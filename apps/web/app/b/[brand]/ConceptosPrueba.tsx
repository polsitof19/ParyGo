'use client';

import dynamic from 'next/dynamic';

// La frontera perezosa. Tiene que ser un componente de CLIENTE porque
// `ssr: false` no está permitido con next/dynamic dentro de un Server
// Component, y sin `ssr: false` el CSS volvería al bundle de la página.
//
// Consecuencia aceptada: en una marca de prueba el tema del concepto entra un
// frame después del primer pintado. Solo pasa en koko/demotest/ensayo-paul y
// solo con ?c=1 o ?c=3, que son la herramienta de comparación, no el producto.
const Css = dynamic(() => import('./ConceptosPruebaCss'), { ssr: false });

export default function ConceptosPrueba() {
  return <Css />;
}
