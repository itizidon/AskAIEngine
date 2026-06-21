"""
Core RAG service using pgvector.
Handles: document ingestion → chunking → embedding → PostgreSQL storage → retrieval
"""
import os
import json
import redis
from datetime import datetime
from typing import List
from pathlib import Path
from sqlalchemy.orm import Session
from sqlalchemy import text
from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter
from openai import OpenAI
from dotenv import load_dotenv
load_dotenv()

# ── Client ─────────────────────────────────────────────────────────────────────
client = OpenAI(
    base_url=os.getenv("LLM_BASE_URL", "http://localhost:11434/v1"),
    api_key=os.getenv("OPENAI_API_KEY", "ollama"),
)
LLM_MODEL = os.getenv("LLM_MODEL", "mistral:7b")

# ── Constants ──────────────────────────────────────────────────────────────────
CHUNK_SIZE         = 500
CHUNK_OVERLAP      = 100
TOP_K              = 5
EMBED_MODEL        = "all-MiniLM-L6-v2"
MIN_SCORE_STANDARD = 0.45
MIN_SCORE_TABULAR  = 0.25

# ── Plan config ────────────────────────────────────────────────────────────────
PLAN_CONFIG = {
    "free": {
        "monthly_searches": 50,
        "use_hyde":         True,
        "use_multiquery":   True,
        "rate_per_minute":  3,
        "rate_per_hour":    20,
        "price_monthly":    0,
        "price_yearly":     0,
        "display_name":     "Free",
        "max_businesses":   1,
        "max_users":        2,
    },
    "starter": {
        "monthly_searches": 2000,
        "use_hyde":         True,
        "use_multiquery":   True,
        "rate_per_minute":  10,
        "rate_per_hour":    100,
        "price_monthly":    49,
        "price_yearly":     470,
        "display_name":     "Starter",
        "max_businesses":   3,
        "max_users":        10,
    },
}

# ── Redis ──────────────────────────────────────────────────────────────────────
redis_client = redis.Redis(
    host=os.getenv("REDIS_HOST", "localhost"),
    port=int(os.getenv("REDIS_PORT", 6379)),
    db=0,
    decode_responses=True,
)

ACTIVE_QUERY_TTL_SECONDS = 60 * 60 * 6  # 6 hours

# ── Singleton embedder ─────────────────────────────────────────────────────────
_embedder = None

def get_embedder() -> SentenceTransformer:
    global _embedder
    if _embedder is None:
        print("Loading embedding model... (first time only)")
        _embedder = SentenceTransformer(EMBED_MODEL)
    return _embedder


# ── Search quota ───────────────────────────────────────────────────────────────
def get_monthly_search_count(org_id: int) -> int:
    key = f"searches:org:{org_id}:{datetime.now().strftime('%Y-%m')}"
    try:
        val = redis_client.get(key)
        return int(val) if val else 0
    except Exception:
        return 0

def increment_search_count(org_id: int) -> int:
    key = f"searches:org:{org_id}:{datetime.now().strftime('%Y-%m')}"
    try:
        pipe = redis_client.pipeline()
        pipe.incr(key)
        pipe.expire(key, 60 * 60 * 24 * 35)  # 35 days
        count, _ = pipe.execute()
        return count
    except Exception:
        return 0

def check_search_limit(org_id: int, plan: str) -> tuple[bool, int, int]:
    """Returns (allowed, current_count, limit)"""
    config  = PLAN_CONFIG.get(plan, PLAN_CONFIG["free"])
    limit   = config["monthly_searches"]
    current = get_monthly_search_count(org_id)
    return current < limit, current, limit


# ── Rate limiting ──────────────────────────────────────────────────────────────
def check_rate_limit(user_id: int, plan: str) -> bool:
    """Returns True if allowed, False if rate limited."""
    config      = PLAN_CONFIG.get(plan, PLAN_CONFIG["free"])
    minute_key  = f"rate:{user_id}:minute"
    hour_key    = f"rate:{user_id}:hour"
    try:
        pipe = redis_client.pipeline()
        pipe.incr(minute_key)
        pipe.expire(minute_key, 60)
        pipe.incr(hour_key)
        pipe.expire(hour_key, 3600)
        minute_count, _, hour_count, _ = pipe.execute()
        if minute_count > config["rate_per_minute"]:
            return False
        if hour_count > config["rate_per_hour"]:
            return False
        return True
    except Exception:
        return True  # fail open if Redis is down


# ── Active query cache (per user) ──────────────────────────────────────────────
def normalize_query(query: str) -> str:
    return " ".join(query.lower().strip().split())

def get_active_query_key(user_id: int) -> str:
    return f"active_query:{user_id}"

def get_active_query(user_id: int) -> dict | None:
    try:
        data = redis_client.get(get_active_query_key(user_id))
        if not data:
            return None
        return json.loads(data)
    except Exception:
        return None

