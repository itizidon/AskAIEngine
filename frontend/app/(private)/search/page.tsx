import Link from 'next/link';
import { Search, ChevronDown, History, Clock } from 'lucide-react';

export default function SearchHome() {
  return (
    <div className="screen" style={{ position: 'relative' }}>
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', gap: '24px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 500, marginBottom: '6px' }}>What do you want to know?</div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Search across all documents in Acme Clinic</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', maxWidth: '520px', padding: '10px 14px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '40px', background: 'var(--color-background-primary)' }}>
          <Search size={16} style={{ color: 'var(--color-text-tertiary)' }} />
          <input type="text" placeholder="Ask anything about your documents…" style={{ border: 'none', outline: 'none', flex: 1, fontSize: '14px', background: 'transparent', padding: 0 }} />
          <Link href="/search/results" className="btn btn-primary" style={{ borderRadius: '20px', padding: '6px 16px', fontSize: '13px' }}>Search</Link>
        </div>
        <div style={{ width: '100%', maxWidth: '520px' }}>
          <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '8px', fontWeight: 500 }}>Recent searches</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <Link href="/search/results" className="table-row" style={{ padding: '8px 10px', borderRadius: 'var(--border-radius-md)', border: 'none', textDecoration: 'none' }}>
              <Clock size={14} style={{ color: 'var(--color-text-tertiary)' }} />
              <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>How much did Dr. Sue charge?</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}