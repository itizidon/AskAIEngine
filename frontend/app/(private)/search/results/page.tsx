import Link from 'next/link';
import { Search, ChevronDown, History, FileSpreadsheet } from 'lucide-react';

export default function SearchResults() {
  return (
    <div className="screen">
      <div className="nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '13px', fontWeight: 500, padding: '5px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-md)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Acme Clinic <ChevronDown size={12} />
          </div>
        </div>
        <div className="nav-right">
          <button className="nav-link" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><History size={13} /> History</button>
          <div className="avatar">BS</div>
        </div>
      </div>
      <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: '472px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', padding: '8px 14px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '40px', background: 'var(--color-background-primary)' }}>
          <Search size={16} style={{ color: 'var(--color-text-tertiary)' }} />
          <span style={{ flex: 1, fontSize: '14px', color: 'var(--color-text-secondary)' }}>How much did Dr. Sue charge?</span>
          <Link href="/search" className="btn" style={{ borderRadius: '20px', padding: '5px 12px', fontSize: '12px' }}>New search</Link>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="card">
            <div style={{ fontSize: '14px', lineHeight: 1.6, marginBottom: '10px' }}>
              Dr. Sue charged <strong>$150</strong> for an office visit on January 3rd, 2024.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileSpreadsheet size={13} style={{ color: 'var(--color-text-tertiary)' }} />
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>billing_2024.csv</span>
              <span className="badge" style={{ background: 'var(--color-background-info)', color: 'var(--color-text-info)', marginLeft: 'auto' }}>chunk 1</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}