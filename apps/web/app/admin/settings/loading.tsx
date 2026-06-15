import { Sk, SkCard } from '@/components/Skeleton';

export default function SettingsLoading() {
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', animation: 'a-fade .2s both' }}>
      <div style={{ marginBottom: 22 }}>
        <Sk w={140} h={12} />
        <div style={{ height: 8 }} />
        <Sk w={180} h={26} r={8} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SkCard lines={3} />
        <SkCard lines={3} />
        <SkCard lines={2} />
      </div>
    </div>
  );
}
