import { Sk, SkCard, SkStats } from '@/components/Skeleton';

export default function SuperEventLoading() {
  return (
    <div style={{ animation: 'a-fade .2s both' }}>
      <div style={{ marginBottom: 14 }}>
        <Sk w={120} h={12} />
        <div style={{ height: 8 }} />
        <Sk w={220} h={24} r={8} />
      </div>
      <div style={{ marginBottom: 14 }}><SkStats n={3} /></div>
      <SkCard lines={3} />
    </div>
  );
}
