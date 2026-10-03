import { Sk, SkStats } from '@/components/Skeleton';

// Skeleton del panel del organizador (se ve al instante mientras el server
// resuelve sus queries → la navegación deja de sentirse congelada).
export default function AdminLoading() {
  return (
    <div style={{ animation: 'a-fade .2s both' }}>
      <div className="s-pagehead">
        <div>
          <Sk w={160} h={12} />
          <div style={{ height: 10 }} />
          <Sk w={220} h={26} r={8} />
        </div>
      </div>
      <div style={{ marginBottom: 22 }}><SkStats n={3} /></div>
      {/* Mismas filas que la lista real (.a-evrow): miniatura 56 + dos renglones. */}
      <ul className="a-evlist">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="a-evrow" style={{ pointerEvents: 'none' }}>
            <Sk w={56} h={56} r={9} />
            <span className="a-evrow__main">
              <Sk w="60%" h={16} />
              <div style={{ height: 8 }} />
              <Sk w="40%" h={12} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
