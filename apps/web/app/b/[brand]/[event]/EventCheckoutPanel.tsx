'use client';

import { useEffect, useMemo, useRef, useState, useTransition, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2, Lock, ArrowRight } from 'lucide-react';
import { formatPEN } from '@/lib/utils';
import { optimizedImage } from '@/lib/imageUrl';
import {
  type Concepto, type Brand, type Event, type TicketType,
  armarEscalera, resumirIncluye, distrito, hrefMapa,
  fmtCortoMayus, fmtCuando, fmtDiaLargo, fmtHora,
  FasesEscalera, FasesLinea, FasesSellos,
  ChipComprar, AsiDeSimple,
} from './conceptos';
import { startCheckout, previewPromo, type CheckoutInput } from './actions';
import { reserveStock } from '@/lib/reservations';
import { MercadoPagoWallet } from './MercadoPagoWallet';
import { ShareEvent } from './ShareEvent';
import { LineaLegal } from '../Responsable';
import { conConcepto } from '@/lib/concepto';

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

// Precio unitario con descuento por cantidad (bulk) aplicado, si corresponde.
// Solo para MOSTRAR — el server recalcula y congela el precio real en el checkout
// (y el bulk NO se apila con un código promo: si hay código, gana el código).
function bulkUnitPrice(t: TicketType, q: number): number {
  if (t.bulk_min_qty > 0 && t.bulk_discount_pct > 0 && q >= t.bulk_min_qty) {
    return Math.floor((t.active_price_cents * (100 - t.bulk_discount_pct)) / 100);
  }
  return t.active_price_cents;
}

export function EventCheckoutPanel({
  brand, event, ticketTypes, mpConfigured, mpPublicKey, refCode = '', shareUrl, concepto = 1,
}: {
  brand: Brand; event: Event; ticketTypes: TicketType[]; mpConfigured: boolean; mpPublicKey: string | null;
  refCode?: string; shareUrl: string;
  // Concepto de diseño a evaluar (1 cartel, 2 entrada, 3 noche). Solo
  // presentación: no cambia precio, stock, pago ni emisión.
  concepto?: Concepto;
}) {
  const sorted = useMemo(
    () => [...ticketTypes].sort((a, b) => a.active_price_cents - b.active_price_cents || a.sort_order - b.sort_order),
    [ticketTypes]
  );

  const [qty, setQty] = useState<Record<string, number>>({});
  const [step, setStepRaw] = useState<1 | 2>(1);
  // Morph entre pasos: el contenido que se va se desvanece 120ms (fade + 4px)
  // antes de que entre el nuevo, en vez de cortarse de golpe. `step` sigue
  // siendo la verdad para la lógica; `shownStep` es lo que se está pintando.
  const [shownStep, setShownStep] = useState<1 | 2>(1);
  const [leaving, setLeaving] = useState(false);
  const setStep = useCallback((next: 1 | 2) => {
    setStepRaw((prev) => {
      if (prev === next) return prev;
      setLeaving(true);
      return next;
    });
  }, []);
  useEffect(() => {
    if (!leaving) return;
    // prefers-reduced-motion: sin espera, el cambio es inmediato.
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setShownStep(step); setLeaving(false); return; }
    const t = setTimeout(() => { setShownStep(step); setLeaving(false); }, 120);
    return () => clearTimeout(t);
  }, [leaving, step]);
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
          const name = sorted.find((t) => t.id === ticketTypeId)?.name;
          toast.error(res.kind === 'stock' && name ? `No quedan suficientes entradas de ${name}.` : res.message);
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
  // Si el carrito quedó vacío estando en el paso 2 (p. ej. se agotó lo elegido),
  // volver a elegir entradas: no tiene sentido pagar 0 entradas.
  useEffect(() => { if (step === 2 && totalItems === 0 && !mpCheckout) setStep(1); }, [step, totalItems, mpCheckout, setStep]);

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
      toast.success(res.isFree ? 'Entrada gratis con el código' : `Código aplicado: -${formatPEN(res.totalDiscountCents)}`);
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
        : 'Pagar con Yape';
  const isYape = method === 'yape_manual' && !applied?.isFree;

  function submitCheckout(form: HTMLFormElement) {
    if (itemsForPromo.length === 0) { toast.error('Elige al menos una entrada.'); setStep(1); return; }
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
      // El concepto viaja con el comprador: la pantalla de Yape y la
      // confirmación se ven con la misma piel que la página del evento.
      if ('redirectUrl' in res) window.location.href = conConcepto(res.redirectUrl, concepto);
    });
  }

  if (sorted.length === 0) {
    return (
      <section className="b-buy">
        <div className="c-card" style={{ textAlign: 'center', color: 'var(--ink-2)' }}>Las entradas estarán disponibles pronto.</div>
      </section>
    );
  }

  const lineItems = selectedTypes.map((t) => ({ id: t.id, name: t.name, q: qty[t.id]!, amount: qty[t.id]! * t.active_price_cents }));
  // Confianza y CTA reflejan los métodos REALES de la marca: no prometemos un
  // medio de pago que el organizador no configuró.
  const payLabel = brand.yape_number && mpConfigured
    ? 'Pagas con Yape o tarjeta'
    : brand.yape_number
      ? 'Pagas con Yape'
      : mpConfigured
        ? 'Pagas con tarjeta'
        : 'Pago seguro';
  const ctaMetodo = method === 'mercadopago' ? 'Pagar con tarjeta' : brand.yape_number ? 'Pagar con Yape' : 'Pagar';

