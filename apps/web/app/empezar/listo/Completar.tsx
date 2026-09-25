'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { completarAlta, type CompletarState } from './actions';

// La contraseña que eligió en /empezar quedó SOLO en este navegador
// (sessionStorage), nunca en el servidor antes del pago. Si vuelve en el mismo
// navegador, el alta se cierra sola; si no (otro dispositivo, el link del
// correo), la elige acá.
export const CLAVE_ALTA = 'parygo-alta';

function Boton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="ez-btn ez-btn--primary" disabled={pending} aria-busy={pending}>
      {pending ? 'Creando tu cuenta…' : <>{children} <ArrowRight aria-hidden="true" className="ez-btn__arrow" /></>}
    </button>
  );
}

export function Completar({ compraId, email, emailVisible }: { compraId: string; email: string; emailVisible: string }) {
  const [estado, enviar] = useFormState(completarAlta, { ok: false, message: null } as CompletarState);
  const [password, setPassword] = useState('');
  const [ver, setVer] = useState(false);
  const [auto, setAuto] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    try {
      const g = JSON.parse(sessionStorage.getItem(CLAVE_ALTA) ?? 'null') as { email?: string; password?: string } | null;
      if (g?.email?.toLowerCase() === email && g.password && g.password.length >= 8) {
        setPassword(g.password);
        setAuto(true);
      }
    } catch { /* sin sessionStorage: la elige a mano */ }
  }, [email]);
  // Un solo intento automático; si falla, queda el formulario con el aviso.
  useEffect(() => {
    if (auto && password) {
      try { sessionStorage.removeItem(CLAVE_ALTA); } catch {}
      form.current?.requestSubmit();
    }
  }, [auto, password]);

  return (
    <form ref={form} action={enviar} className="ez-form ez-form--codigo">
      <input type="hidden" name="compra" value={compraId} />
      {auto && !estado.message ? (
        <p className="ez-body">Creando tu cuenta y entrando a tu panel…</p>
      ) : (
        <>
          <h2 className="ez-h2">Elige tu contraseña</h2>
          <p className="ez-body">Con <strong>{emailVisible}</strong> y esta contraseña entras a tu panel.</p>
          <div className="ez-field">
            <label htmlFor="ez-pass2" className="ez-label">Contraseña</label>
            <div className="ez-affix">
              <input id="ez-pass2" type={ver ? 'text' : 'password'} className="ez-input ez-input--affix" value={password}
                onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} maxLength={72} required />
              <button type="button" className="ez-eye" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar contraseña' : 'Ver contraseña'}>
                {ver ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </button>
            </div>
            <p className="ez-hint">Mínimo 8 caracteres.</p>
          </div>
          {estado.message && <p className="ez-banner" role="alert">{estado.message}</p>}
          <div className="ez-actions"><Boton>Entrar a mi panel</Boton></div>
        </>
      )}
      <input type="hidden" name="password" value={password} />
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
    const t = setTimeout(() => {
      u.searchParams.set('r', String(n + 1));
      window.location.replace(u.toString());
    }, 4000);
    return () => clearTimeout(t);
  }, []);
  return null;
}
