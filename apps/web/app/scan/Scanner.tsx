'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Scanner as QrScanner, type IDetectedBarcode } from '@yudiel/react-qr-scanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { validateScanAction, preloadEventAction, type ScanResult } from './actions';
import {
  cacheTickets,
  getCachedTicket,
  bumpLocalScan,
  enqueueScan,
  pendingScans,
  markScanSynced,
  getDeviceId,
} from '@/lib/offline-scan';

type EventOpt = { id: string; name: string; starts_at: string };
type Shown = ScanResult & { offline?: boolean };

const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

const PALETTE: Record<string, { bg: string; label: string }> = {
  OK: { bg: '#16a34a', label: 'ACCESO OK' },
  REENTRY: { bg: '#d97706', label: 'RE-ENTRADA' },
  ALREADY_USED: { bg: '#dc2626', label: 'YA USADO' },
  NOT_FOUND: { bg: '#dc2626', label: 'TICKET INVÁLIDO' },
  NOT_AUTHORIZED: { bg: '#dc2626', label: 'NO AUTORIZADO' },
  INVALIDATED: { bg: '#dc2626', label: 'ENTRADA ANULADA' },
  ERROR: { bg: '#dc2626', label: 'ERROR · REINTENTÁ' },
  // Offline and the QR wasn't in the preloaded list → don't hard-deny a
  // possibly-valid ticket at the door; flag it for manual review. It still
  // gets queued and the server decides the truth on sync.
  OFFLINE_UNKNOWN: { bg: '#d97706', label: 'VERIFICAR MANUAL' },
};

