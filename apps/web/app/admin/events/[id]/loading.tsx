import { Sk, SkCard, SkStats } from '@/components/Skeleton';

// Skeleton del área de contenido de un evento (la cabecera + tabs del layout se
// mantienen; esto es el fallback de la sub-página mientras carga → cambiar de
// pestaña se siente instantáneo).
export default function EventLoading() {
  return (
    <div style={{ animation: 'a-fade .2s both' }}>
      <div style={{ marginBottom: 14 }}>
        <Sk w={120} h={12} />
        <div style={{ height: 8 }} />
        <Sk w={200} h={22} r={8} />
      </div>
      <div style={{ marginBottom: 14 }}><SkStats n={4} /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SkCard lines={3} />
        <SkCard lines={2} />
      </div>
    </div>
  );
}
