'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Minus, Plus, Loader2, Clock, ShieldCheck, Lock, Mail, ArrowRight, TrendingUp } from 'lucide-react';
import { formatPEN } from '@/lib/utils';
import { startCheckout, previewPromo, type CheckoutInput } from './actions';
import { reserveStock } from '@/lib/reservations';
import { MercadoPagoWallet } from './MercadoPagoWallet';

const SESSION_STORAGE_KEY = 'parygo-checkout-session';

function readOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!id) {
    id = (window.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) + '-' + Date.now().toString(36);
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, id);
  }
  return id;
}

type Brand = { id: string; slug: string; name: string; yape_number: string | null; yape_holder: string | null };
type Event = { id: string; slug: string; name: string; min_age: number; starts_at: string; require_age_confirmation: boolean; require_dni: boolean; collect_attendee_names: boolean };
type TicketType = {
  id: string; name: string; description: string | null; price_cents: number;
  active_price_cents: number; active_name: string | null; active_ends_at: string | null;
  next_price_cents: number | null; next_starts_at: string | null; next_name: string | null;
  // soldOut viene calculado server-side; NUNCA se mandan capacity/sold al cliente
  // (el comprador no ve cuántas hay ni cuántas quedan — solo el estado "Agotado").
  is_unlimited: boolean; soldOut: boolean; sort_order: number; color_hex: string | null;
};

// Días de CALENDARIO que faltan hasta `endIso`, en horario America/Lima (no UTC).
function limaYMD(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
function calendarDaysLeftLima(endIso: string, nowMs: number): number | null {
  const end = Date.parse(endIso);
  if (Number.isNaN(end)) return null;
  const a = Date.parse(limaYMD(nowMs) + 'T00:00:00Z');
  const b = Date.parse(limaYMD(end) + 'T00:00:00Z');
  return Math.round((b - a) / 86_400_000);
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(m.matches);
    const h = () => setReduced(m.matches);
    m.addEventListener?.('change', h);
    return () => m.removeEventListener?.('change', h);
  }, []);
  return reduced;
}

