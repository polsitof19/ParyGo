'use client';

import { useTextos } from '@/components/IdiomaPanel';

// Nombres de entrada de un toque: reemplazan al placeholder de ejemplo.
export function NombresEntrada({ onPick }: { onPick: (nombre: string) => void }) {
  const { t } = useTextos();
  const nombres = [t('General', 'General'), 'VIP', t('Preventa', 'Presale'), t('Mesa', 'Table')];
  return (
    <div className="cw-sug">
      {nombres.map((n) => (
        <button key={n} type="button" className="s-btn s-btn--soft s-btn--sm" onClick={() => onPick(n)}>{n}</button>
      ))}
    </div>
  );
}
