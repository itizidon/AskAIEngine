"use client";

import { useBusiness } from "@/app/context/BusinessContext";
import { useState, useRef, useEffect } from "react";

const ACCEPTED_TYPES = ".pdf,.txt,.md,.docx,.csv,.xlsx,.xls";;

interface Doc {
  id: string; // temporary frontend ID
  backendId?: string; // actual backend document ID
  name: string;
  type: string;
  status?: "pending" | "processing" | "ready" | "failed";
  preview?: string;
}

function fileExt(name: string) {
  return name.split(".").pop()?.toUpperCase() ?? "FILE";
}

const badgeColor: Record<string, { bg: string; color: string }> = {
  PDF: { bg: "#ef444422", color: "#ef4444" },
  DOCX: { bg: "#3b82f622", color: "#3b82f6" },
  TXT: { bg: "#22c55e22", color: "#22c55e" },
  MD: { bg: "#a78bfa22", color: "#a78bfa" },
  CSV: { bg: "#f59e0b22", color: "#f59e0b" },
  IMG: { bg: "#22c55e22", color: "#22c55e" }, // image placeholder
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function DashboardSearchMock() {
  const { selectedBusiness } = useBusiness();
  const businessName = selectedBusiness?.name
  const [docs, setDocs] = useState<Doc[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [sources, setSources] = useState<{ id: number; filename: string }[]>([]);
  console.log(docs)
  // ── Fetch documents with merge to avoid overwriting pending files ──
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const res = await fetch(`${API_BASE}/documents`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            business_ids: [selectedBusiness?.id],
            page: 1,
            page_size: 10,
          }),
        });
        const data = await res.json();
        console.log(data, 'dataaa')
        const fetchedDocs: Doc[] = data?.documents?.map((doc: any) => ({
          id: doc.id.toString(), // frontend key
          backendId: doc.id.toString(), // backend ID
          name: doc.name,
          type: doc.type ?? "FILE",
          status: "ready",
        })) || [];


        setDocs(prev => {
          const pendingOrProcessing = prev.filter(d => d.status !== "ready");
          return [...fetchedDocs, ...pendingOrProcessing];
        });
      } catch (err) {
        console.error("Failed to fetch documents:", err);
      }
    };

    fetchDocuments();
  }, [page]);

  const PAGE_SIZE = 3;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!question.trim()) return;

    if (!selectedBusiness) {
      alert("Please select a business first");
      return;
    }

    setLoading(true);
    setAnswer("");
    setSources([]);
    setHasMore(false);
    setOffset(0);

    try {
      const res = await fetch("http://localhost:8000/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          question,
          business_id: selectedBusiness.id,
          get_k: PAGE_SIZE,
          offset: 0,
        }),
      });

      const data = await res.json();

      console.log("SEARCH DATA:", data);
      console.log("SEARCH OFFSET SENT:", 0);

      setAnswer(data?.answer?.answers ?? []);
      setSources(data.sources || []);
      setHasMore(data.hasMore ?? false);

      // first page already loaded, so next Load More starts at PAGE_SIZE
      setOffset(PAGE_SIZE);
    } catch (err) {
      console.error(err);
      setAnswer("Something went wrong while searching.");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (!question.trim()) return;
    if (!selectedBusiness) return;
  
    setLoading(true);
  
    const requestOffset = offset;
  
    console.log("LOAD MORE OFFSET SENT:", requestOffset);
  
    try {
      const res = await fetch("http://localhost:8000/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          question,
          business_id: selectedBusiness.id,
          get_k: PAGE_SIZE,
          offset: requestOffset,
        }),
      });
  
      if (!res.ok) {
        throw new Error("Failed to fetch answer");
      }
  
      const data = await res.json();
  
      console.log("LOAD MORE DATA:", data);
  
      setAnswer(prev => {
        const combined = [
          ...prev,
          ...(data?.answer?.answers ?? []),
        ];
      
        const seen = new Set();
      
        return combined.filter((item: any) => {
          const key = item.fact.trim().toLowerCase();
      
          if (seen.has(key)) return false;
      
          seen.add(key);
          return true;
        });
      });
  
      setSources(data.sources || []);
      setHasMore(data.hasMore ?? false);
  
      // move offset forward only after success
      setOffset(prev => prev + PAGE_SIZE);
    } catch (err) {
      console.error(err);
      setAnswer("Something went wrong while searching.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError("");
    setUploading(true);

    try {
      const formData = new FormData();
      const tempDocs: Doc[] = Array.from(files).map(file => {
        const tempId = crypto.randomUUID(); // unique frontend ID
        const isImage = file.type.startsWith("image/");
        formData.append("files", file);
        formData.append("business_id", selectedBusiness.id.toString());
        return {
          id: tempId,
          name: file.name,
          type: isImage ? "IMG" : fileExt(file.name),
          status: "processing",
          preview: isImage ? URL.createObjectURL(file) : undefined,
        };
      });

      // Optimistically add to state
      setDocs(prev => [...prev, ...tempDocs]);

      const res = await fetch("http://localhost:8000/upload-multiple", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json(); // { uploaded: [{ filename, document_id }] }

      // Map backend results to optimistic docs by index
      setDocs(prev =>
        prev.map(doc => {
          if (doc.status !== "processing") return doc;
          const match = data.uploaded.find((u: any) => u.filename === doc.name && !prev.some(d => d.backendId === u.document_id));
          return match
            ? { ...doc, status: "ready", backendId: match.document_id }
            : { ...doc, status: "failed" };
        })
      );
    } catch (err) {
      console.error(err);
      setDocs(prev =>
        prev.map(doc =>
          doc.status === "processing" ? { ...doc, status: "failed" } : doc
        )
      );
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeDoc = async (doc: Doc) => {
    if (!doc.backendId) {
      console.warn("No backendId yet, cannot delete");
      return;
    }

    try {
      await fetch(`http://localhost:8000/documents/${doc.backendId}`, {
        method: "DELETE",
        credentials: "include",
      });

      setDocs(prev => prev.filter(d => d.id !== doc.id));

    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  return (
    <div style={s.shell}>
      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.sideTop}>
          <div style={s.logo}>⬡ DocChat</div>
          <div style={s.plan}>STARTER</div>
        </div>

        <div style={s.sideSection}>Documents</div>

        <button
          style={{ ...s.uploadBtn, opacity: uploading ? 0.7 : 1 }}
          onClick={() => !uploading && fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : "+ Upload file"}
        </button>

        {error && <div style={s.errorMsg}>{error}</div>}

        <div style={s.docList}>
          {docs.length === 0 && <p style={s.emptyMsg}>No documents yet</p>}
          {docs.map(doc => {
            const badge = badgeColor[doc.type] ?? { bg: "#6b6b7822", color: "#6b6b78" };
            return (
              <div key={doc.id} style={s.docItem}>
                <div style={{ ...s.docBadge, background: badge.bg, color: badge.color }}>
                  {doc.type}
                </div>
                <div style={s.docInfo}>
                  <div style={s.docName}>{doc.name}</div>
                  <div style={s.docMeta}>
                    {doc.status === "pending" && "⏳ Pending"}
                    {doc.status === "processing" && "⚙️ Processing"}
                    {doc.status === "ready" && "✅ Ready"}
                    {doc.status === "failed" && "❌ Failed"}
                  </div>
                </div>
                <button style={s.delBtn} onClick={() => removeDoc(doc)}>×</button>
              </div>
            );
          })}
        </div>

        <div style={s.sideBottom}>
          <button style={s.logoutBtn}>Sign out</button>
        </div>
      </div>

      {/* Main */}
      <div style={s.main}>
        <div className="flex h-full w-full flex-col items-center justify-center">
          <div className="mb-8">
            <h1 className="text-5xl font-bold text-blue-600 text-center">
              {businessName || "Loading..."}
            </h1>
          </div>

          <form
            onSubmit={handleSearch}
            className="flex w-full max-w-xl items-center rounded-full border border-gray-700 bg-gray-800 px-4 py-2 shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"
          >
            <input
              type="text"
              placeholder="Search your documents..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="flex-1 bg-transparent outline-none text-gray-100 placeholder-gray-400"
            />
            <button
              type="submit"
              className="ml-2 rounded-full bg-blue-600 px-4 py-1 text-white hover:bg-blue-700"
            >
              Search
            </button>
          </form>
          {/* Loading State */}
          {loading && (
            <div className="mt-6 w-full max-w-2xl text-gray-400 animate-pulse text-sm">
              Thinking...
            </div>
          )}

          {/* Answer Card */}
          {answer?.length > 0 && (
            <>
              <div
                className="
    mt-8
    w-full
    max-w-4xl
    flex-1
    min-h-0
    overflow-y-auto
    space-y-4
    pr-2
  "
              >
                {answer.map(
                  (item: any, index: number) => (
                    <div
                      key={index}
                      className="
            rounded-2xl
            border
            border-zinc-800
            bg-zinc-900
            p-5
            shadow-lg
          "
                    >
                      <div className="text-white leading-relaxed">
                        {item.fact}
                      </div>

                      <div className="mt-4">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                          Sources
                        </div>

                        <div className="space-y-2">
                          {item.sources.map(
                            (source: any, sourceIndex: number) => (
                              <div
                                key={sourceIndex}
                                className="
                      flex
                      items-center
                      justify-between
                      rounded-lg
                      bg-zinc-800
                      px-3
                      py-2
                      text-sm
                    "
                              >
                                <span className="text-zinc-200">
                                  {source.filename}
                                </span>

                                <span className="rounded bg-blue-600 px-2 py-1 text-xs text-white">
                                  {source.chunk}
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
              {hasMore && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={loading}
                    className="
              rounded-xl
              bg-blue-600
              px-5
              py-2
              text-white
              font-medium
              hover:bg-blue-700
              disabled:opacity-50
            "
                  >
                    {loading ? "Loading..." : "Load More"}
                  </button>
                </div>
              )}
            </>
          )}
          <p style={s.supportedTypes}>
            Supported: PDF, DOCX, TXT, MD, CSV, XLSX, XLS — max 10MB
          </p>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  shell: { display: "flex", height: "100vh", width: "100vw", fontFamily: "'DM Sans', sans-serif", background: "#18181b", color: "#e4e4e7" },
  sidebar: { width: 260, display: "flex", flexDirection: "column", flexShrink: 0, borderRight: "1px solid #2a2a30" },
  sideTop: { padding: "20px 18px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #2a2a30" },
  logo: { fontSize: 18, fontWeight: 700, color: "#a78bfa" },
  plan: { fontSize: 10, fontWeight: 600, background: "#7c3aed22", color: "#a78bfa", padding: "3px 8px", borderRadius: 20, letterSpacing: .06 },
  sideSection: { fontSize: 11, fontWeight: 600, color: "#6b6b78", letterSpacing: .08, padding: "16px 18px 8px", textTransform: "uppercase" as const },
  uploadBtn: { margin: "0 12px 10px", padding: "9px 14px", background: "#7c3aed", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 },
  errorMsg: { margin: "0 12px 8px", padding: "8px 12px", background: "#7f1d1d22", border: "1px solid #7f1d1d", borderRadius: 8, color: "#fca5a5", fontSize: 12 },
  emptyMsg: { fontSize: 13, color: "#6b6b78", padding: "12px 10px" },
  docList: { flex: 1, overflowY: "auto" as const, padding: "0 8px" },
  docItem: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, marginBottom: 2 },
  docBadge: { fontSize: 10, fontWeight: 700, padding: "3px 6px", borderRadius: 5, flexShrink: 0 },
  docInfo: { flex: 1, minWidth: 0 },
  docName: { fontSize: 12, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  docMeta: { fontSize: 11, marginTop: 2, color: "#6b6b78" },
  delBtn: { background: "none", border: "none", color: "#6b6b78", cursor: "pointer", fontSize: 16, padding: "0 4px", flexShrink: 0 },
  sideBottom: { padding: "12px 12px 16px", borderTop: "1px solid #2a2a30" },
  logoutBtn: { width: "100%", padding: "9px", background: "transparent", border: "1px solid #2a2a30", borderRadius: 8, fontSize: 13, cursor: "pointer", color: "#e4e4e7" },
  main: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center" },
  supportedTypes: { marginTop: 16, fontSize: 12, color: "#6b6b78" },
};