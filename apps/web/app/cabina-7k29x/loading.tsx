import { Sk, SkCard } from '@/components/Skeleton';

// Skeleton del panel super admin (marcas).
export default function CabinaLoading() {
  return (
    <div style={{ animation: 'a-fade .2s both' }}>
      <div style={{ marginBottom: 18 }}>
        <Sk w={120} h={12} />
        <div style={{ height: 8 }} />
        <Sk w={240} h={26} r={8} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkCard key={i} lines={1} />
        ))}
      </div>
    </div>
  );
}
