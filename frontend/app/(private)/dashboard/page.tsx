'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Users, File, Loader2, Building2, Upload, X, Trash2, ShieldAlert, ChevronDown } from 'lucide-react';
import Navbar from '@/components/Navbar';
import MetricCard from '@/components/MetricCard';
import { useBusiness } from '@/app/context/BusinessContext';

const ACCEPTED_TYPES = ".pdf,.txt,.md,.docx,.csv,.xlsx,.xls";

const PLAN_LIMITS: Record<string, { max_organizations: number }> = {
  free: { max_organizations: 1 },
  starter: { max_organizations: 1 },
  pro: { max_organizations: 1 },
};

const badgeColor: Record<string, { bg: string; color: string }> = {
  PDF: { bg: '#fee2e2', color: '#ef4444' },
  TXT: { bg: '#fef3c7', color: '#d97706' },
  MD: { bg: '#e0f2fe', color: '#0284c7' },
  DOCX: { bg: '#e0e7ff', color: '#4f46e5' },
  CSV: { bg: '#dcfce7', color: '#16a34a' },
  XLSX: { bg: '#f3e8ff', color: '#9333ea' },
  XLS: { bg: '#f3e8ff', color: '#9333ea' },
};

interface Doc {
  id: string;
  backendId?: string;
  name: string;
  type: string;
  status: "processing" | "ready" | "failed";
}

interface Org {
  id: number;
  name: string;
  plan: string;
}

