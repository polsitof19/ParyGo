'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Scanner as QrScanner, type IDetectedBarcode } from '@yudiel/react-qr-scanner';
import { Check, X, AlertTriangle, Volume2, VolumeX, Camera, CameraOff } from 'lucide-react';
import { validateScanAction, preloadEventAction, type ScanResult } from './actions';
import {
  cacheTickets, getCachedTicket, bumpLocalScan, enqueueScan, pendingScans, markScanSynced, getDeviceId,
} from '@/lib/offline-scan';

type EventOpt = { id: string; name: string; starts_at: string };
type Shown = ScanResult & { offline?: boolean };

const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

// tone: 'ok' | 'warn' | 'deny' → caracteriza color + sonido del resultado.
const STATUS: Record<string, { tone: 'ok' | 'warn' | 'deny'; label: string }> = {
  OK: { tone: 'ok', label: 'ACCESO OK' },
  REENTRY: { tone: 'warn', label: 'RE-ENTRADA' },
  ALREADY_USED: { tone: 'deny', label: 'YA USADO' },
  NOT_FOUND: { tone: 'deny', label: 'TICKET INVÁLIDO' },
  NOT_AUTHORIZED: { tone: 'deny', label: 'NO AUTORIZADO' },
  INVALIDATED: { tone: 'deny', label: 'ENTRADA ANULADA' },
  ERROR: { tone: 'deny', label: 'ERROR · REINTENTÁ' },
  OFFLINE_UNKNOWN: { tone: 'warn', label: 'VERIFICAR MANUAL' },
};

