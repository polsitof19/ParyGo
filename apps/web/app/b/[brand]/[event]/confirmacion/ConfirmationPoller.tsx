'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Lightweight client poller that replaces the previous <meta http-equiv="refresh">.
// Server stays as RSC; this just re-fetches via router.refresh() so the order
// status check re-runs without a full page reload (no scroll loss, no flash).
export function ConfirmationPoller({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
