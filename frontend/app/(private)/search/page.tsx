'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, ChevronDown, History, Clock, Loader2, Building2, MessageSquare, ArrowRight } from 'lucide-react';
import { useBusiness } from '@/app/context/BusinessContext';

interface RagResponse {
  answer: string;
  sources: string[];
  chunks_used: number;
}

export default function SearchHome() {
  // 1. Consume the real active business from your global state context
  const { selectedBusiness, businesses, selectBusiness } = useBusiness();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // 2. Local states for interactive input and querying
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RagResponse | null>(null);

  // 3. Form submit handler pointing to your POST /ask endpoint
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !selectedBusiness) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("http://localhost:8000/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: query,
          business_id: selectedBusiness.id,
          get_k: 5,
          offset: 0
        })
      });

      if (!response.ok) throw new Error("Search execution failed");
      const data = await response.json();
      setResult(data);
    } catch (err) {
      console.error("RAG Error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen" style={{ position: 'relative' }}>
      {/* Navbar with Scaled Business Switcher */}
      <div className="nav" style={{ overflow: 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
          <button 
            className="btn" 
            style={{ fontSize: '13px', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <Building2 size={13} style={{ color: 'var(--color-text-secondary)' }} />
            {selectedBusiness ? selectedBusiness.name : "Select Business"} <ChevronDown size={12} />
          </button>

          {isDropdownOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, width: '220px',
              background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 'var(--border-radius-md)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 100, padding: '4px'
            }}>
              {businesses.map((biz) => (
                <button
                  key={biz.id}
                  style={{
                    width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', borderRadius: '4px',
                    fontSize: '12px', background: selectedBusiness?.id === biz.id ? 'var(--color-background-secondary)' : 'transparent',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    selectBusiness(biz);
                    setIsDropdownOpen(false);
                    setResult(null); // Clear previous results upon swapping domains
                  }}
                >
                  {biz.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="nav-right">
          <button className="nav-link" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><History size={13} /> History</button>
          <div className="avatar">BS</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: '24px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 500, marginBottom: '6px' }}>What do you want to know?</div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Search across documents in <span style={{ fontWeight: 600, color: 'var(--color-text-info)' }}>{selectedBusiness?.name || "your business"}</span>
          </div>
        </div>

        {/* Dynamic Search Form Wrapper */}
        <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', maxWidth: '520px', padding: '6px 10px 6px 14px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '40px', background: 'var(--color-background-primary)' }}>
          <Search size={16} style={{ color: 'var(--color-text-tertiary)' }} />
          <input 
            type="text" 
            placeholder="Ask anything about your documents…" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={!selectedBusiness || loading}
            style={{ border: 'none', outline: 'none', flex: 1, fontSize: '14px', background: 'transparent', padding: 0 }} 
          />
          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={loading || !query.trim() || !selectedBusiness}
            style={{ borderRadius: '20px', padding: '6px 16px', fontSize: '13px' }}
          >
            {loading ? <Loader2 className="animate-spin" size={14} /> : "Search"}
          </button>
        </form>

        {/* Workspace Display Area: Renders the RAG output if available */}
        {result && (
          <div className="card" style={{ width: '100%', maxWidth: '520px', padding: '16px', borderRadius: 'var(--border-radius-lg)', background: 'var(--color-background-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '10px' }}>
              <MessageSquare size={16} style={{ color: 'var(--color-text-info)', marginTop: '2px' }} />
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: '1.4' }}>
                {result.answer}
              </div>
            </div>
            {result.sources.length > 0 && (
              <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', paddingTop: '10px', marginTop: '10px' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 500, marginBottom: '4px' }}>Sources Verified:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {result.sources.map((src, idx) => (
                    <span key={idx} className="badge badge-success" style={{ fontSize: '10px', padding: '2px 6px' }}>{src}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* History Mock fallback section remains clean */}
        {!result && (
          <div style={{ width: '100%', maxWidth: '520px' }}>
            <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '8px', fontWeight: 500 }}>Recent queries</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <button 
                type="button"
                className="table-row" 
                style={{ width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 'var(--border-radius-md)', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                onClick={() => setQuery("How much did Dr. Sue charge?")}
              >
                <Clock size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', flex: 1 }}>How much did Dr. Sue charge?</span>
                <ArrowRight size={12} style={{ color: 'var(--color-text-tertiary)' }} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}