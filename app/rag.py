"""
Core RAG service using pgvector.
Handles: document ingestion → chunking → embedding → PostgreSQL storage → retrieval
"""
import os
from typing import List
from pathlib import Path
from sqlalchemy.orm import Session
from sqlalchemy import text
from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter
from openai import OpenAI
from dotenv import load_dotenv
load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ── Constants ──────────────────────────────────────────────────────────────────
CHUNK_SIZE    = 500
CHUNK_OVERLAP = 100
TOP_K         = 5
EMBED_MODEL   = "all-MiniLM-L6-v2"

# ── Singleton embedder ─────────────────────────────────────────────────────────
_embedder = None

def get_embedder() -> SentenceTransformer:
    global _embedder
    if _embedder is None:
        print("Loading embedding model... (first time only)")
        _embedder = SentenceTransformer(EMBED_MODEL)
    return _embedder


# ── Text extraction ────────────────────────────────────────────────────────────
def extract_text(file_path: str, mime_type: str) -> str:
    path = Path(file_path)
    ext = path.suffix.lower()

    # --- 1. Handle PDF (Existing) ---
    if ext == ".pdf":
        import fitz
        text = ""
        doc = fitz.open(path)
        for page in doc:
            # Using blocks helps maintain table structure better than raw text
            blocks = page.get_text("blocks")
            for b in blocks:
                text += b[4] + " "
        doc.close()
        return text

    # --- 2. Handle Excel (.xlsx, .xls) ---
    if ext in [".xlsx", ".xls"]:
        import pandas as pd
        # Read all sheets
        dict_df = pd.read_excel(path, sheet_name=None)
        text_output = []
        for sheet_name, df in dict_df.items():
            text_output.append(f"Sheet: {sheet_name}\n{df.to_csv(index=False)}")
        return "\n\n".join(text_output)

    # --- 3. Handle CSV ---
    if ext == ".csv":
        import pandas as pd
        df = pd.read_csv(path)
        # CSVs are best represented as comma-separated text for the model to parse
        return df.to_csv(index=False)

    # --- 4. Handle Word & Text (Existing) ---
    if ext == ".docx":
        import docx
        doc = docx.Document(path)
        return "\n".join([para.text for para in doc.paragraphs])

    if ext in [".txt", ".md"]:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()

    print(f"Unsupported file extension: {ext}")
    return ""


# ── Chunking ───────────────────────────────────────────────────────────────────
def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    # This splitter tries to stay within chunk_size by splitting at:
    # 1. Paragraphs ("\n\n")
    # 2. Newlines ("\n")
    # 3. Spaces (" ")
    # 4. Characters (last resort)
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        separators=["\n\n", "\n", " ", ""]
    )
    
    # split_text returns a list of strings
    return splitter.split_text(text)

def clean_text(text: str) -> str:
    return text.replace("\x00", "")

# ── Ingest ─────────────────────────────────────────────────────────────────────
def ingest_document(
    db: Session,
    business_id: int,
    document_id: int,
    file_path: str,
    mime_type: str,
    filename: str,
) -> int:
    from app.models import Chunk
    import pandas as pd
    from pathlib import Path

    ext = Path(file_path).suffix.lower()
    embedder = get_embedder()
    chunks = []

    # ── BRANCH 1: Tabular Data (CSV/Excel) ──
    if ext in [".csv", ".xlsx", ".xls"]:
        try:
            if ext == ".csv":
                df = pd.read_csv(file_path)
            else:
                df = pd.read_excel(file_path)

            # Convert every row into a descriptive string
            # Example: "Drug: Amoxicillin, Dosage: 500mg, Stock: 50"
            for _, row in df.iterrows():
                row_str = ", ".join([f"{col}: {val}" for col, val in row.items() if pd.notna(val)])
                chunks.append(row_str)
        except Exception as e:
            print(f"Tabular extraction failed: {e}")
            return 0

    # ── BRANCH 2: Standard Documents (PDF/Word/TXT) ──
    else:
        raw_text = extract_text(file_path, mime_type)
        raw_text = clean_text(raw_text)
        if not raw_text:
            return 0
        chunks = chunk_text(raw_text)

    if not chunks:
        return 0

    # ── EMBED AND STORE ──
    # This part remains the same for both types
    embeddings = embedder.encode(chunks, show_progress_bar=False, normalize_embeddings=True).tolist()
    
    rows = []
    for i, (chunk_text_item, embedding) in enumerate(zip(chunks, embeddings)):
        rows.append(Chunk(
            business_id=business_id,
            document_id=document_id,
            chunk_index=i,
            text=chunk_text_item,
            embedding=embedding,
        ))

    db.add_all(rows)
    db.commit()
    return len(chunks)

# ── Retrieval ──────────────────────────────────────────────────────────────────
def retrieve_chunks(
    db: Session,
    business_id: int,
    query: str,
    get_k: int = 3,
    offset: int = 0,
    document_ids: List[int] | None = None,
) -> dict:

    embedder = get_embedder()

    # Generate normalized query embedding
    query_vector = embedder.encode(
        [query],
        normalize_embeddings=True
    ).tolist()[0]

    params = {
        "query_vec": query_vector,
        "business_id": business_id,
        "limit_plus_one": get_k + 1,
        "offset": offset,
    }

    doc_filter_sql = ""
    if document_ids:
        doc_filter_sql = "AND c.document_id = ANY(:doc_ids)"
        params["doc_ids"] = document_ids

    sql = f"""
        SELECT
            c.id,
            c.text,
            c.document_id,
            d.filename,

            -- cosine similarity
            1 - (c.embedding <=> CAST(:query_vec AS vector)) AS score

        FROM chunks c
        JOIN documents d ON d.id = c.document_id

        WHERE c.business_id = :business_id
        AND (1 - (c.embedding <=> CAST(:query_vec AS vector))) >= 0.55
        {doc_filter_sql}

        ORDER BY c.embedding <=> CAST(:query_vec AS vector)

        LIMIT :limit_plus_one
        OFFSET :offset
    """

    results = db.execute(
        text(sql),
        params
    ).fetchall()

    for r in results[:5]:
        print("\n---")
        print("score:", r.score)
        print("filename:", r.filename)
        print("text:", r.text[:200])

    has_more = len(results) > get_k
    results = results[:get_k]

    formatted_results = [
        {
            "text": row.text,
            "filename": row.filename,
            "document_id": row.document_id,
            "score": float(round(row.score, 4)),
        }
        for row in results
    ]

    return {
        "results": formatted_results,
        "hasMore": has_more,
        "nextOffset": offset + get_k if has_more else None
    }

# ── Delete ─────────────────────────────────────────────────────────────────────
def delete_document_chunks(db: Session, document_id: int) -> None:
    """Remove all chunks for a document."""
    from app.models import Chunk
    db.query(Chunk).filter(Chunk.document_id == document_id).delete()
    db.commit()