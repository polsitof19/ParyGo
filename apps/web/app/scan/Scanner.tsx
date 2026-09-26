'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Scanner as QrScanner, type IDetectedBarcode } from '@yudiel/react-qr-scanner';
import { Check, X, AlertTriangle, Volume2, VolumeX, Camera, CameraOff } from 'lucide-react';
import { validateScanAction, previewScanAction, preloadEventAction, type ScanResult } from './actions';
import {
  cacheTickets, getCachedTicket, bumpLocalScan, enqueueScan, pendingScans, markScanSynced, getDeviceId,
} from '@/lib/offline-scan';
import { useTextos } from '@/components/IdiomaPanel';

type EventOpt = { id: string; name: string; starts_at: string };
type Shown = ScanResult & { offline?: boolean };
type Phase = 'scan' | 'preview' | 'result';
type Tr = (es: string, en: string) => string;

const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

// tone: 'ok' | 'warn' | 'deny' → caracteriza color + sonido del resultado.
function getStatus(t: Tr): Record<string, { tone: 'ok' | 'warn' | 'deny'; label: string }> {
  return {
    OK: { tone: 'ok', label: t('ACCESO OK', 'ACCESS OK') },
    REENTRY: { tone: 'warn', label: t('RE-ENTRADA', 'RE-ENTRY') },
    ALREADY_USED: { tone: 'deny', label: t('YA USADO', 'ALREADY USED') },
    NOT_FOUND: { tone: 'deny', label: t('TICKET INVÁLIDO', 'INVALID TICKET') },
    NOT_AUTHORIZED: { tone: 'deny', label: t('NO AUTORIZADO', 'NOT AUTHORIZED') },
    INVALIDATED: { tone: 'deny', label: t('ENTRADA ANULADA', 'TICKET VOIDED') },
    ERROR: { tone: 'deny', label: t('ERROR · REINTENTÁ', 'ERROR · RETRY') },
    OFFLINE_UNKNOWN: { tone: 'warn', label: t('VERIFICAR MANUAL', 'CHECK MANUALLY') },
  };
}

const docLabel = (docType: string | null | undefined, t: Tr) =>
  docType === 'ce' ? 'CE' : docType === 'passport' ? t('Pasaporte', 'Passport') : 'DNI';

// ¿Se puede ofrecer PASAR en la previsualización? Solo si es válido (OK) o si
// es un cache-miss offline (VERIFICAR MANUAL → el validador chequea el doc a mano
// y confirma; se encola igual). Los estados "deny" no ofrecen PASAR.
const canPassStatus = (s: string) => s === 'OK' || s === 'OFFLINE_UNKNOWN';

