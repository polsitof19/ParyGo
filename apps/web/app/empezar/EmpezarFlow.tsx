'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { ArrowRight, Check, Eye, EyeOff } from 'lucide-react';
import { confirmarAlta, enviarCodigo, pagarAlta, slugDisponible, type AltaState } from './actions';
import { CLAVE_ALTA } from './listo/Completar';
import { TEXTOS, formatoPrecio, type Lang, type Moneda } from './textos';

export type Plan = {
  id: '1' | '3' | '5' | '10';
  eventos: number;
  PEN: number; // céntimos
  USD: number; // centavos
  destacado?: boolean;
};

type Opcion = 'prueba' | Plan['id'];

// "Tío Code" → "tio-code". Mismo formato que valida el servidor (SLUG_RE).
function aSlug(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 32).replace(/-+$/, '');
}

function enmascarar(email: string): string {
  const [u, d] = email.split('@');
  if (!u || !d) return email;
  return `${u.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(4, u.length - 1)))}@${d}`;
}

const inicial: AltaState = { ok: false, paso: 'datos', message: null };

function Enviar({ children, disabled, espera }: { children: React.ReactNode; disabled?: boolean; espera: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="ez-btn ez-btn--primary" disabled={disabled || pending} aria-busy={pending}>
      {pending ? espera : <>{children} <ArrowRight aria-hidden="true" className="ez-btn__arrow" /></>}
    </button>
  );
}

