'use client';

import { useFormState, useFormStatus } from 'react-dom';
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
      <p className="s-card__desc">
        Todavía no invitaste validadores. Usá el campo de abajo para invitar al primero por email.
      </p>
    );
  }
  return (
    <ul className="s-owner-list">
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

  const shownCode = codeState.ok ? codeState.code : v.code;

  return (
    <li className="s-owner-row">
      <div className="s-owner-row__id" style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <span className="s-owner-row__email" style={{ fontSize: 15 }}>{v.display_name ?? 'Validador'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {shownCode ? (
            <span className="a-code">{shownCode}</span>
          ) : (
            <span className="s-muted-3" style={{ fontSize: 12.5 }}>sin código</span>
          )}
          <form action={codeAction}>
            <input type="hidden" name="user_id" value={v.user_id} />
            <CodeBtn has={Boolean(shownCode)} />
          </form>
          {v.code_id && (
            <form action={revokeAction}>
              <input type="hidden" name="code_id" value={v.code_id} />
              <button type="submit" className="s-btn s-btn--ghost s-btn--sm">Revocar</button>
            </form>
          )}
        </div>
      </div>
      {codeState.message && !codeState.ok && <p className="s-err">{codeState.message}</p>}

      {/* Setear contraseña */}
      <form action={pwdAction} className="s-form-row">
        <input type="hidden" name="user_id" value={v.user_id} />
        <div className="s-form-row__field">
          <label className="s-label">Contraseña (login por email)</label>
          <input name="password" type="password" placeholder="mín. 8 caracteres" autoComplete="new-password" className="s-input" />
        </div>
        <PwdBtn />
      </form>
      {pwdState.message && (
        <p className={pwdState.ok ? 's-hint s-hint--ok' : 's-err'}>{pwdState.message}</p>
      )}
    </li>
  );
}

function CodeBtn({ has }: { has: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="s-btn s-btn--soft s-btn--sm" disabled={pending}>
      {pending ? '…' : has ? 'Regenerar' : 'Generar código'}
    </button>
  );
}

function PwdBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="s-btn s-btn--ghost s-btn--sm" disabled={pending}>
      {pending ? 'Guardando…' : 'Setear contraseña'}
    </button>
  );
}