export default function AdminDashboard() {
  const { businesses, selectBusiness, isLoading, refreshBusinesses } = useBusiness();

  const [organizations, setOrganizations] = useState<Org[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<number | null>(null);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true);

  const [activeDrawerBiz, setActiveDrawerBiz] = useState<any | null>(null);
  const [drawerDocs, setDrawerDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);

  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [isMounted, setIsMounted] = useState(false);

  const [isBizModalOpen, setIsBizModalOpen] = useState(false);
  const [bizName, setBizName] = useState("");
  const [isCreatingBiz, setIsCreatingBiz] = useState(false);
  const [bizError, setBizError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        const res = await fetch("http://localhost:8000/organizations", {
          method: "GET",
          credentials: "include",
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setOrganizations(data);
        if (data.length > 0) {
          setCurrentOrgId(data[0].id);
        }
      } catch (err) {
        console.error("Failed to retrieve organizational profiles", err);
      } finally {
        setIsLoadingOrgs(false);
      }
    };

    fetchOrganizations();
    setIsMounted(true);
  }, []);

  const activeOrg = organizations.find(o => o.id === currentOrgId);

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;
    setIsCreatingOrg(true);
    setOrgError(null);
    try {
      const res = await fetch("http://localhost:8000/organizations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: orgName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not instantiate an organization.");
      setOrganizations(prev => [...prev, data]);
      setCurrentOrgId(data.id);
      setIsOrgModalOpen(false);
      setOrgName("");
    } catch (err: any) {
      setOrgError(err.message || "An unhandled server anomaly occurred.");
    } finally {
      setIsCreatingOrg(false);
    }
  };

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bizName.trim() || !currentOrgId) return;

    setIsCreatingBiz(true);
    setBizError(null);

    try {
      const res = await fetch("http://localhost:8000/businesses", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: bizName,
          org_id: currentOrgId
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Could not spin up a new business asset.");
      }

      if (refreshBusinesses) {
        await refreshBusinesses();
      } else {
        window.location.reload();
      }

      setIsBizModalOpen(false);
      setBizName("");
    } catch (err: any) {
      setBizError(err.message || "An error occurred while creating the business.");
    } finally {
      setIsCreatingBiz(false);
    }
  };

  const openManagementDrawer = async (biz: any) => {
    setActiveDrawerBiz(biz);
    selectBusiness(biz);
    setDrawerDocs([]);
    try {
      const res = await fetch("http://localhost:8000/documents", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_ids: [biz.id], page: 1, page_size: 50 }),
      });
      const data = await res.json();
      const fetched = data?.documents?.map((d: any) => ({
        id: d.id.toString(),
        backendId: d.id.toString(),
        name: d.name,
        type: d.type ?? d.name.split(".").pop()?.toUpperCase(),
        status: d.status || "ready"
      })) || [];
      setDrawerDocs(fetched);
    } catch (err) {
      console.error("Failed to fetch drawer files", err);
    }
  };

  const handleDrawerFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, bizId: number) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const formData = new FormData();
    const tempDocs: Doc[] = Array.from(files).map(file => {
      const tempId = crypto.randomUUID();
      formData.append("files", file);
      return { id: tempId, name: file.name, type: file.name.split(".").pop()?.toUpperCase() ?? "FILE", status: "processing" };
    });
    formData.append("business_id", bizId.toString());
    setDrawerDocs(prev => [...tempDocs, ...prev]);
    try {
      const res = await fetch("http://localhost:8000/upload-multiple", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDrawerDocs(prev => prev.map(doc => {
        if (doc.status !== "processing") return doc;
        const match = data.uploaded?.find((u: any) => u.filename === doc.name);
        return match ? { ...doc, status: "ready", backendId: match.document_id.toString() } : { ...doc, status: "failed" };
      }));
    } catch (err) {
      setDrawerDocs(prev => prev.map(d => d.status === "processing" ? { ...d, status: "failed" } : d));
    } finally {
      setUploading(false);
      if (e.target) e.target.value = "";
    }
  };

  const filteredBusinesses = businesses.filter(
    b => b.org_id?.toString() === currentOrgId?.toString()
  );

  return (
    <div className="screen" style={{ position: 'relative', overflowX: 'hidden' }}>
      <Navbar />
      <div style={{ padding: '24px' }}>

        {/* Title Section */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
              {isLoadingOrgs ? (
                <div style={{ height: '24px', display: 'flex', alignItems: 'center' }}>
                  <Loader2 className="animate-spin" size={14} style={{ color: 'var(--color-text-secondary)' }} />
                </div>
              ) : (
                <div style={s.dropdownContainer}>
                  <select
                    value={currentOrgId ?? ""}
                    onChange={(e) => setCurrentOrgId(Number(e.target.value))}
                    style={s.orgSelect}
                  >
                    {organizations.map(org => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} style={s.dropdownIcon} />
                </div>
              )}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
              Manage locations, documents, and users
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ position: 'relative', display: 'inline-block' }} className="group">
              <button
                className="btn btn-secondary"
                onClick={() => setIsOrgModalOpen(true)}
                disabled={organizations.length >= (PLAN_LIMITS[activeOrg?.plan?.toLowerCase() || 'free']?.max_organizations ?? 1)}
                style={{
                  fontSize: '13px',
                  opacity: organizations.length >= (PLAN_LIMITS[activeOrg?.plan?.toLowerCase() || 'free']?.max_organizations ?? 1) ? 0.5 : 1,
                  cursor: organizations.length >= (PLAN_LIMITS[activeOrg?.plan?.toLowerCase() || 'free']?.max_organizations ?? 1) ? 'not-allowed' : 'pointer'
                }}
              >
                <Plus size={14} /> New organization
              </button>

              {organizations.length >= (PLAN_LIMITS[activeOrg?.plan?.toLowerCase() || 'free']?.max_organizations ?? 1) && (
                <div style={s.tooltip}>
                  Your current {activeOrg?.plan.toUpperCase() || 'FREE'} tier is restricted to {PLAN_LIMITS[activeOrg?.plan?.toLowerCase() || 'free']?.max_organizations} active organization workspace.
                  <div style={s.tooltipArrow} />
                </div>
              )}
            </div>

            <button
              className="btn btn-primary"
              style={{ fontSize: '13px' }}
              onClick={() => setIsBizModalOpen(true)}
              disabled={isMounted ? !currentOrgId : false}
            >
              <Plus size={14} /> New business
            </button>
          </div>
        </div>

        {/* Workspace Grid Cards */}
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '160px' }}>
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {filteredBusinesses.map((biz) => (
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
          <MetricCard
            label="Searches this month"
            value="340"
            subtext={`340 / 500 · ${activeOrg ? activeOrg.plan.toUpperCase() : 'FREE'} plan`}
            progressPercentage={68}
          />
          <MetricCard label="Total active instances" value={String(filteredBusinesses.length)} subtext="Connected database workspaces" />
        </div>
      </div>

      {/* ── BUSINESS INLINE MODAL WINDOW ── */}
      {isBizModalOpen && (
        <div style={s.modalOverlay}>
          <div style={s.modalContent}>
            <div style={s.modalHeader}>
              <div style={{ fontSize: '15px', fontWeight: 600 }}>
                Create New Business
              </div>
              <button onClick={() => { setIsBizModalOpen(false); setBizError(null); }} style={s.closeBtn}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateBusiness} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                  ASSIGN TO ORGANIZATION
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <select
                    value={currentOrgId ?? ""}
                    onChange={(e) => setCurrentOrgId(Number(e.target.value))}
                    disabled={isCreatingBiz}
                    style={{
                      ...s.modalInput,
                      marginTop: 0,
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      paddingRight: '28px',
                      backgroundColor: 'var(--color-background-secondary, #f4f4f5)',
                      cursor: isCreatingBiz ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {organizations.map(org => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: '10px', pointerEvents: 'none', color: 'var(--color-text-secondary)' }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                  BUSINESS LOCATION NAME
                </label>
                <input
                  type="text"
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  placeholder="e.g. Downtown Branch"
                  required
                  autoFocus
                  disabled={isCreatingBiz}
                  style={s.modalInput}
                />
              </div>

              {bizError && (
                <div style={s.errorAlert}>
                  <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span style={{ fontSize: '11px', lineHeight: '1.4' }}>{bizError}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setIsBizModalOpen(false); setBizError(null); }}
                  disabled={isCreatingBiz}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isCreatingBiz || !bizName.trim()}
                >
                  {isCreatingBiz ? <Loader2 className="animate-spin" size={14} /> : "Create Business"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ORGANIZATION CREATION POPUP WINDOW ── */}
      {isOrgModalOpen && (
        <div style={s.modalOverlay}>
          <div style={s.modalContent}>
            <div style={s.modalHeader}>
              <div style={{ fontSize: '15px', fontWeight: 600 }}>Create New Organization</div>
              <button onClick={() => { setIsOrgModalOpen(false); setOrgError(null); }} style={s.closeBtn}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreateOrganization} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                  ORGANIZATION WORKSPACE NAME
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Acme Holdings LLC"
                  required
                  disabled={isCreatingOrg}
                  style={s.modalInput}
                />
              </div>
              {orgError && (
                <div style={s.errorAlert}>
                  <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span style={{ fontSize: '11px', lineHeight: '1.4' }}>{orgError}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setIsOrgModalOpen(false); setOrgError(null); }} disabled={isCreatingOrg}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isCreatingOrg || !orgName.trim()}>
                  {isCreatingOrg ? <Loader2 className="animate-spin" size={14} /> : "Create Workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slide Drawer Left Panel */}
      {activeDrawerBiz && (
        <div style={s.drawer}>
          <div style={s.drawerHeader}>
            <div>
              <div style={s.drawerTitle}>{activeDrawerBiz.name}</div>
              <div style={s.drawerSub}>File Management Console</div>
            </div>
            <button onClick={() => setActiveDrawerBiz(null)} style={s.closeBtn}>
              <X size={16} />
            </button>
          </div>

          <div style={{ padding: '16px' }}>
            <label style={{ ...s.uploadZone, cursor: uploading ? 'not-allowed' : 'pointer' }}>
              {uploading ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
              <span>{uploading ? "Ingesting data maps..." : "Upload files"}</span>
              <input type="file" multiple accept={ACCEPTED_TYPES} style={{ display: 'none' }} disabled={uploading} onChange={(e) => handleDrawerFileUpload(e, activeDrawerBiz.id)} />
            </label>
          </div>

          <div style={s.drawerBody}>
            <div style={s.sectionLabel}>Indexed Corpora</div>
            {drawerDocs.length === 0 ? (
              <div style={s.emptyText}>No workspace documents parsed.</div>
            ) : (
              <div style={s.docList}>
                {drawerDocs.map(doc => {
                  const badge = badgeColor[doc.type] || { bg: "var(--border)", color: "var(--color-text-secondary)" };
                  return (
                    <div key={doc.id} style={s.docItem}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 5px', borderRadius: '4px', background: badge.bg, color: badge.color, minWidth: '38px', textAlign: 'center' }}>
                          {doc.type}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={s.docName} title={doc.name}>{doc.name}</div>
                          <div style={s.docMeta}>
                            {doc.status === 'processing' && <span style={{ color: '#eab308' }}>⚡ Vectorizing...</span>}
                            {doc.status === 'ready' && <span style={{ color: '#22c55e' }}>Ready</span>}
                            {doc.status === 'failed' && <span style={{ color: '#ef4444' }}>Parsing Failed</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  dropdownContainer: { position: 'relative', display: 'flex', alignItems: 'center' },
  orgSelect: { fontSize: '18px', fontWeight: 500, background: 'transparent', border: 'none', color: 'var(--color-text-primary, #18181b)', cursor: 'pointer', outline: 'none', paddingRight: '20px', appearance: 'none', WebkitAppearance: 'none' },
  dropdownIcon: { position: 'absolute', right: 0, pointerEvents: 'none', color: 'var(--color-text-secondary, #71717a)' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 },
  modalContent: { background: 'var(--color-background-primary, #ffffff)', border: '1px solid var(--color-border-tertiary, #e4e4e7)', borderRadius: '12px', width: '400px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column' },
  modalHeader: { padding: '16px', borderBottom: '1px solid var(--color-border-tertiary, #e4e4e7)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  modalInput: { width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--color-border-tertiary, #e4e4e7)', background: 'transparent', color: 'var(--color-text-primary, #18181b)', outline: 'none', marginTop: '4px' },
  errorAlert: { display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '6px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', color: '#ef4444' },
  drawer: { position: 'fixed', top: 0, right: 0, width: '320px', height: '100vh', background: 'var(--color-background-primary, #ffffff)', borderLeft: '1px solid var(--color-border-tertiary, #e4e4e7)', zIndex: 1000, boxShadow: '-4px 0 24px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' },
  drawerHeader: { padding: '16px', borderBottom: '1px solid var(--border, var(--color-border, #27272a))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  drawerTitle: { fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary, #18181b)' },
  drawerSub: { fontSize: '11px', color: 'var(--color-text-secondary, #71717a)', marginTop: '2px' },
  closeBtn: { background: 'none', border: 'none', color: 'var(--color-text-secondary, #71717a)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' },
  uploadZone: { padding: '8px', background: 'var(--color-background-secondary, #f4f4f5)', border: '1px solid var(--color-border-tertiary, #e4e4e7)', borderRadius: '6px', color: 'var(--color-text-primary, #18181b)', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%' },
  drawerBody: { flex: 1, overflowY: 'auto', padding: '0 16px 16px 16px' },
  sectionLabel: { fontSize: '10px', fontWeight: 600, color: 'var(--color-text-secondary, #52525b)', textTransform: 'uppercase', marginBottom: '8px' },
  emptyText: { fontSize: '11px', color: 'var(--color-text-secondary, #4b4b52)', padding: '12px 0', textAlign: 'center' },
  docList: { display: 'flex', flexDirection: 'column', gap: '4px' },
  docItem: { display: 'flex', alignItems: 'center', padding: '8px 10px', background: 'var(--color-background-primary, #ffffff)', borderRadius: '8px', border: '1px solid var(--color-border-tertiary, #e4e4e7)', justifyContent: 'space-between' },
  docName: { fontSize: '11px', color: 'var(--color-text-primary, #18181b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  docMeta: { fontSize: '9px', marginTop: '1px' },
  tooltip: { position: 'absolute', bottom: '135%', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#1f2937', color: '#ffffff', fontSize: '11px', lineHeight: '1.4', padding: '8px 12px', borderRadius: '6px', width: '220px', textAlign: 'center', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', zIndex: 3000, pointerEvents: 'none', opacity: 0, transition: 'opacity 0.2s ease, transform 0.2s ease' },
  tooltipArrow: { position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', borderWidth: '5px', borderStyle: 'solid', borderColor: '#1f2937 transparent transparent transparent' },
};