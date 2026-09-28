'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { ArrowRight, Check, Eye, EyeOff } from 'lucide-react';
import { pagarAlta, slugDisponible, type AltaState } from './actions';
import { CLAVE_ALTA } from './listo/Completar';
import { TEXTOS, formatoPrecio, type Lang, type Moneda } from './textos';
import { VistaPrevia } from './VistaPrevia';

export type Plan = {
  id: '1' | '3' | '5' | '10';
  eventos: number;
  PEN: number; // céntimos
  USD: number; // centavos
  destacado?: boolean;
};

type Opcion = Plan['id'];

// "Tío Code" → "tio-code". Mismo formato que valida el servidor (SLUG_RE).
function aSlug(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 32).replace(/-+$/, '');
}
// = SLUG_RE de lib/altaMarca.ts (ese módulo es de servidor: no se importa acá).
const SLUG_OK = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// = normalizarWhatsapp + la regla de actions.ts: vacío, celular peruano de 9
// dígitos que empieza en 9, o +/00 con código de país (8 a 15 dígitos).
function waOk(v: string): boolean {
  const x = v.replace(/[\s\-().]/g, '');
  if (x === '' || /^9\d{8}$/.test(x)) return true;
  return /^\+\d{8,15}$/.test(x.startsWith('00') ? `+${x.slice(2)}` : x);
}

// Paso a paso (Paul, 2026-09-28): una pregunta por pantalla. Todo vive en UN
// solo <form>; los campos viajan en los ocultos, así que pagarAlta recibe lo
// mismo que antes. Enter en cualquier paso = "Continuar".
type Paso = 0 | 1 | 2 | 3 | 4;
const TOTAL = 5;
type Campo = 'nombre' | 'slug' | 'email' | 'password' | 'whatsapp';
const PASO_DE: Record<Campo, Paso> = { nombre: 1, slug: 2, email: 3, whatsapp: 3, password: 4 };
const FOCO: Partial<Record<Paso, string>> = { 1: 'ez-nombre', 2: 'ez-slug', 3: 'ez-email', 4: 'ez-pass' };

const inicial: AltaState = { ok: false, paso: 'datos', message: null };

function Enviar({ children, disabled, espera }: { children: React.ReactNode; disabled?: boolean; espera: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="ez-btn ez-btn--primary" disabled={disabled || pending} aria-busy={pending}>
      {pending ? espera : <>{children} <ArrowRight aria-hidden="true" className="ez-btn__arrow" /></>}
    </button>
  );
}

