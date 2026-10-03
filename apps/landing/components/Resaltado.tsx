import type { Resaltado as R } from '@/lib/i18n';

// [antes, resaltado, después] → la palabra del medio con el subrayado de acento.
export function Resaltado({ r }: { r: R }) {
  return <>{r[0]}<span className="accent">{r[1]}</span>{r[2]}</>;
}
