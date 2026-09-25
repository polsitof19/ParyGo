import { Mail, RotateCcw, Share2, ShieldCheck, Smartphone, UserX } from 'lucide-react';

// Lo que vive el público del organizador. Todo existe hoy: compra sin cuenta
// (principio de producto), QR al correo, imagen para guardar/compartir por
// WhatsApp, reenvío desde la entrada, pasarela externa.
const PASOS = [
  { I: UserX, t: 'Sin crear cuenta', d: 'Nada de registros ni contraseñas: elige sus entradas, pone su nombre y correo, y paga.' },
  { I: ShieldCheck, t: 'Paga en una pasarela segura', d: 'Los datos de su tarjeta los procesa el medio de pago, nunca pasan por ParyGo ni por ti.' },
  { I: Mail, t: 'Su entrada al instante', d: 'Recibe su QR en el correo apenas se confirma el pago, y también lo ve en pantalla.' },
  { I: Share2, t: 'La guarda o la comparte', d: 'La descarga como imagen o la manda por WhatsApp a quien va con él.' },
  { I: RotateCcw, t: '¿Borró el correo? Se la reenvía', d: 'Desde la página de tu evento se reenvía su entrada solo, sin escribirte.' },
  { I: Smartphone, t: 'Desde cualquier celular', d: 'Funciona en el navegador. No hay app que descargar, ni para él ni para tu puerta.' },
];

export function Comprador() {
  return (
    <section className="section comprador" id="publico" aria-labelledby="comp-title">
      <div className="container">
        <div className="section__head reveal">
          <h2 className="h2" id="comp-title">
            Comprar es fácil para <span className="accent">tu público</span>.
          </h2>
          <p className="lede">Menos pasos es más ventas. Así se ve la compra del otro lado.</p>
        </div>
        <ol className="comp__lista reveal-stagger">
          {PASOS.map(({ I, t, d }) => (
            <li key={t} className="comp__item">
              <I className="comp__ico" aria-hidden="true" />
              <h3 className="comp__t">{t}</h3>
              <p className="comp__d">{d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
