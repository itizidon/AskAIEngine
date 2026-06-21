import Link from 'next/link';
import { Plus, Users, File, FileText } from 'lucide-react';
import Navbar from '@app/components/Navbar';
import MetricCard from '@app/components/MetricCard';

export default function AdminDashboard() {
  return (
    <div className="screen">
      <Navbar />
      <div style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', marginBottom: '20px', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 500 }}>Your businesses</div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              Manage locations, documents, and users
            </div>
          </div>
          <button className="btn btn-primary"><Plus size={14} /> New business</button>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {/* Acme Clinic Card */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ fontSize: '14px', fontWeight: 500 }}>Acme Clinic</div>
              <span className="badge badge-success">Active</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}><Users size={13} style={{ marginRight: '4px' }} /> 3 users</div>
              <div style={{ display: 'flex', alignItems: 'center' }}><File size={13} style={{ marginRight: '4px' }} /> 12 documents</div>
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
              <Link href="/search" className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: '12px', padding: '5px 0' }}>Open</Link>
              <Link href="/business/acme-clinic" className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: '12px', padding: '5px 0' }}>Manage</Link>
            </div>
          </div>

          {/* Downtown Lab Card */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ fontSize: '14px', fontWeight: 500 }}>Downtown Lab</div>
              <span className="badge badge-success">Active</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}><Users size={13} style={{ marginRight: '4px' }} /> 5 users</div>
              <div style={{ display: 'flex', alignItems: 'center' }}><File size={13} style={{ marginRight: '4px' }} /> 8 documents</div>
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
              <Link href="/search" className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: '12px', padding: '5px 0' }}>Open</Link>
              <Link href="/business/downtown-lab" className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: '12px', padding: '5px 0' }}>Manage</Link>
            </div>
          </div>

          {/* Add Business Upgrade Gate Trigger Link */}
          <Link href="/upgrade" className="card" style={{ borderStyle: 'dashed', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', textDecoration: 'none' }}>
            <Plus size={20} style={{ color: 'var(--color-text-tertiary)' }} />
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Add business</div>
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <MetricCard label="Searches this month" value="340" subtext="340 / 500 · Starter plan" progressPercentage={68} />
          <MetricCard label="Total users" value="8" subtext="across 2 businesses" />
          <MetricCard label="Documents indexed" value="20" subtext="across 2 businesses" />
        </div>
      </div>
    </div>
  );
}