const docLabel = (t?: string | null) => (t === 'ce' ? 'CE' : t === 'passport' ? 'Pasaporte' : 'DNI');

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
  const [muted, setMuted] = useState(false);
  const lastScan = useRef<{ qr: string; ts: number }>({ qr: '', ts: 0 });
  const deviceId = useRef('');
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    deviceId.current = getDeviceId();
    setMuted(localStorage.getItem('parygo-scan-muted') === '1');
    // Desbloquear audio en el primer toque (requisito móvil).
    const unlock = () => { ensureAudio(); window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  function ensureAudio(): AudioContext | null {
    if (!audioRef.current) {
      try { audioRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { return null; }
    }
    if (audioRef.current && audioRef.current.state === 'suspended') void audioRef.current.resume();
    return audioRef.current;
  }
  function beep(freq: number, durMs: number) {
    const c = ensureAudio(); if (!c) return;
    const o = c.createOscillator(); const g = c.createGain();
    o.connect(g); g.connect(c.destination); o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.35, c.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durMs / 1000);
    o.start(); o.stop(c.currentTime + durMs / 1000);
  }
  function feedback(tone: 'ok' | 'warn' | 'deny') {
    const vib = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch {} };
    if (tone === 'ok') { vib(60); if (!muted) beep(900, 150); }
    else if (tone === 'warn') { vib([40, 50, 40]); if (!muted) beep(620, 170); }
    else { vib([150, 90, 150]); if (!muted) { beep(200, 220); setTimeout(() => beep(170, 260), 160); } }
  }
  function toggleMute() {
    setMuted((m) => { const n = !m; localStorage.setItem('parygo-scan-muted', n ? '1' : '0'); return n; });
  }

  const refreshPending = useCallback(async () => { setPending((await pendingScans()).length); }, []);

  const syncQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    const pend = await pendingScans();
    for (const s of pend) {
      try {
        const r = await validateScanAction({ qr: s.qr_code, offline: true, scannedAt: s.scanned_at, deviceId: s.device_id, clientScanId: s.client_scan_id });
        await markScanSynced(s.client_scan_id, r.status);
      } catch { break; }
    }
    await refreshPending();
  }, [refreshPending]);

  useEffect(() => {
    if (!eventId) return;
    (async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const r = await preloadEventAction(eventId);
      if (r.ok && r.tickets) { await cacheTickets(r.tickets); setValidated(r.validated ?? 0); setTotal(r.total ?? 0); }
    })();
  }, [eventId]);

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

  const show = useCallback((r: Shown) => {
    setResult(r);
    feedback(STATUS[r.status]?.tone ?? 'deny');
  }, [muted]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleQr = useCallback(async (qr: string) => {
    setBusy(true);
    try {
      if (navigator.onLine) {
        try {
          const r = await validateScanAction({ qr, deviceId: deviceId.current });
          show(r);
          if (r.ok && r.status === 'OK') { setValidated((v) => v + 1); await bumpLocalScan(qr); }
          return;
        } catch { /* blip → offline */ }
      }
      const cached = await getCachedTicket(qr);
      const csid = crypto.randomUUID();
      await enqueueScan({ client_scan_id: csid, qr_code: qr, scanned_at: new Date().toISOString(), device_id: deviceId.current, synced: false });
      if (!cached) {
        show({ ok: false, status: 'OFFLINE_UNKNOWN', offline: true });
      } else {
        const can = cached.max_scans === null || cached.scan_count < cached.max_scans;
        if (can) {
          const first = cached.scan_count === 0;
          await bumpLocalScan(qr);
          if (first) setValidated((v) => v + 1);
          show({ ok: true, status: first ? 'OK' : 'REENTRY', attendee_name: cached.attendee_name, ticket_type_name: cached.ticket_type_name, scan_count: cached.scan_count + 1, max_scans: cached.max_scans, buyer_dni: cached.buyer_dni, buyer_doc_type: cached.buyer_doc_type, offline: true });
        } else {
          show({ ok: false, status: 'ALREADY_USED', attendee_name: cached.attendee_name, ticket_type_name: cached.ticket_type_name, scan_count: cached.scan_count, max_scans: cached.max_scans, buyer_dni: cached.buyer_dni, buyer_doc_type: cached.buyer_doc_type, offline: true });
        }
      }
      await refreshPending();
    } finally { setBusy(false); }
  }, [refreshPending, show]);

  const onDetect = useCallback((codes: IDetectedBarcode[]) => {
    const raw = codes[0]?.rawValue ?? '';
    const qr = raw.match(UUID_RE)?.[0];
    const now = Date.now();
    if (!qr) { show({ ok: false, status: 'NOT_FOUND' }); return; }
    if (lastScan.current.qr === qr && now - lastScan.current.ts < 2500) return;
    lastScan.current = { qr, ts: now };
    void handleQr(qr);
  }, [handleQr, show]);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const qr = manual.match(UUID_RE)?.[0];
    if (qr) { void handleQr(qr); setManual(''); } else show({ ok: false, status: 'NOT_FOUND' });
  };

  const st = result ? STATUS[result.status] ?? STATUS.ERROR : null;

  return (
    <div className="k-stack">
      {/* Barra superior: evento + estado */}
      <div className="k-top">
        <select value={eventId} onChange={(e) => { setEventId(e.target.value); setResult(null); }} className="k-select" aria-label="Evento">
          {events.map((ev) => (<option key={ev.id} value={ev.id}>{ev.name}</option>))}
        </select>
        <div className="k-status">
          <span className={online ? 'k-dot k-dot--on' : 'k-dot k-dot--off'}>● {online ? 'Online' : 'Offline'}</span>
          {pending > 0 && <span className="k-pend">{pending} por sincronizar</span>}
          <span className="k-count">{validated}/{total}</span>
          <button type="button" onClick={toggleMute} className="k-icon" aria-label={muted ? 'Activar sonido' : 'Silenciar'}>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Resultado GIGANTE (legibilidad de puerta) */}
      {st && result && (
        <div className={`k-result k-result--${st.tone}`} role="status" aria-live="assertive">
          <div className="k-result__icon">
            {st.tone === 'ok' ? <Check /> : st.tone === 'warn' ? <AlertTriangle /> : <X />}
          </div>
          <p className="k-result__label">{st.label}</p>
          {result.attendee_name && <p className="k-result__name">{result.attendee_name}</p>}
          {result.buyer_dni && <p className="k-result__doc">{docLabel(result.buyer_doc_type)} {result.buyer_dni}</p>}
          {result.ticket_type_name && <p className="k-result__type">{result.ticket_type_name}</p>}
          {result.status === 'REENTRY' && result.max_scans != null && <p className="k-result__sub">re-entrada {result.scan_count}/{result.max_scans}</p>}
          {result.status === 'ALREADY_USED' && result.first_validated_at && <p className="k-result__sub">primer ingreso {new Date(result.first_validated_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</p>}
          {result.status === 'OFFLINE_UNKNOWN' && <p className="k-result__sub">No estaba en la lista precargada. Revisá el documento a mano.</p>}
          {result.offline && <p className="k-result__off">offline · se sincronizará</p>}
        </div>
      )}

      {/* Cámara */}
      <div className="k-cam">
        {cameraOn ? (
          <QrScanner onScan={onDetect} onError={() => {}} formats={['qr_code']} scanDelay={400} components={{ finder: true }} styles={{ container: { width: '100%' } }} />
        ) : (
          <div className="k-cam__off">Cámara pausada</div>
        )}
      </div>

      <div className="k-row">
        <button type="button" className="k-btn k-btn--soft" onClick={() => setCameraOn((v) => !v)}>
          {cameraOn ? <><CameraOff className="h-4 w-4" /> Pausar</> : <><Camera className="h-4 w-4" /> Reanudar</>}
        </button>
        {busy && <span className="k-muted">validando…</span>}
      </div>

      {/* Fallback manual */}
      <form onSubmit={submitManual} className="k-row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label className="k-label">Código manual (si la cámara falla)</label>
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="UUID del ticket" className="k-input" />
        </div>
        <button type="submit" className="k-btn k-btn--brand">Validar</button>
      </form>

      <p className="k-foot">Puerta de {brandName}</p>
    </div>
  );
}
