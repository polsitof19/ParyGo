'use client';

// =============================================================
// Los tres conceptos de la página de compra
// =============================================================
// Acá viven los tipos compartidos, las funciones de fecha y las piezas que
// CAMBIAN entre conceptos. Todo lo que no está acá (carrito, reservas, promo,
// checkout) es idéntico en los tres: esto es piel y ritmo, no lógica.
//
//   1 CARTEL   el flyer a pantalla completa manda. Las fases son una LÍNEA DE
//              TIEMPO horizontal; hay un chip sticky para volver a comprar y
//              una sección "Así de simple" que explica el trámite en 3 pasos.
//   2 ENTRADA  el bloque de compra ES un boleto: troquel, talón lateral con el
//              total y el botón, tipografía de ticket. Las fases son SELLOS.
//   3 NOCHE    editorial oscuro: tipografía enorme, precios gigantes, el color
//              de la marca solo en el botón y una línea.

import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, Lock, Ticket, Smartphone, Mail } from 'lucide-react';
import { formatPEN } from '@/lib/utils';

export type Concepto = 1 | 2 | 3;

export type Brand = {
  id: string; slug: string; name: string;
  yape_number: string | null; yape_holder: string | null;
  // Contacto del organizador: es quien responde por el evento, así que la
  // página de compra tiene que poder linkearlo (ver lib/organizador.ts).
  whatsapp_e164?: string | null; contact_email?: string | null;
  // Supabase tipa theme_json como Json; se narrowing-castea al leer el logo.
  theme_json?: unknown;
};

export type Event = {
  id: string; slug: string; name: string; description?: string | null;
  min_age: number; starts_at: string; ends_at?: string | null;
  venue_name?: string | null; venue_address?: string | null;
  venue_lat?: number | null; venue_lng?: number | null; venue_maps_url?: string | null;
  cover_url?: string | null; refund_policy?: string | null;
  require_age_confirmation: boolean; require_dni: boolean; collect_attendee_names: boolean;
};

export type TicketType = {
  id: string; name: string; description: string | null; price_cents: number;
  active_price_cents: number; active_name: string | null; active_ends_at: string | null;
  next_price_cents: number | null; next_starts_at: string | null; next_name: string | null;
  // soldOut viene calculado server-side; NUNCA se mandan capacity/sold al cliente
  // (el comprador no ve cuántas hay ni cuántas quedan — solo el estado "Agotado").
  is_unlimited: boolean; soldOut: boolean; sort_order: number; color_hex: string | null;
  // Todas las fases de precio del tipo (públicas). La compra siempre es sobre
  // la fase VIGENTE.
  phases: { name: string | null; price_cents: number; starts_at: string | null; ends_at: string | null; sort_order: number }[];
  bulk_min_qty: number; bulk_discount_pct: number;
};

// ---------------------------------------------------------------- fechas ---
export function fmtCuando(iso: string): string {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' }).format(d);
  const limpio = dia.replace(/,/g, '');
  return `${limpio.charAt(0).toUpperCase()}${limpio.slice(1)} · ${fmtHora(iso).toLowerCase()}`;
}

export function fmtCortoMayus(iso: string): string {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Lima' })
    .format(d).replace(/[.,]/g, '').trim();
  return `${dia} · ${fmtHora(iso)}`.toUpperCase();
}

export function fmtDiaLargo(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' })
    .format(new Date(iso)).replace(/,/g, '').toUpperCase();
}

export function fmtHora(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Lima' })
    .format(new Date(iso)).replace(/\s?a\.?\s?m\.?/i, ' AM').replace(/\s?p\.?\s?m\.?/i, ' PM').replace(/\s+/g, ' ').trim();
}

/** "27 set" — para el corte de una fase. */
export function fmtDia(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', timeZone: 'America/Lima' })
    .format(new Date(iso)).replace(/[-.]/g, ' ').trim();
}

