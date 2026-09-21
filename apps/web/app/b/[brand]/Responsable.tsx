// Las líneas de "quién responde por este evento", en --ink-3 y en tú.
// El texto vive en lib/organizador.ts (lo comparte el email); acá solo el JSX.
// Server components: no hay estado ni interacción, solo un link de contacto.
import {
  contactoHref, textoLegal, textoPago, textoEntrada, textoPieMarca,
  type MarcaContacto,
} from '@/lib/organizador';

function Contacto({ marca, texto, label = 'Contacto' }: { marca: MarcaContacto; texto?: string; label?: string }) {
  const href = contactoHref(marca, texto);
  if (!href) return null;
  return (
    <>
      {' · '}
      <a href={href} target="_blank" rel="noopener noreferrer">{label} →</a>
    </>
  );
}

/** Página de compra, al final de "Más información". */
export function LineaLegal({ marca, minAge, refundPolicy }: { marca: MarcaContacto; minAge: number; refundPolicy?: string | null }) {
  const propia = refundPolicy?.trim();
  return (
    <>
      <p className="b-legal">
        {textoLegal(marca, minAge)}
        <Contacto marca={marca} texto={`Hola ${marca.name}, tengo una consulta sobre el evento.`} />
      </p>
      {propia && <p className="b-legal">{propia}</p>}
    </>
  );
}

/** Pantalla de Yape y confirmación: a dónde va la plata. */
export function LineaPago({ marca, evento, className = 'c-foot' }: { marca: MarcaContacto; evento?: string; className?: string }) {
  const href = contactoHref(marca, evento ? `Hola ${marca.name}, te escribo por ${evento}.` : undefined);
  return (
    <p className={className}>
      {textoPago(marca)}
      {href ? <> <a href={href} target="_blank" rel="noopener noreferrer">→</a></> : '.'}
    </p>
  );
}

/** Pie de la entrada con QR, encima del "powered by parygo". */
export function LineaEntrada({ marca }: { marca: MarcaContacto }) {
  return (
    <p className="c-pass__foot c-pass__foot--org">
      {textoEntrada(marca)}
      <Contacto marca={marca} />
    </p>
  );
}

/** Pie de la página pública de la marca. */
export function PieMarca({ marca }: { marca: MarcaContacto }) {
  return <p className="c-foot c-foot--resp">{textoPieMarca(marca)}</p>;
}