export function Scanner({ events, brandName }: { events: EventOpt[]; brandName: string }) {
  const { t, loc } = useTextos();
  const STATUS = getStatus(t);
  const [eventId, setEventId] = useState(events[0]?.id ?? '');
  const [online, setOnline] = useState(true);
  const [phase, setPhase] = useState<Phase>('scan');
  const [preview, setPreview] = useState<Shown | null>(null);
  const [result, setResult] = useState<Shown | null>(null);
  const [pendingQr, setPendingQr] = useState('');
  const [validated, setValidated] = useState(0);
  const [total, setTotal] = useState(0);
  const [pending, setPending] = useState(0);
  const [cameraOn, setCameraOn] = useState(true);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const lastScan = useRef<{ qr: string; ts: number }>({ qr: '', ts: 0 });
  const deviceId = useRef('');
  const audioRef = useRef<AudioContext | null>(null);
  // Ref del phase para gatear las detecciones de la cámara sin closures viejos.
  const phaseRef = useRef<Phase>('scan');
  useEffect(() => { phaseRef.current = phase; }, [phase]);

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

  // Volver a escanear (no consume nada).
  const reset = useCallback(() => {
    setPhase('scan'); setPreview(null); setResult(null); setPendingQr('');
    lastScan.current = { qr: '', ts: 0 };
  }, []);

  // PASO 1 — Previsualizar (LECTURA, no consume). Online: previewScanAction.
  // Offline: lee el cache (sin mutar). Muestra la pantalla de decisión.
  const doPreview = useCallback(async (qr: string) => {
    setBusy(true);
    try {
      let pv: Shown | null = null;
      if (navigator.onLine) {
        try { pv = await previewScanAction({ qr }); } catch { pv = null; }
      }
      if (!pv) {
        const cached = await getCachedTicket(qr);
        if (!cached) pv = { ok: false, status: 'OFFLINE_UNKNOWN', offline: true };
        else {
          const can = cached.max_scans === null || cached.scan_count < cached.max_scans;
          pv = {
            ok: can, status: can ? 'OK' : 'ALREADY_USED',
            attendee_name: cached.attendee_name, ticket_type_name: cached.ticket_type_name,
            scan_count: cached.scan_count, max_scans: cached.max_scans,
            buyer_dni: cached.buyer_dni, buyer_doc_type: cached.buyer_doc_type, offline: true,
          };
        }
      }
      setPendingQr(qr);
      setPreview(pv);
      setPhase('preview');
      // Feedback: si está bloqueado (deny) avisamos fuerte; si es válido, un toque
      // suave de "escaneado, revisa".
      const tone = STATUS[pv.status]?.tone ?? 'deny';
      if (tone === 'deny') feedback('deny');
      else { try { navigator.vibrate?.(40); } catch {} }
    } finally { setBusy(false); }
  }, [muted]); // eslint-disable-line react-hooks/exhaustive-deps

  // PASO 2 — Confirmar ingreso (CONSUME). Online: validateScanAction
  // (validate_ticket con FOR UPDATE → concurrencia/idempotencia intactas).
  // Offline: encola idempotente + actualiza el cache, igual que antes.
  const confirm = useCallback(async (qr: string) => {
    setBusy(true);
    try {
      const finish = (r: Shown) => { setResult(r); setPhase('result'); feedback(STATUS[r.status]?.tone ?? 'deny'); };
      if (navigator.onLine) {
        try {
          const r = await validateScanAction({ qr, deviceId: deviceId.current });
          finish(r);
          if (r.ok && r.status === 'OK') { setValidated((v) => v + 1); await bumpLocalScan(qr); }
          return;
        } catch { /* blip → offline */ }
      }
      const cached = await getCachedTicket(qr);
      const csid = crypto.randomUUID();
      await enqueueScan({ client_scan_id: csid, qr_code: qr, scanned_at: new Date().toISOString(), device_id: deviceId.current, synced: false });
      if (!cached) {
        finish({ ok: false, status: 'OFFLINE_UNKNOWN', offline: true });
      } else {
        const can = cached.max_scans === null || cached.scan_count < cached.max_scans;
        if (can) {
          const first = cached.scan_count === 0;
          await bumpLocalScan(qr);
          if (first) setValidated((v) => v + 1);
          finish({ ok: true, status: first ? 'OK' : 'REENTRY', attendee_name: cached.attendee_name, ticket_type_name: cached.ticket_type_name, scan_count: cached.scan_count + 1, max_scans: cached.max_scans, buyer_dni: cached.buyer_dni, buyer_doc_type: cached.buyer_doc_type, offline: true });
        } else {
          finish({ ok: false, status: 'ALREADY_USED', attendee_name: cached.attendee_name, ticket_type_name: cached.ticket_type_name, scan_count: cached.scan_count, max_scans: cached.max_scans, buyer_dni: cached.buyer_dni, buyer_doc_type: cached.buyer_doc_type, offline: true });
        }
      }
      await refreshPending();
    } finally { setBusy(false); }
  }, [muted, refreshPending]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDetect = useCallback((codes: IDetectedBarcode[]) => {
    if (phaseRef.current !== 'scan') return; // solo escanea en fase 'scan'
    const raw = codes[0]?.rawValue ?? '';
    const qr = raw.match(UUID_RE)?.[0];
    const now = Date.now();
    if (!qr) { setPendingQr(''); setPreview({ ok: false, status: 'NOT_FOUND' }); setPhase('preview'); feedback('deny'); return; }
    if (lastScan.current.qr === qr && now - lastScan.current.ts < 2500) return;
    lastScan.current = { qr, ts: now };
    void doPreview(qr);
  }, [doPreview]);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const qr = manual.match(UUID_RE)?.[0];
    setManual('');
    if (qr) { void doPreview(qr); }
    else { setPendingQr(''); setPreview({ ok: false, status: 'NOT_FOUND' }); setPhase('preview'); feedback('deny'); }
  };

  // Datos para el panel de previsualización.
  const pv = preview;
  const pvTone = pv ? (STATUS[pv.status]?.tone ?? 'deny') : 'deny';
  const pvLabel = pv
    ? pv.status === 'OK' ? t('VÁLIDO', 'VALID')
    : pv.status === 'OFFLINE_UNKNOWN' ? t('VERIFICAR MANUAL', 'CHECK MANUALLY')
    : (STATUS[pv.status]?.label ?? t('TICKET INVÁLIDO', 'INVALID TICKET'))
    : '';
  const pvCanPass = pv ? canPassStatus(pv.status) : false;

  const rs = result ? (STATUS[result.status] ?? STATUS.ERROR) : null;

  return (
    <div className="k-stack">
      {/* Barra superior: evento + estado */}
      <div className="k-top">
        <select value={eventId} onChange={(e) => { setEventId(e.target.value); reset(); }} className="k-select" aria-label={t('Evento', 'Event')} disabled={phase !== 'scan'}>
          {events.map((ev) => (<option key={ev.id} value={ev.id}>{ev.name}</option>))}
        </select>
        <div className="k-status">
          <span className={online ? 'k-dot k-dot--on' : 'k-dot k-dot--off'}>● {online ? t('Online', 'Online') : t('Offline', 'Offline')}</span>
          {pending > 0 && <span className="k-pend">{t(`${pending} por sincronizar`, `${pending} to sync`)}</span>}
          <span className="k-count">{validated}/{total}</span>
          <button type="button" onClick={toggleMute} className="k-icon" aria-label={muted ? t('Activar sonido', 'Turn on sound') : t('Silenciar', 'Mute')}>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* FASE PREVIEW — confirmar antes de marcar usado */}
      {phase === 'preview' && pv && (
        <>
          <div className={`k-result k-result--${pvTone}`} role="status" aria-live="assertive">
            <div className="k-result__icon">
              {pvTone === 'ok' ? <Check /> : pvTone === 'warn' ? <AlertTriangle /> : <X />}
            </div>
            <p className="k-result__label">{pvLabel}</p>
            {pv.attendee_name && <p className="k-result__name">{pv.attendee_name}</p>}
            {pv.buyer_dni && <p className="k-result__doc">{docLabel(pv.buyer_doc_type, t)} {pv.buyer_dni}</p>}
            {pv.ticket_type_name && <p className="k-result__type">{pv.ticket_type_name}</p>}
            {pv.status === 'OK' && pv.max_scans != null && pv.max_scans > 1 && (pv.scan_count ?? 0) > 0 && (
              <p className="k-result__sub">{t(`reingreso ${(pv.scan_count ?? 0) + 1}/${pv.max_scans}`, `re-entry ${(pv.scan_count ?? 0) + 1}/${pv.max_scans}`)}</p>
            )}
            {pv.status === 'ALREADY_USED' && pv.first_validated_at && <p className="k-result__sub">{t(`primer ingreso ${new Date(pv.first_validated_at).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })}`, `first check-in ${new Date(pv.first_validated_at).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })}`)}</p>}
            {pv.status === 'OFFLINE_UNKNOWN' && <p className="k-result__sub">{t('No está en la lista precargada. Revisa el documento a mano.', 'Not in the preloaded list. Check the document manually.')}</p>}
            {pv.status === 'OK' && <p className="k-result__sub">{t('Revisa el documento y confirma el ingreso.', 'Check the document and confirm entry.')}</p>}
            {pv.offline && <p className="k-result__off">{t('offline · se sincronizará', 'offline · will sync')}</p>}
          </div>

          {pvCanPass ? (
            <div className="k-confirm">
              <button type="button" className="k-pass" onClick={() => confirm(pendingQr)} disabled={busy}>
                <Check className="k-pass__ico" /> {busy ? t('CONFIRMANDO…', 'CONFIRMING…') : t('PASAR', 'ADMIT')}
              </button>
              <button type="button" className="k-nopass" onClick={reset} disabled={busy}>{t('NO PASAR', 'DENY')}</button>
            </div>
          ) : (
            <button type="button" className="k-btn k-btn--soft k-btn--block" onClick={reset} disabled={busy}>
              {t('Escanear otro', 'Scan another')}
            </button>
          )}
        </>
      )}

      {/* FASE RESULTADO — ya se marcó (o se encoló) el ingreso */}
      {phase === 'result' && rs && result && (
        <>
          <div className={`k-result k-result--${rs.tone}`} role="status" aria-live="assertive">
            <div className="k-result__icon">
              {rs.tone === 'ok' ? <Check /> : rs.tone === 'warn' ? <AlertTriangle /> : <X />}
            </div>
            <p className="k-result__label">{rs.label}</p>
            {result.attendee_name && <p className="k-result__name">{result.attendee_name}</p>}
            {result.buyer_dni && <p className="k-result__doc">{docLabel(result.buyer_doc_type, t)} {result.buyer_dni}</p>}
            {result.ticket_type_name && <p className="k-result__type">{result.ticket_type_name}</p>}
            {result.status === 'REENTRY' && result.max_scans != null && <p className="k-result__sub">{t(`re-entrada ${result.scan_count}/${result.max_scans}`, `re-entry ${result.scan_count}/${result.max_scans}`)}</p>}
            {result.status === 'ALREADY_USED' && result.first_validated_at && <p className="k-result__sub">{t(`primer ingreso ${new Date(result.first_validated_at).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })}`, `first check-in ${new Date(result.first_validated_at).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })}`)}</p>}
            {result.offline && <p className="k-result__off">{t('offline · se sincronizará', 'offline · will sync')}</p>}
          </div>
          <button type="button" className="k-btn k-btn--brand k-btn--block" onClick={reset}>{t('Escanear otro', 'Scan another')}</button>
        </>
      )}

      {/* FASE SCAN — cámara + manual */}
      {phase === 'scan' && (
        <>
          <div className="k-cam">
            {cameraOn ? (
              <QrScanner
                onScan={(codes) => { setCameraError(null); onDetect(codes); }}
                onError={(e) => setCameraError(e instanceof Error ? e.message : t('No se pudo abrir la cámara', 'Could not open the camera'))}
                formats={['qr_code']}
                // Cámara TRASERA a 720p. Sin límite, Safari de iPhone abría el
                // video a la resolución máxima del sensor y, con la memoria al
                // tope, recargaba la pestaña: el escáner "se reiniciaba". Un QR
                // se lee de sobra a 720p.
                constraints={{ facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }}
                scanDelay={400}
                components={{ finder: true }}
                styles={{ container: { width: '100%' } }}
              />
            ) : (
              <div className="k-cam__off">{t('Cámara pausada', 'Camera paused')}</div>
            )}
          </div>
          {cameraError && cameraOn && (
            <p className="k-camerr" role="alert">{t(`No se pudo usar la cámara (${cameraError}). Usa el código manual abajo.`, `Could not use the camera (${cameraError}). Use the manual code below.`)}</p>
          )}

          <div className="k-row">
            <button type="button" className="k-btn k-btn--soft" onClick={() => setCameraOn((v) => !v)}>
              {cameraOn ? <><CameraOff className="h-4 w-4" /> {t('Pausar', 'Pause')}</> : <><Camera className="h-4 w-4" /> {t('Reanudar', 'Resume')}</>}
            </button>
            {busy && <span className="k-muted">{t('leyendo…', 'reading…')}</span>}
          </div>

          {/* Fallback manual */}
          <form onSubmit={submitManual} className="k-row" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="manual-scan" className="k-label">{t('Código manual (si la cámara falla)', 'Manual code (if the camera fails)')}</label>
              <input id="manual-scan" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={t('UUID del ticket', 'Ticket UUID')} className="k-input" />
            </div>
            <button type="submit" className="k-btn k-btn--brand" disabled={busy}>{t('Revisar', 'Check')}</button>
          </form>
        </>
      )}

      <p className="k-foot">{t(`Puerta de ${brandName}`, `Door of ${brandName}`)}</p>
    </div>
  );
}
