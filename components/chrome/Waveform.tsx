'use client';

import { useEffect, useState } from 'react';

type WaveformProps = {
  bars?: number;
  height?: number;
  minH?: number;
  maxH?: number;
  className?: string;
};

// Audio-like reactive bars. Heights randomized client-side so SSR/SSG
// produces a stable empty container — no hydration mismatch.
export function Waveform({
  bars = 32,
  height = 36,
  minH = 12,
  maxH = 36,
  className,
}: WaveformProps) {
  const [items, setItems] = useState<{ h: number; d: number }[] | null>(null);

  useEffect(() => {
    setItems(
      Array.from({ length: bars }).map(() => ({
        h: minH + Math.random() * (maxH - minH),
        d: Math.random() * 1.2,
      }))
    );
  }, [bars, minH, maxH]);

  return (
    <span
      className={`flex items-end gap-[2px] ${className ?? ''}`}
      style={{ height }}
      aria-hidden="true"
    >
      {items?.map((it, i) => (
        <i
          key={i}
          className="block w-[2px] rounded-[1px] origin-bottom"
          style={{
            background: 'var(--cyan)',
            height: it.h,
            animation: `bar 1.2s ease-in-out ${it.d}s infinite alternate`,
          }}
        />
      ))}
    </span>
  );
}
