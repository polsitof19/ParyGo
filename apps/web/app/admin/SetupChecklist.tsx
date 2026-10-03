import Link from 'next/link';
import { textosPanel } from '@/lib/idiomaServer';

// =============================================================
// Primeros pasos (rehecho 2026-10-01, maqueta v2 1-eventos)
// =============================================================
// El progreso se DERIVA de los datos (sin flag en la base). Filas con
// hairline: hecho = punto --ok y su dato en la segunda línea (sin tachado ni
// opacity: lo hecho se tiene que poder leer); el SIGUIENTE se abre con su
// explicación y su botón; lo que viene, solo el nombre. Cuando todo está
// hecho la página no lo renderiza (ver page.tsx).

export type SetupStep = {
  key: string;
  title: string;
  desc: string;
  done: boolean;
  href: string;
  cta: string;
  /** Lo que quedó hecho, en una línea ("Yape 987 654 321", el evento…). */
  detail?: string;
  /** La página pública del evento: se abre aparte. */
  external?: boolean;
};

export async function SetupChecklist({ steps, lead, primary }: { steps: SetupStep[]; lead: string | null; primary: boolean }) {
  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;
  if (doneCount >= total) return null;

  const { t } = await textosPanel();
  const next = steps.find((s) => !s.done) ?? null;
  const pct = Math.round((doneCount / total) * 100);

  return (
    <section className="a-setup" aria-labelledby="a-setup-title">
      <div className="a-setup__head">
        <h2 id="a-setup-title" className="s-h1">{t('Primeros pasos', 'First steps')}</h2>
        <span className="a-setup__count">{t(`Vas ${doneCount} de ${total}`, `${doneCount} of ${total} done`)}</span>
      </div>
      <div className="a-setup__meter" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount} aria-label={t('Avance', 'Progress')}>
        <div className="a-setup__meter-fill" style={{ width: `${pct}%` }} />
      </div>
      {lead && <p className="a-setup__lead">{lead}</p>}

      <ol className="a-setup__list">
        {steps.map((s) => {
          const isNext = next?.key === s.key;
          const cls = `a-setup__step${s.done ? ' a-setup__step--done' : ''}${isNext ? ' a-setup__step--next' : ''}`;
          const btnCls = `s-btn ${primary ? 's-btn--primary' : 's-btn--soft'}`;
          return (
            <li key={s.key} className={cls}>
              <span className="a-setup__mark" aria-hidden="true" />
              <p className="a-setup__name">
                {s.title}
                {s.done && <span className="sr-only"> · {t('hecho', 'done')}</span>}
              </p>
              {s.done && s.detail && <p className="a-setup__detail">{s.detail}</p>}
              {isNext && (
                <div className="a-setup__body">
                  <p className="a-setup__desc">{s.desc}</p>
                  {s.external ? (
                    <a href={s.href} target="_blank" rel="noopener noreferrer" className={btnCls}>{s.cta}</a>
                  ) : (
                    <Link href={s.href} className={btnCls}>{s.cta}</Link>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
