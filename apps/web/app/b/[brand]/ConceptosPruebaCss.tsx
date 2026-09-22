'use client';

// El CSS de CARTEL (1) y NOCHE (3). Vive en un componente propio para que el
// bundler lo ponga en SU chunk y no en el de la página: así el comprador de
// una marca real no se lo baja. No pinta nada; solo existe para arrastrar el
// import del CSS.
import './conceptos-prueba.css';

export default function ConceptosPruebaCss() {
  return null;
}
