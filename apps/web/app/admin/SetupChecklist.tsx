import Link from 'next/link';
import { Check, ArrowRight, Rocket } from 'lucide-react';

// =============================================================
// Setup guiado (TANDA 3, Grupo B) — checklist del primer evento
// =============================================================
// UX pura sobre acciones que YA existen. El progreso se DERIVA de los datos
// (no hay flag de onboarding en BD): cobro configurado, evento creado, entradas
// cargadas, evento publicado. Solo lo ve el dueño de su marca. Cuando los 4
// pasos están listos, no se renderiza (no molesta a marcas establecidas).

export type SetupStep = {
  key: string;
  title: string;
  desc: string;
  done: boolean;
  href: string;
  cta: string;
};

export function SetupChecklist({ steps, brandName }: { steps: SetupStep[]; brandName: string }) {
  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;
  if (doneCount >= total) return null; // todo listo → no estorbar

  // Primer paso pendiente = el "siguiente" sugerido.
  const next = steps.find((s) => !s.done) ?? null;
  const pct = Math.round((doneCount / total) * 100);

  return (
    <div className="s-card" style={{ marginBottom: 22, borderColor: 'var(--brand-ink)', borderWidth: 1.5 }}>
      <div className="s-card__head" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2 className="s-h2" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Rocket className="h-4 w-4" style={{ color: 'var(--brand-ink)' }} /> Primeros pasos
          </h2>
          <p className="s-card__desc">
            Dejá tu primer evento listo para vender. Vas {doneCount} de {total}.
          </p>
        </div>
        <span className="s-badge s-badge--ok" style={{ whiteSpace: 'nowrap' }}>{doneCount}/{total} listo</span>
      </div>

      {/* Barra de progreso */}
      <div style={{ height: 8, borderRadius: 999, background: 'var(--cream-2)', overflow: 'hidden', margin: '4px 0 14px' }} aria-hidden="true">
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand-ink)', transition: 'width .3s' }} />
      </div>

      <ol className="s-stack" style={{ gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
        {steps.map((s) => {
          const isNext = next?.key === s.key;
          return (
            <li
              key={s.key}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                borderRadius: 12, border: '1px solid var(--cream-3)',
                background: s.done ? 'var(--cream)' : isNext ? 'var(--cream-2)' : 'transparent',
                opacity: s.done ? 0.72 : 1,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: s.done ? 'var(--ok, #16a34a)' : 'var(--cream-3)',
                  color: s.done ? '#fff' : 'var(--ink-3)', fontWeight: 700, fontSize: 13,
                }}
              >
                {s.done ? <Check className="h-4 w-4" /> : steps.indexOf(s) + 1}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 14.5, textDecoration: s.done ? 'line-through' : 'none' }}>{s.title}</p>
                <p className="s-muted" style={{ fontSize: 13 }}>{s.desc}</p>
              </div>
              {!s.done && (
                <Link href={s.href} className={`s-btn s-btn--sm ${isNext ? 's-btn--primary' : 's-btn--soft'}`} style={{ flexShrink: 0 }}>
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
