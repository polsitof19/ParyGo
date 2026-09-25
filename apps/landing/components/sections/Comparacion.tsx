import { Check, Minus } from 'lucide-react';

// ParyGo vs. el modelo de ticketera con comisión. Sin nombrar a nadie ni
// inventar porcentajes: se compara el MODELO, que es lo que diferencia de
// verdad a ParyGo (PRODUCT.md, Positioning).
const FILAS = [
  { t: 'Cuánto te cobran', p: 'Precio fijo por evento, vendas lo que vendas', o: 'Un porcentaje de cada entrada: más vendes, más pagas' },
  { t: 'Cuándo tienes tu plata', p: 'Directo en tu propia cuenta de cobro, sin esperar a que nadie te liquide', o: 'Cuando la ticketera te liquida, muchas veces después del evento' },
  { t: 'Tu página', p: 'Con tu marca, tu logo y tus colores: tumarca.parygo.com', o: 'Dentro de su marca, junto a los eventos de otros' },
  { t: 'Los datos de tus compradores', p: 'Son tuyos: los ves y los descargas cuando quieras', o: 'Suelen quedarse en la plataforma' },
  { t: 'Compromiso', p: 'Sin suscripción ni exclusividad: compras eventos cuando los necesitas', o: 'Contratos y, a veces, exclusividad' },
];

export function Comparacion() {
  return (
    <section className="section comp" id="comparacion" aria-labelledby="cmp-title">
      <div className="container">
        <div className="section__head center reveal">
          <h2 className="h2" id="cmp-title">
            Por qué ParyGo y no <span className="accent">una ticketera</span>.
          </h2>
        </div>
        <div className="tabla reveal" role="table" aria-label="ParyGo frente a una ticketera con comisión">
          <div className="tabla__fila tabla__cab" role="row">
            <span role="columnheader" className="tabla__t" />
            <span role="columnheader" className="tabla__p">ParyGo</span>
            <span role="columnheader" className="tabla__o">Ticketera con comisión</span>
          </div>
          {FILAS.map((f) => (
            <div key={f.t} className="tabla__fila" role="row">
              <span role="rowheader" className="tabla__t">{f.t}</span>
              <span role="cell" className="tabla__p"><Check className="tabla__ico" aria-hidden="true" /><span><span className="tabla__mini">ParyGo</span>{f.p}</span></span>
              <span role="cell" className="tabla__o"><Minus className="tabla__ico" aria-hidden="true" /><span><span className="tabla__mini">Ticketera con comisión</span>{f.o}</span></span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
