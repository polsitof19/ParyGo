'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Check } from 'lucide-react';
import { requestAccessAction, type RequestAccessState } from './actions';

const initial: RequestAccessState = { ok: false, message: '' };

export function RequestAccessForm() {
  const [state, action] = useFormState(requestAccessAction, initial);
  const err = state.fieldErrors ?? {};

  if (state.ok && state.message) {
    return (
      <div className="auth-card" role="status" style={{ textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', width: 48, height: 48, borderRadius: '50%', background: 'var(--ok, #16a34a)', color: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Check className="h-6 w-6" />
        </div>
        <h2 className="auth-h1" style={{ fontSize: 22 }}>¡Solicitud enviada!</h2>
        <p className="auth-sub">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="auth-card">
      <p className="auth-eyebrow">Pedir acceso</p>
      <h1 className="auth-h1">Contanos de tu evento</h1>
      <p className="auth-sub">Te damos acceso para vender con tu propia marca, cobrando vos directo.</p>

      {/* Honeypot anti-bot: oculto para humanos. */}
      <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true">
        <label>No llenar<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <div className="auth-field">
        <label htmlFor="brand_name" className="auth-label">Nombre de tu marca o evento</label>
        <input id="brand_name" name="brand_name" required maxLength={120} placeholder="Ej: Discoteca Cocos" className="auth-input" />
        {err.brand_name && <p className="auth-banner">{err.brand_name}</p>}
      </div>

      <div className="auth-field">
        <label htmlFor="contact_name" className="auth-label">Tu nombre</label>
        <input id="contact_name" name="contact_name" required maxLength={120} placeholder="Nombre y apellido" className="auth-input" autoComplete="name" />
        {err.contact_name && <p className="auth-banner">{err.contact_name}</p>}
      </div>

      <div className="auth-field">
        <label htmlFor="contact_email" className="auth-label">Email</label>
        <input id="contact_email" name="contact_email" type="email" required maxLength={200} placeholder="tu@email.com" className="auth-input" autoComplete="email" inputMode="email" />
        {err.contact_email && <p className="auth-banner">{err.contact_email}</p>}
      </div>

      <div className="auth-field">
        <label htmlFor="contact_phone" className="auth-label">WhatsApp <span style={{ fontWeight: 400, opacity: 0.6 }}>(opcional)</span></label>
        <input id="contact_phone" name="contact_phone" type="tel" maxLength={40} placeholder="+51 999 999 999" className="auth-input" autoComplete="tel" inputMode="tel" />
      </div>

      <div className="auth-field">
        <label htmlFor="event_info" className="auth-label">Contanos un poco <span style={{ fontWeight: 400, opacity: 0.6 }}>(opcional)</span></label>
        <textarea id="event_info" name="event_info" maxLength={1000} rows={3} placeholder="Qué tipo de eventos hacés, cada cuánto, dónde…" className="auth-input" style={{ minHeight: 76, resize: 'vertical' }} />
      </div>

      {state.message && !state.ok && <p className="auth-banner">{state.message}</p>}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="auth-btn" disabled={pending}>
      {pending ? 'Enviando…' : 'Pedir acceso'}
    </button>
  );
}