export function EmpezarFlow({ lang, planes, inicial: planInicial, monedaInicial, disponible, tope, cancelado }: {
  lang: Lang;
  planes: Plan[];
  inicial: Opcion;
  monedaInicial: Moneda;
  disponible: Record<Moneda, boolean>;
  tope: number;
  cancelado?: boolean;
}) {
  const t = TEXTOS[lang];
  const [moneda, setMoneda] = useState<Moneda>(monedaInicial);
  const pagos = disponible[moneda];
  const [plan, setPlan] = useState<Opcion>(pagos || planInicial === 'prueba' ? planInicial : 'prueba');
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

  const elegido = plan === 'prueba' ? null : planes.find((p) => p.id === plan) ?? null;
  const esPrueba = elegido === null;
  const precio = (p: Plan) => formatoPrecio(p[moneda], moneda);

  // Sin el medio de pago de esa moneda, un pack elegido vuelve a la prueba.
  useEffect(() => { if (!pagos && plan !== 'prueba') setPlan('prueba'); }, [pagos, plan]);

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
    const id = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [espera]);

  // El link se arma solo desde el nombre hasta que lo edites a mano.
  useEffect(() => { if (!slugTocado) setSlug(aSlug(nombre)); }, [nombre, slugTocado]);
  useEffect(() => {
    setLibre(null);
    if (slug.length < 2) return;
    const id = setTimeout(async () => setLibre(await slugDisponible(slug)), 450);
    return () => clearTimeout(id);
  }, [slug]);

  const err = { ...((esPrueba ? (conf.paso === 'datos' ? conf.fieldErrors : undefined) ?? envio.fieldErrors : pago.fieldErrors) ?? {}), ...(errPass ? { password: errPass } : {}) };
  const aviso = enCodigo ? null : esPrueba ? (conf.paso === 'datos' ? conf.message : null) ?? (envio.ok ? null : envio.message) : pago.message;

  // Pack: la contraseña NO va al servidor antes del pago. Queda en este
  // navegador y /empezar/listo la usa al volver con el pago aprobado.
  function antesDePagar(e: React.FormEvent<HTMLFormElement>) {
    if (esPrueba) return;
    if (password.length < 8) { e.preventDefault(); setErrPass(t.m.passCorta); return; }
    setErrPass(null);
    try { sessionStorage.setItem(CLAVE_ALTA, JSON.stringify({ email: email.toLowerCase(), password })); } catch { /* la elige al volver */ }
  }

  const ocultos = (
    <>
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="moneda" value={moneda} />
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="nombre" value={nombre} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="email" value={email} />
      {esPrueba && <input type="hidden" name="password" value={password} />}
      <input type="hidden" name="whatsapp" value={whatsapp} />
    </>
  );

  const fila = (id: Opcion, nombreFila: string, detalle: string, precioFila: string, apagado: boolean, destacado?: boolean) => (
    <label key={id} className={`ez-plan${plan === id ? ' is-on' : ''}${apagado ? ' is-off' : ''}`}>
      <input type="radio" name="plan-ui" value={id} checked={plan === id} disabled={apagado} onChange={() => setPlan(id)} className="ez-plan__radio" />
      <span className="ez-plan__dot" aria-hidden="true" />
      <span className="ez-plan__txt">
        <span className="ez-plan__name">
          {nombreFila}
          {destacado && <span className="ez-tag"><span className="ez-tag__dot" aria-hidden="true" />{t.masElegido}</span>}
        </span>
        <span className="ez-plan__det">{apagado ? t.noDisponible : detalle}</span>
      </span>
      <span className="ez-plan__price">{precioFila}</span>
    </label>
  );

  return (
    <main className="ez-main" lang={lang}>
      <div className="ez-col">
        <h1 className="ez-h1">
          {t.h1a}<span className="ez-squiggle">{t.h1b}</span>{t.h1c}
        </h1>
        <p className="ez-lede">
          {t.lede1}{' '}
          <strong className="ez-url">{slug || t.linkPh}.parygo.com</strong> {t.lede2}
        </p>

        {!enCodigo ? (
          <form action={esPrueba ? enviar : pagar} onSubmit={antesDePagar} className="ez-form" noValidate>
            <fieldset className="ez-planes">
              <legend className="ez-h2">{t.elige}</legend>

              <div className="ez-moneda" role="radiogroup" aria-label={t.monedaLabel}>
                {(['PEN', 'USD'] as Moneda[]).map((mo) => (
                  <label key={mo} className={`ez-moneda__op${moneda === mo ? ' is-on' : ''}`}>
                    <input type="radio" name="moneda-ui" value={mo} checked={moneda === mo} onChange={() => setMoneda(mo)} className="ez-plan__radio" />
                    {t.monedas[mo]}
                  </label>
                ))}
              </div>

              {fila('prueba', t.prueba, t.pruebaDet(tope), t.gratis, false)}
              {planes.map((p) => fila(
                p.id,
                `${p.eventos} ${p.eventos === 1 ? t.evento : t.eventos}`,
                p.eventos === 1 ? t.puntual : `${formatoPrecio(Math.round(p[moneda] / p.eventos / 100) * 100, moneda)} ${t.porEvento}.`,
                precio(p),
                !pagos,
                p.destacado,
              ))}
              <p className="ez-incl">{t.incluido} <strong>{t.sinComision}</strong></p>
            </fieldset>

            <fieldset className="ez-datos">
              <legend className="ez-h2">{t.tuMarca}</legend>

              <div className="ez-field">
                <label htmlFor="ez-nombre" className="ez-label">{t.nombre}</label>
                <input id="ez-nombre" className="ez-input" value={nombre} onChange={(e) => setNombre(e.target.value)}
                  maxLength={60} autoComplete="organization" placeholder={t.nombrePh} aria-invalid={!!err.nombre} aria-describedby={err.nombre ? 'e-nombre' : undefined} />
                {err.nombre && <p id="e-nombre" className="ez-err">{err.nombre}</p>}
              </div>

              <div className="ez-field">
                <label htmlFor="ez-slug" className="ez-label">{t.link}</label>
                <div className={`ez-affix${err.slug || libre === false ? ' is-bad' : ''}`}>
                  <input id="ez-slug" className="ez-input ez-input--affix" value={slug}
                    onChange={(e) => { setSlugTocado(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32)); }}
                    autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="url" placeholder={t.linkPh}
                    aria-invalid={!!err.slug || libre === false} aria-describedby="e-slug" />
                  <span className="ez-affix__end">.parygo.com</span>
                </div>
                <p id="e-slug" className={err.slug || libre === false ? 'ez-err' : 'ez-hint'} aria-live="polite">
                  {err.slug ?? (libre === false ? t.linkTomado : libre ? <><span className="ez-ok" aria-hidden="true" />{t.linkLibre}</> : t.linkHint)}
                </p>
              </div>

              <div className="ez-field">
                <label htmlFor="ez-email" className="ez-label">{t.correo}</label>
                <input id="ez-email" type="email" className="ez-input" value={email} onChange={(e) => setEmail(e.target.value.trim())}
                  autoComplete="email" inputMode="email" autoCapitalize="none" placeholder={t.correoPh}
                  aria-invalid={!!err.email} aria-describedby="e-email" />
                <p id="e-email" className={err.email ? 'ez-err' : 'ez-hint'}>{err.email ?? t.correoHint}</p>
              </div>

              <div className="ez-field">
                <label htmlFor="ez-pass" className="ez-label">{t.pass}</label>
                <div className="ez-affix">
                  <input id="ez-pass" type={ver ? 'text' : 'password'} className="ez-input ez-input--affix" value={password}
                    onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} maxLength={72}
                    aria-invalid={!!err.password} aria-describedby="e-pass" />
                  <button type="button" className="ez-eye" onClick={() => setVer((v) => !v)} aria-label={ver ? t.passOcultar : t.passVer}>
                    {ver ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </button>
                </div>
                <p id="e-pass" className={err.password ? 'ez-err' : 'ez-hint'}>{err.password ?? t.passHint}</p>
              </div>

              <div className="ez-field">
                <label htmlFor="ez-wa" className="ez-label">{t.wa} <span className="ez-opt">{t.opcional}</span></label>
                <input id="ez-wa" type="tel" className="ez-input" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
                  autoComplete="tel" inputMode="tel" placeholder={t.waPh} aria-invalid={!!err.whatsapp} aria-describedby="e-wa" />
                <p id="e-wa" className={err.whatsapp ? 'ez-err' : 'ez-hint'}>{err.whatsapp ?? t.waHint}</p>
              </div>
            </fieldset>

            {ocultos}
            {/* Honeypot: invisible para personas. */}
            <div className="ez-hp" aria-hidden="true"><label>Empresa<input name="empresa" tabIndex={-1} autoComplete="off" /></label></div>

            {aviso && <p className="ez-banner" role="alert">{aviso}</p>}
            {!aviso && cancelado && !esPrueba && <p className="ez-banner" role="status">{t.cancelado}</p>}
            <div className="ez-actions">
              <Enviar disabled={libre === false} espera={t.momento}>{esPrueba ? t.enviarCodigo : t.pagar(precio(elegido!))}</Enviar>
              <p className="ez-fine">
                {esPrueba ? t.finoPrueba : t.finoPago[moneda]}{' '}
                {t.acepta}{' '}
                <a href="/terminos" target="_blank" rel="noopener">{t.terminos}</a> {t.y} <a href="/privacidad" target="_blank" rel="noopener">{t.privacidad}</a>.
              </p>
            </div>
          </form>
        ) : (
          <form action={confirmar} className="ez-form ez-form--codigo">
            <h2 className="ez-h2">{t.revisa}</h2>
            <p className="ez-body">
              {t.enviamos} <strong>{enmascarar(email)}</strong>. {t.spam}
            </p>
            <div className="ez-field">
              <label htmlFor="ez-codigo" className="ez-label">{t.codigo}</label>
              <input id="ez-codigo" ref={codigoRef} name="codigo" className="ez-input ez-input--code" value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 8))}
                inputMode="numeric" autoComplete="one-time-code" placeholder="00000000" maxLength={8}
                aria-invalid={!!conf.fieldErrors?.codigo} aria-describedby="e-codigo" />
              <p id="e-codigo" className={conf.fieldErrors?.codigo ? 'ez-err' : 'ez-hint'}>{conf.fieldErrors?.codigo ?? t.vence}</p>
            </div>
            {ocultos}
            {conf.paso === 'codigo' && conf.message && <p className="ez-banner" role="alert">{conf.message}</p>}
            {!envio.ok && envio.message && <p className="ez-banner" role="alert">{envio.message}</p>}
            <div className="ez-actions">
              <Enviar disabled={codigo.length < 8} espera={t.momento}>{t.crear}</Enviar>
              <p className="ez-fine">{t.finoCodigo(tope)}</p>
            </div>
            <div className="ez-links">
              <button type="button" className="ez-link" onClick={() => setEnCodigo(false)}>{t.cambiar}</button>
              <button type="submit" formAction={enviar} className="ez-link" disabled={espera > 0}>
                {espera > 0 ? t.reenviarEn(espera) : t.reenviar}
              </button>
            </div>
          </form>
        )}
      </div>

      <aside className="ez-resumen" aria-label={t.tuPlan}>
        <p className="ez-resumen__label">{t.tuPlan}</p>
        <p className="ez-resumen__plan">{elegido ? `${elegido.eventos} ${elegido.eventos === 1 ? t.evento : t.eventos}` : t.prueba}</p>
        <p className="ez-resumen__precio">{elegido ? precio(elegido) : t.gratis}</p>
        {elegido && elegido.eventos > 1 && (
          <p className="ez-resumen__meta">{formatoPrecio(Math.round(elegido[moneda] / elegido.eventos / 100) * 100, moneda)} {t.porEvento} · {t.pagoUnico}</p>
        )}
        {!elegido && <p className="ez-resumen__meta">{t.pruebaResumen(tope)}</p>}
        <ul className="ez-resumen__list">
          {t.resumen(elegido ? elegido.eventos : 1).map((x) => (
            <li key={x}><Check aria-hidden="true" className="ez-tick" />{x}</li>
          ))}
        </ul>
        <p className="ez-resumen__url">
          <span className="ez-ok" aria-hidden="true" />
          {slug || t.linkPh}.parygo.com
        </p>
      </aside>
    </main>
  );
}