// Una sola línea, como se lo diría alguien: nada de enumeraciones de tres.
function fraseConfianza(pago: string): string {
  if (/tarjeta/i.test(pago) && /Yape/i.test(pago)) return 'Pagas por Yape o tarjeta y tu entrada te llega al correo al toque.';
  if (/tarjeta/i.test(pago)) return 'Pagas con tarjeta y tu entrada te llega al correo al toque.';
  return 'Pagas por Yape y tu entrada te llega al correo al toque.';
}

  return (
    <section id="entradas" className={`b-buy b-c${concepto}${shownStep === 2 ? ' b-buy--datos' : ''}${totalItems === 0 ? ' b-buy--vacio' : ''}`}>
      {/* El chip es el atajo de vuelta a la compra. Con algo en el carrito
          manda la barra de pagar y el chip se va: dos cosas pegadas abajo se
          estorban. */}
      {concepto === 1 && shownStep === 1 && <ChipComprar anclaId="elegi" activo={totalItems === 0} />}
      {mpCheckout && mpPublicKey ? (
        <div className={`c-stepwrap${leaving ? ' c-stepwrap--out' : ''}`}>
          <div className="b-head">
            <h1 className="b-head__t">Paga con tarjeta</h1>
            <p className="b-head__s">{event.name} · {formatPEN(finalTotal)}</p>
          </div>
          <div className="b-panel">
            <MercadoPagoWallet publicKey={mpPublicKey} preferenceId={mpCheckout.preferenceId} initPoint={mpCheckout.initPoint} />
          </div>
        </div>
      ) : shownStep === 1 ? (
        /* ---------- PANTALLA 1: el flyer y las entradas ---------- */
        <div className={`c-stepwrap${leaving ? ' c-stepwrap--out' : ''}`} key="step1">
        <div className="b-stage">
          <Hero event={event} concepto={concepto} />

          <div className="b-list">
            {/* "Elige tu entrada" solo en CARTEL: ahí la lista es una
                sección con nombre propio, no la continuación del flyer. */}
            {concepto === 1 && <h2 className="b1-h2" id="elegi">Elige tu entrada</h2>}
            <section className="b-tks">
              {sorted.map((t) => {
                const props = {
                  t,
                  escalera: armarEscalera(t),
                  cur: qty[t.id] ?? 0,
                  incluye: resumirIncluye(t.description),
                  onInc: () => inc(t),
                  onDec: () => dec(t),
                };
                if (concepto === 1) return <FasesLinea key={t.id} {...props} />;
                if (concepto === 2) return <FasesSellos key={t.id} {...props} />;
                return <FasesEscalera key={t.id} {...props} />;
              })}
            </section>
            <p className="b-trust">{fraseConfianza(payLabel)}</p>

            {/* CARTEL explica el trámite en tres pasos antes del mapa. */}
            {concepto === 1 && <AsiDeSimple conYape={!!brand.yape_number} />}

            <MasInfo event={event} brand={brand} />
          </div>

          {/* Resumen de compra: el único bloque sólido de la página, y el
              que reemplaza a la barra sticky en escritorio. */}
          <aside className="b-sum">
            <p className="b-sum__lb">Tu compra</p>
            {lineItems.length === 0 ? (
              <p className="b-sum__vacio">Elige tus entradas</p>
            ) : (
              <>
                <ul className="b-sum__list">
                  {lineItems.map((li) => (
                    <li key={li.id}><span>{li.name} × {li.q}</span><span>{formatPEN(li.amount)}</span></li>
                  ))}
                </ul>
                <p className="b-sum__total"><span>Total</span><b>{formatPEN(totalCents)}</b></p>
              </>
            )}
            <button type="button" className="b-btn b-btn--go" disabled={totalItems === 0} onClick={() => setStep(2)}>
              {applied?.isFree ? 'Continuar' : ctaMetodo} <ArrowRight aria-hidden="true" />
            </button>
          </aside>
        </div>
        </div>
      ) : (
        /* ---------- PANTALLA 2: tus datos ---------- */
        <div className={`c-stepwrap${leaving ? ' c-stepwrap--out' : ''}`} key="step2">
          <div className="b-head">
            <h1 className="b-head__t">Tus datos</h1>
            <p className="b-head__s">Aquí te mandamos tu entrada.</p>
          </div>

          <form
            id="checkout-form"
            onSubmit={(e) => { e.preventDefault(); submitCheckout(e.currentTarget); }}
          >
            <div className="b-panel">
              <div className="c-field">
                <label htmlFor="buyer_name" className="c-label">Nombre y apellido</label>
                <input id="buyer_name" name="buyer_name" autoComplete="name" required autoFocus placeholder="María López" className="c-input" />
              </div>
              <div className="c-field">
                <label htmlFor="buyer_email" className="c-label">Email</label>
                <input
                  id="buyer_email" name="buyer_email" type="email" autoComplete="email" required
                  placeholder="tu@email.com" className="c-input" inputMode="email"
                  onBlur={() => { if (promoInput.trim().length >= 2 && !applied && !checking) applyPromo(); }}
                />
                <p className="c-help">Aquí te llega tu QR.</p>
              </div>
              <div className="c-field">
                <label htmlFor="buyer_phone" className="c-label">Celular</label>
                <input
                  id="buyer_phone" name="buyer_phone" type="tel" autoComplete="tel" required
                  minLength={9} maxLength={20} inputMode="tel" pattern="^[+\d][\d\s\(\)\-]{7,19}$"
                  placeholder="+51 999 999 999" className="c-input"
                />
              </div>
              {event.require_dni && (
                <div className="c-field">
                  <label htmlFor="buyer_dni" className="c-label">DNI</label>
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
                  <p className="c-help">Te lo piden en la puerta. No lo compartimos.</p>
                </div>
              )}
              {event.require_age_confirmation && (
                <div className="c-field">
                  <label className="c-check">
                    <input type="checkbox" name="age_ok" value="1" required />
                    <span>Confirmo que soy mayor de {event.min_age} años.</span>
                  </label>
                </div>
              )}
              <div className="c-field">
                <label className="c-check">
                  {/* Desmarcada por defecto: el consentimiento tiene que ser expreso (Ley 29733). */}
                  <input type="checkbox" name="marketing_opt_in" value="1" />
                  <span>Quiero enterarme de los próximos eventos de {brand.name}.</span>
                </label>
              </div>
            </div>

            {event.collect_attendee_names && selectedTypes.length > 0 && (
              <div className="b-panel">
                <p className="b-panel__t">¿Quiénes van?</p>
                <p className="c-help" style={{ marginTop: -6, marginBottom: 12 }}>Opcional. Si lo dejas vacío, usamos tu nombre.</p>
                {selectedTypes.map((t) => (
                  <div key={t.id} className="c-field">
                    <label className="c-label">{t.name}</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {Array.from({ length: qty[t.id] ?? 0 }).map((_, i) => (
                        <input
                          key={i} className="c-input" placeholder={`Asistente ${i + 1}`} maxLength={120} autoComplete="off"
                          value={attendeeNames[t.id]?.[i] ?? ''}
                          onChange={(e) => setAttendee(t.id, i, e.target.value)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pago: solo se pregunta si de verdad hay dos formas. */}
            {!applied?.isFree && brand.yape_number && mpConfigured && (
              <div className="b-panel">
                <p className="b-panel__t">¿Cómo pagas?</p>
                <div className="b-pays" role="radiogroup" aria-label="Forma de pago">
                  <button type="button" role="radio" aria-checked={method === 'yape_manual'} className={`b-pay${method === 'yape_manual' ? ' b-pay--on' : ''}`} onClick={() => setMethod('yape_manual')}>Yape</button>
                  <button type="button" role="radio" aria-checked={method === 'mercadopago'} className={`b-pay${method === 'mercadopago' ? ' b-pay--on' : ''}`} onClick={() => setMethod('mercadopago')}>Tarjeta</button>
                </div>
                <p className="c-help" style={{ marginTop: 10 }}>
                  {isYape ? 'En la pantalla siguiente yapeas y subes tu comprobante.' : 'Pagas con tarjeta y tu QR llega al instante.'}
                </p>
              </div>
            )}

            <div className="b-panel">
              <p className="b-panel__t">Tu compra</p>
              {lineItems.map((li) => (
                <div key={li.id} className="b-resumen">
                  <span>{li.q}× {li.name}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatPEN(li.amount)}</span>
                </div>
              ))}
              {bulkSavings > 0 && (
                <div className="b-resumen"><span>Descuento por cantidad</span><span className="b-desc">−{formatPEN(bulkSavings)}</span></div>
              )}
              {applied && (
                <div className="b-resumen">
                  <span>Código {applied.code}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <span className="b-desc">{applied.isFree ? 'Gratis' : `−${formatPEN(applied.discountCents)}`}</span>
                    <button type="button" className="b-back" style={{ margin: 0 }} onClick={() => { setApplied(null); setPromoInput(''); }}>Quitar</button>
                  </span>
                </div>
              )}
              <div className="b-resumen"><span>Total</span><b>{formatPEN(finalTotal)}</b></div>
              <p className="b-seguro"><Lock aria-hidden="true" /> {payLabel}</p>

              {!applied && (
                showPromo ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <input
                      value={promoInput} onChange={(e) => setPromoInput(e.target.value)} placeholder="Código de RR.PP."
                      autoCapitalize="characters" maxLength={32} className="c-input" style={{ textTransform: 'uppercase' }}
                    />
                    <button type="button" className="b-btn b-btn--soft" style={{ height: 48 }} onClick={applyPromo} disabled={checking || promoInput.trim().length < 2}>
                      {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
                    </button>
                  </div>
                ) : (
                  <button type="button" className="b-back" onClick={() => setShowPromo(true)}>+ Tengo un código</button>
                )
              )}
            </div>
          </form>

          <button type="button" onClick={() => setStep(1)} className="b-back">← Volver a las entradas</button>
        </div>
      )}

      {/* CTA sticky: el total siempre a la vista. */}
      {!mpCheckout && (
        <div className="b-cta">
          <div className="b-cta__t">
            {totalItems === 0 ? (
              <span className="n n--solo">Elige tu entrada</span>
            ) : (
              <>
                <span className="n">{totalItems} entrada{totalItems === 1 ? '' : 's'}</span>
                <span className="v"><span key={finalTotal} className="c-amount">{formatPEN(shownStep === 1 ? totalCents : finalTotal)}</span></span>
              </>
            )}
          </div>
          {shownStep === 1 ? (
            <button type="button" className="b-btn b-btn--go" disabled={totalItems === 0} onClick={() => setStep(2)}>
              {applied?.isFree ? 'Continuar' : ctaMetodo} <ArrowRight aria-hidden="true" />
            </button>
          ) : (
            <button type="submit" form="checkout-form" className="b-btn b-btn--go" disabled={isPending || totalItems === 0}>
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

// ============================ El hero, por concepto ============================
// Los tres muestran el mismo flyer y el mismo título; lo que cambia es cuánto
// pesa cada uno y dónde cae el texto:
//   1 CARTEL   el flyer ocupa casi toda la primera pantalla y el título va
//              encima, grande. Es un afiche.
//   2 ENTRADA  el flyer es chico y entra DENTRO del boleto, como la foto de
//              un ticket; el título va en el cuerpo del boleto.
//   3 NOCHE    el flyer sangra por un costado y el título ocupa el resto.
// Tocar el flyer lo abre entero en los tres (el hero siempre lo recorta).
function Hero({ event, concepto }: { event: Event; concepto: Concepto }) {
  const mapsHref = hrefMapa(event);
  const [zoom, setZoom] = useState(false);
  const donde = [event.venue_name, distrito(event.venue_address)].filter(Boolean).join(' · ');
  const kicker = [fmtCortoMayus(event.starts_at), donde].filter(Boolean).join(' · ');

  useEffect(() => {
    if (!zoom) return;
    const cerrar = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(false); };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, [zoom]);

  // En ENTRADA el flyer va dentro del boleto: se pide más chico y no lleva
  // el degradado, porque el título no se apoya encima.
  const ancho = concepto === 2 ? 640 : 900;

  return (
    <>
      <header className="b-hero">
      {event.cover_url ? (
        <button type="button" className="b-hero__shot" onClick={() => setZoom(true)} aria-label={`Ver el flyer de ${event.name} completo`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {/* El póster ENTERO sobre una copia difuminada y oscurecida de sí
              mismo. Es la única forma de meter un flyer vertical en una banda
              apaisada sin tirar la mitad del afiche: lo que rellena el hueco
              es el propio flyer, fuera de foco. Va en los tres conceptos, así
              que el recorte es 0% en todos. Decorativo: sin texto encima. */}
          <span
            className="b-hero__blur" aria-hidden="true"
            style={{ backgroundImage: `url(${JSON.stringify(optimizedImage(event.cover_url, { width: 640, quality: 45 }))})` }}
          />
          <img src={optimizedImage(event.cover_url, { width: ancho, quality: 80 })} alt={`Flyer de ${event.name}`} decoding="async" />
          {concepto !== 2 && <span className="b-hero__fade" aria-hidden="true" />}
        </button>
      ) : (
        <div className="b-hero__shot b-hero__shot--ph" aria-hidden="true"><span className="b-hero__fade" /></div>
      )}

      {/* Ficha bajo el póster: solo en escritorio (en teléfono los datos
          van sobre el flyer, en una línea). */}
      <div className="b-aside">
        <p>{fmtDiaLargo(event.starts_at)}</p>
        <p>{fmtHora(event.starts_at)}</p>
        {donde && <p>{donde}</p>}
        {mapsHref && <a href={mapsHref} target="_blank" rel="noopener noreferrer">Cómo llegar →</a>}
      </div>

      {zoom && event.cover_url && (
        <button type="button" className="b-lightbox" onClick={() => setZoom(false)} aria-label="Cerrar el flyer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={optimizedImage(event.cover_url, { width: 1200, quality: 86 })} alt={`Flyer de ${event.name}`} />
          <span className="b-lightbox__hint">Toca para cerrar</span>
        </button>
      )}
      </header>

      {/* El bloque de título. En CARTEL y NOCHE se apoya sobre el flyer en
          teléfono; en ENTRADA siempre va debajo, dentro del boleto. */}
      <div className="b-hero__over">
        <p className="b-kicker">{kicker}</p>
        <h1 className="b-hero__name">{event.name}</h1>
        {concepto === 2 && <p className="b2-cuando">{fmtCuando(event.starts_at)}</p>}
      </div>
    </>
  );
}
// ============================ Más información ============================
// Sección visible (no acordeón): dónde es con su mapa, sobre el evento si el
// organizador escribió algo, y la línea de responsabilidad al final: quién
// gestiona cancelaciones y devoluciones, con su contacto.
function MasInfo({ event, brand }: { event: Event; brand: Brand }) {
  const mapsHref = hrefMapa(event);
  const direccion = [event.venue_address, distrito(event.venue_address) ? null : event.venue_name]
    .filter(Boolean).join(', ');

  return (
    <section className="b-info">
      {(event.venue_name || event.venue_address) && (
        <div className="b-info__b">
          <p className="b-lb">Dónde es</p>
          {event.venue_address && (
            <iframe
              className="b-map"
              src={`https://www.google.com/maps?q=${encodeURIComponent(event.venue_address)}&z=16&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={`Mapa de ${event.venue_name ?? 'el lugar'}`}
            />
          )}
          <p className="b-info__dir">
            {event.venue_name}
            {direccion && <><br />{direccion}</>}
          </p>
          {mapsHref && (
            <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="b-info__link">Cómo llegar →</a>
          )}
        </div>
      )}

      {event.description && (
        <div className="b-info__b">
          <p className="b-lb">Sobre el evento</p>
          <p className="b-info__txt">{event.description}</p>
        </div>
      )}

      <LineaLegal marca={brand} minAge={event.min_age} refundPolicy={event.refund_policy} />
    </section>
  );
}