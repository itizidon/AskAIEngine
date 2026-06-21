interface MetricProps {
    label: string;
    value: string | number;
    subtext: string;
    progressPercentage?: number;
    danger?: boolean;
  }
  
  export default function MetricCard({ label, value, subtext, progressPercentage, danger }: MetricProps) {
    return (
      <div className="metric">
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}</div>
        {progressPercentage !== undefined && (
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ 
                width: `${progressPercentage}%`, 
                background: danger ? 'var(--color-text-danger)' : 'var(--color-background-info)' 
              }}
            />
          </div>
        )}
        <div 
          style={{ 
            fontSize: '11px', 
            color: danger ? 'var(--color-text-danger)' : 'var(--color-text-tertiary)', 
            marginTop: '4px' 
          }}
        >
          {subtext}
        </div>
      </div>
    );
  }