export function Scanner({ events, brandName }: { events: EventOpt[]; brandName: string }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? '');
  const [online, setOnline] = useState(true);
  const [result, setResult] = useState<Shown | null>(null);
  const [validated, setValidated] = useState(0);
  const [total, setTotal] = useState(0);
  const [pending, setPending] = useState(0);
  const [cameraOn, setCameraOn] = useState(true);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const lastScan = useRef<{ qr: string; ts: number }>({ qr: '', ts: 0 });
  const deviceId = useRef('');

  useEffect(() => { deviceId.current = getDeviceId(); }, []);

  const refreshPending = useCallback(async () => {
    setPending((await pendingScans()).length);
  }, []);

  const syncQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    const pend = await pendingScans();
    for (const s of pend) {
      try {
        const r = await validateScanAction({
          qr: s.qr_code, offline: true, scannedAt: s.scanned_at,
          deviceId: s.device_id, clientScanId: s.client_scan_id,
        });
        await markScanSynced(s.client_scan_id, r.status);
      } catch {
        break; // still offline
      }
    }
    await refreshPending();
  }, [refreshPending]);

  // Preload the event's valid QRs (and counters) when online / on event change.
  useEffect(() => {
    if (!eventId) return;
    (async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const r = await preloadEventAction(eventId);
      if (r.ok && r.tickets) {
        await cacheTickets(r.tickets);
        setValidated(r.validated ?? 0);
        setTotal(r.total ?? 0);
      }
    })();
  }, [eventId]);

  // Online/offline tracking + periodic queue drain.
  useEffect(() => {
    const up = () => { setOnline(true); syncQueue(); };
    const down = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    const iv = setInterval(() => { void syncQueue(); }, 20000);
    void refreshPending();
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); clearInterval(iv); };
  }, [syncQueue, refreshPending]);

  const handleQr = useCallback(async (qr: string) => {
    setBusy(true);
    try {
      if (navigator.onLine) {
        try {
          const r = await validateScanAction({ qr, deviceId: deviceId.current });
          setResult(r);
          if (r.ok && r.status === 'OK') { setValidated((v) => v + 1); await bumpLocalScan(qr); }
          return;
        } catch { /* network blip → offline path */ }
      }
      // Offline: validate against the cached list, queue for sync.
      const cached = await getCachedTicket(qr);
      const csid = crypto.randomUUID();
      await enqueueScan({ client_scan_id: csid, qr_code: qr, scanned_at: new Date().toISOString(), device_id: deviceId.current, synced: false });
      if (!cached) {
        // Not in the offline cache — could be a valid ticket issued after the
        // preload or the wrong event. Flag for manual review, don't deny.
        setResult({ ok: false, status: 'OFFLINE_UNKNOWN', offline: true });
      } else {
        const can = cached.max_scans === null || cached.scan_count < cached.max_scans;
        if (can) {
          const first = cached.scan_count === 0;
          await bumpLocalScan(qr);
          if (first) setValidated((v) => v + 1);
          setResult({ ok: true, status: first ? 'OK' : 'REENTRY', attendee_name: cached.attendee_name, ticket_type_name: cached.ticket_type_name, scan_count: cached.scan_count + 1, max_scans: cached.max_scans, offline: true });
        } else {
          setResult({ ok: false, status: 'ALREADY_USED', attendee_name: cached.attendee_name, ticket_type_name: cached.ticket_type_name, scan_count: cached.scan_count, max_scans: cached.max_scans, offline: true });
        }
      }
      await refreshPending();
    } finally {
      setBusy(false);
    }
  }, [refreshPending]);

  const onDetect = useCallback((codes: IDetectedBarcode[]) => {
    const raw = codes[0]?.rawValue ?? '';
    const qr = raw.match(UUID_RE)?.[0];
    const now = Date.now();
    if (!qr) { setResult({ ok: false, status: 'NOT_FOUND' }); return; }
    if (lastScan.current.qr === qr && now - lastScan.current.ts < 2500) return; // debounce same code
    lastScan.current = { qr, ts: now };
    void handleQr(qr);
  }, [handleQr]);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const qr = manual.match(UUID_RE)?.[0];
    if (qr) { void handleQr(qr); setManual(''); }
    else setResult({ ok: false, status: 'NOT_FOUND' });
  };

  const pal = result ? PALETTE[result.status] ?? PALETTE.ERROR : null;

  return (
    <div className="space-y-4">
      {/* Top bar: event + status + counter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={eventId}
          onChange={(e) => { setEventId(e.target.value); setResult(null); }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {events.map((ev) => (<option key={ev.id} value={ev.id}>{ev.name}</option>))}
        </select>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em]">
          <span className={online ? 'text-green' : 'text-yellow'}>● {online ? 'ONLINE' : 'OFFLINE'}</span>
          {pending > 0 && <span className="text-yellow">{pending} por sincronizar</span>}
          <span className="text-muted-foreground">{validated} / {total} validados</span>
        </div>
      </div>

      {/* Big result */}
      {pal && (
        <div className="rounded-xl p-6 text-center text-white" style={{ background: pal.bg }}>
          <p className="font-display text-4xl uppercase leading-none tracking-tight">{pal.label}</p>
          {result?.attendee_name && <p className="mt-2 text-2xl font-semibold">{result.attendee_name}</p>}
          {result?.ticket_type_name && <p className="text-lg opacity-90">{result.ticket_type_name}</p>}
          {result?.status === 'OFFLINE_UNKNOWN' && (
            <p className="mt-2 text-base">No estaba en la lista precargada. Revisá el ticket a mano.</p>
          )}
          {result?.status === 'REENTRY' && result.max_scans != null && (
            <p className="mt-1 font-mono text-sm">re-entrada {result.scan_count} / {result.max_scans}</p>
          )}
          {result?.status === 'ALREADY_USED' && result.first_validated_at && (
            <p className="mt-1 font-mono text-xs opacity-90">
              primer ingreso {new Date(result.first_validated_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
          {result?.offline && <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] opacity-80">offline · se sincronizará</p>}
        </div>
      )}

      {/* Camera */}
      <div className="overflow-hidden rounded-xl border border-border bg-black">
        {cameraOn ? (
          <QrScanner
            onScan={onDetect}
            onError={() => {}}
            formats={['qr_code']}
            scanDelay={400}
            components={{ finder: true }}
            styles={{ container: { width: '100%' } }}
          />
        ) : (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Cámara pausada</div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => setCameraOn((v) => !v)}>
          {cameraOn ? 'Pausar cámara' : 'Reanudar cámara'}
        </Button>
        {busy && <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">validando…</span>}
      </div>

      {/* Manual fallback */}
      <form onSubmit={submitManual} className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Código manual (si la cámara falla)</label>
          <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="UUID del ticket" />
        </div>
        <Button type="submit" variant="default">Validar</Button>
      </form>

      <p className="text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Puerta de {brandName}
      </p>
    </div>
  );
}
