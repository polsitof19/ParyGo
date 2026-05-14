'use client';

import { useEffect, useState } from 'react';

const pad = (n: number) => String(n).padStart(2, '0');

function limaTime(): { h: number; m: number; s: number } {
  const now = new Date();
  // Lima is UTC-5, no DST
  const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
  const lima = new Date(utc.getTime() - 5 * 3600 * 1000);
  return {
    h: lima.getHours(),
    m: lima.getMinutes(),
    s: lima.getSeconds(),
  };
}

type LiveClockProps = {
  withSeconds?: boolean;
  className?: string;
};

export function LiveClock({ withSeconds = true, className }: LiveClockProps) {
  const [t, setT] = useState<{ h: number; m: number; s: number } | null>(null);

  useEffect(() => {
    setT(limaTime());
    const id = window.setInterval(() => setT(limaTime()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!t) return <span className={className}>--:--{withSeconds ? ':--' : ''}</span>;

  return (
    <span className={className}>
      {pad(t.h)}:{pad(t.m)}
      {withSeconds ? `:${pad(t.s)}` : ''}
    </span>
  );
}
