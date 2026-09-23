'use client';

// =============================================================
// Las piezas de la página de compra
// =============================================================
// Acá viven los tipos compartidos, las funciones de fecha y las piezas que
// CAMBIAN entre conceptos. Todo lo que no está acá (carrito, reservas, promo,
// checkout) es idéntico en los tres: esto es piel y ritmo, no lógica.
//
//   1 CARTEL   el flyer a pantalla completa manda. Las fases son una LÍNEA DE
//              TIEMPO horizontal; hay un chip sticky para volver a comprar y
//              una sección "Así de simple" que explica el trámite en 3 pasos.
//   2 ENTRADA  el bloque de compra ES un boleto: troquel, talón lateral con el
//              total y el botón, tipografía de ticket. Comparte con CARTEL la
//              línea de tiempo de fases y los tres pasos.
//   3 NOCHE    editorial oscuro: tipografía enorme, precios gigantes, el color
//              de la marca solo en el botón y una línea.

import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, Lock, Ticket, Smartphone, Mail } from 'lucide-react';
import { formatPEN } from '@/lib/utils';
import { fmtCuando, fmtHora, distrito } from '@/lib/eventoTexto';
export { fmtCuando, fmtHora, distrito };

export type { Direccion } from '@/lib/concepto';

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
  // Evento GRATIS (0056). Manda en el copy de toda la compra: sin gratis, el
  // mismo tipo a S/0 sería una cortesía y no se ofrece en público.
  is_free?: boolean | null;
  // Tope de entradas por persona (0060). NULL = sin tope propio (queda el de 10).
  max_per_person?: number | null;
};

export type TicketType = {
  id: string; name: string; description: string | null; price_cents: number;
  active_price_cents: number; active_name: string | null; active_ends_at: string | null;
  next_price_cents: number | null; next_starts_at: string | null; next_name: string | null;
  // soldOut viene calculado server-side; NUNCA se mandan capacity/sold al cliente
  // (el comprador no ve cuántas hay ni cuántas quedan — solo el estado "Agotado").
  is_unlimited: boolean; soldOut: boolean; pocas: boolean; sort_order: number; color_hex: string | null;
  // Todas las fases de precio del tipo (públicas). La compra siempre es sobre
  // la fase VIGENTE.
  phases: { name: string | null; price_cents: number; starts_at: string | null; ends_at: string | null; sort_order: number }[];
  bulk_min_qty: number; bulk_discount_pct: number;
};

// ---------------------------------------------------------------- fechas ---
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

/** "27 set" — para el corte de una fase. */
export function fmtDia(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', timeZone: 'America/Lima' })
    .format(new Date(iso)).replace(/[-.]/g, ' ').trim();
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
// ------------------------------------------------ La fila de una entrada ---
// UNA sola para las dos direcciones: el tipo y su precio de hoy arriba,
// grandes, y debajo la escalera de precios como una línea horizontal —dónde
// estamos y hacia dónde va—. Lo que cambia entre canvas y editorial es el
// CSS, no el markup: dos árboles distintos para la misma información serían
// dos cosas que mantener y dos formas de que se desincronicen.
export function FilaEntrada({ t, escalera, cur, incluye, onInc, onDec }: FilaProps) {
  const vigente = escalera.find((f) => f.estado === 'vigente') ?? escalera[0]!;
  const iVig = escalera.indexOf(vigente);
  return (
    <div className={`b-ty b1-ty${t.soldOut ? ' b-ty--out' : ''}`}>
      <div className="b1-ty__head">
        <div className="b1-ty__id">
          <h3 className="b1-ty__nm">{t.name}</h3>
          {incluye && <p className="b1-ty__inc">{incluye}</p>}
        </div>
        {/* Un tipo a 0 que llega al público es de un evento GRATIS (las cortesías
            no se ofrecen): dice "Gratis", nunca "S/ 0". */}
        <span className="b-ph__pr b1-ty__pr">{vigente.precio === 0 ? 'Gratis' : formatPEN(vigente.precio)}</span>
        <span className="b-ph__act b1-ty__act">
          <Accion t={t} cur={cur} estado="vigente" onInc={onInc} onDec={onDec} />
        </span>
      </div>

      {escalera.length > 1 && <Linea t={t} escalera={escalera} iVig={iVig} />}
    </div>
  );
}

/** La línea de tiempo de fases. La comparten CARTEL y ENTRADA: el riel es un
 *  hairline, cada etapa un punto, y la vigente lleva el color de la marca en
 *  el punto y en el tramo —nunca en el texto, que sigue en tinta. */
function Linea({ t, escalera, iVig }: { t: TicketType; escalera: Peldano[]; iVig: number }) {
  return (
        <ol className="b1-line" aria-label={`Precios de ${t.name} por etapa`}>
          {escalera.map((f, i) => (
            <li key={i} className={`b1-line__n${i === iVig ? ' b1-line__n--on' : ''}${i < iVig ? ' b1-line__n--past' : ''}`}>
              <span className="b1-line__dot" aria-hidden="true" />
              <span className="b1-line__lb">{nombreFase(t, f, i, escalera.length)}</span>
              <span className="b1-line__pr">{f.precio === 0 ? 'Gratis' : formatPEN(f.precio)}</span>
              {f.sub && i !== iVig && <span className="b1-line__sub">{f.sub}</span>}
              {i === iVig && f.sub && <span className="b1-line__sub">{f.sub.replace(/^.*·\s*/, '')}</span>}
            </li>
          ))}
        </ol>
  );
}

export function AsiDeSimple({ conYape, gratis = false }: { conYape: boolean; gratis?: boolean }) {
  // En un evento gratis no hay paso de pago: el trámite del medio son TUS
  // DATOS, y el QR sale al instante (no "cuando aprueben el Yape").
  const pasos = gratis
    ? [
        { Icono: Ticket, t: 'Eliges', d: 'Sumas las entradas que quieres.' },
        { Icono: Smartphone, t: 'Dejas tus datos', d: 'Nombre, correo y teléfono. Nada de pagos.' },
        { Icono: Mail, t: 'Tu QR al toque', d: 'Te aparece en pantalla y te llega al correo.' },
      ]
    : [
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

