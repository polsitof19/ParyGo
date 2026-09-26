import Link from 'next/link';
import { optimizedImage } from '@/lib/imageUrl';

// Piezas visuales de la cabina (2026-09-26, Paul: "no me gusta que sea todo
// letras, tiene que ser como el panel del organizador"). Mismo lenguaje que
// /admin: el FLYER como imagen, cifras grandes y tarjetas en rejilla. Sin cajas
// ni sombras: la imagen es la tarjeta.

export const inicial = (s: string) => (s.trim()[0] ?? '?').toUpperCase();

/** Flyer de un evento (4:5) o su inicial si no tiene. */
export function Flyer({ url, nombre, ancho = 480 }: { url: string | null; nombre: string; ancho?: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={optimizedImage(url, { width: ancho, quality: 75 })} alt="" loading="lazy" decoding="async" />
  ) : (
    <span>{inicial(nombre)}</span>
  );
}

/** Tarjeta de evento con su flyer, como en el panel del organizador. */
export function EventoCard({ href, nombre, cover, lineas, cifra }: {
  href: string; nombre: string; cover: string | null; lineas: string[]; cifra?: { n: number | null; label: string };
}) {
  return (
    <li>
      <Link href={href} className="c-evcard">
        <span className="c-evcard__flyer" aria-hidden="true">
          <Flyer url={cover} nombre={nombre} />
          {cifra && cifra.n !== null && (
            <span className="c-evcard__pill">{cifra.n.toLocaleString('es-PE')} {cifra.label}</span>
          )}
        </span>
        <span className="c-evcard__name">{nombre}</span>
        {lineas.map((l) => <span key={l} className="c-evcard__when">{l}</span>)}
      </Link>
    </li>
  );
}

/** Tarjeta de marca: el logo grande sobre su color, el nombre y cómo está. */
export function MarcaCard({ href, nombre, logo, estado, detalle, alerta }: {
  href: string; nombre: string; logo: string | null; color?: string | null; estado: 'vendiendo' | 'quieta'; detalle: string; alerta?: string | null;
}) {
  return (
    <li>
      <Link href={href} className="c-brandcard">
        {/* Sin relleno del color de marca: sobre un color que elige la marca
            no hay contraste garantizado para la inicial (regla de CLAUDE.md). */}
        <span className={`c-brandcard__logo${logo ? '' : ' c-brandcard__logo--ini'}`} aria-hidden="true">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={optimizedImage(logo, { width: 320, quality: 85 })} alt="" loading="lazy" decoding="async" />
          ) : (
            <span>{inicial(nombre)}</span>
          )}
        </span>
        <span className="c-brandcard__name">{nombre}</span>
        <span className={`s-badge ${estado === 'vendiendo' ? 's-badge--ok' : 's-badge--draft'}`}>{estado === 'vendiendo' ? 'Vendiendo' : 'Sin evento a la venta'}</span>
        <span className="c-brandcard__meta">{detalle}</span>
        {alerta && <span className="s-flag">{alerta}</span>}
      </Link>
    </li>
  );
}

/** Barras por día. El de hoy va en el acento (decorativo, sin texto encima);
 *  el número de cada barra va arriba, en tinta, solo si no es cero. */
export function Barras({ dias }: { dias: { etiqueta: string; n: number; hoy: boolean; titulo: string }[] }) {
  const max = Math.max(1, ...dias.map((d) => d.n));
  return (
    <div className="c-barras" role="img" aria-label={dias.map((d) => `${d.titulo}: ${d.n}`).join(', ')}>
      {dias.map((d) => (
        <div key={d.titulo} className={`c-barras__col${d.hoy ? ' is-hoy' : ''}`} title={`${d.titulo}: ${d.n}`}>
          {/* El número solo en hoy y en el día más alto: en el teléfono 14
              números no entran. La barra va en su propia área para que su alto
              sea proporcional al área y no a la columna con los rótulos. */}
          <span className="c-barras__n">{d.n > 0 && (d.hoy || d.n === max) ? d.n.toLocaleString('es-PE') : ''}</span>
          <span className="c-barras__area">
            <span className="c-barras__bar" style={{ height: `${Math.max(d.n > 0 ? 4 : 1, Math.round((d.n / max) * 100))}%` }} />
          </span>
          <span className="c-barras__d">{d.etiqueta}</span>
        </div>
      ))}
    </div>
  );
}

/** Cifras grandes en fila (como las del evento que viene en /admin). */
export function Cifras({ items }: { items: { n: string; label: string; href?: string }[] }) {
  return (
    <div className="c-cifras">
      {items.map((c) => {
        const cuerpo = <><b>{c.n}</b><span>{c.label}</span></>;
        return c.href
          ? <Link key={c.label} href={c.href} className="c-cifras__item">{cuerpo}</Link>
          : <div key={c.label} className="c-cifras__item">{cuerpo}</div>;
      })}
    </div>
  );
}
