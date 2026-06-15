import s from './Skeleton.module.css';

// Bloque de carga (shimmer). Server-component friendly: puro CSS, sin JS.
// Respeta prefers-reduced-motion (sin animación). Usado en los loading.tsx de los
// paneles para que la navegación se sienta INSTANTÁNEA (Suspense streaming) en vez
// de una pantalla congelada mientras resuelven las queries server-side.
export function Sk({ w = '100%', h = 14, r, style }: { w?: number | string; h?: number | string; r?: number; style?: React.CSSProperties }) {
  return <span className={s.sk} style={{ width: w, height: h, ...(r != null ? { borderRadius: r } : {}), ...style }} aria-hidden="true" />;
}

// Tarjeta de carga genérica (título + 2 líneas).
export function SkCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className={s.card}>
      <Sk w="40%" h={16} />
      <div style={{ height: 12 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ marginTop: 8 }}><Sk w={i % 2 ? '70%' : '90%'} h={12} /></div>
      ))}
    </div>
  );
}

// Grilla de KPIs (4 stats).
export function SkStats({ n = 4 }: { n?: number }) {
  return (
    <div className={s.grid4}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className={s.card}>
          <Sk w="60%" h={11} />
          <div style={{ height: 10 }} />
          <Sk w="45%" h={26} r={8} />
        </div>
      ))}
    </div>
  );
}

export { s as skStyles };