def set_active_query(
    user_id: int,
    question: str,
    business_id: int,
    doc_state: dict,
    answers: list,
    retrieval_results: list,
    next_chunk_offset: int | None,
) -> None:
    try:
        redis_client.setex(
            get_active_query_key(user_id),
            ACTIVE_QUERY_TTL_SECONDS,
            json.dumps({
                "question":          normalize_query(question),
                "business_id":       business_id,
                "doc_state":         doc_state,
                "answers":           answers,
                "retrieval_results": retrieval_results,
                "next_chunk_offset": next_chunk_offset,
            }),
        )
    except Exception as e:
        print(f"[Redis] Failed to cache active query: {e}")

def clear_active_query(user_id: int) -> None:
    try:
        redis_client.delete(get_active_query_key(user_id))
    except Exception:
        pass


# ── HyDE ──────────────────────────────────────────────────────────────────────
def generate_hypothetical_answer(query: str) -> str:
    hyde_prompt = f"""You are a search assistant. A user is searching a document database.
Write a SHORT hypothetical passage (2-4 sentences) that would be the ideal answer 
to the following question. Write it as if it were extracted from a real document or table.
Do NOT say "I don't know". Always write a plausible passage.
Do NOT include any explanation — output ONLY the passage itself.

Question: {query}
Passage:"""
    try:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": hyde_prompt}],
            temperature=0.5,
            max_tokens=150,
        )
        hypothetical = response.choices[0].message.content.strip()
        print(f"\n[HyDE] Generated: {hypothetical}")
        return hypothetical
    except Exception as e:
        print(f"[HyDE] Failed, falling back to raw query: {e}")
        return query


def build_hyde_vector(query: str, embedder: SentenceTransformer) -> list:
    import numpy as np
    hypothetical = generate_hypothetical_answer(query)
    vecs         = embedder.encode([query, hypothetical], normalize_embeddings=True)
    avg          = (vecs[0] + vecs[1]) / 2.0
    norm         = np.linalg.norm(avg)
    if norm > 0:
        avg = avg / norm
    return avg.tolist()


# ── Multi-Query HyDE ───────────────────────────────────────────────────────────
def generate_query_variants(query: str) -> List[str]:
    prompt = f"""You are a search query expander for a document retrieval system.
Given a user question, generate 4 alternative search queries that mean the same thing
but use different vocabulary, levels of formality, and domain-specific terms.

Rules:
- Include at least one very specific/technical version
- Include at least one that uses common abbreviations (SOP, PPE, etc.)
- Include one that mimics how a document title or heading might be phrased
- Keep each query under 15 words
- Return ONLY a JSON array of strings, nothing else

User question: {query}
"""
    try:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=200,
        )
        raw      = response.choices[0].message.content.strip()
        raw      = raw.replace("```json", "").replace("```", "").strip()
        variants = json.loads(raw)
        if isinstance(variants, list):
            print(f"\n[MultiQuery] Variants: {variants}")
            return [query] + variants
    except Exception as e:
        print(f"[MultiQuery] Failed, using original query only: {e}")
    return [query]


def build_multi_hyde_vectors(query: str, embedder: SentenceTransformer) -> List[list]:
    import numpy as np
    variants = generate_query_variants(query)
    vectors  = []
    for variant in variants:
        try:
            vectors.append(build_hyde_vector(variant, embedder))
        except Exception as e:
            print(f"[MultiQuery] Skipping variant '{variant}': {e}")
            vectors.append(embedder.encode([variant], normalize_embeddings=True).tolist()[0])
    return vectors


