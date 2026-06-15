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
      <div style={{ marginBottom: 22 }}><SkStats n={4} /></div>
      <div className="a-evgrid">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="a-evcard" style={{ pointerEvents: 'none' }}>
            <Sk w="100%" h={150} r={0} />
            <div style={{ padding: 14 }}>
              <Sk w="70%" h={16} />
              <div style={{ height: 10 }} />
              <Sk w="50%" h={12} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
