'use client';

import { useEffect, useMemo, useRef, useState, useTransition, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2, Lock, ArrowRight, MapPin } from 'lucide-react';
import { formatPEN } from '@/lib/utils';
import { optimizedImage } from '@/lib/imageUrl';
import {
  type Brand, type Event, type TicketType,
  armarEscalera, resumirIncluye, distrito, hrefMapa, fmtCortoMayus,
  FilaEntrada, AsiDeSimple,
} from './conceptos';
import { startCheckout, previewPromo, type CheckoutInput } from './actions';
import { reserveStock } from '@/lib/reservations';
import { MercadoPagoWallet } from './MercadoPagoWallet';
import { LineaLegal } from '../Responsable';
import { claseDireccion, type Direccion } from '@/lib/concepto';

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
  brand, event, ticketTypes, mpConfigured, mpPublicKey, refCode = '', shareUrl, direccion = 'editorial',
}: {
  brand: Brand; event: Event; ticketTypes: TicketType[]; mpConfigured: boolean; mpPublicKey: string | null;
  refCode?: string; shareUrl: string;
  // Dirección de diseño, decidida por el flyer en el server. Solo
  // presentación: no cambia precio, stock, pago ni emisión.
  direccion?: Direccion;
}) {
  const sorted = useMemo(
    () => [...ticketTypes].sort((a, b) => a.active_price_cents - b.active_price_cents || a.sort_order - b.sort_order),
    [ticketTypes]
  );

  // Evento GRATIS con un solo tipo: la entrada viene elegida (1) y el botón
  // de abajo ya es "Reclamar". No hay nada que decidir antes de dejar los datos.
  const unicoGratis = event.is_free === true && sorted.length === 1 && !sorted[0]!.soldOut ? sorted[0]! : null;
  const [qty, setQty] = useState<Record<string, number>>(() => (unicoGratis ? { [unicoGratis.id]: 1 } : {}));
  const [step, setStepRaw] = useState<1 | 2>(1);
  // Morph entre pasos: el contenido que se va sale (140ms) antes de que entre
  // el nuevo (220ms), en vez de cortarse de golpe. `step` sigue siendo la
  // verdad para la lógica; `shownStep` es lo que se está pintando.
  //
  // `atras` es la DIRECCIÓN, y existe porque sin ella volver se veía igual que
  // avanzar: el paso que entra tiene que venir del lado por donde se fue el
  // anterior, o el movimiento no informa nada.
  const [shownStep, setShownStep] = useState<1 | 2>(1);
  // La entrada escalonada (hero, título, entradas, pasos, dónde, barra) es de
  // la PRIMERA carga. Volver de "Tus datos" no la repite: ahí el movimiento
  // lo hace el cambio de paso.
  const [primera, setPrimera] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [atras, setAtras] = useState(false);
  const setStep = useCallback((next: 1 | 2) => {
    // Sin updater funcional: un updater de useState tiene que ser PURO y en
    // Strict Mode React lo corre dos veces en desarrollo, así que no puede
    // llevar adentro el setAtras/setLeaving. `step` alcanza como fuente única
    // —es el paso lógico— y la dependencia lo mantiene fresco.
    if (step === next) return;
    setPrimera(false);
    setAtras(next < step);
    setLeaving(true);
    setStepRaw(next);
  }, [step]);
  useEffect(() => {
    if (!leaving) return;
    // prefers-reduced-motion: sin espera, el cambio es inmediato.
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setShownStep(step); setLeaving(false); return; }
    // Igual que la duración de c-stepout: el nuevo paso entra justo cuando
    // el anterior terminó de irse.
    const t = setTimeout(() => { setShownStep(step); setLeaving(false); }, 140);
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
  // Id del reclamo gratis (0064). Atado al CONTENIDO del reclamo: si la
  // respuesta se pierde y la persona toca de nuevo sin cambiar nada, viaja el
  // mismo id y el server devuelve la orden que ya creó. Si cambia entradas,
  // email o documento, es otro reclamo y lleva otro id.
  const claimRef = useRef<{ clave: string; id: string } | null>(null);
  const [reservationExpiresAt, setReservationExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  // La preselección cuenta como "ya reservada" para NO crear una reserva de
  // stock en cada visita (bots incluidos): el cupo lo asegura igual
  // reserve_order_stock, bajo lock, al reclamar. Si la persona cambia la
  // cantidad, desde ahí se reserva como siempre.
  const lastReserved = useRef<Record<string, number>>(unicoGratis ? { [unicoGratis.id]: 1 } : {});
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
    const tope = event.max_per_person ?? 10;
    if (current >= tope) { toast.error(`Máximo ${tope} por persona`); return; }
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
  // En un evento gratis el monto 0 se lee "Gratis", nunca "S/ 0".
  const plata = (c: number) => (event.is_free && c === 0 ? 'Gratis' : formatPEN(c));
  // "Desde" de la barra vacía: la entrada más barata que todavía se vende.
  const aLaVenta = sorted.filter((t) => !t.soldOut);
  const desdeCents = aLaVenta.length ? Math.min(...aLaVenta.map((t) => t.active_price_cents)) : 0;
  // La línea bajo el título: el precio de entrada (o "libre" si es gratis) y
  // la edad mínima. Es lo que la gente pregunta antes de mirar las entradas.
  const lineaHero = [
    event.is_free ? 'Entrada libre con registro' : aLaVenta.length ? `Entradas desde ${formatPEN(desdeCents)}` : 'Entradas agotadas',
    event.min_age > 0 ? `+${event.min_age}` : null,
  ].filter(Boolean).join(' · ');
  // Ahorro por cantidad (bulk) — solo si NO hay código (son excluyentes).
  const bulkSavings = applied ? 0 : sorted.reduce((s, t) => { const q = qty[t.id] ?? 0; return s + q * (t.active_price_cents - bulkUnitPrice(t, q)); }, 0);
  const docLabel = docType === 'dni' ? 'DNI' : docType === 'ce' ? 'Carné ext.' : 'Pasaporte';

  // GRATIS de verdad: o el evento está marcado gratis y el total quedó en 0, o
  // un código del 100% lo dejó en 0. Es la MISMA condición que exige el server
  // antes de emitir sin pago (evento gratis Y total 0): si un evento gratis
  // tuviera además un tipo pago, el total deja de ser 0 y esto vuelve a ser una
  // compra normal, como corresponde.
  const eventoGratis = event.is_free === true && finalTotal === 0;
  const esGratis = applied?.isFree === true || eventoGratis;

  // Label ÚNICO del CTA (mismo texto en el botón del rail y en la barra mobile).
  const ctaLabel = isPending
    ? 'Procesando…'
    : eventoGratis
      ? 'Reclama tu entrada gratis'
      : applied?.isFree
        ? 'Obtener entrada gratis'
        : method === 'mercadopago'
          ? `Pagar ${formatPEN(finalTotal)}`
          : 'Pagar con Yape';
  const isYape = method === 'yape_manual' && !esGratis;

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
      // Solo una pista para el server: elige el camino de un viaje (0064).
      freeHint: eventoGratis && !applied,
    };
    if (input.freeHint) {
      const clave = JSON.stringify([input.items, input.buyerEmail.toLowerCase(), input.buyerDocType, input.buyerDni]);
      if (claimRef.current?.clave !== clave) {
        claimRef.current = { clave, id: window.crypto?.randomUUID?.() ?? '' };
      }
      // Sin randomUUID (navegador muy viejo) no se manda: el reclamo anda igual,
      // solo que sin idempotencia.
      if (claimRef.current.id) input.claimId = claimRef.current.id;
    }
    startTransition(async () => {
      const res = await startCheckout({ ...input, sessionId: sessionIdRef.current });
      if (!res.ok) { toast.error(res.message ?? 'Error en el checkout'); return; }
      // Reclamo confirmado: el próximo (volver atrás y pedir otra, si el límite
      // por persona lo permite) es OTRO reclamo y lleva otro id.
      claimRef.current = null;
      if ('mp' in res) { if (mpPublicKey) setMpCheckout(res.mp); else window.location.href = res.mp.initPoint; return; }
      if ('redirectUrl' in res) window.location.href = res.redirectUrl;
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
  const payLabel = eventoGratis
    ? 'gratis'
    : brand.yape_number && mpConfigured
    ? 'Pagas con Yape o tarjeta'
    : brand.yape_number
      ? 'Pagas con Yape'
      : mpConfigured
        ? 'Pagas con tarjeta'
        : 'Pago seguro';
  const ctaMetodo = method === 'mercadopago' ? 'Pagar con tarjeta' : brand.yape_number ? 'Pagar con Yape' : 'Pagar';
  // Un solo texto para el botón del paso 1, en la barra (teléfono) y en el
  // rail (escritorio): antes el rail decía "Continuar" y la barra otra cosa.
  const etiquetaPaso1 = totalItems === 0
    ? (event.is_free ? 'Elige tu entrada' : 'Elige tus entradas')
    : event.is_free
      ? <>Reclamar entrada gratis <ArrowRight aria-hidden="true" /></>
      : <>{esGratis ? 'Continuar' : ctaMetodo} <ArrowRight aria-hidden="true" /></>;

// Una sola línea, como se lo diría alguien: nada de enumeraciones de tres.
function fraseConfianza(pago: string): string {
  // Evento gratis: no hay pago que explicar. Lo que hay que prometer es que el
  // QR sale al instante y que no se cobra nada.
  if (pago === 'gratis') return 'No pagas nada: dejas tus datos y tu entrada te llega al correo al toque.';
  if (/tarjeta/i.test(pago) && /Yape/i.test(pago)) return 'Pagas por Yape o tarjeta y tu entrada te llega al correo al toque.';
  if (/tarjeta/i.test(pago)) return 'Pagas con tarjeta y tu entrada te llega al correo al toque.';
  return 'Pagas por Yape y tu entrada te llega al correo al toque.';
}

  return (
    <section id="entradas" className={`b-buy ${claseDireccion(direccion)}${shownStep === 2 ? ' b-buy--datos' : ''}${totalItems === 0 ? ' b-buy--vacio' : ''}${primera ? ' b-buy--primera' : ''}`}>
      {mpCheckout && mpPublicKey ? (
        <div className={`c-stepwrap${leaving ? ' c-stepwrap--out' : ''}${atras ? ' c-stepwrap--back' : ''}`}>
          <div className="b-head">
            <h1 className="b-head__t">Paga con tarjeta</h1>
            <p className="b-head__s">{event.name} · {plata(finalTotal)}</p>
          </div>
          <div className="b-panel">
            <MercadoPagoWallet publicKey={mpPublicKey} preferenceId={mpCheckout.preferenceId} initPoint={mpCheckout.initPoint} />
          </div>
        </div>
      ) : shownStep === 1 ? (
        /* ---------- PANTALLA 1: el flyer y las entradas ---------- */
        <div className={`c-stepwrap${leaving ? ' c-stepwrap--out' : ''}${atras ? ' c-stepwrap--back' : ''}`} key="step1">
        <div className="b-stage">
          <Hero event={event} direccion={direccion} linea={lineaHero} />

          <div className="b-list">
            {/* En EDITORIAL la lista es una sección con nombre propio; en
                CANVAS es la continuación natural del flyer y no lo necesita. */}
            {/* En CANVAS el título de la sección no se ve —la lista es la continuación
                del flyer—, pero existe para lectores de pantalla: sin él el
                esquema saltaba de h1 a h3. */}
            <h2 className={direccion === 'editorial' ? 'b1-h2' : 'sr-only'} id="elegi">Elige tu entrada</h2>
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
                return <FilaEntrada key={t.id} {...props} />;
              })}
            </section>
            <p className="b-trust">{fraseConfianza(payLabel)}</p>

            <AsiDeSimple conYape={!!brand.yape_number} gratis={eventoGratis} />

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
                    <li key={li.id}><span>{li.name} × {li.q}</span><span>{plata(li.amount)}</span></li>
                  ))}
                </ul>
                <p className="b-sum__total"><span>Total</span><b>{plata(totalCents)}</b></p>
              </>
            )}
            <button type="button" className="b-btn b-btn--go" disabled={totalItems === 0} onClick={() => setStep(2)}>
              {etiquetaPaso1}
            </button>
          </aside>
        </div>
        </div>
      ) : (
        /* ---------- PANTALLA 2: tus datos ---------- */
        <div className={`c-stepwrap${leaving ? ' c-stepwrap--out' : ''}${atras ? ' c-stepwrap--back' : ''}`} key="step2">
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
            {!esGratis && brand.yape_number && mpConfigured && (
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
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{plata(li.amount)}</span>
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
              <div className="b-resumen"><span>Total</span><b>{plata(finalTotal)}</b></div>
              {/* El candado es la promesa del pago. En un evento gratis no hay
                  pago, así que no hay nada que asegurar: va la promesa real. */}
              {eventoGratis
                ? <p className="b-seguro">Entrada gratis · no se te cobra nada</p>
                : <p className="b-seguro"><Lock aria-hidden="true" /> {payLabel}</p>}

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
            {totalItems === 0 && event.is_free ? (
              // Gratis y vacía: no hay un "desde" que decir.
              <span className="n n--solo">Elige tu entrada</span>
            ) : totalItems === 0 ? (
              // Vacía, la barra dice cuánto cuesta entrar (como la maqueta
              // aprobada de Canvas): el precio más bajo a la venta.
              <>
                <span className="n">Desde</span>
                <span className="v">{formatPEN(desdeCents)}</span>
              </>
            ) : (
              <>
                <span className="n">{totalItems} entrada{totalItems === 1 ? '' : 's'}</span>
                <span className="v"><span key={finalTotal} className="c-amount">{plata(shownStep === 1 ? totalCents : finalTotal)}</span></span>
              </>
            )}
          </div>
          {shownStep === 1 ? (
            <button type="button" className="b-btn b-btn--go" disabled={totalItems === 0} onClick={() => setStep(2)}>
              {etiquetaPaso1}
            </button>
          ) : (
            <button type="submit" form="checkout-form" className="b-btn b-btn--go" disabled={isPending || totalItems === 0}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {!isPending && method === 'mercadopago' && !esGratis && <Lock className="h-4 w-4" />}
              {ctaLabel}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ================================ El hero ================================
// Teléfono: una BANDA de 216 con el flyer ENTERO centrado sobre una copia del
// mismo flyer difuminada (blur 28, brillo .55). Nunca texto sobre el flyer:
// debajo van el eyebrow (cuándo · dónde), el nombre y una línea con el punto
// de la marca. Escritorio: el flyer a 360×450 en su columna, con la ficha del
// lugar debajo. Canvas y Editorial comparten este markup; Editorial (un flyer
// que no sirve: una captura, o ninguno) cambia el orden y el alto en el CSS.
// Tocar el flyer lo abre entero.
function Hero({ event, linea }: { event: Event; direccion: Direccion; linea: string }) {
  const mapsHref = hrefMapa(event);
  const [zoom, setZoom] = useState(false);
  // `cerrando` existe para que el visor tenga SALIDA: antes se desmontaba de
  // golpe mientras la entrada sí estaba animada. Sale por el mismo camino.
  const [cerrando, setCerrando] = useState(false);
  const cerrarZoom = useCallback(() => {
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setZoom(false); return; }
    setCerrando(true);
  }, []);
  // El desmontaje espera a que termine la salida, y el temporizador se limpia.
  useEffect(() => {
    if (!cerrando) return;
    const t = setTimeout(() => { setCerrando(false); setZoom(false); }, 160);
    return () => clearTimeout(t);
  }, [cerrando]);
  useEffect(() => {
    if (!zoom) return;
    const cerrar = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrarZoom(); };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, [zoom, cerrarZoom]);

  const lugar = [event.venue_name, distrito(event.venue_address)].filter(Boolean).join(', ');
  const eyebrow = [fmtCortoMayus(event.starts_at), lugar.toUpperCase()].filter(Boolean).join(' · ');

  return (
    <>
      <header className="b-hero">
        {event.cover_url ? (
          <button type="button" className="b-hero__shot" onClick={() => setZoom(true)} aria-label={`Ver el flyer de ${event.name} completo`}>
            {/* El relleno de la banda es el propio flyer fuera de foco. Se pide
                chiquito (96px): con 28px de blur no se nota, y el teléfono no
                se baja dos veces la imagen grande. */}
            <span
              className="b-hero__blur" aria-hidden="true"
              style={{ backgroundImage: `url(${JSON.stringify(optimizedImage(event.cover_url, { width: 96, quality: 40 }))})` }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={optimizedImage(event.cover_url, { width: 720, quality: 80 })} alt={`Flyer de ${event.name}`} decoding="async" />
          </button>
        ) : null}

        {/* Ficha bajo el flyer: solo en escritorio. La fecha ya va en el
            eyebrow del título; acá, dónde y cómo llegar. */}
        <div className="b-aside">
          {event.venue_name && <p className="b-aside__nm">{event.venue_name}</p>}
          {event.venue_address && <p className="b-aside__dir">{event.venue_address}</p>}
          {mapsHref && <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="b-link">Cómo llegar →</a>}
        </div>

        {zoom && event.cover_url && (
          <button type="button" className={`b-lightbox${cerrando ? ' b-lightbox--out' : ''}`} onClick={cerrarZoom} aria-label="Cerrar el flyer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={optimizedImage(event.cover_url, { width: 1200, quality: 86 })} alt={`Flyer de ${event.name}`} />
            <span className="b-lightbox__hint">Toca para cerrar</span>
          </button>
        )}
      </header>

      {/* El título, DEBAJO del flyer en el teléfono y en la columna del centro
          en escritorio. Nunca encima de la imagen. */}
      <div className="b-hero__over">
        <p className="b-kicker">{eyebrow}</p>
        <h1 className="b-hero__name">{event.name}</h1>
        {linea && <p className="b-hero__linea"><span className="b-dot" aria-hidden="true" />{linea}</p>}
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
  const direccion = event.venue_address ?? '';
  // Qué busca el mapa: la dirección si la hay; si no, el nombre del lugar.
  const mapaQuery = [event.venue_name, event.venue_address].filter(Boolean).join(', ');

  return (
    <section className="b-info">
      {(event.venue_name || event.venue_address) && (
        <div className="b-info__b b-info__donde">
          <h2 className="b1-h2">Dónde es</h2>
          <div className="b-donde">
            {/* El mapa de Google, a 118 y en diferido. Sobre el negro va
                oscurecido con un filtro (compra.css); el pin en --surface-2 es
                lo que se ve mientras carga y lo que queda si no hay dirección
                ni lugar que buscar. */}
            <span className="b-map" aria-hidden="true">
              <MapPin />
              {mapaQuery && (
                <iframe
                  className="b-map__frame"
                  src={`https://www.google.com/maps?q=${encodeURIComponent(mapaQuery)}&z=16&output=embed`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={`Mapa de ${event.venue_name ?? 'el lugar'}`}
                  tabIndex={-1}
                />
              )}
            </span>
            <div className="b-donde__txt">
              {event.venue_name && <p className="b-donde__nm">{event.venue_name}</p>}
              {direccion && <p className="b-info__dir">{direccion}</p>}
              {mapsHref && (
                <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="b-link b-info__link">Cómo llegar →</a>
              )}
            </div>
          </div>
        </div>
      )}

      {event.description && (
        <div className="b-info__b">
          <h2 className="b1-h2">Sobre el evento</h2>
          <p className="b-info__txt">{event.description}</p>
        </div>
      )}

      <LineaLegal marca={brand} minAge={event.min_age} refundPolicy={event.refund_policy} />
    </section>
  );
}