import uvicorn
from fastapi import FastAPI, UploadFile, File, Depends, Query, HTTPException, Form, status
from typing import List, Tuple
from fastapi.middleware.cors import CORSMiddleware
from app.database import get_db
from sqlalchemy.orm import Session
from app.routes.auth import router as auth_router
from app.models import Business, User, Document, QueryLog, Organization
from app.rag import (
    ingest_document,
    retrieve_chunks,
    retrieve_chunks_multi,
    check_search_limit,
    increment_search_count,
    check_rate_limit,
    clear_active_query,
    get_active_query,
    set_active_query,
    normalize_query,
    PLAN_CONFIG,
)
from app.llm import generate_answer
from pydantic import BaseModel
from app.auth import get_current_user
import os
import uuid
from math import ceil


# ── Request / Response models ──────────────────────────────────────────────────
class DocumentsRequest(BaseModel):
    business_ids: List[int]
    page: int = 1
    page_size: int = 10

class AskRequest(BaseModel):
    question:    str
    get_k:       int = 3
    offset:      int = 0
    business_id: int

class CreateBusinessRequest(BaseModel):
    name: str

class BusinessResponse(BaseModel):
    id:   int
    name: str
    model_config = {"from_attributes": True}

class DocumentRequest(BaseModel):
    business_ids: List[int]
    page:         int = 1
    page_size:    int = 50

class DocumentResponseItem(BaseModel):
    id:     int
    name:   str
    type:   str
    status: str

class DocumentListResponse(BaseModel):
    documents: List[DocumentResponseItem]


# ── App setup ──────────────────────────────────────────────────────────────────
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)


# ── Helpers ────────────────────────────────────────────────────────────────────
def get_business_doc_state(db: Session, business_id: int) -> dict:
    latest_doc = (
        db.query(Document)
        .filter(Document.business_id == business_id)
        .order_by(Document.id.desc())
        .first()
    )
    count = db.query(Document).filter(Document.business_id == business_id).count()
    return {
        "document_count":    count,
        "latest_document_id": latest_doc.id if latest_doc else None,
    }


# ── Routes ─────────────────────────────────────────────────────────────────────
@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.post("/upload-multiple")
async def upload_documents(
    business_id:     int            = Form(...),
    current_context: User           = Depends(get_current_user),
    files:           List[UploadFile] = File(...),
    db:              Session        = Depends(get_db),
):
    user, _ = current_context
    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        return {"error": "Business not found"}

    uploaded = []
    for file in files:
        temp_path = f"/tmp/{uuid.uuid4()}_{file.filename}"
        with open(temp_path, "wb") as f:
            f.write(await file.read())

        doc = Document(
            business_id=business.id,
            filename=file.filename,
            content="",
            status="ready",
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

        chunks_count = ingest_document(
            db=db,
            business_id=business.id,
            document_id=doc.id,
            file_path=temp_path,
            mime_type=file.content_type,
            filename=file.filename,
        )

        uploaded.append({
            "filename":    file.filename,
            "document_id": doc.id,
            "chunks":      chunks_count,
        })
        os.remove(temp_path)

    clear_active_query(user.id)
    return {"uploaded": uploaded}


@app.post("/documents", response_model=DocumentListResponse, status_code=status.HTTP_200_OK)
async def get_documents(
    payload:      DocumentRequest,
    db:           Session = Depends(get_db),
    current_auth          = Depends(get_current_user),
):
    user, _ = current_auth
    allowed_business_ids = {b.id for b in user.businesses}

    for requested_id in payload.business_ids:
        if requested_id not in allowed_business_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Not authorized to view business ID: {requested_id}",
            )

    offset = (payload.page - 1) * payload.page_size
    query_results = (
        db.query(Document)
        .filter(Document.business_id.in_(payload.business_ids))
        .order_by(Document.created_at.desc())
        .offset(offset)
        .limit(payload.page_size)
        .all()
    )

    formatted_docs = []
    for doc in query_results:
        ext = doc.filename.split(".")[-1].upper() if "." in doc.filename else "FILE"
        formatted_docs.append(DocumentResponseItem(
            id=doc.id, name=doc.filename, type=ext, status=doc.status
        ))

    return DocumentListResponse(documents=formatted_docs)


