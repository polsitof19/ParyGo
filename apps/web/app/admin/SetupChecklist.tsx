import Link from 'next/link';
import { ArrowRight, Rocket } from 'lucide-react';
import { textosPanel } from '@/lib/idiomaServer';

// =============================================================
// Setup guiado (TANDA 3, Grupo B) — checklist del primer evento
// =============================================================
// UX pura sobre acciones que YA existen. El progreso se DERIVA de los datos
// (no hay flag de onboarding en BD): cobro configurado, evento creado, entradas
// cargadas, evento publicado. Solo lo ve el dueño de su marca. Cuando los 4
// pasos están listos, no se renderiza (no molesta a marcas establecidas).
//
// Piel (2026-09-20): sin cajas. Los pasos son filas separadas por hairlines;
// el estado es un punto (--ok listo / acento el siguiente / hueco pendiente) y
// el único botón con relleno es el del paso siguiente.

export type SetupStep = {
  key: string;
  title: string;
  desc: string;
  done: boolean;
  href: string;
  cta: string;
};

export async function SetupChecklist({ steps, brandName }: { steps: SetupStep[]; brandName: string }) {
  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;
  if (doneCount >= total) return null; // todo listo → no estorbar

  const { t } = await textosPanel();
  // Primer paso pendiente = el "siguiente" sugerido.
  const next = steps.find((s) => !s.done) ?? null;
  const pct = Math.round((doneCount / total) * 100);

  return (
    <div className="s-card a-setup">
      <div className="s-card__head">
        <div>
          <h2 className="s-card__title" style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
            <Rocket className="h-4 w-4" style={{ color: 'var(--ink-3)' }} /> {t('Primeros pasos', 'First steps')}
          </h2>
          <p className="s-card__desc">
            {t(`Deja tu primer evento listo para vender. Vas ${doneCount} de ${total}.`, `Get your first event ready to sell. You're at ${doneCount} of ${total}.`)}
          </p>
        </div>
        <span className="s-badge s-badge--ok" style={{ whiteSpace: 'nowrap' }}>{t(`${doneCount}/${total} listo`, `${doneCount}/${total} done`)}</span>
      </div>

      {/* Barra de avance: hairline de acento sobre la línea de papel. */}
      <div className="a-setup__meter" aria-hidden="true">
        <div className="a-setup__meter-fill" style={{ width: `${pct}%` }} />
      </div>

      <ol className="a-setup__list">
        {steps.map((s, i) => {
          const isNext = next?.key === s.key;
          return (
            <li
              key={s.key}
              className={`a-setup__step${s.done ? ' a-setup__step--done' : ''}${isNext ? ' a-setup__step--next' : ''}`}
            >
              <span className="a-setup__mark" aria-hidden="true">{s.done ? '' : i + 1}</span>
              <div className="a-setup__txt">
                <p className="a-setup__name">{s.title}</p>
                <p className="s-muted" style={{ fontSize: 13 }}>{s.desc}</p>
              </div>
              {/* Botón de TEXTO, también el del paso siguiente: el único
                  primario de la home es "Crear evento". Que este paso es el
                  que toca ya lo dice la fila (tinta + punto de acento). */}
              {!s.done && (
                <Link href={s.href} className="s-btn s-btn--soft s-btn--sm" style={{ flexShrink: 0 }}>
                  {s.cta} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
