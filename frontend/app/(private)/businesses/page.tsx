'use client';

import { useState, useEffect, useMemo, ChangeEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, Upload, Trash, FileText, UserPlus, ChevronsUpDown, Building2, Loader2 } from 'lucide-react';
import { useBusiness } from '@/app/context/BusinessContext';

interface ServerDocument {
  id: string;
  name: string;
  type: string;
  business_id: number;
}

export default function EnterpriseBusinessDetail() {
  const { businesses, selectedBusiness, selectBusiness, clearSelection, isLoading: contextLoading } = useBusiness();
  
  // Local UI Interactivity States
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [documents, setDocuments] = useState<ServerDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Memoized filter for clientside selection lists
  const filteredBusinesses = useMemo(() => {
    if (!searchQuery) return businesses;
    return businesses.filter((biz) =>
      biz.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, businesses]);

  // Sync documents whenever active focus layout targets change
  useEffect(() => {
    if (!selectedBusiness) return;

    const fetchDocs = async () => {
      setDocsLoading(true);
      try {
        const res = await fetch("http://localhost:8000/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            business_ids: [selectedBusiness.id],
            page: 1,
            page_size: 50
          })
        });
        const data = await res.json();
        if (data.documents) {
          setDocuments(data.documents);
        }
      } catch (err) {
        console.error("Error retrieving documents:", err);
      } finally {
        setDocsLoading(false);
      }
    };

    fetchDocs();
  }, [selectedBusiness]);

  // Handle file injection pipeline
  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !selectedBusiness) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append("business_id", selectedBusiness.id.toString());
    
    Array.from(e.target.files).forEach((file) => {
      formData.append("files", file);
    });

    try {
      const res = await fetch("http://localhost:8000/upload-multiple", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.uploaded) {
        // Re-append items cleanly onto current state layout stack
        const newDocs: ServerDocument[] = data.uploaded.map((u: any) => ({
          id: u.document_id.toString(),
          name: u.filename,
          type: u.filename.split('.').pop()?.toUpperCase() || 'UNKNOWN',
          business_id: selectedBusiness.id
        }));
        setDocuments((prev) => [...newDocs, ...prev]);
      }
    } catch (err) {
      console.error("Upload failure:", err);
    } finally {
      setUploading(false);
    }
  };

  // Handle destructive removal items
  const handleDeleteDoc = async (docId: string) => {
    if (!selectedBusiness) return;
    try {
      const res = await fetch(`http://localhost:8000/documents/${docId}?business_id=${selectedBusiness.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDocuments((prev) => prev.filter(d => d.id !== docId));
      }
    } catch (err) {
      console.error("Error purging target document record:", err);
    }
  };

  if (contextLoading) {
    return (
      <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '520px' }}>
        <Loader2 className="animate-spin" size={24} style={{ color: 'var(--color-text-info)' }} />
      </div>
    );
  }

  return (
    <div className="screen" style={{ position: 'relative' }}>
      {/* Top Header Selector */}
      <div className="nav" style={{ overflow: 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <Link href="/dashboard" className="btn" style={{ padding: '5px 10px', fontSize: '12px', flexShrink: 0 }}>
            <ArrowLeft size={14} /> Dashboard
          </Link>
          
          <div style={{ position: 'relative', width: '280px' }}>
            <button 
              className="btn" 
              style={{ width: '100%', justifyContent: 'space-between', padding: '6px 12px' }}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <Building2 size={14} style={{ color: 'var(--color-text-secondary)' }} />
                {selectedBusiness ? selectedBusiness.name : "Select a business..."}
              </span>
              <ChevronsUpDown size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
            </button>

            {/* Scale-safe Search Dropdown Context Layer */}
            {isDropdownOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, width: '100%',
                background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-secondary)',
                borderRadius: 'var(--border-radius-lg)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 50, padding: '4px',
              }}>
                <input 
                  type="text" placeholder="Filter locations..." value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ fontSize: '12px', padding: '6px 10px', marginBottom: '4px', borderRadius: 'var(--border-radius-md)' }}
                  autoFocus
                />
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {filteredBusinesses.length === 0 ? (
                    <div style={{ padding: '8px', fontSize: '12px', color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
                      No locations linked
                    </div>
                  ) : (
                    filteredBusinesses.map((biz) => (
                      <button
                        key={biz.id}
                        style={{
                          width: '100%', textAlign: 'left', padding: '6px 10px',
                          background: selectedBusiness?.id === biz.id ? 'var(--color-background-info)' : 'transparent',
                          color: selectedBusiness?.id === biz.id ? 'var(--color-text-info)' : 'var(--color-text-primary)',
                          border: 'none', borderRadius: 'var(--border-radius-md)', fontSize: '12px', cursor: 'pointer', display: 'block'
                        }}
                        onClick={() => {
                          selectBusiness(biz);
                          setIsDropdownOpen(false);
                          setSearchQuery('');
                        }}
                      >
                        {biz.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <Link href="/search" className="btn btn-primary" style={{ flexShrink: 0 }}><Search size={14} /> Open search</Link>
      </div>

      {/* Main Workspace Frame Workspace */}
      <div style={{ display: 'flex', height: '472px', overflow: 'hidden' }}>
        {!selectedBusiness ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', gap: '8px' }}>
            <Building2 size={32} style={{ color: 'var(--color-text-tertiary)' }} />
            <p style={{ fontSize: '13px' }}>Use the location switcher above to see context indices.</p>
          </div>
        ) : (
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto', background: 'var(--color-background-primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid var(--color-border-tertiary)', paddingBottom: '8px' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-info)' }}>{selectedBusiness.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>System Account Index Token: #{selectedBusiness.id}</div>
              </div>
              <button className="btn" style={{ fontSize: '11px', padding: '2px 6px', color: 'var(--color-text-danger)' }} onClick={clearSelection}>Clear View</button>
            </div>

            <div style={{ display: 'flex', gap: '20px' }}>
              {/* Dynamic Documents List Panel */}
              <div style={{ flex: 1, marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>Documents</div>
                  <label className="btn" style={{ fontSize: '11px', padding: '4px 8px', cursor: 'pointer' }}>
                    {uploading ? <Loader2 className="animate-spin" size={12} /> : <Upload size={12} />} 
                    {uploading ? " Uploading..." : " Upload File"}
                    <input type="file" multiple onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} />
                  </label>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {docsLoading ? (
                    <div style={{ padding: '20px', textAlignment: 'center', display: 'flex', justifyContent: 'center' }}><Loader2 className="animate-spin" size={16} /></div>
                  ) : documents.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', padding: '10px 0' }}>No files indexed yet.</div>
                  ) : (
                    documents.map((doc) => (
                      <div className="table-row" key={doc.id}>
                        <FileText size={16} style={{ color: '#E24B4A', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '12px', wordBreak: 'break-all' }}>{doc.name}</div>
                        </div>
                        <span className="badge badge-success" style={{ fontSize: '10px' }}>{doc.type}</span>
                        <button className="btn" style={{ padding: '2px 6px' }} onClick={() => handleDeleteDoc(doc.id)}><Trash size={12} /></button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Users Metadata Block */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>Authorized Users</div>
                  <button className="btn" style={{ fontSize: '11px', padding: '4px 8px' }}><UserPlus size={12} /> Invite</button>
                </div>
                <div className="table-row">
                  <div className="avatar" style={{ width: '24px', height: '24px', fontSize: '10px' }}>SYSTEM</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px' }}>Access tied to database instance</div>
                  </div>
                  <span className="badge badge-info" style={{ fontSize: '10px' }}>Root Account</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}