@app.get("/me/businesses")
def get_my_businesses(
    db:           Session = Depends(get_db),
    current_user          = Depends(get_current_user),
):
    user, _ = current_user
    return {
        "businesses": [{"id": b.id, "name": b.name} for b in user.businesses]
    }


ANSWER_PAGE_SIZE    = 10
CHUNK_BATCH_SIZE    = 3
RETRIEVAL_POOL_SIZE = 50
MAX_LLM_CALLS       = 10


@app.post("/ask")
def ask_question(
    body:            AskRequest,
    db:              Session = Depends(get_db),
    current_context          = Depends(get_current_user),
):
    user, _ = current_context

    # ── Auth check ─────────────────────────────────────────────────────────────
    allowed_business_ids = {b.id for b in user.businesses}
    if body.business_id not in allowed_business_ids:
        raise HTTPException(status_code=403, detail="You do not have access to this business")

    # ── Get org and plan config ────────────────────────────────────────────────
    business = db.query(Business).filter(Business.id == body.business_id).first()
    if not business or not business.organization:
        raise HTTPException(status_code=404, detail="Business or organization not found")

    org    = business.organization
    config = PLAN_CONFIG.get(org.plan, PLAN_CONFIG["free"])

    # ── Rate limit check ───────────────────────────────────────────────────────
    if not check_rate_limit(user.id, org.plan):
        raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")

    # ── Monthly quota check (only on fresh queries, not load more) ─────────────
    answer_offset = body.offset or 0
    if answer_offset == 0:
        allowed, current, limit = check_search_limit(org.id, org.plan)
        if not allowed:
            raise HTTPException(
                status_code=402,
                detail={
                    "message":     f"Monthly search limit of {limit} reached.",
                    "current":     current,
                    "limit":       limit,
                    "upgrade_url": "/pricing",
                },
            )

    # ── Cache check ────────────────────────────────────────────────────────────
    current_doc_state = get_business_doc_state(db, body.business_id)
    cached            = get_active_query(user.id)

    cache_is_valid = (
        cached
        and cached.get("question")    == normalize_query(body.question)
        and cached.get("business_id") == body.business_id
        and cached.get("doc_state")   == current_doc_state
    )

    if cache_is_valid:
        print("[Cache] HIT")
        all_answers       = cached.get("answers", [])
        retrieval_results = cached.get("retrieval_results", [])
        next_chunk_offset = cached.get("next_chunk_offset", 0)
    else:
        print("[Cache] MISS — running retrieval")

        # Pick retrieval strategy based on plan
        if config["use_multiquery"]:
            retrieval         = retrieve_chunks_multi(
                db=db, business_id=body.business_id,
                query=body.question, get_k=RETRIEVAL_POOL_SIZE, offset=0,
            )
            retrieval_results = retrieval["allResults"]
        elif config["use_hyde"]:
            retrieval         = retrieve_chunks(
                db=db, business_id=body.business_id,
                query=body.question, get_k=RETRIEVAL_POOL_SIZE,
                offset=0, use_hyde=True,
            )
            retrieval_results = retrieval["results"]
        else:
            retrieval         = retrieve_chunks(
                db=db, business_id=body.business_id,
                query=body.question, get_k=RETRIEVAL_POOL_SIZE,
                offset=0, use_hyde=False,
            )
            retrieval_results = retrieval["results"]

        all_answers       = []
        next_chunk_offset = 0

        # Increment search count on fresh query
        increment_search_count(org.id)

    # ── Generate answers until we have enough for this page ───────────────────
    target    = answer_offset + ANSWER_PAGE_SIZE
    llm_calls = 0

    while (
        len(all_answers) < target
        and next_chunk_offset is not None
        and llm_calls < MAX_LLM_CALLS
    ):
        chunks = retrieval_results[next_chunk_offset: next_chunk_offset + CHUNK_BATCH_SIZE]
        if not chunks:
            next_chunk_offset = None
            break

        generated    = generate_answer(body.question, chunks)
        new_answers  = generated.get("answers", [])
        all_answers.extend(new_answers)

        next_chunk_offset += CHUNK_BATCH_SIZE
        llm_calls         += 1

        if next_chunk_offset >= len(retrieval_results):
            next_chunk_offset = None

    # ── Save cache ─────────────────────────────────────────────────────────────
    set_active_query(
        user_id=user.id,
        question=body.question,
        business_id=body.business_id,
        doc_state=current_doc_state,
        answers=all_answers,
        retrieval_results=retrieval_results,
        next_chunk_offset=next_chunk_offset,
    )

    # ── Slice page ─────────────────────────────────────────────────────────────
    page_answers = all_answers[answer_offset: answer_offset + ANSWER_PAGE_SIZE]
    has_more     = (
        answer_offset + ANSWER_PAGE_SIZE < len(all_answers)
        or next_chunk_offset is not None
    )
    next_offset  = answer_offset + ANSWER_PAGE_SIZE if has_more else None

    # ── Write QueryLog once per fresh query ────────────────────────────────────
    if answer_offset == 0:
        db.add(QueryLog(
            org_id         = org.id,
            business_id    = body.business_id,
            user_id        = user.id,
            query_text     = body.question,
            answer         = {"answers": page_answers},
            retrieval_plan = (
                "multiquery" if config["use_multiquery"]
                else "hyde"  if config["use_hyde"]
                else "basic"
            ),
        ))
        db.commit()

    if not page_answers:
        return {
            "answer":      {"answers": []},
            "sources":     [],
            "chunks_used": 0,
            "hasMore":     False,
            "nextOffset":  None,
        }

    return {
        "answer":      {"answers": page_answers},
        "sources":     list({
            source["filename"]
            for item in page_answers
            for source in item.get("sources", [])
        }),
        "chunks_used": len(page_answers),
        "hasMore":     has_more,
        "nextOffset":  next_offset,
        "usage": {
            "searches_used":  get_monthly_search_count(org.id) if answer_offset == 0 else None,
            "searches_limit": config["monthly_searches"],
        },
    }


