import { BadgeCheck, FileLock2, Lock, QrCode, Users, WifiOff } from 'lucide-react';

// Seguridad y confianza. Todo lo que se afirma acá es cómo funciona el sistema
// hoy (CLAUDE.md): la plata no pasa por ParyGo, el monto lo decide el servidor
// y se verifica contra la pasarela, un QR entra una vez, credenciales
// cifradas, escáner sin señal, acceso personal por miembro del equipo.
const PUNTOS = [
  { I: Lock, t: 'Nunca tocamos tu plata', d: 'Tus compradores pagan a TU cuenta de cobro. ParyGo no recibe, no retiene y no liquida el dinero de tus entradas.' },
  { I: BadgeCheck, t: 'Pagos verificados', d: 'Con tarjeta, confirmamos el pago con la pasarela y que el monto sea el correcto antes de emitir la entrada. Con transferencias como Yape, tú apruebas cada comprobante. Nadie puede cambiar el precio desde su celular.' },
  { I: QrCode, t: 'Cada QR entra una sola vez', d: 'Si alguien reenvía o copia una entrada, el segundo escaneo sale "YA USADO". Adiós a las entradas duplicadas.' },
  { I: WifiOff, t: 'Funciona aunque se caiga la señal', d: 'El escáner descarga tus entradas antes de abrir la puerta y sigue validando sin internet.' },
  { I: Users, t: 'Cada persona con su acceso', d: 'Tu equipo entra con su propio usuario: sabes quién escaneó cada entrada y a qué hora.' },
  { I: FileLock2, t: 'Tus claves, cifradas', d: 'Las credenciales de tus medios de cobro se guardan cifradas y nunca se muestran en pantalla.' },
];

export function Seguridad() {
  return (
    <section className="section seg" id="seguridad" aria-labelledby="seg-title">
      <div className="container">
        <div className="seg__grid">
          <div className="reveal">
            <h2 className="h2" id="seg-title">
              Tu plata va <span className="accent">directo a tu cuenta</span>.
            </h2>
            <p className="lede seg__lede">
              ParyGo no es un intermediario. Tu público le paga a tu medio de cobro y el dinero es tuyo desde el primer minuto. A nosotros nos pagas aparte, un precio fijo por evento.
            </p>
          </div>

          {/* Diagrama del recorrido del dinero: geometría simple, no ilustración. */}
          <figure className="flujo reveal" aria-label="Cómo se mueve el dinero">
            <div className="flujo__nodo">
              <span className="flujo__eti">Tu público</span>
              <span className="flujo__txt">compra su entrada</span>
            </div>
            <div className="flujo__linea" aria-hidden="true"><span>paga</span></div>
            <div className="flujo__nodo flujo__nodo--tuyo">
              <span className="flujo__eti">Tu cuenta de cobro</span>
              <span className="flujo__txt">el 100% de cada entrada</span>
            </div>
            <div className="flujo__aparte">
              <span className="flujo__eti">ParyGo</span>
              <span className="flujo__txt">precio fijo por evento, que pagas aparte. Cero comisión por entrada.</span>
            </div>
          </figure>
        </div>

        <ul className="seg__lista reveal-stagger">
          {PUNTOS.map(({ I, t, d }) => (
            <li key={t} className="seg__item">
              <I className="seg__ico" aria-hidden="true" />
              <div>
                <h3 className="seg__t">{t}</h3>
                <p className="seg__d">{d}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
