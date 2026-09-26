import { Calendar, MapPin } from 'lucide-react';
import { optimizedImage } from '@/lib/imageUrl';
import { formatEventDate } from '@/lib/utils';
import { SaveTicketImage, CompartirEntrada, type DatosEntrada } from './SaveTicketImage';
import { LineaEntrada } from './Responsable';
import { ReenviarMiEntrada } from './ReenviarMiEntrada';

export type PassState =
  | { kind: 'ok' }
  | { kind: 'used'; at: string }
  | { kind: 'wait' }
  | { kind: 'dead'; reason: string };

// LA ENTRADA. Se usa en /t/[uuid], en /pedido (una por entrada) y como cierre
// de la confirmación: la misma pieza en los tres lados.
//
// Tarjeta BLANCA sobre la página negra, franja de 8px del color de la marca,
// QR de 216 primero —es lo único que se usa en la puerta—, y debajo lo que
// mira el de la puerta: evento, cuándo, dónde, a nombre de quién y qué tipo.
//
// NO muestra el código de la entrada (TKT-…/ticket_number) ni ninguna URL: el
// QR es la entrada. El código sigue en la base y en el panel del organizador,
// para soporte y escaneo manual.
export function TicketPass({
  qrSvg,
  qrCode,
  ticketTypeName,
  attendeeName,
  eventName,
  startsAt,
  venueName,
  brandName,
  brandLogoUrl,
  brandWhatsapp,
  brandEmail = null,
  state = { kind: 'ok' },
  showFooter = true,
  reenviar = true,
  n,
}: {
  qrSvg: string;
  /** Payload del QR: viaja al componer la imagen y al reenvío, nunca se pinta. */
  qrCode: string;
  ticketTypeName: string;
  attendeeName: string | null;
  eventName: string;
  startsAt: string | null;
  venueName: string | null;
  brandName: string;
  brandLogoUrl: string | null;
  brandWhatsapp: string | null;
  /** Fallback de contacto del organizador cuando no cargó WhatsApp. */
  brandEmail?: string | null;
  state?: PassState;
  showFooter?: boolean;
  /** "Reenviar a mi email" (una vez por pantalla, no por entrada). */
  reenviar?: boolean;
  /** Número de la entrada dentro del pedido, para el nombre del archivo. */
  n?: number;
}) {
  const cuando = startsAt ? formatEventDate(startsAt) : null;
  const datos: DatosEntrada = {
    qrCode, eventName, ticketTypeName, attendeeName, whenText: cuando, venueName, brandName,
  };
  const usable = state.kind !== 'wait' && state.kind !== 'dead';

  return (
    <div className="c-pass">
      {state.kind !== 'ok' && (
        <p className={`c-pass__state c-pass__state--${state.kind}`} role="status">
          {state.kind === 'used' && (
            <span><b>Entrada usada.</b> Se escaneó el {state.at}. Un QR entra una sola vez.</span>
          )}
          {state.kind === 'wait' && (
            <span><b>Tu Yape está en revisión.</b> Te avisamos por email apenas {brandName} lo apruebe.</span>
          )}
          {state.kind === 'dead' && <span><b>{state.reason}</b></span>}
        </p>
      )}

      <article className="c-pass__card">
        <div className="c-pass__brand">
          {brandLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={optimizedImage(brandLogoUrl, { width: 240, quality: 85 })} alt={brandName} decoding="async" />
          ) : (
            <span className="c-pass__brandname">{brandName}</span>
          )}
          <span className="c-pass__type">{ticketTypeName}</span>
        </div>

        <div className="c-pass__qrwrap">
          <div className="c-pass__qr" role="img" aria-label="Código QR de tu entrada" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p className="c-pass__say">Muéstralo en la puerta</p>
        </div>

        <div className="c-pass__perf" />

        <div className="c-pass__data">
          <p className="c-pass__ev">{eventName}</p>
          {cuando && <p className="c-pass__row"><Calendar aria-hidden="true" /> {cuando}</p>}
          {venueName && <p className="c-pass__row"><MapPin aria-hidden="true" /> {venueName}</p>}
          <p className={`c-pass__who${attendeeName ? '' : ' c-pass__who--solo'}`}>
            {attendeeName && <b>{attendeeName}</b>}
            <span>{ticketTypeName}</span>
          </p>
        </div>
      </article>

      {usable && (
        <div className="c-pass__actions">
          <SaveTicketImage datos={datos} n={n} />
          <CompartirEntrada datos={datos} n={n} />
          {/* El correo puede tardar (sale por la cola) o no llegar nunca: esta
              es la salida sin depender de nadie. Va al email de la orden, no a
              uno que se escriba. */}
          {reenviar && <ReenviarMiEntrada qrCode={qrCode} />}
        </div>
      )}

      {showFooter && (
        <>
          {/* Quién organiza va ANTES del "powered by": el evento es de la
              marca, ParyGo solo vendió la entrada. El contacto va ahí. */}
          <LineaEntrada marca={{ name: brandName, whatsapp_e164: brandWhatsapp, contact_email: brandEmail }} />
          <p className="c-pass__foot">
            powered by <b>parygo</b><span className="c-powered__dot" />
          </p>
        </>
      )}
    </div>
  );
}
