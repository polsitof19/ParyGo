import { Sk, SkCard } from '@/components/Skeleton';

export default function BrandLoading() {
  return (
    <div style={{ animation: 'a-fade .2s both' }}>
      <div style={{ marginBottom: 18 }}>
        <Sk w={120} h={12} />
        <div style={{ height: 8 }} />
        <Sk w={220} h={26} r={8} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SkCard lines={2} />
        <SkCard lines={3} />
        <SkCard lines={2} />
      </div>
    </div>
  );
}
