type CapacityMeterProps = {
  filled?: number;
  total?: number;
  label?: string;
  className?: string;
};

export function CapacityMeter({
  filled = 38,
  total = 60,
  label = 'AFORO · LIVE',
  className,
}: CapacityMeterProps) {
  const pct = Math.min(100, Math.max(0, (filled / total) * 100));

  return (
    <div className={`w-full ${className ?? ''}`}>
      <div className="mono mb-3 flex items-center justify-between">
        <span>{label}</span>
        <span>
          {filled}/{total}
        </span>
      </div>
      <div className="flex h-2 w-full gap-[2px]">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className="flex-1 transition-colors"
            style={{
              background: i < filled ? '#0A0A0A' : '#E8E6E0',
            }}
          />
        ))}
      </div>
      <div className="mono mt-3 flex items-center justify-between">
        <span style={{ color: '#1F8A5B' }}>
          <span className="mr-1 inline-block h-[6px] w-[6px] -translate-y-[1px] animate-soft-pulse rounded-full bg-accent-green align-middle" />
          ACTUALIZANDO
        </span>
        <span>{pct.toFixed(0)}%</span>
      </div>
    </div>
  );
}
