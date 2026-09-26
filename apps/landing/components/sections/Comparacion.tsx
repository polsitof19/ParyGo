import { Check, Minus } from 'lucide-react';
import type { Dict } from '@/lib/i18n';
import { Resaltado } from '@/components/Resaltado';

// ParyGo frente al modelo de ticketera con comisión. Sin nombrar a nadie ni
// inventar porcentajes: se compara el MODELO, que es lo que diferencia de
// verdad a ParyGo (PRODUCT.md, Positioning). En el teléfono la tabla se apila
// y cada celda lleva su rótulo (.tabla__mini) porque la cabecera se oculta.
export function Comparacion({ t }: { t: Dict }) {
  const c = t.cmp;
  return (
    <section className="section comp" id="comparacion" aria-labelledby="cmp-title">
      <div className="container">
        <div className="section__head center reveal">
          <h2 className="h2" id="cmp-title"><Resaltado r={c.h2} /></h2>
        </div>
        <div className="tabla reveal" role="table" aria-label={c.aria}>
          <div className="tabla__fila tabla__cab" role="row">
            <span role="columnheader" className="tabla__t" />
            <span role="columnheader" className="tabla__p">{c.p}</span>
            <span role="columnheader" className="tabla__o">{c.o}</span>
          </div>
          {c.filas.map((f) => (
            <div key={f.t} className="tabla__fila" role="row">
              <span role="rowheader" className="tabla__t">{f.t}</span>
              <span role="cell" className="tabla__p"><Check className="tabla__ico" aria-hidden="true" /><span><span className="tabla__mini">{c.p}</span>{f.p}</span></span>
              <span role="cell" className="tabla__o"><Minus className="tabla__ico" aria-hidden="true" /><span><span className="tabla__mini">{c.o}</span>{f.o}</span></span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
