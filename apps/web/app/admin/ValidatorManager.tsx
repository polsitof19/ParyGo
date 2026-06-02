'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  generatePersonalCodeAction,
  revokeGateCodeAction,
  setValidatorPasswordAction,
  type GateCodeState,
  type SetPwdState,
} from './actions';

type Validator = {
  user_id: string;
  display_name: string | null;
  code: string | null;
  code_id: string | null;
  expires_at: string | null;
};

const codeInit: GateCodeState = { ok: false, message: null };
const pwdInit: SetPwdState = { ok: false, message: null };

export function ValidatorManager({ validators }: { validators: Validator[] }) {
  if (validators.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no invitaste validadores. Usá el campo de abajo para invitar al primero por email.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {validators.map((v) => (
        <ValidatorRow key={v.user_id} v={v} />
      ))}
    </ul>
  );
}

function ValidatorRow({ v }: { v: Validator }) {
  const [codeState, codeAction] = useFormState(generatePersonalCodeAction, codeInit);
  const [, revokeAction] = useFormState(revokeGateCodeAction, codeInit);
  const [pwdState, pwdAction] = useFormState(setValidatorPasswordAction, pwdInit);

  // After generating, show the fresh code; else the existing active one.
  const shownCode = codeState.ok ? codeState.code : v.code;

  return (
    <li className="space-y-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium">{v.display_name ?? 'Validador'}</span>
        <div className="flex items-center gap-2">
          {shownCode ? (
            <span className="font-mono text-lg tracking-[0.25em] text-green">{shownCode}</span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">sin código</span>
          )}
          <form action={codeAction}>
            <input type="hidden" name="user_id" value={v.user_id} />
            <CodeBtn has={Boolean(shownCode)} />
          </form>
          {v.code_id && (
            <form action={revokeAction}>
              <input type="hidden" name="code_id" value={v.code_id} />
              <Button type="submit" variant="ghost" size="sm">Revocar</Button>
            </form>
          )}
        </div>
      </div>
      {codeState.message && !codeState.ok && <p className="text-xs text-destructive">{codeState.message}</p>}

      {/* Set password */}
      <form action={pwdAction} className="flex items-end gap-2">
        <input type="hidden" name="user_id" value={v.user_id} />
        <div className="flex-1 space-y-1">
          <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Contraseña (login por email)</label>
          <Input name="password" type="password" placeholder="mín. 8 caracteres" autoComplete="new-password" />
        </div>
        <PwdBtn />
      </form>
      {pwdState.message && (
        <p className={`text-xs ${pwdState.ok ? 'text-green' : 'text-destructive'}`}>{pwdState.message}</p>
      )}
    </li>
  );
}

function CodeBtn({ has }: { has: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="default" size="sm" disabled={pending}>
      {pending ? '…' : has ? 'Regenerar' : 'Generar código'}
    </Button>
  );
}

function PwdBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? 'Guardando…' : 'Setear contraseña'}
    </Button>
  );
}
