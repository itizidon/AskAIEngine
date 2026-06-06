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

# Minimum similarity score for standard (non-tabular) document chunks.
# Tabular chunks use a lower threshold because their header-heavy format
# embeds differently from natural-language queries.
MIN_SCORE_STANDARD = 0.45
MIN_SCORE_TABULAR  = 0.25

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

    if ext == ".pdf":
        import fitz
        text = ""
        doc = fitz.open(path)
        for page in doc:
            blocks = page.get_text("blocks")
            for b in blocks:
                text += b[4] + " "
        doc.close()
        return text

    if ext in [".xlsx", ".xls"]:
        import pandas as pd
        dict_df = pd.read_excel(path, sheet_name=None)
        text_output = []
        for sheet_name, df in dict_df.items():
            text_output.append(f"Sheet: {sheet_name}\n{df.to_csv(index=False)}")
        return "\n\n".join(text_output)

    if ext == ".csv":
        import pandas as pd
        df = pd.read_csv(path)
        return df.to_csv(index=False)

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
    from pathlib import Path

    ext = Path(file_path).suffix.lower()
    embedder = get_embedder()
    chunks = []
    is_tabular = False

    # ── BRANCH 1: Tabular Data (CSV/Excel) ──
    if ext in [".csv", ".xlsx", ".xls"]:
        is_tabular = True
        try:
            if ext == ".csv":
                df = pd.read_csv(file_path)
            else:
                df = pd.read_excel(file_path)

            df.columns = [str(c).strip() for c in df.columns]
            col_list   = ", ".join(df.columns.tolist())
            num_rows   = len(df)
            table_name = Path(filename).stem.replace("_", " ").replace("-", " ").title()

            # ── Chunk 1: Schema header ───────────────────────────────────────
            # Always the first chunk — orients the LLM to the full table structure.
            # Also includes sample values per column so the embedder can match
            # queries like "dr. sue" or "office visit" to the right columns.
            sample_lines = []
            for col in df.columns:
                samples = (
                    df[col]
                    .dropna()
                    .astype(str)
                    .str.strip()
                    .loc[lambda s: s != ""]
                    .unique()[:3]
                    .tolist()
                )
                sample_lines.append(f"  - {col}: e.g. {', '.join(samples)}" if samples else f"  - {col}")

            schema_chunk = (
                f"[Table: {table_name}]\n"
                f"This table has {num_rows} rows and {len(df.columns)} columns.\n"
                f"Columns and sample values:\n" + "\n".join(sample_lines) + "\n"
                f"Source file: {filename}"
            )
            chunks.append(schema_chunk)

            # ── Chunks 2+: Row windows ───────────────────────────────────────
            WINDOW_SIZE = 10
            OVERLAP     = 2
            step        = WINDOW_SIZE - OVERLAP

            for start in range(0, num_rows, step):
                end    = min(start + WINDOW_SIZE, num_rows)
                window = df.iloc[start:end]

                lines = [
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
    embeddings = embedder.encode(
        chunks, show_progress_bar=False, normalize_embeddings=True
    ).tolist()

    rows = []
    for i, (chunk_text_item, embedding) in enumerate(zip(chunks, embeddings)):
        rows.append(Chunk(
            business_id=business_id,
            document_id=document_id,
            chunk_index=i,
            text=chunk_text_item,
            embedding=embedding,
            # chunk_index=0 is always the schema header for tabular files;
            # callers can use this to always pull it alongside row chunks.
        ))

    db.add_all(rows)
    db.commit()
    return len(chunks)


# ── Retrieval ──────────────────────────────────────────────────────────────────
def retrieve_chunks(
    db: Session,
    business_id: int,
    query: str,
    get_k: int = TOP_K,
    offset: int = 0,
    document_ids: List[int] | None = None,
) -> dict:

    embedder = get_embedder()
    query_vector = embedder.encode(
        [query], normalize_embeddings=True
    ).tolist()[0]

    params = {
        "query_vec":       query_vector,
        "business_id":     business_id,
        "min_standard":    MIN_SCORE_STANDARD,
        "min_tabular":     MIN_SCORE_TABULAR,
        "limit_plus_one":  get_k + 1,
        "offset":          offset,
    }

    doc_filter_sql = ""
    if document_ids:
        doc_filter_sql = "AND c.document_id = ANY(:doc_ids)"
        params["doc_ids"] = document_ids

    # is_tabular: chunk_index=0 marks the schema header; any document that has
    # a schema header is a tabular file. We use the per-document presence of
    # chunk_index=0 with '[Table:' prefix to apply the lower threshold.
    sql = f"""
        WITH scored AS (
            SELECT
                c.id,
                c.text,
                c.chunk_index,
                c.document_id,
                d.filename,
                1 - (c.embedding <=> CAST(:query_vec AS vector)) AS score,
                -- flag tabular chunks by their '[Table:' header prefix
                (c.text LIKE '[Table:%%') AS is_tabular
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE c.business_id = :business_id
            {doc_filter_sql}
        ),
        -- For every tabular document that has at least one chunk scoring above
        -- the tabular threshold, also pull its schema header (chunk_index=0)
        -- so the LLM always knows the column layout.
        tabular_headers AS (
            SELECT DISTINCT ON (c.document_id)
                c.id,
                c.text,
                c.chunk_index,
                c.document_id,
                d.filename,
                1.0 AS score,   -- give headers a guaranteed high score
                TRUE  AS is_tabular
            FROM chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE c.business_id = :business_id
              AND c.chunk_index = 0
              AND c.text LIKE '[Table:%%'
              {doc_filter_sql}
              AND c.document_id IN (
                  SELECT document_id FROM scored
                  WHERE is_tabular
                    AND score >= :min_tabular
              )
        )
        SELECT id, text, chunk_index, document_id, filename, score
        FROM (
            -- Row chunks that pass their respective threshold
            SELECT id, text, chunk_index, document_id, filename, score
            FROM scored
            WHERE (is_tabular  AND score >= :min_tabular)
               OR (NOT is_tabular AND score >= :min_standard)

            UNION

            -- Schema headers for matched tabular documents
            SELECT id, text, chunk_index, document_id, filename, score
            FROM tabular_headers
        ) combined
        ORDER BY score DESC
        LIMIT :limit_plus_one
        OFFSET :offset
    """

    results = db.execute(text(sql), params).fetchall()

    # Debug output
    for r in results[:8]:
        print("\n---")
        print("score:", r.score)
        print("filename:", r.filename)
        print("chunk_index:", r.chunk_index)
        print("text:", r.text[:200])

    has_more = len(results) > get_k
    results  = results[:get_k]

    formatted_results = [
        {
            "text":        row.text,
            "filename":    row.filename,
            "document_id": row.document_id,
            "score":       float(round(row.score, 4)),
        }
        for row in results
    ]

    return {
        "results":    formatted_results,
        "hasMore":    has_more,
        "nextOffset": offset + get_k if has_more else None,
    }


# ── Delete ─────────────────────────────────────────────────────────────────────
def delete_document_chunks(db: Session, document_id: int) -> None:
    """Remove all chunks for a document."""
    from app.models import Chunk
    db.query(Chunk).filter(Chunk.document_id == document_id).delete()
    db.commit()