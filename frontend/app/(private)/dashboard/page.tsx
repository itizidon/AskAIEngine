'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Users, File, Loader2, Building2, Upload, X, Trash2, FileSpreadsheet } from 'lucide-react';
import Navbar from '@/components/Navbar';
import MetricCard from '@/components/MetricCard';
import { useBusiness } from '@/app/context/BusinessContext';

// RESTORED: Exactly your original file string scope
const ACCEPTED_TYPES = ".pdf,.txt,.md,.docx,.csv,.xlsx,.xls";

interface Doc {
  id: string;
  backendId?: string;
  name: string;
  type: string;
  status: "processing" | "ready" | "failed";
}

function fileExt(name: string) {
  return name.split(".").pop()?.toUpperCase() ?? "FILE";
}

// RESTORED: Matching style badge definitions for Excel assets
const badgeColor: Record<string, { bg: string; color: string }> = {
  PDF: { bg: "#ef444422", color: "#ef4444" },
  DOCX: { bg: "#3b82f622", color: "#3b82f6" },
  TXT: { bg: "#22c55e22", color: "#22c55e" },
  MD: { bg: "#a78bfa22", color: "#a78bfa" },
  CSV: { bg: "#f59e0b22", color: "#f59e0b" },
  XLSX: { bg: "#10b98122", color: "#10b981" },
  XLS: { bg: "#10b98122", color: "#10b981" },
  IMG: { bg: "#22c55e22", color: "#22c55e" },
};