@app.delete("/documents/{document_id}")
def delete_document(
    document_id:  int,
    business_id:  int     = Query(...),
    db:           Session = Depends(get_db),
    current_user          = Depends(get_current_user),
):
    user, _ = current_user

    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        raise HTTPException(404, "Business not found")

    if business.id not in {b.id for b in user.businesses}:
        raise HTTPException(403, "No access")

    doc = (
        db.query(Document)
        .filter(Document.id == document_id, Document.business_id == business_id)
        .first()
    )
    if not doc:
        raise HTTPException(404, "Document not found")

    from app.models import Chunk
    db.query(Chunk).filter(Chunk.document_id == document_id).delete()
    db.delete(doc)
    db.commit()

    clear_active_query(user.id)
    return {"message": "Document deleted successfully"}


@app.post("/businesses", response_model=BusinessResponse)
def create_business_route(
    body:         CreateBusinessRequest,
    db:           Session = Depends(get_db),
    current_user          = Depends(get_current_user),
):
    user, _ = current_user
    
    business_name = body.name.strip()
    if not business_name:
        raise HTTPException(status_code=400, detail="Business name is required")

    # Check org exists and plan allows more businesses
    org = db.query(Organization).filter(Organization.owner_id == user.id).first()
    if not org:
        raise HTTPException(status_code=402, detail="Subscription required to create businesses")

    if not org.is_active:
        raise HTTPException(status_code=402, detail="Your subscription is inactive")

    business = Business(name=business_name, org_id=org.id)
    db.add(business)
    db.commit()
    db.refresh(business)

    user.businesses.append(business)
    db.commit()
    db.refresh(current_user)

    return business


@app.get("/queries/recent")
def get_recent_queries(
    business_id: int     = Query(...),
    page:        int     = Query(1, ge=1),
    page_size:   int     = Query(10, ge=1, le=50),
    db:          Session = Depends(get_db),
    current_user         = Depends(get_current_user),
):
    user, _ = current_user

    allowed_business_ids = {b.id for b in user.businesses}
    if business_id not in allowed_business_ids:
        raise HTTPException(status_code=403, detail="No access")

    query = (
        db.query(QueryLog)
        .filter(QueryLog.business_id == business_id)
        .order_by(QueryLog.id.desc())
    )

    total   = query.count()
    queries = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "page":      page,
        "page_size": page_size,
        "total":     total,
        "has_more":  page * page_size < total,
        "queries": [
            {"id": q.id, "question": q.query_text, "answer": q.answer}
            for q in queries
        ],
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)