def retrieve_chunks_multi(
    db: Session,
    business_id: int,
    query: str,
    get_k: int,
    offset: int = 0,
    document_ids: List[int] | None = None,
) -> dict:
    embedder = get_embedder()
    vectors  = build_multi_hyde_vectors(query, embedder)

    doc_filter_sql = ""
    base_params    = {
        "business_id":  business_id,
        "min_standard": MIN_SCORE_STANDARD,
        "min_tabular":  MIN_SCORE_TABULAR,
    }
    if document_ids:
        doc_filter_sql         = "AND c.document_id = ANY(:doc_ids)"
        base_params["doc_ids"] = document_ids

    rrf_scores: dict = {}
    RRF_K            = 60

    for query_vector in vectors:
        params = {
            **base_params,
            "query_vec":      query_vector,
            "limit_plus_one": get_k * 3 + 1,
            "offset":         0,
        }

        sql = f"""
            WITH scored AS (
                SELECT
                    c.id, c.text, c.chunk_index, c.document_id, d.filename,
                    1 - (c.embedding <=> CAST(:query_vec AS vector)) AS score,
                    (c.text LIKE '[Table:%%') AS is_tabular
                FROM chunks c
                JOIN documents d ON d.id = c.document_id
                WHERE c.business_id = :business_id
                {doc_filter_sql}
            ),
            tabular_headers AS (
                SELECT DISTINCT ON (c.document_id)
                    c.id, c.text, c.chunk_index, c.document_id, d.filename,
                    1.0 AS score, TRUE AS is_tabular
                FROM chunks c
                JOIN documents d ON d.id = c.document_id
                WHERE c.business_id = :business_id
                  AND c.chunk_index = 0
                  AND c.text LIKE '[Table:%%'
                  {doc_filter_sql}
                  AND c.document_id IN (
                      SELECT document_id FROM scored
                      WHERE is_tabular AND score >= :min_tabular
                  )
            )
            SELECT id, text, chunk_index, document_id, filename, score
            FROM (
                SELECT id, text, chunk_index, document_id, filename, score
                FROM scored
                WHERE (is_tabular     AND score >= :min_tabular)
                   OR (NOT is_tabular AND score >= :min_standard)
                UNION
                SELECT id, text, chunk_index, document_id, filename, score
                FROM tabular_headers
            ) combined
            ORDER BY score DESC
            LIMIT :limit_plus_one
            OFFSET :offset
        """

        rows = db.execute(text(sql), params).fetchall()
        for rank, row in enumerate(rows):
            chunk_id = row.id
            rrf_contribution = 1.0 / (rank + 1 + RRF_K)
            if chunk_id not in rrf_scores:
                rrf_scores[chunk_id] = {
                    "text":        row.text,
                    "filename":    row.filename,
                    "document_id": row.document_id,
                    "score":       row.score,
                    "rrf_score":   0.0,
                }
            rrf_scores[chunk_id]["rrf_score"] += rrf_contribution

    merged = sorted(rrf_scores.values(), key=lambda x: x["rrf_score"], reverse=True)

    print(f"\n[MultiQuery] {len(vectors)} variants → {len(merged)} unique chunks after RRF")
    for r in merged[:8]:
        print(f"  rrf={r['rrf_score']:.4f} score={r['score']:.4f} | {r['filename']} | {r['text'][:100]}")

    has_more = len(merged) > (offset + get_k)
    page     = merged[offset: offset + get_k]

    return {
        "results": [
            {
                "text":        r["text"],
                "filename":    r["filename"],
                "document_id": r["document_id"],
                "score":       float(round(r["score"], 4)),
            }
            for r in page
        ],
        "allResults": [
            {
                "text":        r["text"],
                "filename":    r["filename"],
                "document_id": r["document_id"],
                "score":       float(round(r["score"], 4)),
            }
            for r in merged
        ],
        "hasMore":    has_more,
        "nextOffset": offset + get_k if has_more else None,
    }


# ── Text extraction ────────────────────────────────────────────────────────────
def extract_text(file_path: str, mime_type: str) -> str:
    path = Path(file_path)
    ext  = path.suffix.lower()

    if ext == ".pdf":
        import fitz
        text = ""
        doc  = fitz.open(path)
        for page in doc:
            for b in page.get_text("blocks"):
                text += b[4] + " "
        doc.close()
        return text

    if ext in [".xlsx", ".xls"]:
        import pandas as pd
        dict_df     = pd.read_excel(path, sheet_name=None)
        text_output = []
        for sheet_name, df in dict_df.items():
            text_output.append(f"Sheet: {sheet_name}\n{df.to_csv(index=False)}")
        return "\n\n".join(text_output)

    if ext == ".csv":
        import pandas as pd
        return pd.read_csv(path).to_csv(index=False)

    if ext == ".docx":
        import docx
        doc = docx.Document(path)
        return "\n".join([p.text for p in doc.paragraphs])

    if ext in [".txt", ".md"]:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()

    print(f"Unsupported file extension: {ext}")
    return ""