export default function AdminDashboard() {
  const { businesses, selectBusiness, isLoading } = useBusiness();
  
  // Slide Drawer States
  const [activeDrawerBiz, setActiveDrawerBiz] = useState<any | null>(null);
  const [drawerDocs, setDrawerDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);

  // Fetch documents specifically when a drawer opens
  const openManagementDrawer = async (biz: any) => {
    console.log(biz)
    setActiveDrawerBiz(biz);
    selectBusiness(biz); 
    setDrawerDocs([]);

    try {
      const res = await fetch("http://localhost:8000/documents", {
        method: "POST",
        // ADD THIS LINE CRUCIAL FOR COOKIE-BASED AUTHENTICATION:
        credentials: "include", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_ids: [biz.id], page: 1, page_size: 50 }),
      });
      const data = await res.json();
      const fetched = data?.documents?.map((d: any) => ({
        id: d.id.toString(),
        backendId: d.id.toString(),
        name: d.name,
        type: d.type ?? fileExt(d.name),
        status: "ready" as const
      })) || [];
      setDrawerDocs(fetched);
    } catch (err) {
      console.error("Failed to fetch drawer files", err);
    }
  };

  // Optimistic Multi-File Upload Handler inside the Drawer
  const handleDrawerFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, bizId: number) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    
    const tempDocs: Doc[] = Array.from(files).map(file => {
      const tempId = crypto.randomUUID();
      formData.append("files", file);
      return { 
        id: tempId, 
        name: file.name, 
        type: fileExt(file.name),
        status: "processing" 
      };
    });

    formData.append("business_id", bizId.toString());
    
    // Inject optimistically into the active drawer list
    setDrawerDocs(prev => [...tempDocs, ...prev]);

    try {
      const res = await fetch("http://localhost:8000/upload-multiple", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error();
      const data = await res.json();

      setDrawerDocs(prev => prev.map(doc => {
        if (doc.status !== "processing") return doc;
        const match = data.uploaded?.find((u: any) => u.filename === doc.name);
        return match 
          ? { ...doc, status: "ready", backendId: match.document_id.toString() }
          : { ...doc, status: "failed" };
      }));
    } catch (err) {
      setDrawerDocs(prev => prev.map(d => d.status === "processing" ? { ...d, status: "failed" } : d));
    } finally {
      setUploading(false);
      if (e.target) e.target.value = ""; // Clear file target session memory
    }
  };

  return (
    <div className="screen" style={{ position: 'relative', overflowX: 'hidden' }}>
      <Navbar />
      <div style={{ padding: '24px' }}>
        
        {/* Title Section */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 500 }}>Your businesses</div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              Manage locations, documents, and users
            </div>
          </div>
          <button className="btn btn-primary"><Plus size={14} /> New business</button>
        </div>
        
        {/* Loading / Cards Grid */}
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '160px' }}>
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {businesses.map((biz) => (
              <div className="card" key={biz.id}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Building2 size={14} style={{ color: 'var(--color-text-secondary)' }} />
                    {biz.name}
                  </div>
                  <span className="badge badge-success">Active</span>
                </div>
                
                <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
                  <Link href="/search" className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: '12px' }} onClick={() => selectBusiness(biz)}>
                    Open Search
                  </Link>
                  <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center', fontSize: '12px' }} onClick={() => openManagementDrawer(biz)}>
                    Manage Files
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Global Performance Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <MetricCard label="Searches this month" value="340" subtext="340 / 500 · Starter plan" progressPercentage={68} />
          <MetricCard label="Total active instances" value={String(businesses.length)} subtext="Connected database workspaces" />
        </div>
      </div>

      {/* ── SLIDE OVER DRAWER PANEL ── */}
      {activeDrawerBiz && (
        <div style={{
          position: 'fixed', top: 0, right: 0, width: '400px', height: '100vh',
          background: '#0c0c0e', borderLeft: '1px solid #1f1f23', zIndex: 1000,
          boxShadow: '-8px 0 24px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column'
        }}>
          {/* Drawer Header */}
          <div style={{ padding: '20px', borderBottom: '1px solid #1f1f23', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>{activeDrawerBiz.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>File Management Console</div>
            </div>
            <button onClick={() => setActiveDrawerBiz(null)} style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>

          {/* Drawer Upload Action Trigger */}
          <div style={{ padding: '16px' }}>
            <label style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              border: '1px dashed #3f3f46', borderRadius: '8px', padding: '24px', cursor: uploading ? 'not-allowed' : 'pointer', background: '#141416'
            }}>
              <Upload size={20} style={{ color: '#a78bfa', marginBottom: '8px' }} />
              <span style={{ fontSize: '12px', fontWeight: 500 }}>{uploading ? "Ingesting data maps..." : "Drop or click to upload files"}</span>
              
              {/* FIXED: Re-injected ACCEPTED_TYPES variable to whitelist excel files within local explorer prompts */}
              <input 
                type="file" 
                multiple 
                accept={ACCEPTED_TYPES} 
                style={{ display: 'none' }} 
                disabled={uploading} 
                onChange={(e) => handleDrawerFileUpload(e, activeDrawerBiz.id)} 
              />
            </label>
          </div>

          {/* Document Activity Stream */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#52525b', textTransform: 'uppercase', marginBottom: '8px' }}>Indexed Corpora</div>
            
            {drawerDocs.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#52525b', padding: '12px 0', textAlign: 'center' }}>No workspace documents parsed.</div>
            ) : (
              drawerDocs.map(doc => {
                const badge = badgeColor[doc.type] ?? { bg: "#6b6b7822", color: "#6b6b78" };
                return (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', background: '#141416', borderRadius: '6px', marginBottom: '4px', border: '1px solid #18181b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                      <span style={{ 
                        fontSize: '9px', fontWeight: 700, padding: '2px 5px', borderRadius: '4px', 
                        background: badge.bg, color: badge.color, minWidth: '38px', textAlign: 'center' 
                      }}>
                        {doc.type}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={doc.name}>
                          {doc.name}
                        </div>
                        <div style={{ fontSize: '10px', marginTop: '2px' }}>
                          {doc.status === 'processing' && <span style={{ color: '#eab308' }}>⚡ Vectorizing...</span>}
                          {doc.status === 'ready' && <span style={{ color: '#22c55e' }}>Ready</span>}
                          {doc.status === 'failed' && <span style={{ color: '#ef4444' }}>Parsing Failed</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}