/** Distrito deducible de la dirección; si no se puede, no inventa. */
export function distrito(dir?: string | null): string | null {
  const partes = (dir ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (partes.length < 2) return null;
  const sinCiudad = partes.filter((x) => !/^(lima|per[uú])$/i.test(x));
  if (sinCiudad.length < 2) return null;
  return sinCiudad[sinCiudad.length - 1] ?? null;
}

/** Qué incluye, en pocas palabras, para que la fila no crezca. */
export function resumirIncluye(desc?: string | null): string | null {
  const todo = (desc ?? '').split('\n').map((x) => x.trim()).filter(Boolean).join(' · ');
  if (!todo) return null;
  const palabras = todo.split(/\s+/);
  return palabras.length <= 6 ? todo : `${palabras.slice(0, 6).join(' ')}…`;
}

export function hrefMapa(event: Event): string | null {
  if (event.venue_maps_url?.startsWith('https://')) return event.venue_maps_url;
  if (event.venue_lat && event.venue_lng) return `https://www.google.com/maps/search/?api=1&query=${event.venue_lat},${event.venue_lng}`;
  if (event.venue_address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue_address)}`;
  return null;
}

// ------------------------------------------------------------- las fases ---
export type Peldano = {
  titulo: string; sub: string | null; precio: number;
  estado: 'pasada' | 'vigente' | 'futura';
};

/** Misma regla que get_event_active_prices: vigente = la primera cuya ventana
 *  contiene a ahora. Los tres conceptos parten de esta misma lista. */
export function armarEscalera(t: TicketType): Peldano[] {
  const ahora = Date.now();
  if (t.phases.length === 0) {
    return [{ titulo: t.name, sub: null, precio: t.active_price_cents, estado: 'vigente' }];
  }
  const ordenadas = [...t.phases].sort((a, b) => a.sort_order - b.sort_order);
  const iVigente = ordenadas.findIndex((f) => {
    const empezo = !f.starts_at || Date.parse(f.starts_at) <= ahora;
    const sigue = !f.ends_at || Date.parse(f.ends_at) > ahora;
    return empezo && sigue;
  });
  return ordenadas.map((f, i) => {
    const estado: Peldano['estado'] = i === iVigente ? 'vigente' : i < iVigente || iVigente === -1 ? 'pasada' : 'futura';
    // Sin nombre: las del medio son preventas numeradas y la última la Regular,
    // como en Joinnus o Teleticket.
    const ultima = i === ordenadas.length - 1;
    const nombre = f.name?.trim() || (ultima && ordenadas.length > 1 ? 'Regular' : `Preventa ${i + 1}`);
    if (estado === 'vigente') {
      const sub = f.ends_at ? `${nombre} · hasta el ${fmtDia(f.ends_at)}` : nombre;
      return { titulo: t.name, sub, precio: f.price_cents, estado };
    }
    let sub: string | null = null;
    if (estado === 'futura' && f.starts_at) {
      const previa = ordenadas[i - 1]?.ends_at;
      const mismoDia = previa ? fmtDia(previa) === fmtDia(f.starts_at) : false;
      if (!mismoDia) sub = `desde el ${fmtDia(f.starts_at)}`;
    }
    return { titulo: nombre, sub, precio: f.price_cents, estado };
  });
}

/** Solo el nombre de la fase (sin el tipo), para la línea de tiempo y los
 *  sellos, donde el tipo ya va en la cabecera. */
export function nombreFase(t: TicketType, p: Peldano, i: number, total: number): string {
  if (p.estado !== 'vigente') return p.titulo;
  const f = [...t.phases].sort((a, b) => a.sort_order - b.sort_order)[i];
  if (!f) return p.titulo;
  return f.name?.trim() || (i === total - 1 && total > 1 ? 'Regular' : `Preventa ${i + 1}`);
}

// ------------------------------------------------------------- la acción ---
// El control de compra es EL MISMO en los tres conceptos: mismas clases,
// mismos aria-label, misma lógica. Cambia la piel alrededor, no esto — así el
// E2E recorre los tres sin tocar un selector.
export function Accion({
  t, cur, estado, onInc, onDec,
}: {
  t: TicketType; cur: number; estado: Peldano['estado'];
  onInc: () => void; onDec: () => void;
}) {
  if (estado !== 'vigente') {
    return <Lock className="b-ph__lock" aria-label={estado === 'futura' ? 'Todavía no disponible' : 'Fase terminada'} />;
  }
  if (t.soldOut) return <span className="b-ph__ago">Agotada</span>;
  if (cur === 0) {
    return (
      <button type="button" onClick={onInc} className="b-add" aria-label={`Sumar ${t.name}`}>
        <Plus aria-hidden="true" />
      </button>
    );
  }
  return (
    <span className="b-qty" aria-live="polite">
      <button type="button" onClick={onDec} aria-label={`Restar ${t.name}`} className="b-qbtn"><Minus aria-hidden="true" /></button>
      <span key={cur} className="b-qval">{cur}</span>
      <button type="button" onClick={onInc} aria-label={`Sumar ${t.name}`} className="b-qbtn b-qbtn--add"><Plus aria-hidden="true" /></button>
    </span>
  );
}

type FilaProps = {
  t: TicketType; escalera: Peldano[]; cur: number; incluye: string | null;
  onInc: () => void; onDec: () => void;
};

// ------------------------------------------- 3 · NOCHE y base: la escalera ---
// Una fila por fase. Es la lectura más literal: qué precio rige hoy, hasta
// cuándo y cuánto va a costar después.
export function FasesEscalera({ t, escalera, cur, incluye, onInc, onDec }: FilaProps) {
  return (
    <div className={`b-ty${t.soldOut ? ' b-ty--out' : ''}`}>
      {escalera.map((f, i) => (
        <div key={i} className={`b-ph${f.estado === 'vigente' ? ' b-ph--on' : ''}`}>
          <span className="b-ph__nm">
            {f.titulo}
            {f.sub && <span className="b-ph__fase">{f.sub}</span>}
            {f.estado === 'vigente' && incluye && <span className="b-ph__inc">{incluye}</span>}
          </span>
          <span className="b-ph__pr">{formatPEN(f.precio)}</span>
          <span className="b-ph__act">
            <Accion t={t} cur={cur} estado={f.estado} onInc={onInc} onDec={onDec} />
          </span>
        </div>
      ))}
    </div>
  );
}

// -------------------------------------------- 1 · CARTEL: línea de tiempo ---
// El tipo y su precio de hoy arriba, grandes. Debajo, la escalera de precios
// como una línea horizontal: dónde estamos y hacia dónde va. La fase vigente
// se marca con el color de la marca (punto y barra — nunca el texto).
export function FasesLinea({ t, escalera, cur, incluye, onInc, onDec }: FilaProps) {
  const vigente = escalera.find((f) => f.estado === 'vigente') ?? escalera[0]!;
  const iVig = escalera.indexOf(vigente);
  return (
    <div className={`b-ty b1-ty${t.soldOut ? ' b-ty--out' : ''}`}>
      <div className="b1-ty__head">
        <div className="b1-ty__id">
          <h3 className="b1-ty__nm">{t.name}</h3>
          {incluye && <p className="b1-ty__inc">{incluye}</p>}
        </div>
        <span className="b-ph__pr b1-ty__pr">{formatPEN(vigente.precio)}</span>
        <span className="b-ph__act b1-ty__act">
          <Accion t={t} cur={cur} estado="vigente" onInc={onInc} onDec={onDec} />
        </span>
      </div>

      {escalera.length > 1 && (
        <ol className="b1-line" aria-label={`Precios de ${t.name} por etapa`}>
          {escalera.map((f, i) => (
            <li key={i} className={`b1-line__n${i === iVig ? ' b1-line__n--on' : ''}${i < iVig ? ' b1-line__n--past' : ''}`}>
              <span className="b1-line__dot" aria-hidden="true" />
              <span className="b1-line__lb">{nombreFase(t, f, i, escalera.length)}</span>
              <span className="b1-line__pr">{formatPEN(f.precio)}</span>
              {f.sub && i !== iVig && <span className="b1-line__sub">{f.sub}</span>}
              {i === iVig && f.sub && <span className="b1-line__sub">{f.sub.replace(/^.*·\s*/, '')}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// --------------------------------------------------- 2 · ENTRADA: sellos ---
// Cabecera de boleto (tipo · precio · acción) y debajo las fases como sellos
// apilados: el vigente entero, los otros apagados con su fecha.
export function FasesSellos({ t, escalera, cur, incluye, onInc, onDec }: FilaProps) {
  const vigente = escalera.find((f) => f.estado === 'vigente') ?? escalera[0]!;
  const iVig = escalera.indexOf(vigente);
  return (
    <div className={`b-ty b2-ty${t.soldOut ? ' b-ty--out' : ''}`}>
      <div className="b2-ty__head">
        <span className="b2-ty__nm">{t.name}</span>
        <span className="b-ph__pr b2-ty__pr">{formatPEN(vigente.precio)}</span>
        <span className="b-ph__act">
          <Accion t={t} cur={cur} estado="vigente" onInc={onInc} onDec={onDec} />
        </span>
      </div>
      {incluye && <p className="b2-ty__inc">{incluye}</p>}
      {escalera.length > 1 && (
        <ul className="b2-sellos">
          {escalera.map((f, i) => (
            <li key={i} className={`b2-sello${i === iVig ? ' b2-sello--on' : ''}`}>
              <span className="b2-sello__lb">{nombreFase(t, f, i, escalera.length)}</span>
              <span className="b2-sello__pr">{formatPEN(f.precio)}</span>
              <span className="b2-sello__sub">{i === iVig ? 'Vigente' : (f.sub ?? '—')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------- 1 · CARTEL: chip de comprar ---
// Aparece cuando la lista de entradas sale de la pantalla y lleva de vuelta.
// No reemplaza al botón de pagar: es un atajo de navegación.
export function ChipComprar({ anclaId, activo }: { anclaId: string; activo: boolean }) {
  const [verse, setVerse] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!activo) { setVerse(false); return; }
    const ancla = document.getElementById(anclaId);
    if (!ancla || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([e]) => setVerse(!!e && !e.isIntersecting && e.boundingClientRect.top < 0),
      { rootMargin: '-72px 0px 0px 0px' }
    );
    io.observe(ancla);
    return () => io.disconnect();
  }, [anclaId, activo]);
  return (
    <div ref={ref} className={`b1-chip${verse ? ' b1-chip--on' : ''}`} aria-hidden={!verse}>
      <a href={`#${anclaId}`} className="b1-chip__a" tabIndex={verse ? 0 : -1}>
        <Ticket aria-hidden="true" /> Comprar entradas
      </a>
    </div>
  );
}

