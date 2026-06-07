'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Eye, EyeOff } from 'lucide-react';
import { loginAction, type LoginState } from './actions';

const initialState: LoginState = { ok: false, message: null };

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useFormState(loginAction, initialState);
  const [showPwd, setShowPwd] = useState(false);

  return (
    <form action={formAction}>
      <input type="hidden" name="next" value={next ?? ''} />

      <div className="auth-field">
        <label htmlFor="email" className="auth-label">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="tu@email.com"
          className="auth-input"
        />
      </div>

      <div className="auth-field">
        <label htmlFor="password" className="auth-label">Contraseña</label>
        <div className="auth-pwrap">
          <input
            id="password"
            name="password"
            type={showPwd ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            className="auth-input"
          />
          <button
            type="button"
            className="auth-peek"
            onClick={() => setShowPwd((v) => !v)}
            aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {state.message && !state.ok && <p className="auth-banner">{state.message}</p>}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="auth-btn" disabled={pending}>
      {pending ? 'Entrando…' : 'Entrar'}
    </button>
  );
}
