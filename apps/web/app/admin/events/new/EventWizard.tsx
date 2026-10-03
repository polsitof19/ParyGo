'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { BatteryFull, CheckCircle2, ChevronLeft, Lock, Plus, Signal, Trash2, Wifi, XCircle } from 'lucide-react';
import { pareceCaptura, medirImagen } from '@/lib/flyer';
import { useTextos } from '@/components/IdiomaPanel';
import { aCentavos, formatMoney, simbolo, sinDecimales, NOMBRE_MONEDA, type Moneda } from '@/lib/moneda';
import { paisDe } from '@/lib/metodoManual';
import { localAUtc, utcALocal, ciudadDe, type Zona } from '@/lib/zona';
import { createBrandEventAction, eventoSlugLibre, type FormState } from './actions';

// Crear evento como ASISTENTE (2026-10-01, Paul: "que haga preguntas"): una
// pregunta por pantalla, como /empezar. Todo vive en UN solo <form> y TODOS
// los pasos quedan montados (los que no se ven, con `hidden`): así cada campo
// viaja con su name de siempre —el server y el E2E leen los mismos— y el
// archivo del flyer no se pierde al ir y volver. Enter = "Continuar"; el
// formulario va al server recién en el paso 6.

const initial: FormState = { ok: false, message: null, fieldErrors: {} };
const TOTAL = 6;
type Paso = 1 | 2 | 3 | 4 | 5 | 6;

type Phase = { priceSoles: string; until: string };
type TT = { name: string; gratis: boolean; unlimited: boolean; capacity: string; phases: Phase[] };

// datetime-local → ISO en la hora de la marca, igual que el server con
// starts_at/ends_at. No depende de la zona horaria de la compu del promotor.
// Una hora que no existe por el cambio de horario da null (el server la rechaza).
const toISO = (local: string, zona: Zona): string | null => {
  if (!local) return null;
  return localAUtc(local, zona)?.toISOString() ?? null;
};
// Texto del campo de precio → centavos de la moneda de la marca (vacío o raro = 0).
const centsDe = (s: string, m: Moneda): number => { try { return s.trim() ? aCentavos(s, m) : 0; } catch { return 0; } };
const precioOk = (s: string, m: Moneda): boolean => { try { aCentavos(s, m); return s.trim() !== ''; } catch { return false; } };
// datetime-local + N horas reales, sin pasar por la zona de la compu: se suma
// sobre el instante UTC y se vuelve a la hora de la marca (22:00 + 6 h → 04:00).
const masHoras = (local: string, h: number, zona: Zona): string => {
  const iso = toISO(local, zona);
  return iso ? utcALocal(new Date(Date.parse(iso) + h * 3600 * 1000), zona) : '';
};

// Una fase de preventa termina AL FINAL del día que el promotor elige, no a la
// medianoche del día anterior ni a la hora que quedó en el input. Si pone
// "sube el 24 de setiembre" quiere decir que el 24 todavía se vende al precio
// viejo. Solo se completa lo que está en 00:00 (o vacío): una hora puesta a
// propósito se respeta. Todo en la hora de la marca.
const FIN_DEL_DIA = '23:59';
const alFinDelDia = (local: string): string => {
  if (!local) return local;
  const [fecha, hora] = local.split('T');
  if (!fecha) return local;
  if (!hora || hora === '00:00' || hora === '00:00:00') return `${fecha}T${FIN_DEL_DIA}`;
  return local;
};
// El link sale del nombre ("Density · Noche 04" → density-noche-04) mientras
// el organizador no lo toque; si lo edita a mano, se respeta.
const aSlug = (n: string): string => n
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  .slice(0, 42).replace(/-+$/g, '');
const SLUG_OK = /^[a-z0-9][a-z0-9-]{0,40}[a-z0-9]$/;

// "sáb 17 oct · 22:00" desde el datetime-local (la hora de la marca, sin convertir).
function cuando(local: string, loc: string): string {
  if (!local) return '';
  const [f, h] = local.split('T');
  const [y, m, d] = (f ?? '').split('-').map(Number);
  if (!y || !m || !d) return '';
  const dia = new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d))).replace(/[.,]/g, '');
  return `${dia} · ${(h ?? '').slice(0, 5)}`;
}
const mapsOk = (v: string) => { try { return new URL(v).protocol === 'https:'; } catch { return false; } };

// Campo de error del server → paso donde vive (como PASO_DE de /empezar).
const PASO_DE: Record<string, Paso> = {
  name: 1, slug: 1, starts_at: 2, ends_at: 2, venue_name: 3, venue_address: 3, venue_maps_url: 3,
  cover: 5, description: 6, min_age: 6, refund_policy: 6,
};
const FOCO: Partial<Record<Paso, string>> = { 1: 'name', 2: 'starts_at', 3: 'venue_name', 4: 'tt-0-name' };

