'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { purgeOfflineScanData } from '@/lib/offline-scan';

// Cierre de sesión del validador: PURGA el estado offline (cache de tickets con
// DNI/datos de asistentes + cola + claves locales) ANTES de cerrar sesión, para
// no dejar PII en el dispositivo de puerta. Luego POSTea al logout server-side.
export function ScanLogoutButton() {
  const [busy, setBusy] = useState(false);

  async function onLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await purgeOfflineScanData();
    } catch {
      /* best-effort: aunque falle la purga, cerramos sesión igual */
    }
    // POST real al endpoint de logout (mantiene la semántica server-side).
    const form = document.createElement('form');
    form.method = 'post';
    form.action = '/auth/logout';
    document.body.appendChild(form);
    form.submit();
  }

  return (
    <button type="button" onClick={onLogout} disabled={busy} aria-label="Cerrar sesión" className="k-logout">
      <LogOut className="h-4 w-4" />
    </button>
  );
}
