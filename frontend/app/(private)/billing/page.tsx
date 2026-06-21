import Link from 'next/link';
import Navbar from '@/components/Navbar';
import MetricCard from '@/components/MetricCard';

export default function BillingPlan() {
  return (
    <div className="screen">
      <Navbar />
      <div style={{ padding: '24px' }}>
        <div style={{ fontSize: '18px', fontWeight: 500, marginBottom: '4px' }}>Billing</div>
        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '20px' }}>Current plan and usage</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', padding: '14px 16px', background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', marginBottom: '20px', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Current plan</div>
            <div style={{ fontSize: '16px', fontWeight: 500, marginTop: '2px' }}>Starter · $49/month</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>Renews July 1, 2026</div>
          </div>
          <Link href="/upgrade" className="btn btn-primary">Upgrade plan</Link>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
          <MetricCard label="Searches" value="340" subtext="340 / 500 · resets Jul 1" progressPercentage={68} />
          <MetricCard label="Businesses" value="1" subtext="1 / 1 · upgrade to add more" progressPercentage={100} danger />
          <MetricCard label="Users" value="3" subtext="3 / 5" progressPercentage={60} />
        </div>
      </div>
    </div>
  );
}