export function EventWizard({ marcaSlug, marcaNombre, saldo, prueba, tope, vista, moneda, zona, primerEvento = false, children }: {
  marcaSlug: string;
  marcaNombre: string;
  saldo: number;
  // Evento de prueba gratis (sin saldo): no usa saldo.
  prueba: boolean;
  // Tope de entradas sumando todos los tipos (prueba o evento privado); null = sin tope.
  tope: number | null;
  // Variables CSS de la página de compra de la marca (su tema y su color).
  vista: Record<string, string>;
  // Moneda de las entradas de la marca (brands.moneda).
  moneda: Moneda;
  // Zona horaria de la marca (brands.zona_horaria).
  zona: Zona;
  // Primer evento de la marca: se le recuerda la moneda (después no cambia).
  primerEvento?: boolean;
  children?: React.ReactNode;
}) {
  const { t, l, loc } = useTextos();
  const toCents = (s: string) => centsDe(s, moneda);
  const soles = (cents: number) => formatMoney(cents, moneda);
  const sim = simbolo(moneda);
  const stepPrecio = sinDecimales(moneda) ? '1' : '0.5';
  const [state, action] = useFormState(createBrandEventAction, initial);
  const [paso, setPaso] = useState<Paso>(1);
  const [animar, setAnimar] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const slugManual = useRef(false);
  const [editSlug, setEditSlug] = useState(false);
  const [libre, setLibre] = useState<boolean | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const endsManual = useRef(false);
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [isFree, setIsFree] = useState(false);
  const capInicial = tope ? String(tope) : '100';
  const newTT = (cap = capInicial): TT => ({ name: '', gratis: false, unlimited: false, capacity: cap, phases: [{ priceSoles: '', until: '' }] });
  const [tts, setTts] = useState<TT[]>(() => [newTT()]);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverName, setCoverName] = useState<string | null>(null);
  const [avisoFlyer, setAvisoFlyer] = useState<string | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const confirmFreeRef = useRef<HTMLInputElement>(null);
  const pantallaRef = useRef<HTMLDivElement>(null);
  const tksRef = useRef<HTMLDivElement>(null);
  // "Ahora" en la hora de la marca para el min de los datetime-local, igual que
  // el server (no la zona horaria de la compu del promotor).
  const min = utcALocal(new Date(), zona);

  // ✓/✕ del link en vivo, contra los eventos de ESTA marca (debounce 450 ms).
  useEffect(() => {
    setLibre(null);
    if (!SLUG_OK.test(slug)) return;
    let vivo = true;
    const id = setTimeout(async () => {
      const ok = await eventoSlugLibre(slug).catch(() => null);
      if (vivo) setLibre(ok);
    }, 450);
    return () => { vivo = false; clearTimeout(id); };
  }, [slug]);

  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);

  // Respuesta del server: al paso del primer campo con error.
  useEffect(() => {
    if (state === initial) return;
    const fe = (state.fieldErrors ?? {}) as Record<string, string>;
    setErrs(fe);
    setAviso(state.message);
    const campo = Object.keys(fe).find((k) => PASO_DE[k]);
    if (campo) {
      if (campo === 'slug') setEditSlug(true);
      setPaso(PASO_DE[campo]!);
      setAnimar(true);
    }
  }, [state]);

  // Al cambiar de paso: arriba, el cursor en la pregunta y la vista previa
  // donde importa (las entradas en el paso 4).
  const montado = useRef(false);
  useEffect(() => {
    const pan = pantallaRef.current;
    if (pan) pan.scrollTop = paso === 4 && tksRef.current ? Math.max(0, tksRef.current.offsetTop - 24) : 0;
    if (!montado.current) { montado.current = true; return; }
    window.scrollTo({ top: 0 });
    const id = FOCO[paso];
    const el = (id && document.getElementById(id)) || document.getElementById(`cw-q-${paso}`);
    el?.focus({ preventScroll: true });
  }, [paso]);
  // En el paso 4, la vista previa sigue a las entradas a medida que se agregan.
  useEffect(() => {
    const pan = pantallaRef.current;
    if (paso === 4 && pan && tksRef.current) pan.scrollTop = Math.max(0, tksRef.current.offsetTop - 24);
  }, [paso, tts.length]);

  const ir = (p: Paso) => { setErrs({}); setAviso(null); setAnimar(true); setPaso(p); };
  const limpiar = (k: string) => setErrs((s) => { if (!(k in s)) return s; const r = { ...s }; delete r[k]; return r; });

  const totalEntradas = tts.reduce((n, tt) => n + (parseInt(tt.capacity || '0', 10) || 0), 0);

  function validar(p: Paso): Record<string, string> {
    const e: Record<string, string> = {};
    if (p === 1) {
      const n = name.trim();
      if (n.length < 2) e.name = t('Escribe el nombre del evento.', 'Type the event name.');
      else if (n.length > 120) e.name = t('Máximo 120 caracteres.', '120 characters max.');
      if (!SLUG_OK.test(slug)) e.slug = t('El link va con letras, números y guiones (mínimo 2).', 'The link uses letters, numbers and hyphens (2 minimum).');
      else if (libre === false) e.slug = t('Ya tienes un evento con ese link. Cámbialo.', 'You already have an event with that link. Change it.');
    }
    if (p === 2) {
      const s = toISO(startsAt, zona), f = toISO(endsAt, zona);
      if (!s) e.starts_at = t('Elige el día y la hora en que empieza.', 'Pick the day and time it starts.');
      else if (Date.parse(s) <= Date.now()) e.starts_at = t('Tiene que ser una fecha que todavía no pasó.', 'It has to be a date that has not passed yet.');
      if (!f) e.ends_at = t('Elige cuándo termina.', 'Pick when it ends.');
      else if (s && Date.parse(f) <= Date.parse(s)) e.ends_at = t('Tiene que terminar después de empezar.', 'It has to end after it starts.');
    }
    if (p === 3) {
      if (!venueName.trim()) e.venue_name = t('Escribe el nombre del lugar.', 'Type the name of the place.');
      if (mapsUrl.trim() && !mapsOk(mapsUrl.trim())) e.venue_maps_url = t('Pega el link completo, que empiece con https://', 'Paste the full link, starting with https://');
    }
    if (p === 4) {
      tts.forEach((tt, i) => {
        if (!tt.name.trim()) e[`tt-${i}-name`] = t('Ponle un nombre (General, VIP…).', 'Give it a name (General, VIP…).');
        if (!tt.gratis && !precioOk(tt.phases[0]?.priceSoles ?? '', moneda)) e[`tt-${i}-price`] = t('Pon el precio o marca "Gratis".', 'Set the price or check "Free".');
        if (!tt.unlimited && !((parseInt(tt.capacity || '0', 10) || 0) > 0)) e[`tt-${i}-cap`] = t('¿Cuántas hay? Pon un número.', 'How many are there? Type a number.');
        if (tt.unlimited && (tt.gratis || toCents(tt.phases[0]?.priceSoles ?? '') === 0)) e[`tt-${i}-cap`] = t('Una entrada gratis no puede ser sin límite. Pon cuántas hay.', 'A free ticket cannot be unlimited. Set how many there are.');
        if (!tt.gratis && tt.phases.length > 1) {
          // Una fecha "hasta" que no existe en la zona (salto del horario de verano)
          // daría una fase abierta sin aviso: se trata como vacía.
          const malo = tt.phases.some((ph, j) => (j > 0 && ph.priceSoles === '') || (j < tt.phases.length - 1 && (!ph.until || !toISO(alFinDelDia(ph.until), zona))));
          if (malo) e[`tt-${i}-ph`] = t('Completa el precio y la fecha de cada subida.', 'Fill in the price and date of each increase.');
        }
      });
      if (tope && totalEntradas > tope) e.tope = t(`Son ${totalEntradas} entradas y el máximo es ${tope}, sumando todos los tipos.`, `That's ${totalEntradas} tickets and the maximum is ${tope}, across all types.`);
    }
    return e;
  }

  function mostrar(e: Record<string, string>) {
    setErrs(e);
    // El cursor y la vista al primer campo con error (en el paso 4 puede
    // estar lejos de arriba). "-ph" = las subidas: al precio de la primera.
    const primero = Object.keys(e)[0];
    const id = primero === 'tope' ? 'tt-0-cap' : primero;
    const el = id ? document.getElementById(id) ?? document.getElementById(`${id}-1`) : null;
    if (!el) { window.scrollTo({ top: 0 }); return; }
    el.scrollIntoView({ block: 'center' });
    el.focus({ preventScroll: true });
  }

  function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    if (paso < TOTAL) {
      ev.preventDefault();
      const e = validar(paso);
      if (Object.keys(e).length) { if (e.slug) setEditSlug(true); mostrar(e); return; }
      ir((paso + 1) as Paso);
      return;
    }
    // Paso 6: se revisa todo de nuevo (pudo editar un paso desde la revisión).
    for (const p of [1, 2, 3, 4] as Paso[]) {
      const e = validar(p);
      if (Object.keys(e).length) { ev.preventDefault(); ir(p); setTimeout(() => mostrar(e), 0); return; }
    }
    // Entradas en S/ 0: en un evento GRATIS es lo esperado y no se pregunta;
    // en un evento pago son cortesías y se confirma (el server exige
    // confirm_free=1 y vuelve a validar todo).
    if (confirmFreeRef.current) confirmFreeRef.current.value = '';
    const free = tts.filter((tt) => tt.gratis || tt.phases.some((ph) => toCents(ph.priceSoles) === 0));
    if (free.length) {
      if (!isFree) {
        const names = free.map((tt) => `"${tt.name || t('sin nombre', 'unnamed')}"`).join(', ');
        const ok = window.confirm(t(
          `${names} cuesta ${sim} 0. Los tipos gratis NO se venden en tu página: se emiten desde "Cortesías" y descuentan del aforo. ¿Confirmas?`,
          `${names} costs ${sim} 0. Free ticket types are NOT sold on your page: they are issued from "Complimentary tickets" and count against capacity. Confirm?`
        ));
        if (!ok) { ev.preventDefault(); return; }
      }
      if (confirmFreeRef.current) confirmFreeRef.current.value = '1';
    }
    setAviso(null);
  }

  async function onCover(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setCoverPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : null; });
    setCoverName(f?.name ?? null);
    limpiar('cover');
    // Aviso de captura de pantalla. NO bloquea: solo lo dice.
    setAvisoFlyer(null);
    if (f) {
      const { width, height } = await medirImagen(f);
      const v = pareceCaptura(width, height, l);
      if (v.esCaptura) setAvisoFlyer(v.motivo);
    }
  }
  function sinFlyer() {
    if (coverRef.current) coverRef.current.value = '';
    setCoverPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setCoverName(null);
    setAvisoFlyer(null);
  }

  // Mismo JSON que el builder de antes: el server y la fase B del E2E lo leen.
  const serialized = tts.map((tt, i) => {
    const fases = tt.gratis ? [{ priceSoles: '0', until: '' }] : tt.phases;
    const last = fases.length - 1;
    // El 23:59 también se aplica acá y no solo en el onBlur: si el promotor
    // escribe la fecha y sigue sin salir del campo, el onBlur no corre.
    const phases = fases.map((ph, j) => ({
      price_cents: toCents(ph.priceSoles),
      starts_at: j === 0 ? null : toISO(alFinDelDia(fases[j - 1]?.until ?? ''), zona),
      ends_at: j === last ? null : toISO(alFinDelDia(ph.until), zona),
      sort_order: j + 1,
    }));
    return {
      name: tt.name.trim(),
      description: '',
      price_cents: phases[0]?.price_cents ?? 0,
      capacity: tt.unlimited ? 0 : parseInt(tt.capacity || '0', 10) || 0,
      is_unlimited: tt.unlimited,
      sort_order: i,
      phases,
    };
  });

  const patchTT = (i: number, p: Partial<TT>) => setTts((s) => s.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const patchPhase = (i: number, j: number, p: Partial<Phase>) =>
    setTts((s) => s.map((x, k) => (k === i ? { ...x, phases: x.phases.map((ph, m) => (m === j ? { ...ph, ...p } : ph)) } : x)));

  const link = `${marcaSlug}.parygo.com/${slug || t('tu-evento', 'your-event')}`;
  const err = (k: string) => errs[k] ? <p className="s-err" id={`e-${k}`}>{errs[k]}</p> : null;
  const inv = (k: string) => ({ 'aria-invalid': !!errs[k] || undefined, 'aria-describedby': errs[k] ? `e-${k}` : undefined });

  // Lo que el comprador ve: un S/ 0 de un evento PAGO es cortesía y no se
  // ofrece en la página (lib/publicTicketGuard.ts).
  const publicas = serialized.filter((x, i) => tts[i]!.name.trim() && (x.price_cents > 0 || isFree));
  const desde = publicas.length ? Math.min(...publicas.map((x) => x.price_cents)) : null;
  const resumenEntradas = tts.filter((x) => x.name.trim()).map((tt) => {
    const precio = tt.gratis ? t('Gratis', 'Free') : soles(toCents(tt.phases[0]?.priceSoles ?? ''));
    const cuantas = tt.unlimited ? t('sin límite', 'unlimited') : t(`${tt.capacity} entradas`, `${tt.capacity} tickets`);
    return `${tt.name.trim()} · ${precio} · ${cuantas}`;
  });

  const pregunta = (p: Paso, texto: string, sub?: React.ReactNode) => (
    <>
      <h2 className="cw-q" id={`cw-q-${p}`} tabIndex={-1}>{texto}</h2>
      {sub && <p className="cw-sub">{sub}</p>}
    </>
  );

  return (
    <div className="cw">
      <div className="cw-col">
        {children}
        <div className="cw-top">
          {paso > 1
            ? <button type="button" className="cw-atras" onClick={() => ir((paso - 1) as Paso)}><ChevronLeft aria-hidden="true" /> {t('Atrás', 'Back')}</button>
            : <span />}
          <span className="cw-n">{t(`Paso ${paso} de ${TOTAL}`, `Step ${paso} of ${TOTAL}`)}</span>
        </div>
        <div className="cw-barra" aria-hidden="true" style={{ ['--p' as string]: paso / TOTAL }}><span /></div>

        <form action={action} onSubmit={onSubmit} noValidate className={animar ? 'cw-form cw--anim' : 'cw-form'}>
          <input type="hidden" name="ticket_types_json" value={JSON.stringify(serialized)} />
          <input type="hidden" name="confirm_free" ref={confirmFreeRef} defaultValue="" />

          {/* 1 · Nombre y link */}
          <div className="cw-paso" hidden={paso !== 1}>
            <h2 className="cw-q" id="cw-q-1" tabIndex={-1}><label htmlFor="name">{t('¿Cómo se llama tu evento?', "What's your event called?")}</label></h2>
            <div className="s-field">
              <input
                id="name" name="name" className="s-input" placeholder="Density · Noche 04" maxLength={120} autoComplete="off" value={name} {...inv('name')}
                onChange={(e) => { setName(e.target.value); limpiar('name'); if (!slugManual.current) { setSlug(aSlug(e.target.value)); limpiar('slug'); } }}
              />
              {err('name')}
            </div>
            <div className="cw-link" aria-live="polite">
              <Lock aria-hidden="true" className="cw-link__lock" />
              <span className="cw-link__url">{marcaSlug}.parygo.com/<b>{slug || t('tu-evento', 'your-event')}</b></span>
              {libre === true && <span className="cw-link__st"><CheckCircle2 aria-hidden="true" className="cw-ok" />{t('Libre', 'Available')}</span>}
              {libre === false && <span className="cw-link__st"><XCircle aria-hidden="true" className="cw-no" />{t('En uso', 'Taken')}</span>}
            </div>
            <p className="s-hint">{t('Este es el link de tu evento: lo compartes por WhatsApp o Instagram.', 'This is your event link: share it on WhatsApp or Instagram.')}</p>
            {!editSlug && (
              <button type="button" className="s-btn s-btn--ghost s-btn--sm" onClick={() => { setEditSlug(true); setTimeout(() => document.getElementById('slug')?.focus(), 0); }}>
                {t('Cambiar link', 'Change link')}
              </button>
            )}
            <div className="s-field" hidden={!editSlug}>
              <label htmlFor="slug" className="s-label">{t('Link del evento', 'Event link')}</label>
              <div className="cw-affix">
                <span className="cw-affix__pre" aria-hidden="true">{marcaSlug}.parygo.com/</span>
                <input
                  id="slug" name="slug" className="s-input" value={slug} maxLength={42} autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="url" {...inv('slug')}
                  onChange={(e) => { slugManual.current = true; setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); limpiar('slug'); }}
                />
              </div>
              {err('slug') ?? <p className="s-hint">{t('Letras, números y guiones.', 'Letters, numbers and hyphens.')}</p>}
            </div>
          </div>

          {/* 2 · Cuándo */}
          <div className="cw-paso" hidden={paso !== 2}>
            {pregunta(2, t('¿Cuándo es?', 'When is it?'), zona === 'America/Lima' ? t('Hora de Lima.', 'Lima time.') : t(`Hora de ${ciudadDe(zona)}.`, `${ciudadDe(zona)} time.`))}
            <div className="s-form-grid cw-grid">
              <div className="s-field">
                <label htmlFor="starts_at" className="s-label">{t('Empieza', 'Starts')}</label>
                <input
                  id="starts_at" name="starts_at" type="datetime-local" min={min} className="s-input" value={startsAt} {...inv('starts_at')}
                  onChange={(e) => { setStartsAt(e.target.value); limpiar('starts_at'); if (!endsManual.current) { setEndsAt(masHoras(e.target.value, 6, zona)); limpiar('ends_at'); } }}
                />
                {err('starts_at')}
              </div>
              <div className="s-field">
                <label htmlFor="ends_at" className="s-label">{t('Termina', 'Ends')}</label>
                <input
                  id="ends_at" name="ends_at" type="datetime-local" min={startsAt || min} className="s-input" value={endsAt} {...inv('ends_at')}
                  onChange={(e) => { endsManual.current = true; setEndsAt(e.target.value); limpiar('ends_at'); }}
                />
                {err('ends_at') ?? <p className="s-hint">{t('Lo ponemos 6 horas después. Cámbialo si hace falta.', "We set it 6 hours later. Change it if needed.")}</p>}
              </div>
            </div>
          </div>

          {/* 3 · Dónde */}
          <div className="cw-paso" hidden={paso !== 3}>
            {pregunta(3, t('¿Dónde es?', 'Where is it?'))}
            <div className="s-field">
              <label htmlFor="venue_name" className="s-label">{t('Nombre del lugar', 'Name of the place')}</label>
              <input id="venue_name" name="venue_name" className="s-input" placeholder="Club Foso" maxLength={120} value={venueName} {...inv('venue_name')}
                onChange={(e) => { setVenueName(e.target.value); limpiar('venue_name'); }} />
              {err('venue_name')}
            </div>
            <div className="s-field">
              <label htmlFor="venue_address" className="s-label">{t('Dirección', 'Address')} <span className="cw-opt">{t('(opcional)', '(optional)')}</span></label>
              <input id="venue_address" name="venue_address" className="s-input" placeholder="Av. Foso 123, Miraflores" maxLength={200} value={venueAddress}
                onChange={(e) => setVenueAddress(e.target.value)} />
            </div>
            <div className="s-field">
              <label htmlFor="venue_maps_url" className="s-label">{t('Link de Google Maps', 'Google Maps link')} <span className="cw-opt">{t('(opcional)', '(optional)')}</span></label>
              <input id="venue_maps_url" name="venue_maps_url" type="url" inputMode="url" className="s-input" placeholder="https://maps.app.goo.gl/…" maxLength={500} value={mapsUrl} {...inv('venue_maps_url')}
                onChange={(e) => { setMapsUrl(e.target.value.trim()); limpiar('venue_maps_url'); }} />
              {err('venue_maps_url') ?? <p className="s-hint">{t('En Google Maps: Compartir → Copiar enlace. Tu comprador llega con un toque.', 'In Google Maps: Share → Copy link. Your buyer gets there in one tap.')}</p>}
            </div>
          </div>

          {/* 4 · Entradas (opcional) */}
          <div className="cw-paso" hidden={paso !== 4}>
            {pregunta(4, t('Tus entradas', 'Your tickets'), tope
              ? t(`Precio y cuántas hay. Hasta ${tope} en total. Puedes saltarlo y agregarlas después.`, `Price and how many. Up to ${tope} in total. You can skip this and add them later.`)
              : t('Precio y cuántas hay. Puedes saltarlo y agregarlas después.', 'Price and how many. You can skip this and add them later.'))}
            {primerEvento && (() => {
              const p = paisDe(moneda, zona);
              return (
                <p className="s-hint cw-hint-top">
                  {t(`Tu marca es de ${p.nombre}: tus precios van en ${NOMBRE_MONEDA[moneda].es}. ¿Es de otro país? Cámbialo en `, `Your brand is from ${p.name}: your prices are in ${NOMBRE_MONEDA[moneda].en}. Another country? Change it in `)}
                  <a href="/admin/settings#cobro">{t('Mi marca', 'My brand')}</a>
                  {t(' antes de crear tu primer evento: después ya no se puede.', ' before creating your first event: it cannot be changed afterwards.')}
                </p>
              );
            })()}
            <label className="s-check">
              <input type="checkbox" name="is_free" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} />
              {t('Evento gratis (entrada libre con registro)', 'Free event (open entry with registration)')}
            </label>
            {isFree && (
              <p className="s-hint cw-hint-top">{t('Tus entradas gratis se ofrecen al público y se entregan al instante, sin pago. Lo puedes cambiar después, mientras no haya ventas.', 'Your free tickets are offered to the public and issued instantly, without payment. You can change this later, as long as there are no sales.')}</p>
            )}

            {tts.map((tt, i) => (
              <div key={i} className="cw-tt">
                <div className="cw-tt__head">
                  <div className="cw-tt__name">
                    <label htmlFor={`tt-${i}-name`} className="s-label">{t('Nombre de la entrada', 'Ticket name')}</label>
                    <input id={`tt-${i}-name`} className="s-input" placeholder="General / VIP" maxLength={80} value={tt.name} {...inv(`tt-${i}-name`)}
                      onChange={(e) => { patchTT(i, { name: e.target.value }); limpiar(`tt-${i}-name`); }} />
                  </div>
                  <button type="button" className="s-btn s-btn--ghost cw-quitar" onClick={() => { setTts((s) => s.filter((_, k) => k !== i)); setErrs({}); }} aria-label={t(`Quitar ${tt.name || 'esta entrada'}`, `Remove ${tt.name || 'this ticket'}`)}>
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
                {err(`tt-${i}-name`)}
                <div className="s-form-grid cw-grid">
                  <div className="s-field">
                    <label htmlFor={`tt-${i}-price`} className="s-label">{t(`Precio (${sim})`, `Price (${sim})`)}</label>
                    <input id={`tt-${i}-price`} type="number" inputMode="decimal" min={0} step={stepPrecio} className="s-input" placeholder="30"
                      value={tt.gratis ? '' : tt.phases[0]?.priceSoles ?? ''} disabled={tt.gratis} {...inv(`tt-${i}-price`)}
                      onChange={(e) => { patchPhase(i, 0, { priceSoles: e.target.value }); limpiar(`tt-${i}-price`); }} />
                    <label className="s-check">
                      <input type="checkbox" checked={tt.gratis} onChange={(e) => { patchTT(i, { gratis: e.target.checked }); limpiar(`tt-${i}-price`); }} />
                      {t('Gratis', 'Free')}
                    </label>
                    {err(`tt-${i}-price`)}
                    {tt.gratis && !isFree && <p className="s-hint">{t('En un evento que cobra, una entrada gratis es cortesía: no se vende en tu página, se entrega desde Cortesías.', 'In a paid event, a free ticket is complimentary: it is not sold on your page, you issue it from Complimentary tickets.')}</p>}
                  </div>
                  <div className="s-field">
                    <label htmlFor={`tt-${i}-cap`} className="s-label">{t('Cuántas hay', 'How many')}</label>
                    <input id={`tt-${i}-cap`} type="number" inputMode="numeric" min={1} className="s-input" value={tt.unlimited ? '' : tt.capacity} disabled={tt.unlimited} {...inv(`tt-${i}-cap`)}
                      onChange={(e) => { patchTT(i, { capacity: e.target.value }); limpiar(`tt-${i}-cap`); limpiar('tope'); }} />
                    {!tope && (
                      <label className="s-check">
                        <input type="checkbox" checked={tt.unlimited} onChange={(e) => { patchTT(i, { unlimited: e.target.checked }); limpiar(`tt-${i}-cap`); }} />
                        {t('Sin límite', 'Unlimited')}
                      </label>
                    )}
                    {err(`tt-${i}-cap`)}
                  </div>
                </div>

                {!tt.gratis && (
                  <details className="s-details cw-pre">
                    <summary>{t('Preventa: ¿el precio sube en alguna fecha?', 'Presale: does the price go up on a date?')}</summary>
                    {tt.phases.length === 1 ? (
                      <p className="s-hint">{t('Si vendes más barato al principio, agrega cuándo sube y a cuánto.', 'If you sell cheaper at first, add when it goes up and to how much.')}</p>
                    ) : (
                      tt.phases.map((ph, j) => (
                        <div key={j} className="cw-fase">
                          {j === 0 ? (
                            <p className="cw-fase__t">{t(`${soles(toCents(ph.priceSoles))} hasta el`, `${soles(toCents(ph.priceSoles))} until`)}</p>
                          ) : (
                            <div className="cw-fase__precio">
                              <label htmlFor={`tt-${i}-ph-${j}`} className="s-label">{t(`Después sube a (${sim})`, `Then goes up to (${sim})`)}</label>
                              <input id={`tt-${i}-ph-${j}`} type="number" inputMode="decimal" min={0} step={stepPrecio} className="s-input" placeholder="40" value={ph.priceSoles}
                                onChange={(e) => { patchPhase(i, j, { priceSoles: e.target.value }); limpiar(`tt-${i}-ph`); }} />
                            </div>
                          )}
                          {j < tt.phases.length - 1 ? (
                            <div className="cw-fase__fecha">
                              {j > 0 && <label htmlFor={`tt-${i}-hasta-${j}`} className="s-label">{t('hasta el', 'until')}</label>}
                              <input id={`tt-${i}-hasta-${j}`} type="datetime-local" min={min} className="s-input" value={ph.until}
                                aria-label={j === 0 ? t('Este precio vale hasta', 'This price is valid until') : undefined}
                                onChange={(e) => { patchPhase(i, j, { until: e.target.value }); limpiar(`tt-${i}-ph`); }}
                                // Al salir del campo se completa 23:59 si quedó en 00:00 (sugerido, no impuesto).
                                onBlur={(e) => patchPhase(i, j, { until: alFinDelDia(e.target.value) })} />
                            </div>
                          ) : (
                            <p className="s-hint">{t('Vale hasta el día del evento.', 'Valid until the event day.')}</p>
                          )}
                          {j > 0 && (
                            <button type="button" className="s-btn s-btn--ghost s-btn--sm" onClick={() => patchTT(i, { phases: tt.phases.filter((_, m) => m !== j) })}>
                              {t('Quitar esta subida', 'Remove this increase')}
                            </button>
                          )}
                        </div>
                      ))
                    )}
                    {err(`tt-${i}-ph`)}
                    <button type="button" className="s-btn s-btn--soft s-btn--sm" onClick={() => patchTT(i, { phases: [...tt.phases, { priceSoles: '', until: '' }] })}>
                      <Plus aria-hidden="true" className="h-4 w-4" /> {tt.phases.length === 1 ? t('Agregar una subida de precio', 'Add a price increase') : t('Agregar otra subida', 'Add another increase')}
                    </button>
                  </details>
                )}
              </div>
            ))}

            <div className="cw-mas">
              <button type="button" className="s-btn s-btn--soft" onClick={() => setTts((s) => [...s, newTT(tope ? String(Math.max(1, tope - totalEntradas)) : capInicial)])}>
                <Plus aria-hidden="true" className="h-4 w-4" /> {tts.length ? t('Agregar otro tipo', 'Add another type') : t('Agregar tipo de entrada', 'Add a ticket type')}
              </button>
              {tope && <p className="cw-cuenta" aria-live="polite">{t(`Vas ${totalEntradas} de ${tope}`, `${totalEntradas} of ${tope} so far`)}</p>}
            </div>
            {err('tope')}
            {!tts.length && <p className="s-hint">{t('Sin entradas el evento se crea igual, pero no se puede publicar hasta que agregues una en Entradas.', "Without tickets the event is still created, but you can't publish it until you add one in Tickets.")}</p>}
          </div>

          {/* 5 · Flyer (opcional) */}
          <div className="cw-paso" hidden={paso !== 5}>
            {pregunta(5, t('Sube tu flyer', 'Upload your flyer'), t('Opcional. PNG, JPG o WEBP · vertical o cuadrado · máx 10 MB.', 'Optional. PNG, JPG or WEBP · vertical or square · max 10 MB.'))}
            <div className="cw-flyer">
              {coverPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPreview} alt="" className="cw-flyer__img" />
              )}
              <div className="cw-flyer__txt">
                <div className="s-file">
                  <input ref={coverRef} id="cover" name="cover" type="file" accept="image/png,image/jpeg,image/webp" onChange={onCover} className="s-file__input" />
                  <label htmlFor="cover" className="s-btn s-btn--soft s-file__btn">
                    {coverName ? t('Cambiar flyer', 'Change flyer') : t('Elegir flyer', 'Choose flyer')}
                  </label>
                  <span className="s-file__name">{coverName ?? t('Ninguno elegido', 'None chosen')}</span>
                </div>
                {err('cover')}
                <p className="s-hint">
                  {t('Sube el ', 'Upload the ')}<strong>{t('archivo original', 'original file')}</strong>{t(' del flyer, no una captura de pantalla: la captura trae la barra del teléfono y sale borrosa en grande.', ' of the flyer, not a screenshot: a screenshot includes the phone status bar and looks blurry when enlarged.')}
                </p>
                {avisoFlyer && (
                  <p className="s-err">
                    {t('Esto parece una captura de pantalla. ', 'This looks like a screenshot. ')}{avisoFlyer} {t('Puedes usarla igual, pero si tienes el archivo original va a verse mucho mejor.', 'You can use it anyway, but if you have the original file it will look much better.')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 6 · Revisión */}
          <div className="cw-paso" hidden={paso !== 6}>
            {pregunta(6, t('Revisa tu evento', 'Review your event'), t('Se crea en borrador: lo publicas cuando esté listo.', "It's created as a draft: you publish it when ready."))}
            <dl className="cw-rev">
              <Fila dt={t('Nombre', 'Name')} dd={name.trim()} onEdit={() => ir(1)} editar={t('Editar', 'Edit')} />
              <Fila dt={t('Link', 'Link')} dd={link} onEdit={() => { setEditSlug(true); ir(1); }} editar={t('Editar', 'Edit')} />
              <Fila dt={t('Cuándo', 'When')} dd={startsAt ? `${cuando(startsAt, loc)} → ${cuando(endsAt, loc)}` : ''} onEdit={() => ir(2)} editar={t('Editar', 'Edit')} />
              <Fila dt={t('Dónde', 'Where')} dd={[venueName.trim(), venueAddress.trim()].filter(Boolean).join(' · ') + (mapsUrl ? t(' · con mapa', ' · with map') : '')} onEdit={() => ir(3)} editar={t('Editar', 'Edit')} />
              <Fila
                dt={t('Entradas', 'Tickets')}
                dd={resumenEntradas.length
                  ? <>{isFree && <span className="cw-rev__l">{t('Evento gratis', 'Free event')}</span>}{resumenEntradas.map((x) => <span key={x} className="cw-rev__l">{x}</span>)}</>
                  : t('Ninguna por ahora. Las agregas después en Entradas.', 'None for now. Add them later in Tickets.')}
                onEdit={() => ir(4)} editar={t('Editar', 'Edit')}
              />
              <Fila dt={t('Flyer', 'Flyer')} dd={coverName ?? t('Sin flyer por ahora', 'No flyer for now')} onEdit={() => ir(5)} editar={t('Editar', 'Edit')} />
            </dl>

            <details className="s-details cw-mas-det">
              <summary>{t('Más detalles (opcional)', 'More details (optional)')}</summary>
              <div className="s-field">
                <label htmlFor="description" className="s-label">{t('Descripción corta', 'Short description')}</label>
                <textarea id="description" name="description" rows={2} maxLength={2000} className="s-input" placeholder="DJ Headliner · Club Foso · Lima" />
                {err('description')}
              </div>
              <div className="s-field">
                <label htmlFor="min_age" className="s-label">{t('Edad mínima', 'Minimum age')}</label>
                <input id="min_age" name="min_age" type="number" inputMode="numeric" min={0} max={99} defaultValue={18} className="s-input cw-corto" />
                {err('min_age')}
              </div>
              <div className="s-field">
                <label htmlFor="refund_policy" className="s-label">{t('Política de devolución', 'Refund policy')}</label>
                <textarea id="refund_policy" name="refund_policy" rows={2} maxLength={500} className="s-input" defaultValue="Sin devolución post-pago salvo cancelación del evento." />
                {err('refund_policy')}
              </div>
            </details>
          </div>

          {aviso && <p className="s-banner s-banner--err cw-aviso" role="alert">{aviso}</p>}
          {paso === 6 && (
            <p className="cw-saldo">
              {prueba
                ? t(`Es tu evento de prueba: hasta ${tope ?? ''} entradas en total.`, `This is your trial event: up to ${tope ?? ''} tickets in total.`)
                : t(`Usa 1 de tu saldo (te quedan ${Math.max(0, saldo - 1)}).`, `Uses 1 from your balance (${Math.max(0, saldo - 1)} left).`)}
            </p>
          )}

          {/* En el celular esta barra queda FIJA abajo (admin.css): el botón
              del paso siempre a la vista, sin bajar (regla de Paul, 2026-09-28). */}
          <div className="cw-acc">
            {paso === 6
              ? <Crear label={t('Crear evento', 'Create event')} espera={t('Creando…', 'Creating…')} />
              : <button type="submit" className="s-btn s-btn--primary s-btn--lg">{t('Continuar', 'Continue')}</button>}
            {paso === 4 && (
              <button type="button" className="s-btn s-btn--ghost" onClick={() => { setTts([]); ir(5); }}>{t('Saltar por ahora', 'Skip for now')}</button>
            )}
            {paso === 5 && (
              <button type="button" className="s-btn s-btn--ghost" onClick={() => { sinFlyer(); ir(6); }}>{t('Saltar por ahora', 'Skip for now')}</button>
            )}
          </div>
        </form>
      </div>

      {/* Compu (≥1280): la página de compra EN VIVO dentro de un teléfono. Es
          un dibujo (aria-hidden): los datos ya están en el formulario. Lo de
          adentro va en español siempre: es lo que ve el comprador. */}
      <aside className="cw-vista" aria-hidden="true">
        <p className="cw-vista__t">{t('Así lo ve tu comprador', 'How your buyer sees it')}</p>
        <div className="cw-cel">
          <div className="cw-cel__pantalla" style={vista as React.CSSProperties}>
            <div className="cw-cel__estado">
              <span>22:41</span>
              <span className="cw-cel__isla" />
              <span className="cw-cel__ico"><Signal /><Wifi /><BatteryFull /></span>
            </div>
            <div className="cw-cel__barra">
              <Lock />
              <span className="cw-cel__url"><b>{marcaSlug}.parygo.com</b>/{slug || 'tu-evento'}</span>
            </div>
            <div className="cw-cel__pag" ref={pantallaRef}>
              <div className="cw-pv__head">{marcaNombre}</div>
              <div className="cw-pv__fly">
                {coverPreview
                  ? <>
                      <span className="cw-pv__blur" style={{ backgroundImage: `url(${coverPreview})` }} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={coverPreview} alt="" />
                    </>
                  : <span className="cw-pv__ph">Tu flyer</span>}
              </div>
              <p className="cw-pv__kicker">{startsAt ? cuando(startsAt, 'es-PE') : <span className="cw-pv__ph">Fecha y hora</span>}</p>
              <p className="cw-pv__name">{name.trim() || <span className="cw-pv__ph">Tu evento</span>}</p>
              <p className="cw-pv__linea"><span className="cw-pv__dot" />{venueName.trim() || <span className="cw-pv__ph">Lugar</span>}</p>
              <div className="cw-pv__tks" ref={tksRef}>
                <p className="cw-pv__h">Elige tus entradas</p>
                <p className="cw-pv__hint">Toca <span className="cw-pv__plus">+</span> en la que quieras.</p>
                {publicas.length ? publicas.map((x, k) => (
                  <div key={k} className="cw-pv__tk">
                    <span className="cw-pv__tkt"><b>{x.name}</b><span>{x.price_cents ? soles(x.price_cents) : 'Gratis'}</span></span>
                    <span className="cw-pv__menos">−</span>
                    <span className="cw-pv__qty">0</span>
                    <span className="cw-pv__mas">+</span>
                  </div>
                )) : <div className="cw-pv__tkph">Aquí van a aparecer tus entradas</div>}
              </div>
            </div>
            <div className="cw-pv__cta">
              <span className="cw-pv__desde"><span>Desde</span><b>{desde === null ? <span className="cw-pv__ph">Tu precio</span> : desde ? soles(desde) : 'Gratis'}</b></span>
              <span className="cw-pv__btn">Toca + para elegir</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Fila({ dt, dd, onEdit, editar }: { dt: string; dd: React.ReactNode; onEdit: () => void; editar: string }) {
  return (
    <div>
      <dt>{dt}</dt>
      <dd>{dd || '—'}</dd>
      <button type="button" className="s-btn s-btn--ghost s-btn--sm" onClick={onEdit} aria-label={`${editar}: ${dt}`}>{editar}</button>
    </div>
  );
}

function Crear({ label, espera }: { label: string; espera: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="s-btn s-btn--primary s-btn--lg" disabled={pending} aria-busy={pending}>
      {pending ? espera : label}
    </button>
  );
}
