'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { ArrowRight, Check, Eye, EyeOff } from 'lucide-react';
import { confirmarAlta, enviarCodigo, pagarAlta, slugDisponible, type AltaState } from './actions';
import { CLAVE_ALTA } from './listo/Completar';

export type Plan = {
  id: 'prueba' | '1' | '3' | '5' | '10';
  nombre: string;
  detalle: string;
  precio: number | null; // céntimos; null = gratis
  porEvento: number | null;
  eventos: number;
  destacado?: boolean;
};

const soles = (c: number) => `S/${(c / 100).toLocaleString('es-PE')}`;

// "Tío Code" → "tio-code". Mismo formato que valida el servidor (SLUG_RE).
function aSlug(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 32).replace(/-+$/, '');
}

function enmascarar(email: string): string {
  const [u, d] = email.split('@');
  if (!u || !d) return email;
  return `${u.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(4, u.length - 1)))}@${d}`;
}

const inicial: AltaState = { ok: false, paso: 'datos', message: null };

function Enviar({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="ez-btn ez-btn--primary" disabled={disabled || pending} aria-busy={pending}>
      {pending ? 'Un momento…' : <>{children} <ArrowRight aria-hidden="true" className="ez-btn__arrow" /></>}
    </button>
  );
}

export function EmpezarFlow({ planes, inicial: planInicial, pagos, tope, cancelado }: { planes: Plan[]; inicial: Plan['id']; pagos: boolean; tope: number; cancelado?: boolean }) {
  const [plan, setPlan] = useState<Plan['id']>(planInicial);
  const [nombre, setNombre] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTocado, setSlugTocado] = useState(false);
  const [libre, setLibre] = useState<null | boolean>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ver, setVer] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [codigo, setCodigo] = useState('');
  const [enCodigo, setEnCodigo] = useState(false);
  const [espera, setEspera] = useState(0);

  const [envio, enviar] = useFormState(enviarCodigo, inicial);
  const [pago, pagar] = useFormState(pagarAlta, inicial);
  const [errPass, setErrPass] = useState<string | null>(null);
  const [conf, confirmar] = useFormState(confirmarAlta, inicial);
  const codigoRef = useRef<HTMLInputElement>(null);

  const elegido = planes.find((p) => p.id === plan) ?? planes[0]!;
  const esPrueba = elegido.precio === null;

  // El servidor decide en qué paso quedamos: el código salió → pantalla del
  // código; el alta rebotó por un dato (p. ej. el link se ocupó) → a los datos.
  useEffect(() => {
    if (envio.ok && envio.paso === 'codigo') { setEnCodigo(true); setCodigo(''); setEspera(30); }
  }, [envio]);
  useEffect(() => {
    if (!conf.ok && conf.paso === 'datos' && conf.message) setEnCodigo(false);
  }, [conf]);
  useEffect(() => { if (enCodigo) codigoRef.current?.focus(); }, [enCodigo]);
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  // El link se arma solo desde el nombre hasta que lo edites a mano.
  useEffect(() => { if (!slugTocado) setSlug(aSlug(nombre)); }, [nombre, slugTocado]);
  useEffect(() => {
    setLibre(null);
    if (slug.length < 2) return;
    const t = setTimeout(async () => setLibre(await slugDisponible(slug)), 450);
    return () => clearTimeout(t);
  }, [slug]);

  const err = { ...((esPrueba ? (conf.paso === 'datos' ? conf.fieldErrors : undefined) ?? envio.fieldErrors : pago.fieldErrors) ?? {}), ...(errPass ? { password: errPass } : {}) };
  const aviso = enCodigo ? null : esPrueba ? (conf.paso === 'datos' ? conf.message : null) ?? (envio.ok ? null : envio.message) : pago.message;
  const cta = 'Crear mi marca';

  // Pack: la contraseña NO va al servidor antes del pago. Queda en este
  // navegador y /empezar/listo la usa al volver con el pago aprobado.
  function antesDePagar(e: React.FormEvent<HTMLFormElement>) {
    if (esPrueba) return;
    if (password.length < 8) { e.preventDefault(); setErrPass('Mínimo 8 caracteres.'); return; }
    setErrPass(null);
    try { sessionStorage.setItem(CLAVE_ALTA, JSON.stringify({ email: email.toLowerCase(), password })); } catch { /* la elige al volver */ }
  }

  const ocultos = (
    <>
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="nombre" value={nombre} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="email" value={email} />
      {esPrueba && <input type="hidden" name="password" value={password} />}
      <input type="hidden" name="whatsapp" value={whatsapp} />
    </>
  );

  return (
    <main className="ez-main">
      <div className="ez-col">
        <h1 className="ez-h1">
          Tu marca, lista para <span className="ez-squiggle">vender</span>.
        </h1>
        <p className="ez-lede">
          Elige cómo empezar, pon tus datos y en unos minutos tienes tu página{' '}
          <strong className="ez-url">{slug || 'tumarca'}.parygo.com</strong> con entradas, cobro directo y escáner.
        </p>

        {!enCodigo ? (
          <form action={esPrueba ? enviar : pagar} onSubmit={antesDePagar} className="ez-form" noValidate>
            <fieldset className="ez-planes">
              <legend className="ez-h2">Elige cómo empezar</legend>
              {planes.map((p) => {
                const apagado = p.precio !== null && !pagos;
                return (
                  <label key={p.id} className={`ez-plan${plan === p.id ? ' is-on' : ''}${apagado ? ' is-off' : ''}`}>
                    <input
                      type="radio" name="plan-ui" value={p.id} checked={plan === p.id} disabled={apagado}
                      onChange={() => setPlan(p.id)} className="ez-plan__radio"
                    />
                    <span className="ez-plan__dot" aria-hidden="true" />
                    <span className="ez-plan__txt">
                      <span className="ez-plan__name">
                        {p.nombre}
                        {p.destacado && <span className="ez-tag"><span className="ez-tag__dot" aria-hidden="true" />El más elegido</span>}
                      </span>
                      <span className="ez-plan__det">{apagado ? 'El pago en línea se activa muy pronto.' : p.detalle}</span>
                    </span>
                    <span className="ez-plan__price">{p.precio === null ? 'Gratis' : soles(p.precio)}</span>
                  </label>
                );
              })}
              <p className="ez-incl">
                Todo incluido en cualquier opción: tu página con tu logo, entradas con QR, cobro directo a tu Yape o
                tarjeta, escáner para la puerta y tu panel. <strong>Sin comisión por entrada.</strong>
              </p>
            </fieldset>

            <fieldset className="ez-datos">
              <legend className="ez-h2">Tu marca</legend>

              <div className="ez-field">
                <label htmlFor="ez-nombre" className="ez-label">Nombre de tu marca</label>
                <input id="ez-nombre" className="ez-input" value={nombre} onChange={(e) => setNombre(e.target.value)}
                  maxLength={60} autoComplete="organization" placeholder="Ej. Tío Code" aria-invalid={!!err.nombre} aria-describedby={err.nombre ? 'e-nombre' : undefined} />
                {err.nombre && <p id="e-nombre" className="ez-err">{err.nombre}</p>}
              </div>

              <div className="ez-field">
                <label htmlFor="ez-slug" className="ez-label">Tu link</label>
                <div className={`ez-affix${err.slug || libre === false ? ' is-bad' : ''}`}>
                  <input id="ez-slug" className="ez-input ez-input--affix" value={slug}
                    onChange={(e) => { setSlugTocado(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32)); }}
                    autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="url" placeholder="tumarca"
                    aria-invalid={!!err.slug || libre === false} aria-describedby="e-slug" />
                  <span className="ez-affix__end">.parygo.com</span>
                </div>
                <p id="e-slug" className={err.slug || libre === false ? 'ez-err' : 'ez-hint'} aria-live="polite">
                  {err.slug ?? (libre === false ? 'Ese link ya lo tiene otra marca. Prueba con otro.'
                    : libre ? <><span className="ez-ok" aria-hidden="true" />Disponible</> : 'Es la dirección de tu página. Solo minúsculas, números y guiones.')}
                </p>
              </div>

              <div className="ez-field">
                <label htmlFor="ez-email" className="ez-label">Tu correo</label>
                <input id="ez-email" type="email" className="ez-input" value={email} onChange={(e) => setEmail(e.target.value.trim())}
                  autoComplete="email" inputMode="email" autoCapitalize="none" placeholder="tu@correo.com"
                  aria-invalid={!!err.email} aria-describedby="e-email" />
                <p id="e-email" className={err.email ? 'ez-err' : 'ez-hint'}>{err.email ?? 'Ahí te llega el código y los avisos de pagos.'}</p>
              </div>

              <div className="ez-field">
                <label htmlFor="ez-pass" className="ez-label">Contraseña</label>
                <div className="ez-affix">
                  <input id="ez-pass" type={ver ? 'text' : 'password'} className="ez-input ez-input--affix" value={password}
                    onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} maxLength={72}
                    aria-invalid={!!err.password} aria-describedby="e-pass" />
                  <button type="button" className="ez-eye" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar contraseña' : 'Ver contraseña'}>
                    {ver ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </button>
                </div>
                <p id="e-pass" className={err.password ? 'ez-err' : 'ez-hint'}>{err.password ?? 'Mínimo 8 caracteres. Con esto entras a tu panel.'}</p>
              </div>

              <div className="ez-field">
                <label htmlFor="ez-wa" className="ez-label">WhatsApp <span className="ez-opt">(opcional)</span></label>
                <div className="ez-affix">
                  <span className="ez-affix__start">+51</span>
                  <input id="ez-wa" type="tel" className="ez-input ez-input--affix" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
                    autoComplete="tel-national" inputMode="tel" placeholder="999 999 999" aria-invalid={!!err.whatsapp} aria-describedby="e-wa" />
                </div>
                <p id="e-wa" className={err.whatsapp ? 'ez-err' : 'ez-hint'}>{err.whatsapp ?? 'Para que tus compradores te escriban.'}</p>
              </div>
            </fieldset>

            {ocultos}
            {/* Honeypot: invisible para personas. */}
            <div className="ez-hp" aria-hidden="true"><label>Empresa<input name="empresa" tabIndex={-1} autoComplete="off" /></label></div>

            {aviso && <p className="ez-banner" role="alert">{aviso}</p>}
            {!aviso && cancelado && !esPrueba && (
              <p className="ez-banner" role="status">No se completó el pago y no se te cobró nada. Cuando quieras, vuelve a intentarlo.</p>
            )}
            <div className="ez-actions">
              <Enviar disabled={libre === false}>{esPrueba ? 'Enviarme el código' : `Pagar ${soles(elegido.precio!)} con Mercado Pago`}</Enviar>
              <p className="ez-fine">
                {esPrueba
                  ? 'Te mandamos un código al correo para confirmar que es tuyo.'
                  : 'Pagas en Mercado Pago con tarjeta o con tu cuenta. Al volver entras directo a tu panel con tus eventos.'}{' '}
                Al continuar aceptas los{' '}
                <a href="/terminos" target="_blank" rel="noopener">Términos</a> y la <a href="/privacidad" target="_blank" rel="noopener">Privacidad</a>.
              </p>
            </div>
          </form>
        ) : (
          <form action={confirmar} className="ez-form ez-form--codigo">
            <h2 className="ez-h2">Revisa tu correo</h2>
            <p className="ez-body">
              Te mandamos un código de 8 dígitos a <strong>{enmascarar(email)}</strong>. Si no lo ves, mira en spam o promociones.
            </p>
            <div className="ez-field">
              <label htmlFor="ez-codigo" className="ez-label">Código</label>
              <input id="ez-codigo" ref={codigoRef} name="codigo" className="ez-input ez-input--code" value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 8))}
                inputMode="numeric" autoComplete="one-time-code" placeholder="00000000" maxLength={8}
                aria-invalid={!!conf.fieldErrors?.codigo} aria-describedby="e-codigo" />
              <p id="e-codigo" className={conf.fieldErrors?.codigo ? 'ez-err' : 'ez-hint'}>
                {conf.fieldErrors?.codigo ?? 'Vence en una hora.'}
              </p>
            </div>
            {ocultos}
            {conf.paso === 'codigo' && conf.message && <p className="ez-banner" role="alert">{conf.message}</p>}
            {!envio.ok && envio.message && <p className="ez-banner" role="alert">{envio.message}</p>}
            <div className="ez-actions">
              <Enviar disabled={codigo.length < 8}>{cta}</Enviar>
              <p className="ez-fine">
                {esPrueba
                  ? `Entras a tu panel con tu evento de prueba: hasta ${tope} entradas.`
                  : 'Te llevamos a Mercado Pago. Al volver, tus eventos ya están en tu saldo.'}
              </p>
            </div>
            <div className="ez-links">
              <button type="button" className="ez-link" onClick={() => setEnCodigo(false)}>Cambiar mis datos</button>
              <button type="submit" formAction={enviar} className="ez-link" disabled={espera > 0}>
                {espera > 0 ? `Reenviar código en ${espera}s` : 'Reenviar código'}
              </button>
            </div>
          </form>
        )}
      </div>

      <aside className="ez-resumen" aria-label="Tu plan">
        <p className="ez-resumen__label">Tu plan</p>
        <p className="ez-resumen__plan">{elegido.nombre}</p>
        <p className="ez-resumen__precio">{elegido.precio === null ? 'Gratis' : soles(elegido.precio)}</p>
        {elegido.porEvento !== null && elegido.eventos > 1 && (
          <p className="ez-resumen__meta">{soles(elegido.porEvento)} por evento · pago único</p>
        )}
        {elegido.precio === null && <p className="ez-resumen__meta">1 evento de hasta {tope} entradas</p>}
        <ul className="ez-resumen__list">
          {[
            `${elegido.eventos} evento${elegido.eventos === 1 ? '' : 's'} para crear cuando quieras`,
            'Cobras directo a tu Yape o tarjeta',
            'Entradas con QR y escáner en la puerta',
            'Sin comisión por entrada',
          ].map((t) => (
            <li key={t}><Check aria-hidden="true" className="ez-tick" />{t}</li>
          ))}
        </ul>
        <p className="ez-resumen__url">
          <span className="ez-ok" aria-hidden="true" />
          {slug || 'tumarca'}.parygo.com
        </p>
      </aside>
    </main>
  );
}