export function EmpezarFlow({ lang, planes, inicial: planInicial, monedaInicial, disponible, cancelado }: {
  lang: Lang;
  planes: Plan[];
  inicial: Opcion;
  monedaInicial: Moneda;
  disponible: Record<Moneda, boolean>;
  cancelado?: boolean;
}) {
  const t = TEXTOS[lang];
  const [paso, setPaso] = useState<Paso>(0);
  const [moneda, setMoneda] = useState<Moneda>(monedaInicial);
  const pagos = disponible[moneda];
  const [plan, setPlan] = useState<Opcion>(planInicial);
  const [nombre, setNombre] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTocado, setSlugTocado] = useState(false);
  const [libre, setLibre] = useState<null | boolean>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ver, setVer] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');

  const [pago, pagar] = useFormState(pagarAlta, inicial);
  // Errores del servidor (se borran al editar ese campo) y los de cada paso.
  const [errSrv, setErrSrv] = useState<AltaState['fieldErrors']>({});
  const [errPaso, setErrPaso] = useState<Partial<Record<Campo, string>>>({});

  // Sin prueba gratis: siempre hay un paquete elegido.
  const elegido: Plan = planes.find((p) => p.id === plan) ?? planes[0]!;
  const precio = (p: Plan) => formatoPrecio(p[moneda], moneda);

  // El link se arma solo desde el nombre hasta que lo edites a mano.
  useEffect(() => { if (!slugTocado) setSlug(aSlug(nombre)); }, [nombre, slugTocado]);
  useEffect(() => {
    setLibre(null);
    if (slug.length < 2) return;
    const id = setTimeout(async () => setLibre(await slugDisponible(slug)), 450);
    return () => clearTimeout(id);
  }, [slug]);

  // El servidor rechazó algo: vuelve al paso de ese campo.
  useEffect(() => {
    const fe = pago.fieldErrors ?? {};
    setErrSrv(fe);
    const primero = (['nombre', 'slug', 'email', 'whatsapp', 'password'] as const).find((k) => fe[k]);
    if (primero) setPaso(PASO_DE[primero]);
  }, [pago]);

  // Al cambiar de paso: arriba de todo y el cursor en la pregunta nueva.
  const montado = useRef(false);
  useEffect(() => {
    if (!montado.current) { montado.current = true; return; }
    window.scrollTo({ top: 0 });
    const id = FOCO[paso];
    if (id) document.getElementById(id)?.focus({ preventScroll: true });
  }, [paso]);

  const err: Partial<Record<Campo, string>> = { ...errSrv, ...errPaso };
  const sin = <T extends object>(o: T | undefined, c: Campo): T => { const r = { ...(o ?? {}) } as Record<string, unknown>; delete r[c]; return r as T; };
  const limpiar = (c: Campo) => {
    setErrPaso((s) => sin(s, c));
    setErrSrv((s) => sin(s, c));
  };
  const aviso = pago.message;

  function validar(p: Paso): boolean {
    const e: Partial<Record<Campo, string>> = {};
    const n = nombre.trim();
    if (p === 1) { if (n.length < 2) e.nombre = t.m.nombreCorto; else if (n.length > 60) e.nombre = t.m.nombreLargo; }
    if (p === 2) { if (!SLUG_OK.test(slug)) e.slug = t.m.slugMal; else if (libre === false) e.slug = t.linkTomado; }
    if (p === 3 && !EMAIL_OK.test(email)) e.email = t.m.correoMal;
    if (p === 3 && !waOk(whatsapp)) e.whatsapp = t.m.waMal;
    if (p === 4 && password.length < 8) e.password = t.m.passCorta;
    setErrPaso(e);
    return Object.keys(e).length === 0;
  }
  const ir = (p: Paso) => { setErrPaso({}); setPaso(p); };

  // Antes del último paso, "enviar" es "Continuar". En el último: la
  // contraseña NO va al servidor antes del pago; queda en este navegador y
  // /empezar/listo la usa al volver con el pago aprobado.
  // Si el paso no valida: la pregunta arriba a la vista (WebKit bajaba la
  // página al mostrar el error) y el cursor de vuelta en el campo.
  const mostrarError = () => {
    window.scrollTo({ top: 0 });
    const id = FOCO[paso];
    if (id) document.getElementById(id)?.focus({ preventScroll: true });
  };
  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    if (paso < 4) {
      e.preventDefault();
      if (validar(paso)) ir((paso + 1) as Paso); else mostrarError();
      return;
    }
    if (!validar(4)) { e.preventDefault(); mostrarError(); return; }
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

  const planTxt = `${elegido.eventos} ${elegido.eventos === 1 ? t.evento : t.eventos}`;
  const hintSlug = err.slug ?? (libre === false ? t.linkTomado : libre ? null : slug.length >= 2 ? t.w.buscando : t.linkHint);

  return (
    <main className="ez-main" lang={lang}>
      <div className="ez-col">
        <div className="ez-wiz__top">
          {paso > 0
            ? <button type="button" className="ez-volver" onClick={() => ir((paso - 1) as Paso)}>{t.w.atras}</button>
            : <span />}
          <span className="ez-wiz__paso">{t.w.paso(paso + 1, TOTAL)}</span>
        </div>
        <div className="ez-wiz__barra" aria-hidden="true" style={{ ['--p' as string]: (paso + 1) / TOTAL }}><span /></div>

        {paso === 0 && (
          <>
            <h1 className="ez-h1">
              {t.h1a}<span className="ez-squiggle">{t.h1b}</span>{t.h1c}
            </h1>
            <p className="ez-lede">
              {t.lede1}{' '}
              <strong className="ez-url">{slug || t.linkPh}.parygo.com</strong> {t.lede2}
            </p>
          </>
        )}

        <form action={pagar} onSubmit={alEnviar} className={`ez-form${paso > 0 ? ' ez-form--paso' : ''}`} noValidate>
          {paso === 0 && (
            <>
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

              {/* Celular: qué incluye, plegable por grupo (el primero abierto) para
                  no enterrar el botón. En la compu lo muestra el costado. */}
              <section className="ez-incluye" aria-labelledby="ez-incluye-h">
                <h2 className="ez-h2" id="ez-incluye-h">{t.incluye.h}</h2>
                {t.incluye.grupos.map((g, i) => (
                  <details key={g.t} className="ez-incluye__grupo" open={i === 0}>
                    <summary className="ez-incluye__t">{g.t}<span className="ez-incluye__n">{g.items.length}</span></summary>
                    <ul className="ez-resumen__list">
                      {g.items.map((x) => <li key={x}><Check aria-hidden="true" className="ez-tick" />{x}</li>)}
                    </ul>
                  </details>
                ))}
              </section>
            </>
          )}

          {paso === 1 && (
            <div className="ez-paso">
              <h1 className="ez-h1 ez-h1--q"><label htmlFor="ez-nombre">{t.w.nombre}</label></h1>
              <p className="ez-lede">{t.w.nombreHint}</p>
              <div className="ez-field ez-field--q">
                <input id="ez-nombre" className="ez-input" value={nombre} onChange={(e) => { setNombre(e.target.value); limpiar('nombre'); }}
                  maxLength={60} autoComplete="organization" placeholder={t.nombrePh} aria-invalid={!!err.nombre} aria-describedby={err.nombre ? 'e-nombre' : undefined} />
                {err.nombre && <p id="e-nombre" className="ez-err">{err.nombre}</p>}
              </div>
            </div>
          )}

          {paso === 2 && (
            <div className="ez-paso">
              <h1 className="ez-h1 ez-h1--q"><label htmlFor="ez-slug">{t.w.enlace}</label></h1>
              <p className="ez-lede">{t.w.enlaceHint}</p>
              <div className="ez-field ez-field--q">
                <div className={`ez-affix${err.slug || libre === false ? ' is-bad' : ''}`}>
                  <input id="ez-slug" className="ez-input ez-input--affix" value={slug}
                    onChange={(e) => { setSlugTocado(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32)); limpiar('slug'); }}
                    autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="url" placeholder={t.linkPh}
                    aria-invalid={!!err.slug || libre === false} aria-describedby="e-slug" />
                  <span className="ez-affix__end">.parygo.com</span>
                </div>
                <p id="e-slug" className={err.slug || libre === false ? 'ez-err' : 'ez-hint'} aria-live="polite">
                  {hintSlug ?? <><span className="ez-ok" aria-hidden="true" />{t.linkLibre}</>}
                </p>
              </div>
            </div>
          )}

          {paso === 3 && (
            <div className="ez-paso">
              <h1 className="ez-h1 ez-h1--q">{t.w.contacto}</h1>
              <div className="ez-field ez-field--q">
                <label htmlFor="ez-email" className="ez-label">{t.correo}</label>
                <input id="ez-email" type="email" className="ez-input" value={email} onChange={(e) => { setEmail(e.target.value.trim()); limpiar('email'); }}
                  autoComplete="email" inputMode="email" autoCapitalize="none" placeholder={t.correoPh}
                  aria-invalid={!!err.email} aria-describedby="e-email" />
                <p id="e-email" className={err.email ? 'ez-err' : 'ez-hint'}>{err.email ?? t.correoHint}</p>
              </div>
              <div className="ez-field">
                <label htmlFor="ez-wa" className="ez-label">{t.wa} <span className="ez-opt">{t.opcional}</span></label>
                <input id="ez-wa" type="tel" className="ez-input" value={whatsapp} onChange={(e) => { setWhatsapp(e.target.value); limpiar('whatsapp'); }}
                  autoComplete="tel" inputMode="tel" placeholder={t.waPh} aria-invalid={!!err.whatsapp} aria-describedby="e-wa" />
                <p id="e-wa" className={err.whatsapp ? 'ez-err' : 'ez-hint'}>{err.whatsapp ?? t.waHint}</p>
              </div>
            </div>
          )}

          {paso === 4 && (
            <div className="ez-paso">
              <h1 className="ez-h1 ez-h1--q"><label htmlFor="ez-pass">{t.w.clave}</label></h1>
              <div className="ez-field ez-field--q">
                <div className="ez-affix">
                  <input id="ez-pass" type={ver ? 'text' : 'password'} className="ez-input ez-input--affix" value={password}
                    onChange={(e) => { setPassword(e.target.value); limpiar('password'); }} autoComplete="new-password" minLength={8} maxLength={72}
                    aria-invalid={!!err.password} aria-describedby="e-pass" />
                  <button type="button" className="ez-eye" onClick={() => setVer((v) => !v)} aria-label={ver ? t.passOcultar : t.passVer}>
                    {ver ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </button>
                </div>
                <p id="e-pass" className={err.password ? 'ez-err' : 'ez-hint'}>{err.password ?? t.passHint}</p>
              </div>

              <h2 className="ez-h2">{t.w.revisa}</h2>
              <dl className="ez-revisa">
                <div><dt>{t.tuPlan}</dt><dd>{planTxt} · {precio(elegido)}</dd><button type="button" className="ez-link" onClick={() => ir(0)}>{t.w.editar}</button></div>
                <div><dt>{t.w.rMarca}</dt><dd>{nombre.trim()}</dd><button type="button" className="ez-link" onClick={() => ir(1)}>{t.w.editar}</button></div>
                <div><dt>{t.w.rEnlace}</dt><dd>{slug}.parygo.com</dd><button type="button" className="ez-link" onClick={() => ir(2)}>{t.w.editar}</button></div>
                <div><dt>{t.w.rCorreo}</dt><dd>{email}</dd><button type="button" className="ez-link" onClick={() => ir(3)}>{t.w.editar}</button></div>
              </dl>
            </div>
          )}

          {ocultos}
          {/* Honeypot: invisible para personas. */}
          <div className="ez-hp" aria-hidden="true"><label>Empresa<input name="empresa" tabIndex={-1} autoComplete="off" /></label></div>

          {/* Celular: la dirección de su página, en vivo, bajo la pregunta. En la
              compu va en el costado. */}
          {(paso === 1 || paso === 2) && <VistaPrevia slug={slug} t={t} className="ez-vp--movil" />}

          {aviso && <p className="ez-banner" role="alert">{aviso}</p>}
          {!aviso && cancelado && paso === 0 && <p className="ez-banner" role="status">{t.cancelado}</p>}
          <div className="ez-actions">
            {paso < 4 ? (
              <button type="submit" className="ez-btn ez-btn--primary">
                {t.w.continuar} <ArrowRight aria-hidden="true" className="ez-btn__arrow" />
              </button>
            ) : (
              <>
                <Enviar disabled={libre === false || !pagos} espera={t.momento}>{t.pagar(precio(elegido))}</Enviar>
                <p className="ez-fine">
                  {t.finoPago[moneda]}{' '}
                  {t.acepta}{' '}
                  <a href="/terminos" target="_blank" rel="noopener">{t.terminos}</a> {t.y} <a href="/privacidad" target="_blank" rel="noopener">{t.privacidad}</a>.
                </p>
              </>
            )}
          </div>

        </form>
      </div>

      <aside className="ez-resumen" aria-label={t.tuPlan}>
        <p className="ez-resumen__label">{t.tuPlan}</p>
        <p className="ez-resumen__plan">{planTxt}</p>
        <p className="ez-resumen__precio">{precio(elegido)}</p>
        {elegido.eventos > 1 && (
          <p className="ez-resumen__meta">{formatoPrecio(Math.round(elegido[moneda] / elegido.eventos / 100) * 100, moneda)} {t.porEvento} · {t.pagoUnico}</p>
        )}
        {paso === 0 ? (
          <>
            {/* Compu, paso 1: todo lo que incluye, para saber por qué paga. */}
            <p className="ez-resumen__h">{t.incluye.h}</p>
            {t.incluye.grupos.map((g) => (
              <div key={g.t} className="ez-resumen__grupo">
                <p className="ez-resumen__gt">{g.t}</p>
                <ul className="ez-resumen__list">
                  {g.items.map((x) => <li key={x}><Check aria-hidden="true" className="ez-tick" />{x}</li>)}
                </ul>
              </div>
            ))}
          </>
        ) : (
          // Compu, desde el nombre: la dirección de su página, en vivo.
          <VistaPrevia slug={slug} t={t} className="ez-vp--costado" />
        )}
      </aside>
    </main>
  );
}