# ── Chunking ───────────────────────────────────────────────────────────────────
def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        separators=["\n\n", "\n", " ", ""]
    )
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

    ext      = Path(file_path).suffix.lower()
    embedder = get_embedder()
    chunks   = []

    if ext in [".csv", ".xlsx", ".xls"]:
        try:
            df = pd.read_csv(file_path) if ext == ".csv" else pd.read_excel(file_path)

            df.columns = [str(c).strip() for c in df.columns]
            col_list   = ", ".join(df.columns.tolist())
            num_rows   = len(df)
            table_name = Path(filename).stem.replace("_", " ").replace("-", " ").title()

            sample_lines = []
            for col in df.columns:
                samples = (
                    df[col].dropna().astype(str).str.strip()
                    .loc[lambda s: s != ""].unique()[:3].tolist()
                )
                sample_lines.append(
                    f"  - {col}: e.g. {', '.join(samples)}" if samples else f"  - {col}"
                )

            chunks.append(
                f"[Table: {table_name}]\n"
                f"This table has {num_rows} rows and {len(df.columns)} columns.\n"
                f"Columns and sample values:\n" + "\n".join(sample_lines) + "\n"
                f"Source file: {filename}"
            )

            WINDOW_SIZE = 10
            OVERLAP     = 2
            step        = WINDOW_SIZE - OVERLAP

            for start in range(0, num_rows, step):
                end    = min(start + WINDOW_SIZE, num_rows)
                window = df.iloc[start:end]
                lines  = [
                    f"[Table: {table_name} | Columns: {col_list} | "
                    f"Rows {start + 1}–{end} of {num_rows}]"
                ]
                for row_idx, (_, row) in enumerate(window.iterrows(), start=start + 1):
                    pairs = [
                        f"{col}: {val}"
                        for col, val in row.items()
                        if pd.notna(val) and str(val).strip() != ""
                    ]
                    lines.append(f"  Row {row_idx}: " + " | ".join(pairs))
                chunks.append("\n".join(lines))

        except Exception as e:
            print(f"Tabular extraction failed: {e}")
            return 0
    else:
        raw_text = extract_text(file_path, mime_type)
        raw_text = clean_text(raw_text)
        if not raw_text:
            return 0
        chunks = chunk_text(raw_text)

    if not chunks:
        return 0

    embeddings = embedder.encode(
        chunks, show_progress_bar=False, normalize_embeddings=True
    ).tolist()

    db.add_all([
        Chunk(
            business_id=business_id,
            document_id=document_id,
            chunk_index=i,
            text=chunk_text_item,
            embedding=embedding,
        )
        for i, (chunk_text_item, embedding) in enumerate(zip(chunks, embeddings))
    ])
    db.commit()
    return len(chunks)


# ── Retrieval (single HyDE) ────────────────────────────────────────────────────
def retrieve_chunks(
    db: Session,
    business_id: int,
    query: str,
    get_k: int = TOP_K,
    offset: int = 0,
    document_ids: List[int] | None = None,
    use_hyde: bool = True,
) -> dict:
    embedder = get_embedder()

    if use_hyde:
        query_vector = build_hyde_vector(query, embedder)
    else:
        query_vector = embedder.encode([query], normalize_embeddings=True).tolist()[0]

    params = {
        "query_vec":      query_vector,
        "business_id":    business_id,
        "min_standard":   MIN_SCORE_STANDARD,
        "min_tabular":    MIN_SCORE_TABULAR,
        "limit_plus_one": get_k + 1,
        "offset":         offset,
    }

    doc_filter_sql = ""
    if document_ids:
        doc_filter_sql = "AND c.document_id = ANY(:doc_ids)"
        params["doc_ids"] = document_ids

    sql = f"""
        WITH scored AS (
            SELECT
                c.id, c.text, c.chunk_index, c.document_id, d.filename,
                1 - (c.embedding <=> CAST(:query_vec AS vector)) AS score,
                (c.text LIKE '[Table:%%') AS is_tabular
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE c.business_id = :business_id
            {doc_filter_sql}
        ),
        tabular_headers AS (
            SELECT DISTINCT ON (c.document_id)
                c.id, c.text, c.chunk_index, c.document_id, d.filename,
                1.0 AS score, TRUE AS is_tabular
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE c.business_id = :business_id
              AND c.chunk_index = 0
              AND c.text LIKE '[Table:%%'
              {doc_filter_sql}
              AND c.document_id IN (
                  SELECT document_id FROM scored
                  WHERE is_tabular AND score >= :min_tabular
              )
        )
        SELECT id, text, chunk_index, document_id, filename, score
        FROM (
            SELECT id, text, chunk_index, document_id, filename, score
            FROM scored
            WHERE (is_tabular     AND score >= :min_tabular)
               OR (NOT is_tabular AND score >= :min_standard)
            UNION
            SELECT id, text, chunk_index, document_id, filename, score
            FROM tabular_headers
        ) combined
        ORDER BY score DESC
        LIMIT :limit_plus_one
        OFFSET :offset
    """

    results  = db.execute(text(sql), params).fetchall()
    has_more = len(results) > get_k
    results  = results[:get_k]

    return {
        "results": [
            {
                "text":        row.text,
                "filename":    row.filename,
                "document_id": row.document_id,
                "score":       float(round(row.score, 4)),
            }
            for row in results
        ],
        "hasMore":    has_more,
        "nextOffset": offset + get_k if has_more else None,
    }


# ── Delete ─────────────────────────────────────────────────────────────────────
def delete_document_chunks(db: Session, document_id: int) -> None:
    from app.models import Chunk
    db.query(Chunk).filter(Chunk.document_id == document_id).delete()
    db.commit()