// Fase activa (countdown ≤7 días, hora Lima) + teaser de la siguiente. Solo
// expone nombres de fase, precios (públicos) y fechas — nada sensible.
function PhaseTiming({ tt }: { tt: TicketType }) {
  const reduced = usePrefersReducedMotion();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const days = tt.active_ends_at ? calendarDaysLeftLima(tt.active_ends_at, nowMs) : null;
  const lastDay = days === 0;
  useEffect(() => {
    if (reduced || !lastDay) return; // ticker liviano SOLO el último día y sin reduced-motion
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [reduced, lastDay]);

  // ¿El precio SUBE cuando termina esta fase? (dato real, no escasez inventada).
  // Si sube, el countdown enfatiza "a este precio"; si no, avisa el fin de fase.
  const priceRises = tt.next_price_cents != null && tt.next_price_cents > tt.active_price_cents;

  let countdown: string | null = null;
  if (days != null && days >= 0 && days <= 7) {
    const phase = tt.active_name || 'Preventa';
    if (days >= 2) countdown = priceRises ? `Quedan ${days} días a este precio` : `${phase} termina en ${days} días`;
    else if (days === 1) countdown = priceRises ? `Último día a este precio` : `${phase} termina en 1 día`;
    else {
      const ms = tt.active_ends_at ? Date.parse(tt.active_ends_at) - nowMs : 0;
      const lead = priceRises ? 'Último día a este precio' : `${phase}: último día`;
      if (reduced || ms <= 0) countdown = lead;
      else {
        const h = Math.floor(ms / 3_600_000);
        const m = Math.floor((ms % 3_600_000) / 60_000);
        countdown = h >= 1 ? `${lead} · ${h}h ${m}m` : `${lead} · ${m}m`;
      }
    }
  }

  const next = tt.next_price_cents != null && tt.next_starts_at
    ? `${tt.next_name || 'Próxima etapa'}: ${formatPEN(tt.next_price_cents)} · próximamente`
    : null;

  if (!countdown && !next) return null;
  return (
    <div className="c-phase">
      {countdown && <p className="c-phase__now"><Clock className="h-3.5 w-3.5" /> {countdown}</p>}
      {next && <p className="c-rise"><TrendingUp className="h-3.5 w-3.5" /> {next}</p>}
    </div>
  );
}

export function EventCheckoutPanel({
  brand, event, ticketTypes, mpConfigured, mpPublicKey, refCode = '',
}: {
  brand: Brand; event: Event; ticketTypes: TicketType[]; mpConfigured: boolean; mpPublicKey: string | null;
  refCode?: string;
}) {
  const sorted = useMemo(
    () => [...ticketTypes].sort((a, b) => b.active_price_cents - a.active_price_cents || a.sort_order - b.sort_order),
    [ticketTypes]
  );

  const [qty, setQty] = useState<Record<string, number>>({});
  const [step, setStep] = useState<1 | 2>(1);
  // Código de RR.PP. (promo_codes) — se ingresa en el PASO 1 (al comprar) y se
  // conserva para aplicarlo en el paso 2 con el email. Opcional (no bloquea).
  // B5: pre-rellena con el código del link del promotor (?ref=). Editable.
  const [promoInput, setPromoInput] = useState(refCode.toUpperCase());
  const [method, setMethod] = useState<'yape_manual' | 'mercadopago'>(
    brand.yape_number ? 'yape_manual' : mpConfigured ? 'mercadopago' : 'yape_manual'
  );
  const [mpCheckout, setMpCheckout] = useState<{ preferenceId: string; initPoint: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const sessionIdRef = useRef<string>('');
  const [reservationExpiresAt, setReservationExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const lastReserved = useRef<Record<string, number>>({});
  useEffect(() => { sessionIdRef.current = readOrCreateSessionId(); }, []);
  useEffect(() => {
    if (reservationExpiresAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [reservationExpiresAt]);
  useEffect(() => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const timer = setTimeout(() => {
      const next = { ...lastReserved.current };
      const ids = new Set([...Object.keys(qty), ...Object.keys(lastReserved.current)]);
      ids.forEach(async (ticketTypeId) => {
        const want = qty[ticketTypeId] ?? 0;
        const have = lastReserved.current[ticketTypeId] ?? 0;
        if (want === have) return;
        const res = await reserveStock(sid, ticketTypeId, want);
        if (!res.ok) {
          // Mensaje SIN número (no exponer cuántas quedan). Si el server informa
          // el máximo disponible, ajustamos el stepper en silencio.
          toast.error('No quedan suficientes entradas de este tipo.');
          if (typeof res.available === 'number') {
            setQty((q) => ({ ...q, [ticketTypeId]: res.available! }));
            next[ticketTypeId] = res.available!;
          }
          return;
        }
        next[ticketTypeId] = want;
        if (want === 0) delete next[ticketTypeId];
        if (res.expiresAt) setReservationExpiresAt(new Date(res.expiresAt).getTime());
      });
      lastReserved.current = next;
    }, 400);
    return () => clearTimeout(timer);
  }, [qty]);

  const totalCents = useMemo(() => sorted.reduce((acc, t) => acc + (qty[t.id] ?? 0) * t.active_price_cents, 0), [qty, sorted]);
  const totalItems = useMemo(() => Object.values(qty).reduce((a, b) => a + b, 0), [qty]);

  function inc(t: TicketType) {
    const current = qty[t.id] ?? 0;
    if (t.soldOut) return;
    if (current >= 10) { toast.error('Máximo 10 por compra'); return; }
    // El tope real de stock lo enforcea reserveStock (atómico) + reserve_order_stock
    // al confirmar; acá solo limitamos el máximo por compra. No exponemos el cupo.
    setQty({ ...qty, [t.id]: current + 1 });
  }
  function dec(t: TicketType) {
    const current = qty[t.id] ?? 0;
    if (current <= 0) return;
    setQty({ ...qty, [t.id]: current - 1 });
  }

  const secondsLeft = reservationExpiresAt === null ? null : Math.max(0, Math.floor((reservationExpiresAt - now) / 1000));
  const countdownLabel = secondsLeft === null ? null : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;
  useEffect(() => {
    if (secondsLeft === 0 && totalItems > 0) {
      toast.error('Tu reserva expiró. Recargando…');
      const t = setTimeout(() => window.location.reload(), 1500);
      return () => clearTimeout(t);
    }
  }, [secondsLeft, totalItems]);

  if (sorted.length === 0) {
    return (
      <section className="c-wrap" style={{ marginTop: 40 }}>
        <div className="c-card" style={{ textAlign: 'center', color: 'var(--ink-2)' }}>Las entradas estarán disponibles pronto.</div>
      </section>
    );
  }

  const activeStep = mpCheckout ? 2 : step;

  return (
    <section id="entradas" className="c-wrap" style={{ marginTop: 32 }}>
      {/* Progreso (goal-gradient) + countdown */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
        <ol className="c-steps" aria-label="Pasos de la compra">
          <li role="listitem" aria-current={activeStep === 1 ? 'step' : undefined} className={`c-step ${activeStep >= 1 ? 'c-step--on' : ''}`}><b>1</b> Entradas</li>
          <span className="c-step__line" aria-hidden="true" />
          <li role="listitem" aria-current={activeStep === 2 ? 'step' : undefined} className={`c-step ${activeStep >= 2 ? 'c-step--on' : ''}`}><b>2</b> Datos + pago</li>
          <span className="c-step__line" aria-hidden="true" />
          <li role="listitem" className="c-step"><b>3</b> ¡Listo!</li>
        </ol>
        {countdownLabel && totalItems > 0 && (
          <span className="c-chip" style={secondsLeft !== null && secondsLeft < 60 ? { color: 'var(--alert)', borderColor: 'var(--alert)' } : { color: 'var(--brand-ink)', borderColor: 'var(--brand)' }} aria-live="polite">
            <Clock className="h-3.5 w-3.5" /> Reserva · {countdownLabel}
          </span>
        )}
      </div>

      {mpCheckout && mpPublicKey ? (
        <MercadoPagoWallet publicKey={mpPublicKey} preferenceId={mpCheckout.preferenceId} initPoint={mpCheckout.initPoint} />
      ) : step === 1 ? (
        <div className="c-stepwrap" key="step1">
        <Step1 sorted={sorted} qty={qty} inc={inc} dec={dec} totalCents={totalCents} totalItems={totalItems} promoInput={promoInput} setPromoInput={setPromoInput} onContinue={() => setStep(2)} />
        </div>
      ) : (
        <div className="c-stepwrap" key="step2">
        <Step2
          brand={brand} event={event} sorted={sorted} qty={qty} totalCents={totalCents}
          method={method} setMethod={setMethod} mpConfigured={mpConfigured} isPending={isPending}
          promoInput={promoInput} setPromoInput={setPromoInput}
          onBack={() => setStep(1)}
          onSubmit={(input) => {
            startTransition(async () => {
              const res = await startCheckout({ ...input, sessionId: sessionIdRef.current });
              if (!res.ok) { toast.error(res.message ?? 'Error en el checkout'); return; }
              if ('mp' in res) { if (mpPublicKey) setMpCheckout(res.mp); else window.location.href = res.mp.initPoint; return; }
              if ('redirectUrl' in res) window.location.href = res.redirectUrl;
            });
          }}
        />
        </div>
      )}
    </section>
  );
}

// ============================ Paso 1 — Elegir entradas ============================
function Step1({
  sorted, qty, inc, dec, totalCents, totalItems, promoInput, setPromoInput, onContinue,
}: {
  sorted: TicketType[]; qty: Record<string, number>; inc: (t: TicketType) => void; dec: (t: TicketType) => void;
  totalCents: number; totalItems: number; promoInput: string; setPromoInput: (v: string) => void; onContinue: () => void;
}) {
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sorted.map((t, i) => {
          const soldOut = t.soldOut;
          const cur = qty[t.id] ?? 0;
          const perks = (t.description ?? '').split('\n').filter(Boolean);
          // Banda de color por tipo (color_hex; cae a la marca) + delay de entrada.
          const ttStyle = { '--i': i, ...(t.color_hex ? { '--tt-accent': t.color_hex } : {}) } as React.CSSProperties;
          return (
            <article key={t.id} className={`c-tt ${cur > 0 ? 'c-tt--active' : ''} ${soldOut ? 'c-tt--out' : ''}`} style={ttStyle}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <h3 className="c-tt__name">{t.name}</h3>
                  <span className="c-tt__price">{formatPEN(t.active_price_cents)}</span>
                </div>
                {perks.length > 0 && (
                  <ul className="c-tt__perks">{perks.map((p, idx) => <li key={idx}><span style={{ color: 'var(--brand-ink)'}}>·</span> {p}</li>)}</ul>
                )}
                {/* No agotado → fases (countdown + teaser). Agotado → badge a la derecha. */}
                {!soldOut && <PhaseTiming tt={t} />}
              </div>
              {soldOut ? (
                <span className="c-soldout">Agotado</span>
              ) : cur === 0 ? (
                // En reposo, solo el botón "+" (sin un "0" administrativo).
                <button type="button" onClick={() => inc(t)} aria-label={`Sumar ${t.name}`} className="c-qbtn c-qbtn--add"><Plus className="h-4 w-4" /></button>
              ) : (
                <div className="c-qty">
                  <button type="button" onClick={() => dec(t)} aria-label={`Restar ${t.name}`} className="c-qbtn"><Minus className="h-4 w-4" /></button>
                  <span className="c-qval">{cur}</span>
                  <button type="button" onClick={() => inc(t)} aria-label={`Sumar ${t.name}`} className="c-qbtn c-qbtn--add"><Plus className="h-4 w-4" /></button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Código de RR.PP. — visible al comprar. Opcional: si lo tenés, ingresalo;
          se aplica al confirmar tu email en el siguiente paso. */}
      <div className="c-card" style={{ marginTop: 16 }}>
        <label htmlFor="rrpp_code" className="c-card__title" style={{ display: 'block', marginBottom: 4 }}>¿Tenés un código de RR.PP.?</label>
        <p className="c-muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Si un promotor te pasó un código, ingresalo acá (opcional). Se aplica al pagar.</p>
        <input
          id="rrpp_code"
          value={promoInput}
          onChange={(e) => setPromoInput(e.target.value)}
          placeholder="Código del promotor"
          autoCapitalize="characters"
          maxLength={32}
          className="c-input"
          style={{ textTransform: 'uppercase' }}
        />
      </div>

      <div className={`c-stickybar ${totalItems === 0 ? 'c-stickybar--off' : ''}`} style={{ marginTop: 20 }}>
        <div className="c-stickybar__t">
          <span className="n">{totalItems} entrada{totalItems === 1 ? '' : 's'}</span>
          <span className="v"><span key={totalCents} className="c-amount">{formatPEN(totalCents)}</span> <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500 }}>IGV inc.</span></span>
        </div>
        <button type="button" className="c-btn c-btn--brand" disabled={totalItems === 0} onClick={onContinue}>
          Continuar <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}

// ============================ Paso 2 — Datos + pago ============================
function Step2({
  brand, event, sorted, qty, totalCents, method, setMethod, mpConfigured, isPending, promoInput, setPromoInput, onBack, onSubmit,
}: {
  brand: Brand; event: Event; sorted: TicketType[]; qty: Record<string, number>; totalCents: number;
  method: 'yape_manual' | 'mercadopago'; setMethod: (m: 'yape_manual' | 'mercadopago') => void;
  mpConfigured: boolean; isPending: boolean; promoInput: string; setPromoInput: (v: string) => void; onBack: () => void;
  onSubmit: (input: Omit<CheckoutInput, 'sessionId'>) => void;
}) {
  const [applied, setApplied] = useState<null | { code: string; finalCents: number; discountCents: number; isFree: boolean }>(null);
  const [checking, setChecking] = useState(false);
  const [docType, setDocType] = useState<'dni' | 'ce' | 'passport'>('dni');
  // Nombre por entrada (solo si el evento lo pide). Clave: ticketTypeId → nombres[].
  const [attendeeNames, setAttendeeNames] = useState<Record<string, string[]>>({});
  const setAttendee = (typeId: string, idx: number, val: string) =>
    setAttendeeNames((prev) => {
      const arr = [...(prev[typeId] ?? [])];
      arr[idx] = val;
      return { ...prev, [typeId]: arr };
    });

  const itemsForPromo = Object.entries(qty).filter(([, q]) => q > 0).map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
  const selectedTypes = sorted.filter((t) => (qty[t.id] ?? 0) > 0);

  async function applyPromo() {
    const code = promoInput.trim();
    if (!code) return;
    const email = (document.getElementById('buyer_email') as HTMLInputElement | null)?.value?.trim() ?? '';
    if (!email) { toast.error('Ingresa tu email antes de aplicar el código.'); return; }
    setChecking(true);
    try {
      const res = await previewPromo({ eventId: event.id, code, email, items: itemsForPromo });
      if (!res.ok) {
        const msgs: Record<string, string> = {
          NOT_FOUND: 'Código inválido.', EXPIRED: 'Código vencido.', EXHAUSTED: 'Código agotado.',
          EMAIL_LIMIT: 'Ya usaste ese código con este email.', NOT_APPLICABLE: 'No aplica a estas entradas.',
          NEED_EMAIL: 'Ingresa tu email primero.', BAD_TICKET_TYPE: 'Entrada inválida.',
        };
        setApplied(null);
        toast.error(msgs[res.reason] ?? 'No se pudo aplicar el código.');
        return;
      }
      setApplied({ code, finalCents: res.totalFinalCents, discountCents: res.totalDiscountCents, isFree: res.isFree });
      toast.success(res.isFree ? '¡Entrada gratis con el código!' : `Código aplicado: -${formatPEN(res.totalDiscountCents)}`);
    } catch {
      toast.error('No se pudo verificar el código (red). Intenta de nuevo.');
    } finally {
      setChecking(false);
    }
  }

  const finalTotal = applied ? applied.finalCents : totalCents;
  const docLabel = docType === 'dni' ? 'DNI' : docType === 'ce' ? 'Carné ext.' : 'Pasaporte';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        // Confirmación de edad: solo se exige si el evento la pide (configurable).
        const ageOk = event.require_age_confirmation ? fd.get('age_ok') === '1' : true;
        if (event.require_age_confirmation && !ageOk) { toast.error(`Tienes que confirmar que eres mayor de ${event.min_age} años`); return; }
        onSubmit({
          eventId: event.id, brandId: brand.id,
          buyerName: String(fd.get('buyer_name') ?? '').trim(),
          buyerEmail: String(fd.get('buyer_email') ?? '').trim(),
          buyerPhone: String(fd.get('buyer_phone') ?? '').trim(),
          buyerDocType: docType,
          buyerDni: String(fd.get('buyer_dni') ?? '').trim(),
          ageOk, marketingOptIn: fd.get('marketing_opt_in') === '1',
          method,
          items: event.collect_attendee_names
            ? itemsForPromo.map((it) => ({ ...it, attendeeNames: (attendeeNames[it.ticketTypeId] ?? []).slice(0, it.quantity) }))
            : itemsForPromo,
          promoCode: applied?.code,
        });
      }}
      style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0,1fr) 360px', alignItems: 'start' }}
      className="c-checkout-grid"
    >
      {/* Columna form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="c-card">
          <p className="c-card__title">Tus datos</p>
          <div className="c-field">
            <label htmlFor="buyer_name" className="c-label">Nombre y apellido</label>
            <input id="buyer_name" name="buyer_name" autoComplete="name" required placeholder="María López" className="c-input" />
          </div>
          <div className="c-field">
            <label htmlFor="buyer_email" className="c-label">Email</label>
            <input id="buyer_email" name="buyer_email" type="email" autoComplete="email" required placeholder="tu@email.com" className="c-input" inputMode="email"
              onBlur={() => { if (promoInput.trim().length >= 2 && !applied && !checking) applyPromo(); }} />
            <p className="c-help">Acá te llega tu QR al instante.</p>
          </div>
          <div className="c-field">
            <label htmlFor="buyer_phone" className="c-label">WhatsApp</label>
            <input id="buyer_phone" name="buyer_phone" type="tel" autoComplete="tel" required minLength={9} maxLength={20} inputMode="tel" pattern="^[+\d][\d\s\(\)\-]{7,19}$" placeholder="+51 999 999 999" className="c-input" />
          </div>
          {event.require_dni && (
          <div className="c-field">
            <label htmlFor="buyer_dni" className="c-label">Documento de identidad</label>
            <div className="c-doc">
              <select aria-label="Tipo de documento" value={docType} onChange={(e) => setDocType(e.target.value as 'dni' | 'ce' | 'passport')} className="c-input">
                <option value="dni">DNI</option>
                <option value="ce">CE</option>
                <option value="passport">Pasaporte</option>
              </select>
              <input
                id="buyer_dni" name="buyer_dni" required
                inputMode={docType === 'dni' ? 'numeric' : 'text'}
                maxLength={docType === 'dni' ? 8 : 15}
                pattern={docType === 'dni' ? '\\d{8}' : '[A-Za-z0-9]{6,15}'}
                placeholder={docType === 'dni' ? '8 dígitos' : `Número de ${docLabel.toLowerCase()}`}
                autoComplete="off" className="c-input"
              />
            </div>
            <p className="c-help">Para validar tu identidad en la puerta. No lo compartimos.</p>
          </div>
          )}
          {event.require_age_confirmation && (
            <div className="c-field">
              <label className="c-check">
                <input type="checkbox" name="age_ok" value="1" required />
                <span>Confirmo que soy mayor de {event.min_age} años (requerido para ingresar).</span>
              </label>
            </div>
          )}
          <div className="c-field">
            <label className="c-check">
              <input type="checkbox" name="marketing_opt_in" value="1" defaultChecked />
              <span>Quiero recibir info de los próximos eventos de {brand.name}.</span>
            </label>
          </div>
        </div>

        {event.collect_attendee_names && selectedTypes.length > 0 && (
          <div className="c-card">
            <p className="c-card__title">¿Quiénes asisten?</p>
            <p className="c-muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Poné el nombre de cada asistente (opcional). Aparece en cada entrada. Si lo dejás vacío, usamos tu nombre.</p>
            <div className="c-stack" style={{ gap: 12 }}>
              {selectedTypes.map((t) => (
                <div key={t.id}>
                  <p className="c-label" style={{ marginBottom: 6 }}>{t.name}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Array.from({ length: qty[t.id] ?? 0 }).map((_, i) => (
                      <input
                        key={i}
                        className="c-input"
                        placeholder={`Asistente ${i + 1}`}
                        maxLength={120}
                        autoComplete="off"
                        value={attendeeNames[t.id]?.[i] ?? ''}
                        onChange={(e) => setAttendee(t.id, i, e.target.value)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!applied?.isFree && (
          <div className="c-card">
            <p className="c-card__title">Cómo pagas</p>
            <div role="radiogroup" aria-label="Método de pago" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {brand.yape_number && (
                <PayOption kind="yape" selected={method === 'yape_manual'} onClick={() => setMethod('yape_manual')} title="Yape" sub="Validación en 5–15 min" note={`Yapeas a ${brand.yape_holder ?? brand.name} y nos mandás la captura.`} />
              )}
              {mpConfigured && (
                <PayOption kind="mp" selected={method === 'mercadopago'} onClick={() => setMethod('mercadopago')} title="Tarjeta · MercadoPago" sub="Pago con tarjeta — tu QR al instante" note="Procesado de forma segura por MercadoPago." />
              )}
            </div>
          </div>
        )}

        <div className="c-card">
          <p className="c-card__title">¿Tienes un código?</p>
          {applied ? (
            <div className="c-promo-on">
              <div>
                <span style={{ fontWeight: 700, color: 'var(--brand-ink)'}}>{applied.code}</span>
                <p className="c-muted" style={{ fontSize: 12.5, marginTop: 2 }}>{applied.isFree ? '¡Entrada gratis!' : `Descuento: -${formatPEN(applied.discountCents)}`}</p>
              </div>
              <button type="button" className="c-btn c-btn--ghost" onClick={() => { setApplied(null); setPromoInput(''); }}>Quitar</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={promoInput} onChange={(e) => setPromoInput(e.target.value)} placeholder="Código de RRPP" autoCapitalize="characters" maxLength={32} className="c-input" style={{ textTransform: 'uppercase' }} />
              <button type="button" className="c-btn c-btn--soft" onClick={applyPromo} disabled={checking || promoInput.trim().length < 2}>
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Columna resumen (confianza) */}
      <aside style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 76 }}>
        <div className="c-card">
          <p className="c-card__title">Tu compra</p>
          <p className="c-h2">{event.name}</p>
          <p className="c-muted-3" style={{ fontSize: 13, marginTop: 2 }}>{new Date(event.starts_at).toLocaleString('es-PE', { timeZone: 'America/Lima' })}</p>
          <div style={{ marginTop: 14 }}>
            {sorted.filter((t) => (qty[t.id] ?? 0) > 0).map((t) => {
              const q = qty[t.id]!;
              return (
                <div key={t.id} className="c-sum__row"><span>{q}× {t.name}</span><span className="v">{formatPEN(q * t.active_price_cents)}</span></div>
              );
            })}
            {applied && <div className="c-sum__row c-sum__discount"><span>Código {applied.code}</span><span className="v">−{formatPEN(applied.discountCents)}</span></div>}
          </div>
          <div className="c-sum__total"><span className="l">Total</span><span className="v"><span key={finalTotal} className="c-amount">{formatPEN(finalTotal)}</span></span></div>
          <p className="c-muted-3" style={{ fontSize: 11.5, textAlign: 'right', marginTop: 2 }}>IGV incluido · sin costos ocultos</p>
        </div>

        <button type="submit" className="c-btn c-btn--brand c-btn--block c-btn--lg" disabled={isPending}>
          {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Procesando…</>
            : applied?.isFree ? <>Obtener entrada gratis</>
            : method === 'mercadopago' ? <><Lock className="h-4 w-4" /> Pagar {formatPEN(finalTotal)}</>
            : <>Continuar con Yape</>}
        </button>

        <p className="c-reassure"><Mail className="h-4 w-4" style={{ color: 'var(--brand-ink)'}} /> Recibís tu entrada con QR al instante por email.</p>
        <div className="c-seals">
          <span className="c-seal"><ShieldCheck className="h-4 w-4" /> Pago seguro</span>
          <span className="c-seal"><Lock className="h-4 w-4" /> Datos protegidos</span>
          <span className="c-seal"><Mail className="h-4 w-4" /> QR al instante</span>
        </div>
        <button type="button" onClick={onBack} className="c-btn c-btn--ghost" style={{ margin: '0 auto' }}>← Editar entradas</button>
      </aside>

      {/* CTA sticky SOLO en mobile: el total + pagar siempre a la vista sin
          tener que scrollear hasta el final del formulario. Submite el form. */}
      <div className="c-mobilecta">
        <div className="c-mobilecta__t">
          <span className="n">Total</span>
          <span className="v"><span key={finalTotal} className="c-amount">{formatPEN(finalTotal)}</span></span>
        </div>
        <button type="submit" className="c-btn c-btn--brand" disabled={isPending}>
          {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> …</>
            : applied?.isFree ? <>Entrada gratis</>
            : method === 'mercadopago' ? <><Lock className="h-4 w-4" /> Pagar</>
            : <>Continuar <ArrowRight className="h-4 w-4" /></>}
        </button>
      </div>
    </form>
  );
}

function PayOption({ selected, onClick, title, sub, note, kind }: { selected: boolean; onClick: () => void; title: string; sub: string; note: string; kind?: 'yape' | 'mp' }) {
  return (
    <button type="button" role="radio" aria-checked={selected} aria-label={`${title}. ${sub}`} onClick={onClick} className={`c-pay ${selected ? 'c-pay--on' : ''}`}>
      <div className="c-pay__top">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {kind === 'yape' ? <span className="c-pmt c-pmt--yape">Yape</span>
            : kind === 'mp' ? <span className="c-pmt c-pmt--mp">MercadoPago</span>
            : <span className="c-pay__title">{title}</span>}
        </span>
        <span aria-hidden className="c-pay__radio" />
      </div>
      <p className="c-pay__sub">{sub}</p>
      {kind === 'mp' && (
        <div className="c-cardmarks" style={{ marginTop: 8 }}>
          <span className="c-cardmark">VISA</span>
          <span className="c-cardmark">Mastercard</span>
          <span className="c-cardmark">AMEX</span>
        </div>
      )}
      <p className="c-pay__note">{note}</p>
    </button>
  );
}
