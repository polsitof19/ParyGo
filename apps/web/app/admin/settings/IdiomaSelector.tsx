'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cambiarIdiomaAction } from './actions';
import type { Idioma } from '@/lib/idioma';

// Idioma del panel (0073). La etiqueta va en LOS DOS idiomas: quien no entiende
// el actual tiene que poder encontrar el control igual.
export function IdiomaSelector({ idioma, disabled }: { idioma: Idioma; disabled: boolean }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  return (
    <div style={{ marginBottom: 'var(--s-s3)' }}>
      <label htmlFor="idioma" className="s-label">Idioma del panel · Panel language</label>
      <select
        id="idioma"
        className="s-input s-input--sm s-select"
        defaultValue={idioma}
        disabled={disabled || pendiente}
        onChange={(e) => {
          const v = e.target.value;
          start(async () => {
            const r = await cambiarIdiomaAction(v);
            if (r.ok) router.refresh();
          });
        }}
      >
        <option value="es">Español</option>
        <option value="en">English</option>
      </select>
    </div>
  );
}
