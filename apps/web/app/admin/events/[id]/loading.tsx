import { Sk } from '@/components/Skeleton';

// Esqueleto mientras carga el evento o una de sus secciones: el mismo dibujo
// que la página (flyer + nombre, y filas de menú), no las cajas de cifras de
// antes. Así la carga no "salta" a otra forma.
export default function EventLoading() {
  return (
    <div style={{ animation: 'a-fade .2s both' }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <Sk w={104} h={130} r={10} />
        <div style={{ flex: 1 }}>
          <Sk w="70%" h={24} r={8} />
          <div style={{ height: 10 }} />
          <Sk w="50%" h={14} />
        </div>
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 0', borderBottom: '1px solid var(--line)' }}>
          <Sk w={20} h={20} r={6} />
          <div style={{ flex: 1 }}>
            <Sk w="35%" h={14} />
            <div style={{ height: 8 }} />
            <Sk w="60%" h={12} />
          </div>
        </div>
      ))}
    </div>
  );
}