// -------------------------------------------- 1 · CARTEL: así de simple ---
export function AsiDeSimple({ conYape }: { conYape: boolean }) {
  const pasos = [
    { Icono: Ticket, t: 'Eliges', d: 'Sumas las entradas que quieres.' },
    { Icono: Smartphone, t: conYape ? 'Yapeas' : 'Pagas', d: conYape ? 'Yapeas el monto exacto y subes la captura.' : 'Pagas con tu tarjeta.' },
    { Icono: Mail, t: 'Tu QR al correo', d: 'Te llega tu entrada. La muestras en la puerta.' },
  ];
  return (
    <section className="b1-simple">
      <h2 className="b1-h2">Así de simple</h2>
      <ol className="b1-pasos">
        {pasos.map(({ Icono, t, d }, i) => (
          <li key={t} className="b1-paso">
            <span className="b1-paso__n" aria-hidden="true"><Icono /></span>
            <h3 className="b1-paso__t">{i + 1}. {t}</h3>
            <p className="b1-paso__d">{d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ------------------------------------------ 2 · ENTRADA: el flyer detrás ---
// En escritorio el boleto se apoya sobre el propio flyer, difuminado y
// oscurecido. Es decorativo: no lleva texto encima y va aria-hidden.
export function FondoFlyer({ url }: { url?: string | null }) {
  if (!url) return null;
  return <div className="b2-bg" aria-hidden="true" style={{ backgroundImage: `url(${JSON.stringify(url)})` }} />;
}
