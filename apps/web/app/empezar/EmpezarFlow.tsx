'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { ArrowRight, Bell, Check, Eye, EyeOff, LogIn } from 'lucide-react';
import { enviarCodigo, finalizarAlta, slugDisponible, type AltaState } from './actions';
import { passwordOk } from '@/lib/password';
import { TEXTOS, formatoPrecio, type Lang, type Moneda } from './textos';
import type { TipoMarca } from '@/lib/packs';
import { VistaPrevia } from './VistaPrevia';

export type Plan = {
  id: '1' | '3' | '5' | '10';
  eventos: number;
  PEN: number; // céntimos
  USD: number; // centavos
  destacado?: boolean;
};

type Opcion = Plan['id'] | 'prueba';

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
// solo <form>; los campos viajan en los ocultos. Enter en cualquier paso =
// "Continuar". Paso 3 (correo) manda el código; 4 lo confirma; 5 crea/paga.
type Paso = 0 | 1 | 2 | 3 | 4 | 5;
const TOTAL = 6;
type Campo = 'nombre' | 'slug' | 'email' | 'password' | 'whatsapp' | 'codigo';
const PASO_DE: Record<Campo, Paso> = { nombre: 1, slug: 2, email: 3, whatsapp: 3, codigo: 4, password: 5 };
const FOCO: Partial<Record<Paso, string>> = { 1: 'ez-nombre', 2: 'ez-slug', 3: 'ez-email', 4: 'ez-codigo', 5: 'ez-pass' };

const inicial: AltaState = { ok: false, paso: 'datos', message: null };

function Enviar({ children, disabled, espera, ocupado }: { children: React.ReactNode; disabled?: boolean; espera: string; ocupado?: boolean }) {
  const { pending: enviando } = useFormStatus();
  const pending = enviando || !!ocupado;
  return (
    <button type="submit" className="ez-btn ez-btn--primary" disabled={disabled || pending} aria-busy={pending}>
      {pending ? espera : <>{children} <ArrowRight aria-hidden="true" className="ez-btn__arrow" /></>}
    </button>
  );
}

