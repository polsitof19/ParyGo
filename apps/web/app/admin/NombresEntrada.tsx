'use client';

import { useTextos } from '@/components/IdiomaPanel';

// Atajos de un toque para el nombre (que sigue siendo texto libre): escriben el
// texto, reemplazando lo que hubiera, y devuelven el foco al campo para seguir editando.
export function NombresEntrada({ inputId, onPick }: { inputId: string; onPick: (nombre: string) => void }) {
  const { t } = useTextos();
  const nombres = [t('General', 'General'), 'VIP', t('Preventa', 'Presale'), t('Mesa', 'Table')];
  return (
    <div className="cw-sug">
      {nombres.map((n) => (
        <button key={n} type="button" className="s-btn s-btn--soft s-btn--sm" onClick={() => {
          onPick(n);
          setTimeout(() => {
            const el = document.getElementById(inputId) as HTMLInputElement | null;
            if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
          }, 0);
        }}>{n}</button>
      ))}
    </div>
  );
}
