'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Minus, Plus, Loader2, Clock, Lock, ArrowRight, TrendingUp } from 'lucide-react';
import { formatPEN } from '@/lib/utils';
import { optimizedImage } from '@/lib/imageUrl';
import { startCheckout, previewPromo, type CheckoutInput } from './actions';
import { reserveStock } from '@/lib/reservations';
import { MercadoPagoWallet } from './MercadoPagoWallet';
import { ShareEvent } from './ShareEvent';

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

type Brand = {
  id: string; slug: string; name: string;
  yape_number: string | null; yape_holder: string | null;
  // Supabase tipa theme_json como Json; se narrowing-castea al leer el logo.
  theme_json?: unknown;
};
type Event = {
  id: string; slug: string; name: string; description?: string | null;
  min_age: number; starts_at: string; ends_at?: string | null;
  venue_name?: string | null; venue_address?: string | null;
  venue_lat?: number | null; venue_lng?: number | null; venue_maps_url?: string | null;
  cover_url?: string | null; refund_policy?: string | null;
  require_age_confirmation: boolean; require_dni: boolean; collect_attendee_names: boolean;
};
type TicketType = {
  id: string; name: string; description: string | null; price_cents: number;
  active_price_cents: number; active_name: string | null; active_ends_at: string | null;
  next_price_cents: number | null; next_starts_at: string | null; next_name: string | null;
  // soldOut viene calculado server-side; NUNCA se mandan capacity/sold al cliente
  // (el comprador no ve cuántas hay ni cuántas quedan — solo el estado "Agotado").
  is_unlimited: boolean; soldOut: boolean; sort_order: number; color_hex: string | null;
  bulk_min_qty: number; bulk_discount_pct: number;
};

// Precio unitario con descuento por cantidad (bulk) aplicado, si corresponde.
// Solo para MOSTRAR — el server recalcula y congela el precio real en el checkout
// (y el bulk NO se apila con un código promo: si hay código, gana el código).
function bulkUnitPrice(t: TicketType, q: number): number {
  if (t.bulk_min_qty > 0 && t.bulk_discount_pct > 0 && q >= t.bulk_min_qty) {
    return Math.floor((t.active_price_cents * (100 - t.bulk_discount_pct)) / 100);
  }
  return t.active_price_cents;
}

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

// Fecha corta + hora (Lima) para hero y rail.
function fmtDateShort(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'America/Lima' }).format(new Date(iso));
}
function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' }).format(new Date(iso));
}

