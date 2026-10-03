'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { completarAlta, type CompletarState } from './actions';
import { passwordOk } from '@/lib/password';
import { TEXTOS, type Lang } from '../textos';

function Boton({ children, espera, disabled }: { children: React.ReactNode; espera: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="ez-btn ez-btn--primary" disabled={disabled || pending} aria-busy={pending}>
      {pending ? espera : <>{children} <ArrowRight aria-hidden="true" className="ez-btn__arrow" /></>}
    </button>
  );
}

// nueva = alta con código (brands.alta_usuario): la cuenta ya existe con su
// contraseña, así que solo se entra al panel. Alta vieja: elige contraseña acá.
export function Completar({ compraId, lang, emailVisible, nueva }: { compraId: string; lang: Lang; emailVisible: string; nueva: boolean }) {
  const t = TEXTOS[lang];
  const [estado, enviar] = useFormState(completarAlta, { ok: false, message: null } as CompletarState);
  const [password, setPassword] = useState('');
  const [ver, setVer] = useState(false);

  return (
    <form action={enviar} className="ez-form ez-form--codigo">
      <input type="hidden" name="compra" value={compraId} />
      <input type="hidden" name="lang" value={lang} />
      {!nueva && (
        <>
          <h2 className="ez-h2">{t.l.elige}</h2>
          <p className="ez-body">{t.l.eligeTxt} <strong>{emailVisible}</strong> {t.l.eligeTxt2}</p>
          <div className="ez-field">
            <label htmlFor="ez-pass2" className="ez-label">{t.pass}</label>
            <div className="ez-affix">
              <input id="ez-pass2" type={ver ? 'text' : 'password'} className="ez-input ez-input--affix" value={password}
                onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} maxLength={72} required />
              <button type="button" className="ez-eye" onClick={() => setVer((v) => !v)} aria-label={ver ? t.passOcultar : t.passVer}>
                {ver ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </button>
            </div>
            <p className={password && !passwordOk(password) ? 'ez-err' : 'ez-hint'}>{t.l.passRango}</p>
          </div>
          <input type="hidden" name="password" value={password} />
        </>
      )}
      {estado.message && <p className="ez-banner" role="alert">{estado.message}</p>}
      <div className="ez-actions"><Boton espera={t.momento} disabled={!nueva && !passwordOk(password)}>{t.l.entrar}</Boton></div>
    </form>
  );
}

// Pago todavía en revisión: recarga sola cada 4 s durante un minuto. Recarga
// COMPLETA: con router.refresh() la página seguía diciendo "confirmando"
// después de aprobado (medido en el E2E). El contador va en la URL para que
// no recargue para siempre.
export function Refrescar() {
  useEffect(() => {
    const u = new URL(window.location.href);
    const n = Number(u.searchParams.get('r') ?? '0');
    if (n >= 15) return;
    const id = setTimeout(() => {
      u.searchParams.set('r', String(n + 1));
      window.location.replace(u.toString());
    }, 4000);
    return () => clearTimeout(id);
  }, []);
  return null;
}
