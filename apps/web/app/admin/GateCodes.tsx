'use client';

import { useFormStatus } from 'react-dom';
import { useFormFeedback } from '@/components/useFormFeedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTextos } from '@/components/IdiomaPanel';
import { generateGateCodeAction, revokeGateCodeAction, type GateCodeState } from './actions';

const initial: GateCodeState = { ok: false, message: null };

type ActiveCode = {
  id: string;
  code: string;
  device_label: string | null;
  expires_at: string;
  use_count: number;
  max_uses: number;
};

export function GateCodes({ codes }: { codes: ActiveCode[] }) {
  const [state, action] = useFormFeedback(generateGateCodeAction, initial);
  const { t, loc } = useTextos();

  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <label className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {t('Nombre del puesto (ej. Puerta 1)', 'Station name (e.g. Door 1)')}
          </label>
          <Input name="device_label" placeholder={t('Puerta 1', 'Door 1')} maxLength={40} />
        </div>
        <GenButton />
      </form>

      {state.ok && state.code && (
        <div className="rounded-lg border border-green/40 bg-green/10 p-4 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {t(`Código para “${state.label}” · válido 12h`, `Code for “${state.label}” · valid 12h`)}
          </p>
          <p className="font-display text-5xl tracking-[0.3em] text-green">{state.code}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('El staff entra en', 'Staff sign in at')} <span className="font-mono">app.parygo.com/puerta</span> {t('con este código.', 'with this code.')}
          </p>
        </div>
      )}
      {state.message && !state.ok && <p className="text-xs text-destructive">{state.message}</p>}

      {codes.length > 0 && (
        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{t('Códigos activos', 'Active codes')}</p>
          <ul className="space-y-2">
            {codes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
                <div>
                  <span className="font-mono text-lg tracking-[0.2em]">{c.code}</span>
                  <span className="ml-3 text-muted-foreground">{c.device_label ?? t('Puesto', 'Station')}</span>
                  <span className="ml-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    {t('expira', 'expires')} {new Date(c.expires_at).toLocaleString(loc, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })} · {t(`${c.use_count} usos`, `${c.use_count} uses`)}
                  </span>
                </div>
                <RevokeButton id={c.id} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function GenButton() {
  const { pending } = useFormStatus();
  const { t } = useTextos();
  return (
    <Button type="submit" variant="default" disabled={pending}>
      {pending ? t('Generando…', 'Generating…') : t('Generar código', 'Generate code')}
    </Button>
  );
}

function RevokeButton({ id }: { id: string }) {
  const [, action] = useFormFeedback(revokeGateCodeAction, initial);
  const { t } = useTextos();
  return (
    <form action={action}>
      <input type="hidden" name="code_id" value={id} />
      <Button type="submit" variant="ghost" size="sm">{t('Revocar', 'Revoke')}</Button>
    </form>
  );
}