export function EventCheckoutPanel({
  brand, event, ticketTypes, mpConfigured, mpPublicKey, refCode = '', shareUrl,
}: {
  brand: Brand; event: Event; ticketTypes: TicketType[]; mpConfigured: boolean; mpPublicKey: string | null;
  refCode?: string; shareUrl: string;
}) {
  const sorted = useMemo(
    () => [...ticketTypes].sort((a, b) => b.active_price_cents - a.active_price_cents || a.sort_order - b.sort_order),
    [ticketTypes]
  );

  const [qty, setQty] = useState<Record<string, number>>({});
  const [step, setStep] = useState<1 | 2>(1);
  // Código de RR.PP. (promo_codes) — opcional. Se ingresa en el paso 1 o 2 y se
  // aplica en el paso 2 junto al email. B5: pre-rellena con ?ref del promotor.
  const [promoInput, setPromoInput] = useState(refCode.toUpperCase());
  const [method, setMethod] = useState<'yape_manual' | 'mercadopago'>(
    brand.yape_number ? 'yape_manual' : mpConfigured ? 'mercadopago' : 'yape_manual'
  );
  const [mpCheckout, setMpCheckout] = useState<{ preferenceId: string; initPoint: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // ----- Estado del paso 2 (elevado al panel para que el rail comparta total) -----
  const [applied, setApplied] = useState<null | { code: string; finalCents: number; discountCents: number; isFree: boolean }>(null);
  const [checking, setChecking] = useState(false);
  const [docType, setDocType] = useState<'dni' | 'ce' | 'passport'>('dni');
  const [showPromo, setShowPromo] = useState(() => promoInput.trim().length > 0);
  const [attendeeNames, setAttendeeNames] = useState<Record<string, string[]>>({});
  const setAttendee = (typeId: string, idx: number, val: string) =>
    setAttendeeNames((prev) => {
      const arr = [...(prev[typeId] ?? [])];
      arr[idx] = val;
      return { ...prev, [typeId]: arr };
    });

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

  const totalCents = useMemo(() => sorted.reduce((acc, t) => { const q = qty[t.id] ?? 0; return acc + q * bulkUnitPrice(t, q); }, 0), [qty, sorted]);
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
  // Al expirar la reserva NO recargamos la página (perdería los datos que el
  // comprador está tipeando). Renovamos la reserva del carrito actual en silencio;
  // solo si algo se agotó mientras tanto, avisamos y ajustamos el carrito.
  useEffect(() => {
    if (secondsLeft !== 0 || totalItems === 0) return;
    const sid = sessionIdRef.current;
    if (!sid) return;
    let cancelled = false;
    (async () => {
      let renewed = false;
      let shortfall = false;
      for (const [ticketTypeId, want] of Object.entries(qty)) {
        if (want <= 0) continue;
        const res = await reserveStock(sid, ticketTypeId, want);
        if (cancelled) return;
        if (!res.ok) {
          shortfall = true;
          if (typeof res.available === 'number') setQty((q) => ({ ...q, [ticketTypeId]: res.available! }));
          continue;
        }
        if (res.expiresAt) { setReservationExpiresAt(new Date(res.expiresAt).getTime()); renewed = true; }
      }
      if (cancelled) return;
      if (shortfall) toast.error('Se agotaron algunas entradas mientras comprabas; ajustamos tu carrito.');
      else if (renewed) toast.success('Renovamos tu reserva.');
    })();
    return () => { cancelled = true; };
  }, [secondsLeft, totalItems, qty]);

  // ----- Derivados del paso 2 -----
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
  // Ahorro por cantidad (bulk) — solo si NO hay código (son excluyentes).
  const bulkSavings = applied ? 0 : sorted.reduce((s, t) => { const q = qty[t.id] ?? 0; return s + q * (t.active_price_cents - bulkUnitPrice(t, q)); }, 0);
  const docLabel = docType === 'dni' ? 'DNI' : docType === 'ce' ? 'Carné ext.' : 'Pasaporte';

  // Label ÚNICO del CTA (mismo texto en el botón del rail y en la barra mobile).
  const ctaLabel = isPending
    ? 'Procesando…'
    : applied?.isFree
      ? 'Obtener entrada gratis'
      : method === 'mercadopago'
        ? `Pagar ${formatPEN(finalTotal)}`
        : 'Ir a pagar con Yape';
  const isYape = method === 'yape_manual' && !applied?.isFree;

  function submitCheckout(form: HTMLFormElement) {
    const fd = new FormData(form);
    // Confirmación de edad: solo se exige si el evento la pide (configurable).
    const ageOk = event.require_age_confirmation ? fd.get('age_ok') === '1' : true;
    if (event.require_age_confirmation && !ageOk) { toast.error(`Tienes que confirmar que eres mayor de ${event.min_age} años`); return; }
    const input: Omit<CheckoutInput, 'sessionId'> = {
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
    };
    startTransition(async () => {
      const res = await startCheckout({ ...input, sessionId: sessionIdRef.current });
      if (!res.ok) { toast.error(res.message ?? 'Error en el checkout'); return; }
      if ('mp' in res) { if (mpPublicKey) setMpCheckout(res.mp); else window.location.href = res.mp.initPoint; return; }
      if ('redirectUrl' in res) window.location.href = res.redirectUrl;
    });
  }

  if (sorted.length === 0) {
    return (
      <section className="c-co">
        <div className="c-card" style={{ textAlign: 'center', color: 'var(--ink-2)' }}>Las entradas estarán disponibles pronto.</div>
      </section>
    );
  }

  const activeStep = mpCheckout ? 2 : step;
  const lineItems = selectedTypes.map((t) => ({ id: t.id, name: t.name, q: qty[t.id]!, amount: qty[t.id]! * t.active_price_cents }));
  // Línea de confianza del rail: refleja los métodos REALES de la marca (mismas
  // banderas que las pestañas de pago). Evita prometer un método no configurado.
  const payLabel = brand.yape_number && mpConfigured
    ? 'Pago con Yape o tarjeta'
    : brand.yape_number
      ? 'Pago con Yape'
      : mpConfigured
        ? 'Pago con tarjeta'
        : 'Pago seguro';

  // CTA del rail según paso (paso 1 = Continuar; paso 2 = submit del form).
  const railCta = mpCheckout ? null : step === 1 ? (
    <button type="button" className="c-btn c-btn--brand c-btn--block c-btn--lg" disabled={totalItems === 0} onClick={() => setStep(2)}>
      Continuar <ArrowRight className="h-4 w-4" />
    </button>
  ) : (
    <button type="submit" form="checkout-form" className="c-btn c-btn--brand c-btn--block c-btn--lg" disabled={isPending}>
      {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
      {!isPending && method === 'mercadopago' && !applied?.isFree && <Lock className="h-4 w-4" />}
      {ctaLabel}
    </button>
  );

  return (
    <section id="entradas" className="c-co">
      <Stepper active={activeStep} onGoStep1={() => { if (step === 2 && !mpCheckout) setStep(1); }} />

      <div className="c-co__grid">
        {/* ---------------- Columna principal ---------------- */}
        <div className="c-co__main">
          {mpCheckout && mpPublicKey ? (
            <div className="c-stepwrap">
              <div className="c-card">
                <p className="c-card__title">Pagar con tarjeta</p>
                <MercadoPagoWallet publicKey={mpPublicKey} preferenceId={mpCheckout.preferenceId} initPoint={mpCheckout.initPoint} />
              </div>
            </div>
          ) : step === 1 ? (
            <div className="c-stepwrap" key="step1">
              <HeroCard event={event} />

              {/* ENTRADAS */}
              <section>
                <div className="c-sechead"><span className="c-sechead__t">Elegí tus entradas</span></div>
                <div className="c-ttlist">
                  {sorted.map((t, i) => {
                    const soldOut = t.soldOut;
                    const cur = qty[t.id] ?? 0;
                    const perks = (t.description ?? '').split('\n').filter(Boolean);
                    const ttStyle = { '--i': i, ...(t.color_hex ? { '--tt-accent': t.color_hex } : {}) } as React.CSSProperties;
                    return (
                      <article key={t.id} className={`c-tt ${cur > 0 ? 'c-tt--active' : ''} ${soldOut ? 'c-tt--out' : ''}`} style={ttStyle}>
                        <div className="c-tt__main">
                          <h3 className="c-tt__name">{t.name}</h3>
                          {perks.length > 0 && (
                            <ul className="c-tt__perks">{perks.map((p, idx) => <li key={idx}>{p}</li>)}</ul>
                          )}
                          {t.bulk_min_qty > 0 && t.bulk_discount_pct > 0 && (
                            <p className="c-tt__bulk">Llevá {t.bulk_min_qty}+ y pagás {t.bulk_discount_pct}% menos</p>
                          )}
                          {!soldOut && <PhaseTiming tt={t} />}
                        </div>
                        <div className="c-tt__right">
                          <span className="c-tt__price">{formatPEN(t.active_price_cents)}</span>
                          {soldOut ? (
                            <span className="c-soldout">Agotado</span>
                          ) : cur === 0 ? (
                            <button type="button" onClick={() => inc(t)} aria-label={`Agregar ${t.name}`} className="c-add">Agregar</button>
                          ) : (
                            <div className="c-qty" aria-live="polite">
                              <button type="button" onClick={() => dec(t)} aria-label={`Restar ${t.name}`} className="c-qbtn"><Minus className="h-4 w-4" /></button>
                              <span key={cur} className="c-qval">{cur}</span>
                              <button type="button" onClick={() => inc(t)} aria-label={`Sumar ${t.name}`} className="c-qbtn c-qbtn--add"><Plus className="h-4 w-4" /></button>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>

                {/* Código de promotor (opcional): se aplica en el paso 2 con el email. */}
                <div className="c-promorow">
                  {showPromo ? (
                    <input value={promoInput} onChange={(e) => setPromoInput(e.target.value)} placeholder="Código de promotor" autoCapitalize="characters" maxLength={32} className="c-input" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', maxWidth: 300 }} />
                  ) : (
                    <button type="button" onClick={() => setShowPromo(true)} className="c-textlink">
                      ¿Tenés un código de promotor? Ingresalo acá
                    </button>
                  )}
                </div>

                {/* Compartir — enlaces de texto, después del selector (fuera del hero) */}
                <ShareEvent eventName={event.name} shareUrl={shareUrl} />
              </section>

              <DondeCard event={event} />
            </div>
          ) : (
            <div className="c-stepwrap" key="step2">
              <form
                id="checkout-form"
                onSubmit={(e) => { e.preventDefault(); submitCheckout(e.currentTarget); }}
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                {/* TUS DATOS */}
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
                    <p className="c-help">Aquí te llega tu QR al instante.</p>
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
                    <p className="c-muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Pon el nombre de cada asistente (opcional). Aparece en cada entrada. Si lo dejas vacío, usamos tu nombre.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

                {/* PAGO (pestañas adaptadas a los métodos reales) */}
                {!applied?.isFree && (
                  <div className="c-card">
                    <p className="c-card__title">Pago</p>
                    <div className="c-paytabs" role="radiogroup" aria-label="Método de pago">
                      {brand.yape_number && (
                        <button type="button" role="radio" aria-checked={method === 'yape_manual'} className={`c-paytab ${method === 'yape_manual' ? 'c-paytab--on' : ''}`} onClick={() => setMethod('yape_manual')}>Yape</button>
                      )}
                      {mpConfigured && (
                        <button type="button" role="radio" aria-checked={method === 'mercadopago'} className={`c-paytab ${method === 'mercadopago' ? 'c-paytab--on' : ''}`} onClick={() => setMethod('mercadopago')}>Tarjeta</button>
                      )}
                    </div>
                    {isYape ? (
                      <div className="c-paypanel">
                        <p style={{ fontSize: 14, fontWeight: 700 }}>Yapeas a {brand.yape_holder ?? brand.name}</p>
                        <p className="c-muted" style={{ fontSize: 13, marginTop: 4 }}>En la pantalla siguiente yapeas y subes tu comprobante. Tu QR llega cuando el organizador confirme (5–15 min).</p>
                      </div>
                    ) : method === 'mercadopago' ? (
                      <div className="c-paypanel">
                        <div className="c-cardmarks">
                          <span className="c-cardmark">VISA</span>
                          <span className="c-cardmark">Mastercard</span>
                          <span className="c-cardmark">AMEX</span>
                        </div>
                        <p className="c-muted" style={{ fontSize: 13, marginTop: 8 }}>Procesado de forma segura por MercadoPago. Tu QR llega al instante.</p>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Código de promotor (si no se ingresó en el paso 1 o para verlo aplicado) */}
                {applied ? (
                  <div className="c-card">
                    <p className="c-card__title">¿Tienes un código?</p>
                    <div className="c-promo-on">
                      <div>
                        <span style={{ fontWeight: 700, color: 'var(--brand-ink)' }}>{applied.code}</span>
                        <p className="c-muted" style={{ fontSize: 12.5, marginTop: 2 }}>{applied.isFree ? '¡Entrada gratis!' : `Descuento: -${formatPEN(applied.discountCents)}`}</p>
                      </div>
                      <button type="button" className="c-btn c-btn--ghost" onClick={() => { setApplied(null); setPromoInput(''); }}>Quitar</button>
                    </div>
                  </div>
                ) : showPromo ? (
                  <div className="c-card">
                    <p className="c-card__title">¿Tienes un código?</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={promoInput} onChange={(e) => setPromoInput(e.target.value)} placeholder="Código de RRPP" autoCapitalize="characters" maxLength={32} className="c-input" style={{ textTransform: 'uppercase' }} />
                      <button type="button" className="c-btn c-btn--soft" onClick={applyPromo} disabled={checking || promoInput.trim().length < 2}>
                        {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="c-promo-toggle" onClick={() => setShowPromo(true)}>
                    <span aria-hidden className="c-promo-toggle__plus">+</span> ¿Tienes un código de descuento?
                  </button>
                )}

                <button type="button" onClick={() => setStep(1)} className="c-co__back">← Volver a entradas</button>
              </form>
            </div>
          )}
        </div>

        {/* ---------------- Rail de resumen (sticky) ---------------- */}
        <aside className="c-co__rail">
          <SummaryRail
            event={event} lineItems={lineItems} applied={applied} bulkSavings={bulkSavings}
            finalTotal={finalTotal} countdownLabel={countdownLabel} secondsLeft={secondsLeft}
            totalItems={totalItems} isYape={isYape && step === 2} cta={railCta} payLabel={payLabel}
          />
        </aside>
      </div>

      {/* CTA sticky SOLO en mobile */}
      {!mpCheckout && (
        <div className="c-mobilecta">
          <div className="c-mobilecta__t">
            <span className="n">{step === 1 ? `${totalItems} entrada${totalItems === 1 ? '' : 's'}` : 'Total'}</span>
            <span className="v"><span key={finalTotal} className="c-amount">{formatPEN(step === 1 ? totalCents : finalTotal)}</span></span>
          </div>
          {step === 1 ? (
            <button type="button" className="c-btn c-btn--brand" disabled={totalItems === 0} onClick={() => setStep(2)}>
              Continuar <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="submit" form="checkout-form" className="c-btn c-btn--brand" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {!isPending && method === 'mercadopago' && !applied?.isFree && <Lock className="h-4 w-4" />}
              {ctaLabel}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ============================ Stepper (texto plano, sin círculos) ============================
function Stepper({ active, onGoStep1 }: { active: number; onGoStep1: () => void }) {
  const steps = [
    { n: 1, label: 'Entradas' },
    { n: 2, label: 'Datos' },
    { n: 3, label: '¡Listo!' },
  ];
  return (
    <div className="c-stepper" aria-label="Pasos de la compra">
      {steps.map((s, i) => {
        const on = active === s.n;
        const clickable = s.n === 1 && active > 1;
        return (
          <span key={s.n} style={{ display: 'contents' }}>
            {i > 0 && <span className="c-stepper__sep" aria-hidden>—</span>}
            <button
              type="button"
              className={`c-stepper__item ${on ? 'c-stepper__item--on' : ''}`}
              onClick={clickable ? onGoStep1 : undefined}
              aria-current={on ? 'step' : undefined}
              style={{ cursor: clickable ? 'pointer' : 'default' }}
              disabled={!clickable}
            >
              <span className="c-stepper__n">{'0' + s.n}</span> {s.label}
            </button>
          </span>
        );
      })}
    </div>
  );
}

// ============================ Hero (compacto, contenido sobre papel, sin caja) ============================
function HeroCard({ event }: { event: Event }) {
  const cover = event.cover_url ?? null;
  return (
    <section className="c-hero2">
      <div className="c-hero2__thumb">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optimizedImage(cover, { width: 240, quality: 82 })} alt={`Flyer de ${event.name}`} decoding="async" />
        ) : (
          <div className="c-hero2__thumb-ph" aria-hidden />
        )}
      </div>
      <div className="c-hero2__body">
        <h1 className="c-hero2__title">
          {event.name}
          {' '}
          <span className="c-hero2__live"><span className="dot" /> En vivo</span>
        </h1>
        {event.description && <p className="c-hero2__sub">{event.description}</p>}
        <p className="c-hero2__meta">
          {fmtDateShort(event.starts_at)} · {fmtTime(event.starts_at)}
          {event.venue_name ? ` · ${event.venue_name}` : ''}
          {event.min_age > 0 ? ` · +${event.min_age}` : ''}
        </p>
      </div>
    </section>
  );
}

// ============================ Dónde (mapa real) ============================
function DondeCard({ event }: { event: Event }) {
  if (!event.venue_address && !event.refund_policy) return null;
  const mapsHref = event.venue_maps_url?.startsWith('https://')
    ? event.venue_maps_url
    : event.venue_lat && event.venue_lng
      ? `https://www.google.com/maps/search/?api=1&query=${event.venue_lat},${event.venue_lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue_address ?? '')}`;
  return (
    <section>
      <div className="c-sechead"><span className="c-sechead__t">Dónde</span></div>
      <div className="c-donde">
        {event.venue_address && (
          <div className="c-donde__map">
            <iframe
              title={`Mapa de ${event.venue_name ?? 'la ubicación'}`}
              src={`https://www.google.com/maps?q=${encodeURIComponent(event.venue_address)}&z=16&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        )}
        <div className="c-donde__info">
          {event.venue_name && <div className="c-donde__venue">{event.venue_name}</div>}
          {event.venue_address && <p className="c-donde__addr">{event.venue_address}</p>}
          {event.venue_address && (
            <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="c-donde__link">
              Cómo llegar →
            </a>
          )}
          <p className="c-donde__refund"><b>Devoluciones ·</b> {event.refund_policy || 'Sin devolución post-pago salvo cancelación del evento.'}</p>
        </div>
      </div>
    </section>
  );
}

// ============================ Rail de resumen ============================
function SummaryRail({
  event, lineItems, applied, bulkSavings, finalTotal, countdownLabel, secondsLeft, totalItems, isYape, cta, payLabel,
}: {
  event: Event;
  lineItems: { id: string; name: string; q: number; amount: number }[];
  applied: null | { code: string; discountCents: number; isFree: boolean };
  bulkSavings: number; finalTotal: number; countdownLabel: string | null; secondsLeft: number | null;
  totalItems: number; isYape: boolean; cta: React.ReactNode; payLabel: string;
}) {
  const cover = event.cover_url ?? null;
  return (
    <div className="c-rail">
      <div className="c-rail__head">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optimizedImage(cover, { width: 140, quality: 80 })} alt="" decoding="async" />
        )}
        <div style={{ minWidth: 0 }}>
          <div className="c-rail__name">{event.name}</div>
          <div className="c-rail__meta">{fmtDateShort(event.starts_at)} · {fmtTime(event.starts_at)}</div>
          {event.venue_name && <div className="c-rail__meta">{event.venue_name}</div>}
        </div>
      </div>

      {countdownLabel && totalItems > 0 && (
        <div className={`c-rail__timer ${secondsLeft !== null && secondsLeft < 60 ? 'c-rail__timer--soon' : ''}`} aria-live="polite">
          <Clock className="h-3.5 w-3.5" /> Entradas reservadas por <b style={{ fontVariantNumeric: 'tabular-nums' }}>{countdownLabel}</b>
        </div>
      )}

      <div className="c-rail__body">
        <p className="c-rail__label">Tu compra</p>
        {totalItems === 0 ? (
          <p className="c-rail__empty">Aún no elegiste entradas. Sumá al menos una para continuar.</p>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {lineItems.map((l) => (
                <div key={l.id} className="c-sum__row"><span>{l.name} × {l.q}</span><span className="v">{formatPEN(l.amount)}</span></div>
              ))}
              {applied && <div className="c-sum__row c-sum__discount"><span>Código {applied.code}</span><span className="v">−{formatPEN(applied.discountCents)}</span></div>}
              {!applied && bulkSavings > 0 && <div className="c-sum__row c-sum__discount"><span>Descuento por cantidad</span><span className="v">−{formatPEN(bulkSavings)}</span></div>}
            </div>
            <div className="c-sum__total"><span className="l">Total</span><span className="v"><span key={finalTotal} className="c-amount">{formatPEN(finalTotal)}</span></span></div>
            <p className="c-muted-3" style={{ fontSize: 11.5, textAlign: 'right', marginTop: 2 }}>IGV incluido · sin costos ocultos</p>
          </>
        )}

        {cta && <div className="c-rail__cta" style={{ marginTop: 18 }}>{cta}</div>}
        {isYape && <p className="c-rail__cta c-muted-3" style={{ textAlign: 'center', fontSize: 12, marginTop: 10 }}>Después: yapeas y subes tu comprobante.</p>}
        <p className="c-rail__secure"><Lock className="h-3.5 w-3.5" /> {payLabel}</p>
      </div>
    </div>
  );
}
