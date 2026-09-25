'use client';

import { useFormStatus } from 'react-dom';
import { useFormFeedback } from '@/components/useFormFeedback';
import { useTextos } from '@/components/IdiomaPanel';
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
  const { t } = useTextos();
  if (validators.length === 0) {
    return (
      <p className="s-card__desc">
        {t('Todavía no invitaste validadores. Usa el campo de abajo para invitar al primero por email.', "You haven't invited any door staff yet. Use the field below to invite your first one by email.")}
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
  const [codeState, codeAction] = useFormFeedback(generatePersonalCodeAction, codeInit);
  const [, revokeAction] = useFormFeedback(revokeGateCodeAction, codeInit);
  const [pwdState, pwdAction] = useFormFeedback(setValidatorPasswordAction, pwdInit);
  const { t } = useTextos();

  const shownCode = codeState.ok ? codeState.code : v.code;

  return (
    <li className="s-owner-row">
      <div className="s-owner-row__id" style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <span className="s-owner-row__email" style={{ fontSize: 15 }}>{v.display_name ?? t('Validador', 'Door staff')}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {shownCode ? (
            <span className="a-code">{shownCode}</span>
          ) : (
            <span className="s-muted-3" style={{ fontSize: 12.5 }}>{t('sin código', 'no code')}</span>
          )}
          <form action={codeAction}>
            <input type="hidden" name="user_id" value={v.user_id} />
            <CodeBtn has={Boolean(shownCode)} />
          </form>
          {v.code_id && (
            <form action={revokeAction}>
              <input type="hidden" name="code_id" value={v.code_id} />
              <button type="submit" className="s-btn s-btn--ghost s-btn--sm">{t('Revocar', 'Revoke')}</button>
            </form>
          )}
        </div>
      </div>
      {codeState.message && !codeState.ok && <p className="s-err">{codeState.message}</p>}

      {/* Guardar contraseña */}
      <form action={pwdAction} className="s-form-row">
        <input type="hidden" name="user_id" value={v.user_id} />
        <div className="s-form-row__field">
          <label className="s-label">{t('Contraseña (login por email)', 'Password (email login)')}</label>
          <input name="password" type="password" placeholder={t('mín. 8 caracteres', 'min. 8 characters')} autoComplete="new-password" className="s-input" />
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
  const { t } = useTextos();
  return (
    <button type="submit" className="s-btn s-btn--soft s-btn--sm" disabled={pending}>
      {pending ? '…' : has ? t('Regenerar', 'Regenerate') : t('Generar código', 'Generate code')}
    </button>
  );
}

function PwdBtn() {
  const { pending } = useFormStatus();
  const { t } = useTextos();
  return (
    <button type="submit" className="s-btn s-btn--ghost s-btn--sm" disabled={pending}>
      {pending ? t('Guardando…', 'Saving…') : t('Guardar contraseña', 'Save password')}
    </button>
  );
}
