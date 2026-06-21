'use client';

import Link from 'next/link';
import { ArrowLeft, Search, Upload, Trash, FileText, FileSpreadsheet, UserPlus } from 'lucide-react';
import { useBusiness } from '@/app/context/BusinessContext';

export default function MultiBusinessDetail() {
  const { selectedBusinessIds, toggleBusinessSelection } = useBusiness();

  const formatBusinessName = (idString: string) => {
    return idString
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  return (
    <div className="screen">
      {/* Top Header */}
      <div className="nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/dashboard" className="btn" style={{ padding: '5px 10px', fontSize: '12px' }}>
            <ArrowLeft size={14} /> Dashboard
          </Link>
          <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
            Viewing: {selectedBusinessIds.length === 0 ? (
              <span style={{ color: 'var(--color-text-danger)' }}>No businesses selected</span>
            ) : (
              selectedBusinessIds.map(id => formatBusinessName(id)).join(', ')
            )}
          </div>
        </div>
        <Link href="/search" className="btn btn-primary"><Search size={14} /> Open search</Link>
      </div>

      {/* Main Panel View */}
      <div style={{ display: 'flex', height: '472px', overflow: 'hidden' }}>
        
        {/* If no business is selected, show an empty state selector panel */}
        {selectedBusinessIds.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)' }}>
            <p>Please select a business from your dashboard to view its components.</p>
          </div>
        ) : (
          // Otherwise, dynamically iterate through whatever is active in Context
          selectedBusinessIds.map((bizId) => (
            <div 
              key={bizId} 
              style={{ 
                flex: 1, 
                padding: '20px', 
                borderRight: '0.5px solid var(--color-border-tertiary)', 
                overflowY: 'auto',
                background: 'var(--color-background-primary)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid var(--color-border-tertiary)', paddingBottom: '8px' }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-info)' }}>
                  {formatBusinessName(bizId)}
                </div>
                <button 
                  className="btn" 
                  style={{ fontSize: '11px', padding: '2px 6px', color: 'var(--color-text-danger)' }}
                  onClick={() => toggleBusinessSelection(bizId)}
                >
                  Deselect
                </button>
              </div>

              {/* Documents Subsection for this specific business */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>Documents</div>
                  <button className="btn" style={{ fontSize: '11px', padding: '4px 8px' }}><Upload size={12} /> Upload</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div className="table-row">
                    <FileText size={16} style={{ color: '#E24B4A', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px' }}>{bizId}_sop_hygiene.pdf</div>
                    </div>
                    <span className="badge badge-success" style={{ fontSize: '10px' }}>Ready</span>
                    <button className="btn" style={{ padding: '2px 6px' }}><Trash size={12} /></button>
                  </div>
                </div>
              </div>

              {/* Users Subsection for this specific business */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>Authorized Users</div>
                  <button className="btn" style={{ fontSize: '11px', padding: '4px 8px' }}><UserPlus size={12} /> Invite</button>
                </div>
                <div className="table-row">
                  <div className="avatar" style={{ width: '24px', height: '24px', fontSize: '10px' }}>JD</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px' }}>manager@{bizId}.com</div>
                  </div>
                  <span className="badge badge-info" style={{ fontSize: '10px' }}>Admin</span>
                </div>
              </div>

            </div>
          ))
        )}

      </div>
    </div>
  );
}