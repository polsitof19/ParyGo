import { BadgeCheck, FileLock2, Lock, QrCode, Users, WifiOff } from 'lucide-react';
import type { Dict } from '@/lib/i18n';
import { Resaltado } from '@/components/Resaltado';

// Seguridad y confianza. Todo lo que se afirma es cómo funciona el sistema hoy
// (CLAUDE.md): el dinero no pasa por ParyGo, el monto lo decide el servidor y
// se verifica contra la pasarela, un QR entra una vez, credenciales cifradas,
// escáner sin señal, acceso personal por miembro del equipo.
// Íconos en el mismo orden que t.seg.puntos.
const ICONOS = [Lock, BadgeCheck, QrCode, WifiOff, Users, FileLock2];

export function Seguridad({ t }: { t: Dict }) {
  const s = t.seg;
  return (
    <section className="section seg" id="seguridad" aria-labelledby="seg-title">
      <div className="container">
        <div className="seg__grid">
          <div className="reveal">
            <h2 className="h2" id="seg-title"><Resaltado r={s.h2} /></h2>
            <p className="lede seg__lede">{s.lede}</p>
          </div>

          {/* Diagrama del recorrido del dinero: geometría simple, no ilustración. */}
          <figure className="flujo reveal" aria-label={s.flujo.aria}>
            <div className="flujo__nodo">
              <span className="flujo__eti">{s.flujo.publico}</span>
              <span className="flujo__txt">{s.flujo.publicoTxt}</span>
            </div>
            <div className="flujo__linea" aria-hidden="true"><span>{s.flujo.paga}</span></div>
            <div className="flujo__nodo flujo__nodo--tuyo">
              <span className="flujo__eti">{s.flujo.cuenta}</span>
              <span className="flujo__txt">{s.flujo.cuentaTxt}</span>
            </div>
            <div className="flujo__aparte">
              <span className="flujo__eti">{s.flujo.parygo}</span>
              <span className="flujo__txt">{s.flujo.parygoTxt}</span>
            </div>
          </figure>
        </div>

        <ul className="seg__lista reveal-stagger">
          {s.puntos.map((p, i) => {
            const I = ICONOS[i] ?? Lock;
            return (
              <li key={p.t} className="seg__item">
                <I className="seg__ico" aria-hidden="true" />
                <div>
                  <h3 className="seg__t">{p.t}</h3>
                  <p className="seg__d">{p.d}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