export function EmpezarFlow({ lang, tipo = 'marca', planes, inicial: planInicial, monedaInicial, disponible, cancelado }: {
  lang: Lang;
  // Marca o evento privado (0075): cambia los textos y va en un oculto; el
  // precio NO sale de acá (lo decide el server por brands.tipo).
  tipo?: TipoMarca;
  planes: Plan[];
  inicial: Opcion;
  monedaInicial: Moneda;
  disponible: Record<Moneda, boolean>;
  cancelado?: boolean;
}) {
  const base = TEXTOS[lang];
  // Evento privado: sus textos encima de los de siempre.
  const t = tipo === 'privado' ? { ...base, ...base.privado, w: { ...base.w, ...base.privado.w } } : base;
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
  const [codigo, setCodigo] = useState('');
  const [reenv, setReenv] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<AltaState>(inicial);

  const [rEnviar, accEnviar] = useFormState(enviarCodigo, inicial);
  // El código se verifica por fetch (verificar/route.ts), no como acción: ver ahí por qué.
  const [verificando, setVerificando] = useState(false);
  const [rFinal, accFinal] = useFormState(finalizarAlta, inicial);
  // Errores del servidor (se borran al editar ese campo) y los de cada paso.
  const [errSrv, setErrSrv] = useState<AltaState['fieldErrors']>({});
  const [errPaso, setErrPaso] = useState<Partial<Record<Campo, string>>>({});

  const esPrueba = plan === 'prueba' && tipo === 'marca';
  // Con la prueba elegida, `elegido` es el primer paquete (solo relleno: no se muestra).
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

  // Respuesta de una acción: avanza si salió bien; si no, vuelve al paso del
  // campo con error (o al código si la sesión no está verificada).
  function alResultado(r: AltaState) {
    if (r === inicial) return;
    const fe = r.fieldErrors ?? {};
    setUltimo(r);
    setErrSrv(fe);
    setReenv(null);
    const primero = (['nombre', 'slug', 'email', 'whatsapp', 'codigo', 'password'] as const).find((k) => fe[k]);
    if (primero) setPaso(PASO_DE[primero]);
    else if (r.ok && r.paso === 'codigo') setPaso(4);
    else if (r.ok && r.paso === 'clave') setPaso(5);
    else if (!r.ok && r.paso === 'codigo') setPaso(4);
  }
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => alResultado(rEnviar), [rEnviar]);
  useEffect(() => alResultado(rFinal), [rFinal]);
  /* eslint-enable react-hooks/exhaustive-deps */

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
  const aviso = ultimo.message;

  function validar(p: Paso): boolean {
    const e: Partial<Record<Campo, string>> = {};
    const n = nombre.trim();
    if (p === 1) { if (n.length < 2) e.nombre = t.m.nombreCorto; else if (n.length > 60) e.nombre = t.m.nombreLargo; }
    if (p === 2) { if (!SLUG_OK.test(slug)) e.slug = t.m.slugMal; else if (libre === false) e.slug = t.linkTomado; }
    if (p === 3 && !EMAIL_OK.test(email)) e.email = t.m.correoMal;
    if (p === 3 && !waOk(whatsapp)) e.whatsapp = t.m.waMal;
    else if (p === 3 && esPrueba && whatsapp.trim() === '') e.whatsapp = t.m.waObligatorio;
    if (p === 4 && codigo.length !== 8) e.codigo = t.m.escribeCodigo;
    if (p === 5 && !passwordOk(password)) e.password = t.m.passRegla;
    setErrPaso(e);
    return Object.keys(e).length === 0;
  }
  const ir = (p: Paso) => { setErrPaso({}); setErrSrv({}); setUltimo(inicial); setReenv(null); setPaso(p); };

  // Hasta el paso 2, "enviar" es "Continuar" (todo en el navegador). Del 3 al 5
  // el form va al servidor: código, verificación y alta/pago.
  // Si el paso no valida: la pregunta arriba a la vista (WebKit bajaba la
  // página al mostrar el error) y el cursor de vuelta en el campo.
  const mostrarError = () => {
    window.scrollTo({ top: 0 });
    const id = FOCO[paso];
    if (id) document.getElementById(id)?.focus({ preventScroll: true });
  };
  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    if (paso < 3) {
      e.preventDefault();
      if (validar(paso)) ir((paso + 1) as Paso); else mostrarError();
      return;
    }
    if (!validar(paso)) { e.preventDefault(); mostrarError(); return; }
    setErrSrv({}); setUltimo(inicial);
    if (paso === 4) {
      e.preventDefault();
      void verificar(new FormData(e.currentTarget));
    }
  }

  async function verificar(fd: FormData) {
    setVerificando(true);
    try {
      const res = await fetch('/empezar/verificar', { method: 'POST', body: fd, credentials: 'same-origin' });
      const r = (await res.json()) as AltaState;
      if (r.ir) { window.location.assign(r.ir); return; }
      alResultado(r);
    } catch {
      alResultado({ ok: false, paso: 'codigo', message: t.m.noCodigo });
    } finally {
      setVerificando(false);
    }
  }

  // Reenviar: mismo envío del paso 3 con reenvio=1, sin salir de la pantalla.
  const [reenviando, setReenviando] = useState(false);
  async function reenviar() {
    setReenviando(true);
    // Sin esto el error del código anterior tapaba el aviso del reenvío.
    setErrSrv({}); setErrPaso({});
    const fd = new FormData();
    for (const [k, v] of Object.entries({ nombre, slug, email, whatsapp, plan, tipo, lang, moneda, reenvio: '1', empresa: '' })) fd.set(k, v);
    const r = await enviarCodigo(inicial, fd);
    setReenviando(false);
    setReenv(r.ok ? t.c.reenviado : r.message ?? t.m.noCodigo);
  }

  const ocultos = (
    <>
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="moneda" value={moneda} />
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="nombre" value={nombre} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="whatsapp" value={whatsapp} />
      {paso === 4 && <input type="hidden" name="codigo" value={codigo} />}
      {paso === 5 && <input type="hidden" name="password" value={password} />}
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

  const planTxt = esPrueba ? t.c.pruebaNombre : tipo === 'privado' ? base.privado.planNombre : `${elegido.eventos} ${elegido.eventos === 1 ? t.evento : t.eventos}`;
  const hintSlug = err.slug ?? (libre === false ? t.linkTomado : libre ? null : slug.length >= 2 ? t.w.buscando : t.linkHint);

  return (
    <main className="ez-main" lang={lang}>
      <div className="ez-col">
        <div className="ez-wiz__top">
          {paso > 0
            ? <button type="button" className="ez-volver" onClick={() => ir(paso === 5 ? 3 : (paso - 1) as Paso)}>{t.w.atras}</button>
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

        <form action={paso === 3 ? accEnviar : accFinal} onSubmit={alEnviar} className={`ez-form${paso > 0 ? ' ez-form--paso' : ''}`} noValidate>
          {paso === 0 && (
            <>
              <fieldset className="ez-planes">
                <legend className="ez-h2">{t.elige}</legend>

                {!esPrueba && <div className="ez-moneda" role="radiogroup" aria-label={t.monedaLabel}>
                  {(['PEN', 'USD'] as Moneda[]).map((mo) => (
                    <label key={mo} className={`ez-moneda__op${moneda === mo ? ' is-on' : ''}`}>
                      <input type="radio" name="moneda-ui" value={mo} checked={moneda === mo} onChange={() => setMoneda(mo)} className="ez-plan__radio" />
                      {t.monedas[mo]}
                    </label>
                  ))}
                </div>}

                {tipo === 'marca' && fila('prueba', t.c.pruebaNombre, t.c.pruebaDet, t.c.pruebaPrecio, false)}
                {planes.map((p) => fila(
                  p.id,
                  tipo === 'privado' ? base.privado.planNombre : `${p.eventos} ${p.eventos === 1 ? t.evento : t.eventos}`,
                  tipo === 'privado' ? base.privado.planDet : p.eventos === 1 ? t.puntual : `${formatoPrecio(Math.round(p[moneda] / p.eventos / 100) * 100, moneda)} ${t.porEvento}.`,
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
                {/* El enlace que se arma solo ya es de otra marca: se avisa acá, antes del paso del enlace. */}
                {!err.nombre && libre === false && <p className="ez-hint" aria-live="polite">{t.w.ocupadoPaso}</p>}
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
              <ul className="ez-usos">
                {t.w.correoUsos.map((u, i) => (
                  <li key={u.t}>
                    {i === 0 ? <LogIn aria-hidden="true" className="ez-usos__ico" /> : <Bell aria-hidden="true" className="ez-usos__ico" />}
                    <span><b>{u.t}</b>{u.d}</span>
                  </li>
                ))}
              </ul>
              <div className="ez-field">
                <label htmlFor="ez-wa" className="ez-label">{t.wa} <span className="ez-opt">{esPrueba ? t.c.waObligatorio : t.opcional}</span></label>
                <input id="ez-wa" type="tel" className="ez-input" value={whatsapp} onChange={(e) => { setWhatsapp(e.target.value); limpiar('whatsapp'); }}
                  autoComplete="tel" inputMode="tel" placeholder={t.waPh} aria-invalid={!!err.whatsapp} aria-describedby="e-wa" />
                <p id="e-wa" className={err.whatsapp ? 'ez-err' : 'ez-hint'}>{err.whatsapp ?? (esPrueba ? t.c.waHintPrueba : t.waHint)}</p>
              </div>
            </div>
          )}

          {paso === 4 && (
            <div className="ez-paso">
              <h1 className="ez-h1 ez-h1--q"><label htmlFor="ez-codigo">{t.c.h}</label></h1>
              <p className="ez-lede">{t.c.llegoA}<strong>{email}</strong>{t.c.llegoB}</p>
              <div className="ez-field">
                <label htmlFor="ez-codigo" className="ez-label">{t.c.label}</label>
                <input id="ez-codigo" className="ez-input ez-input--code" value={codigo}
                  onChange={(e) => { setCodigo(e.target.value.replace(/\D/g, '').slice(0, 8)); limpiar('codigo'); }}
                  inputMode="numeric" autoComplete="one-time-code" maxLength={8} pattern="[0-9]*" placeholder="00000000"
                  aria-invalid={!!err.codigo} aria-describedby="e-codigo" />
                <p id="e-codigo" className={err.codigo ? 'ez-err' : 'ez-hint'} aria-live="polite">{err.codigo ?? reenv ?? t.c.spam}</p>
              </div>
              <div className="ez-links">
                <button type="button" className="ez-link" onClick={reenviar} disabled={reenviando}>{t.c.reenviar}</button>
                <button type="button" className="ez-link" onClick={() => ir(3)}>{t.c.cambiar}</button>
              </div>
            </div>
          )}

          {paso === 5 && (
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
                <p id="e-pass" className={err.password ? 'ez-err' : 'ez-hint'}>{err.password ?? t.c.claveHint}</p>
                <ul className="ez-reglas" aria-live="polite">
                  {[/.{8,}/, /[A-Z]/, /[a-z]/, /\d/].map((re, i) => {
                    const ok = re.test(password);
                    return <li key={i} className={ok ? 'is-ok' : undefined}><span className={ok ? 'ez-ok' : 'ez-pend'} aria-hidden="true" />{t.c.reglas[i]}</li>;
                  })}
                </ul>
              </div>

              <h2 className="ez-h2">{t.w.revisa}</h2>
              <dl className="ez-revisa">
                <div><dt>{t.tuPlan}</dt><dd>{planTxt} · {esPrueba ? t.c.pruebaPrecio : precio(elegido)}</dd><button type="button" className="ez-link" onClick={() => ir(0)}>{t.w.editar}</button></div>
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
          {(paso === 1 || paso === 2) && <VistaPrevia slug={slug} libre={libre} t={t} className="ez-vp--movil" />}

          {aviso && <p className="ez-banner" role="alert">{aviso}</p>}
          {!aviso && cancelado && paso === 0 && <p className="ez-banner" role="status">{t.cancelado}</p>}
          {paso === 5 && (
            <p className="ez-fine ez-fine--pago">
              {esPrueba ? t.c.finoPrueba : t.finoPago[moneda]}{' '}
              {t.acepta}{' '}
              <a href="/terminos" target="_blank" rel="noopener">{t.terminos}</a> {t.y} <a href="/privacidad" target="_blank" rel="noopener">{t.privacidad}</a>.
            </p>
          )}
          {/* En el celular esta barra queda FIJA abajo (empezar.css): el botón
              del paso siempre a la vista, sin tener que bajar (Paul, 2026-09-28). */}
          <div className="ez-actions ez-actions--fija">
            {paso < 3 ? (
              <button type="submit" className="ez-btn ez-btn--primary">
                {t.w.continuar} <ArrowRight aria-hidden="true" className="ez-btn__arrow" />
              </button>
            ) : paso < 5 ? (
              <Enviar espera={t.momento} ocupado={verificando}>{t.w.continuar}</Enviar>
            ) : (
              <Enviar disabled={libre === false || !passwordOk(password) || (!esPrueba && !pagos)} espera={t.momento}>
                {esPrueba ? t.c.crearPrueba : t.pagar(precio(elegido))}
              </Enviar>
            )}
          </div>

        </form>
      </div>

      <aside className="ez-resumen" aria-label={t.tuPlan}>
        <p className="ez-resumen__label">{t.tuPlan}</p>
        <p className="ez-resumen__plan">{planTxt}</p>
        <p className="ez-resumen__precio">{esPrueba ? t.c.pruebaPrecio : precio(elegido)}</p>
        {esPrueba && <p className="ez-resumen__meta">{t.c.pruebaDet}</p>}
        {!esPrueba && elegido.eventos > 1 && (
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
          <VistaPrevia slug={slug} libre={libre} t={t} className="ez-vp--costado" />
        )}
      </aside>
    </main>
  );
}
