'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Minus, Plus, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatPEN } from '@/lib/utils';
import { startCheckout, previewPromo, type CheckoutInput } from './actions';
import { reserveStock } from '@/lib/reservations';

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
  id: string;
  slug: string;
  name: string;
  yape_number: string | null;
  yape_holder: string | null;
};
type Event = {
  id: string;
  slug: string;
  name: string;
  min_age: number;
  starts_at: string;
};
type TicketType = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  // Active price phase (server-resolved). Display + estimate only — the
  // server re-resolves the authoritative price at checkout.
  active_price_cents: number;
  next_price_cents: number | null;
  next_starts_at: string | null;
  capacity: number;
  sold: number;
  is_unlimited: boolean;
  sort_order: number;
  color_hex: string | null;
};

// Urgency hook: "sube a S/40 el 5 jun". Shows the LAST day at the current
// price (the instant just before the next phase begins), in Lima time.
function formatRiseDate(nextStartsAt: string): string {
  const lastMoment = new Date(new Date(nextStartsAt).getTime() - 60_000);
  return new Intl.DateTimeFormat('es-PE', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Lima',
  }).format(lastMoment);
}

export function EventCheckoutPanel({
  brand,
  event,
  ticketTypes,
}: {
  brand: Brand;
  event: Event;
  ticketTypes: TicketType[];
}) {
  // Anchoring: sort by price descending so highest tier shows first.
  // (Promoter's sort_order is a tiebreaker.)
  const sorted = useMemo(
    () =>
      [...ticketTypes].sort(
        (a, b) =>
          b.active_price_cents - a.active_price_cents || a.sort_order - b.sort_order
      ),
    [ticketTypes]
  );

  const [qty, setQty] = useState<Record<string, number>>({});
  const [step, setStep] = useState<1 | 2>(1);
  const [method, setMethod] = useState<'yape_manual' | 'mercadopago'>(
    brand.yape_number ? 'yape_manual' : 'mercadopago'
  );
  const [isPending, startTransition] = useTransition();

  // Stock reservation: session id is created on first interaction and persists
  // for the tab. The first reservation sets the countdown; every successful
  // refresh extends it.
  const sessionIdRef = useRef<string>('');
  const [reservationExpiresAt, setReservationExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  // We re-trigger the server reserve when qty changes — debounced so quick
  // clicks on +/- don't flood the RPC.
  const lastReserved = useRef<Record<string, number>>({});
  useEffect(() => {
    sessionIdRef.current = readOrCreateSessionId();
  }, []);
  useEffect(() => {
    if (reservationExpiresAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [reservationExpiresAt]);
  useEffect(() => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const timer = setTimeout(() => {
      // Compute diff vs last known reserved state and push changes.
      const next = { ...lastReserved.current };
      const ids = new Set([...Object.keys(qty), ...Object.keys(lastReserved.current)]);
      ids.forEach(async (ticketTypeId) => {
        const want = qty[ticketTypeId] ?? 0;
        const have = lastReserved.current[ticketTypeId] ?? 0;
        if (want === have) return;
        const res = await reserveStock(sid, ticketTypeId, want);
        if (!res.ok) {
          toast.error(res.message);
          if (typeof res.available === 'number') {
            // Snap quantity to the actual maximum so the UI doesn't lie.
            setQty((q) => ({ ...q, [ticketTypeId]: res.available! }));
            next[ticketTypeId] = res.available!;
          }
          return;
        }
        next[ticketTypeId] = want;
        if (want === 0) delete next[ticketTypeId];
        if (res.expiresAt) {
          setReservationExpiresAt(new Date(res.expiresAt).getTime());
        }
      });
      lastReserved.current = next;
    }, 400);
    return () => clearTimeout(timer);
  }, [qty]);

  const totalCents = useMemo(
    () =>
      sorted.reduce(
        (acc, t) => acc + (qty[t.id] ?? 0) * t.active_price_cents,
        0
      ),
    [qty, sorted]
  );
  const totalItems = useMemo(
    () => Object.values(qty).reduce((a, b) => a + b, 0),
    [qty]
  );

  function inc(t: TicketType) {
    const remaining = t.capacity - t.sold;
    const current = qty[t.id] ?? 0;
    if (!t.is_unlimited && current >= remaining) {
      toast.error(`Solo quedan ${remaining} disponibles`);
      return;
    }
    if (current >= 10) {
      toast.error('Máximo 10 por compra');
      return;
    }
    setQty({ ...qty, [t.id]: current + 1 });
  }
  function dec(t: TicketType) {
    const current = qty[t.id] ?? 0;
    if (current <= 0) return;
    setQty({ ...qty, [t.id]: current - 1 });
  }

  // Countdown derived state.
  const secondsLeft =
    reservationExpiresAt === null
      ? null
      : Math.max(0, Math.floor((reservationExpiresAt - now) / 1000));
  const countdownLabel = secondsLeft === null
    ? null
    : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;
  // When time runs out, force a reload so the user starts over with fresh stock.
  useEffect(() => {
    if (secondsLeft === 0 && totalItems > 0) {
      toast.error('Tu reserva expiró. Recargando…');
      const t = setTimeout(() => window.location.reload(), 1500);
      return () => clearTimeout(t);
    }
  }, [secondsLeft, totalItems]);

  if (sorted.length === 0) {
    return (
      <section className="container mt-12">
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          Las entradas estarán disponibles pronto.
        </div>
      </section>
    );
  }

  return (
    <section id="entradas" className="container mt-12 space-y-6">
      {/* Progress + countdown */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <Dot active />
          <span>Entradas</span>
          <span className="mx-1 h-px w-6 bg-border" />
          <Dot active={step >= 2} />
          <span>Datos + pago</span>
          <span className="mx-1 h-px w-6 bg-border" />
          <Dot />
          <span>Confirmación</span>
        </div>
        {countdownLabel && totalItems > 0 && (
          <div
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] ${
              secondsLeft !== null && secondsLeft < 60
                ? 'border-destructive/60 text-destructive'
                : 'border-secondary/40 text-secondary'
            }`}
            aria-live="polite"
            aria-label={`Tu reserva vence en ${countdownLabel}`}
          >
            <Clock className="h-3 w-3" />
            Reserva · {countdownLabel}
          </div>
        )}
      </div>

      {step === 1 ? (
        <Step1
          sorted={sorted}
          qty={qty}
          inc={inc}
          dec={dec}
          totalCents={totalCents}
          totalItems={totalItems}
          onContinue={() => setStep(2)}
        />
      ) : (
        <Step2
          brand={brand}
          event={event}
          sorted={sorted}
          qty={qty}
          totalCents={totalCents}
          method={method}
          setMethod={setMethod}
          isPending={isPending}
          onBack={() => setStep(1)}
          onSubmit={(input) => {
            startTransition(async () => {
              const res = await startCheckout({
                ...input,
                sessionId: sessionIdRef.current,
              });
              if (!res.ok) {
                toast.error(res.message ?? 'Error en el checkout');
                return;
              }
              if (res.redirectUrl) {
                window.location.href = res.redirectUrl;
              }
            });
          }}
        />
      )}
    </section>
  );
}

function Dot({ active }: { active?: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${active ? 'bg-secondary' : 'bg-muted'}`}
      style={
        active
          ? { boxShadow: '0 0 6px hsl(var(--secondary))' }
          : undefined
      }
    />
  );
}

// =============================================================
// Step 1 — Pick tickets
// =============================================================
function Step1({
  sorted,
  qty,
  inc,
  dec,
  totalCents,
  totalItems,
  onContinue,
}: {
  sorted: TicketType[];
  qty: Record<string, number>;
  inc: (t: TicketType) => void;
  dec: (t: TicketType) => void;
  totalCents: number;
  totalItems: number;
  onContinue: () => void;
}) {
  return (
    <>
      <div className="space-y-3">
        {sorted.map((t) => {
          const remaining = t.capacity - t.sold;
          // Unlimited types never sell out and have no scarcity meter.
          const soldOut = !t.is_unlimited && remaining <= 0;
          const lowStock = !t.is_unlimited && !soldOut && remaining < t.capacity * 0.2;
          const accent = t.color_hex || 'var(--primary-hex,#FF1F8F)';
          const cur = qty[t.id] ?? 0;
          const perks = (t.description ?? '').split('\n').filter(Boolean);
          return (
            <article
              key={t.id}
              className={`relative grid gap-4 rounded-lg border bg-card p-5 transition-colors md:grid-cols-[1fr_auto] md:items-center md:gap-8 md:p-6 ${
                soldOut ? 'border-border opacity-60' : 'border-border hover:border-foreground/30'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <h3 className="font-display text-2xl uppercase leading-none tracking-tight md:text-3xl">
                    {t.name}
                  </h3>
                  <span
                    className="font-mono text-xs"
                    style={{ color: accent }}
                  >
                    {formatPEN(t.active_price_cents)}
                  </span>
                </div>
                {perks.length > 0 && (
                  <ul className="space-y-0.5 text-sm text-muted-foreground">
                    {perks.map((p, i) => (
                      <li key={i}>· {p}</li>
                    ))}
                  </ul>
                )}
                {t.next_price_cents != null && t.next_starts_at && !soldOut && (
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-yellow">
                    ↑ Sube a {formatPEN(t.next_price_cents)} el{' '}
                    {formatRiseDate(t.next_starts_at)}
                  </p>
                )}
                {!t.is_unlimited && (
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {soldOut ? (
                      <span className="text-destructive">Agotado</span>
                    ) : lowStock ? (
                      <span style={{ color: accent }}>
                        Quedan pocas · {remaining} de {t.capacity}
                      </span>
                    ) : (
                      <>
                        Disponibles · {remaining} de {t.capacity}
                      </>
                    )}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 justify-self-end">
                <button
                  type="button"
                  onClick={() => dec(t)}
                  disabled={cur === 0 || soldOut}
                  aria-label={`Restar ${t.name}`}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-muted disabled:opacity-30"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center font-mono text-lg tabular-nums">
                  {cur}
                </span>
                <button
                  type="button"
                  onClick={() => inc(t)}
                  disabled={soldOut}
                  aria-label={`Sumar ${t.name}`}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white transition-all disabled:opacity-30"
                  style={{
                    background: soldOut ? 'hsl(var(--muted))' : accent,
                    boxShadow: soldOut ? 'none' : `0 0 14px -4px ${accent}`,
                  }}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Sticky bottom CTA on mobile, inline on desktop */}
      <div
        className={`sticky bottom-4 z-20 flex items-center justify-between gap-4 rounded-full border border-border bg-card/90 p-2 pl-5 backdrop-blur transition-opacity ${
          totalItems > 0 ? 'opacity-100' : 'pointer-events-none opacity-50'
        }`}
      >
        <div className="flex flex-col font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <span>
            {totalItems} entrada{totalItems === 1 ? '' : 's'}
          </span>
          <span className="font-display text-xl normal-case tracking-normal text-foreground">
            {formatPEN(totalCents)}
            <span className="ml-1 text-[10px] text-muted-foreground">IGV inc.</span>
          </span>
        </div>
        <Button
          type="button"
          variant="gradient"
          size="lg"
          disabled={totalItems === 0}
          onClick={onContinue}
        >
          Continuar al pago →
        </Button>
      </div>
    </>
  );
}

// =============================================================
// Step 2 — Buyer data + payment method
// =============================================================
function Step2({
  brand,
  event,
  sorted,
  qty,
  totalCents,
  method,
  setMethod,
  isPending,
  onBack,
  onSubmit,
}: {
  brand: Brand;
  event: Event;
  sorted: TicketType[];
  qty: Record<string, number>;
  totalCents: number;
  method: 'yape_manual' | 'mercadopago';
  setMethod: (m: 'yape_manual' | 'mercadopago') => void;
  isPending: boolean;
  onBack: () => void;
  onSubmit: (input: Omit<CheckoutInput, 'sessionId'>) => void;
}) {
  const [promoInput, setPromoInput] = useState('');
  const [applied, setApplied] = useState<null | { code: string; finalCents: number; discountCents: number; isFree: boolean }>(null);
  const [checking, setChecking] = useState(false);

  const itemsForPromo = Object.entries(qty)
    .filter(([, q]) => q > 0)
    .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));

  async function applyPromo() {
    const code = promoInput.trim();
    if (!code) return;
    const email = (document.getElementById('buyer_email') as HTMLInputElement | null)?.value?.trim() ?? '';
    if (!email) { toast.error('Ingresá tu email antes de aplicar el código.'); return; }
    setChecking(true);
    const res = await previewPromo({ eventId: event.id, code, email, items: itemsForPromo });
    setChecking(false);
    if (!res.ok) {
      const msgs: Record<string, string> = {
        NOT_FOUND: 'Código inválido.', EXPIRED: 'Código vencido.', EXHAUSTED: 'Código agotado.',
        EMAIL_LIMIT: 'Ya usaste ese código con este email.', NOT_APPLICABLE: 'No aplica a estas entradas.',
        NEED_EMAIL: 'Ingresá tu email primero.', BAD_TICKET_TYPE: 'Entrada inválida.',
      };
      setApplied(null);
      toast.error(msgs[res.reason] ?? 'No se pudo aplicar el código.');
      return;
    }
    setApplied({ code, finalCents: res.totalFinalCents, discountCents: res.totalDiscountCents, isFree: res.isFree });
    toast.success(res.isFree ? '¡Entrada gratis con el código!' : `Código aplicado: -${formatPEN(res.totalDiscountCents)}`);
  }

  const finalTotal = applied ? applied.finalCents : totalCents;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const ageOk = fd.get('age_ok') === '1';
        if (!ageOk) {
          toast.error(`Tienes que confirmar que eres mayor de ${event.min_age} años`);
          return;
        }
        onSubmit({
          eventId: event.id,
          brandId: brand.id,
          buyerName: String(fd.get('buyer_name') ?? '').trim(),
          buyerEmail: String(fd.get('buyer_email') ?? '').trim(),
          buyerPhone: String(fd.get('buyer_phone') ?? '').trim(),
          ageOk,
          marketingOptIn: fd.get('marketing_opt_in') === '1',
          method,
          items: itemsForPromo,
          promoCode: applied?.code,
        });
      }}
      className="grid gap-6 md:grid-cols-[1fr_360px]"
    >
      {/* Form column */}
      <div className="space-y-6">
        <section className="space-y-4 rounded-lg border border-border bg-card p-6">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
            [ DATOS DEL COMPRADOR ]
          </h2>
          <div className="space-y-2">
            <Label htmlFor="buyer_name">Nombre y apellido</Label>
            <Input
              id="buyer_name"
              name="buyer_name"
              autoComplete="name"
              required
              placeholder="María López"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="buyer_email">Email</Label>
            <Input
              id="buyer_email"
              name="buyer_email"
              type="email"
              autoComplete="email"
              required
              placeholder="tu@email.com"
            />
            <p className="text-xs text-muted-foreground">
              Aquí te llega tu QR al instante.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="buyer_phone">WhatsApp</Label>
            <Input
              id="buyer_phone"
              name="buyer_phone"
              type="tel"
              autoComplete="tel"
              required
              minLength={9}
              maxLength={20}
              inputMode="tel"
              pattern="^[+\d][\d\s\(\)\-]{7,19}$"
              placeholder="+51 999 999 999"
            />
            <p className="text-xs text-muted-foreground">
              También te lo enviamos por aquí.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="age_ok"
              value="1"
              required
              className="mt-1"
            />
            <span>
              Confirmo que soy mayor de {event.min_age} años (requerido para
              ingresar al evento)
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="marketing_opt_in"
              value="1"
              defaultChecked
              className="mt-1"
            />
            <span>
              Quiero recibir info de los próximos eventos de {brand.name}
            </span>
          </label>
        </section>

        <section
          className={`space-y-4 rounded-lg border border-border bg-card p-6 ${
            applied?.isFree ? 'hidden' : ''
          }`}
        >
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
            [ MÉTODO DE PAGO ]
          </h2>

          <div role="radiogroup" aria-label="Método de pago" className="space-y-3">
            {brand.yape_number && (
              <PaymentOption
                selected={method === 'yape_manual'}
                onClick={() => setMethod('yape_manual')}
                title="Yape"
                subtitle="Pago manual · validación en 5–15 min"
                note={`Yapeas a ${brand.yape_holder ?? brand.name} y nos envías la captura.`}
              />
            )}
            <PaymentOption
              selected={method === 'mercadopago'}
              onClick={() => setMethod('mercadopago')}
              title="Tarjeta · MercadoPago"
              subtitle="Visa · Mastercard · AMEX · Transferencia BCP/BBVA"
              note="Procesado por MercadoPago. Tu QR llega al instante."
            />
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-card p-6">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
            [ CÓDIGO PROMOCIONAL ]
          </h2>
          {applied ? (
            <div className="flex items-center justify-between rounded-md border border-secondary bg-secondary/10 p-3">
              <div className="text-sm">
                <span className="font-mono uppercase tracking-[0.12em] text-secondary">
                  {applied.code}
                </span>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {applied.isFree
                    ? '¡Entrada gratis!'
                    : `Descuento aplicado: -${formatPEN(applied.discountCents)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setApplied(null);
                  setPromoInput('');
                }}
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
              >
                Quitar
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value)}
                placeholder="Ingresá tu código"
                className="uppercase"
                autoCapitalize="characters"
                maxLength={32}
              />
              <Button
                type="button"
                variant="outline"
                onClick={applyPromo}
                disabled={checking || promoInput.trim().length < 2}
              >
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Si un RRPP te dio un código, ingresalo antes de pagar.
          </p>
        </section>
      </div>

      {/* Summary column */}
      <aside className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
            [ RESUMEN ]
          </h2>
          <p className="mt-3 font-display text-xl uppercase">{event.name}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {new Date(event.starts_at).toLocaleString('es-PE')}
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {sorted
              .filter((t) => (qty[t.id] ?? 0) > 0)
              .map((t) => {
                const q = qty[t.id]!;
                return (
                  <li key={t.id} className="flex items-baseline justify-between">
                    <span>
                      {q}× {t.name}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatPEN(q * t.active_price_cents)}
                    </span>
                  </li>
                );
              })}
          </ul>
          {applied && (
            <div className="mt-4 flex items-baseline justify-between text-sm text-secondary">
              <span className="uppercase tracking-tight">
                Código {applied.code}
              </span>
              <span className="font-mono tabular-nums">
                −{formatPEN(applied.discountCents)}
              </span>
            </div>
          )}
          <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4 font-display text-xl">
            <span className="text-sm uppercase tracking-tight">Total</span>
            <span className="tabular-nums">{formatPEN(finalTotal)}</span>
          </div>
          <p className="mt-1 text-right text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            IGV incluido
          </p>
        </div>

        <Button
          type="submit"
          variant="gradient"
          size="lg"
          className="w-full"
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Procesando…
            </>
          ) : applied?.isFree ? (
            <>Obtener entrada gratis →</>
          ) : method === 'mercadopago' ? (
            <>Pagar {formatPEN(finalTotal)} →</>
          ) : (
            <>Continuar con Yape →</>
          )}
        </Button>

        <button
          type="button"
          onClick={onBack}
          className="block w-full text-center font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
        >
          ← Editar entradas
        </button>

        <p className="text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          🔒 Pago seguro · Tus datos están protegidos
        </p>
      </aside>
    </form>
  );
}

function PaymentOption({
  selected,
  onClick,
  title,
  subtitle,
  note,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  note: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${title}. ${subtitle}`}
      onClick={onClick}
      className={`block w-full rounded-md border p-4 text-left transition-colors ${
        selected
          ? 'border-secondary bg-secondary/10'
          : 'border-border hover:border-foreground/30'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">{title}</span>
        <span
          aria-hidden
          className={`h-4 w-4 rounded-full border-2 ${
            selected ? 'border-secondary bg-secondary' : 'border-border'
          }`}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      <p className="mt-2 text-xs text-foreground/70">{note}</p>
    </button>
  );
}
