import { Calendar, MapPin } from 'lucide-react';
import { optimizedImage } from '@/lib/imageUrl';
import { formatEventDate, whatsappLink } from '@/lib/utils';
import { SaveTicketImage } from './SaveTicketImage';
import { LineaEntrada } from './Responsable';
import { ReenviarMiEntrada } from './ReenviarMiEntrada';

export type PassState =
  | { kind: 'ok' }
  | { kind: 'used'; at: string }
  | { kind: 'wait' }
  | { kind: 'dead'; reason: string };

// LA ENTRADA. Se usa en /t/[uuid] y como cierre de la confirmación: la misma
// pieza en los dos lados, para que el comprador reconozca lo que ya vio.
// El QR va primero y grande —es lo único que se usa en la puerta—; debajo,
// los datos que el de la puerta mira y UNA instrucción.
export function TicketPass({
  qrSvg,
  qrCode,
  ticketNumber,
  ticketTypeName,
  attendeeName,
  eventName,
  startsAt,
  venueName,
  brandName,
  brandLogoUrl,
  brandWhatsapp,
  brandEmail = null,
  shareUrl,
  state = { kind: 'ok' },
  showFooter = true,
}: {
  qrSvg: string;
  qrCode: string;
  ticketNumber: string;
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
  shareUrl: string;
  state?: PassState;
  showFooter?: boolean;
}) {
  const cuando = startsAt ? formatEventDate(startsAt) : null;

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
            <img src={optimizedImage(brandLogoUrl, { width: 120, quality: 82 })} alt="" decoding="async" />
          ) : null}
          <span className="c-pass__brandname">{brandName}</span>
          <span className="c-pass__type">{ticketTypeName}</span>
        </div>

        <div className="c-pass__qrwrap">
          <div className="c-pass__qr" role="img" aria-label="Código QR de tu entrada" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p className="c-pass__say">Muéstralo en la puerta</p>
        </div>

        <div className="c-pass__perf" />

        <div className="c-pass__data">
          <div>
            <p className="c-pass__who">{attendeeName || eventName}</p>
            {attendeeName ? <p className="c-pass__row" style={{ marginTop: 4 }}><b>{eventName}</b></p> : null}
          </div>
          {cuando && <p className="c-pass__row"><Calendar aria-hidden="true" /> {cuando}</p>}
          {venueName && <p className="c-pass__row"><MapPin aria-hidden="true" /> {venueName}</p>}
          <p className="c-pass__code">{ticketNumber}</p>
        </div>
      </article>

      <div className="c-pass__actions">
        <SaveTicketImage
          qrCode={qrCode}
          fileName={ticketNumber}
          eventName={eventName}
          ticketTypeName={ticketTypeName}
          attendeeName={attendeeName}
          whenText={cuando}
          brandName={brandName}
        />
        {brandWhatsapp && (
          <a
            href={whatsappLink(brandWhatsapp.replace(/[^\d]/g, ''), `Mi entrada para ${eventName}: ${shareUrl}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="c-btn c-btn--soft"
          >
            Compartir por WhatsApp
          </a>
        )}
        {/* El correo puede tardar (sale por la cola) o no llegar nunca: esta es
            la salida sin depender de nadie. Va al email de la orden, no a uno
            que se escriba. Solo con la entrada ya emitida. */}
        {state.kind !== 'wait' && state.kind !== 'dead' && <ReenviarMiEntrada qrCode={qrCode} />}
      </div>

      {showFooter && (
        <>
          {/* Quién organiza va ANTES del "powered by": el evento es de la
              marca, ParyGo solo vendió la entrada. */}
          <LineaEntrada marca={{ name: brandName, whatsapp_e164: brandWhatsapp, contact_email: brandEmail }} />
          <p className="c-pass__foot">
            powered by <b>parygo</b><span className="c-powered__dot" />
          </p>
        </>
      )}
    </div>
  );
}
