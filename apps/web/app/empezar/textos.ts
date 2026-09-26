// Textos del alta (/empezar y /empezar/listo) en español e inglés. Los usan
// la página, las acciones de servidor (mensajes de error) y los correos.
// Registro formal en tuteo, como la landing.
export type Lang = 'es' | 'en';
export type Moneda = 'PEN' | 'USD';

export const esLang = (v: unknown): Lang => (v === 'en' ? 'en' : 'es');
export const esMoneda = (v: unknown): Moneda | null => (v === 'PEN' || v === 'USD' ? v : null);

export function formatoPrecio(centavos: number, moneda: Moneda): string {
  const n = (centavos / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return moneda === 'PEN' ? `S/${n}` : `US$${n}`;
}

const es = {
  h1a: 'Tu marca, lista para ', h1b: 'vender', h1c: '.',
  lede1: 'Elige tu paquete, completa tus datos y en pocos minutos tendrás tu página', lede2: 'con entradas, cobro directo y control de acceso.',
  elige: 'Elige tu paquete',
  evento: 'evento', eventos: 'eventos', puntual: 'Para un evento puntual.', porEvento: 'por evento',
  masElegido: 'El más elegido',
  noDisponible: 'Este medio de pago estará disponible muy pronto.',
  monedaLabel: 'Moneda de pago',
  monedas: { PEN: 'Soles · Mercado Pago', USD: 'Dólares · PayPal' },
  incluido: 'Todos los paquetes incluyen tu página con tu logo, entradas con QR, cobro directo a tu cuenta, escáner de acceso y panel de gestión.', sinComision: 'Sin comisión por entrada.',
  tuMarca: 'Tu marca',
  nombre: 'Nombre de tu marca', nombrePh: 'Ej. Noches del Sur',
  link: 'Tu enlace', linkPh: 'tumarca', linkHint: 'Es la dirección de tu página. Solo minúsculas, números y guiones.', linkLibre: 'Disponible', linkTomado: 'Ese enlace ya pertenece a otra marca. Prueba con otro.',
  correo: 'Tu correo', correoPh: 'tu@correo.com', correoHint: 'Recibirás aquí la confirmación del pago y los avisos de tus ventas.',
  pass: 'Contraseña', passHint: 'Mínimo 8 caracteres. La usarás para ingresar a tu panel.', passVer: 'Ver contraseña', passOcultar: 'Ocultar contraseña',
  wa: 'WhatsApp', opcional: '(opcional)', waPh: '+51 999 999 999', waHint: 'Con código de país, para que tus compradores puedan escribirte.',
  pagar: (p: string) => `Pagar ${p}`, momento: 'Un momento…',
  finoPago: { PEN: 'Pago seguro con tarjeta a través de Mercado Pago. Al finalizar ingresarás directamente a tu panel.', USD: 'Pago seguro en dólares con PayPal, con tu cuenta o con tarjeta. Al finalizar ingresarás directamente a tu panel.' },
  acepta: 'Al continuar aceptas los', terminos: 'Términos', y: 'y la', privacidad: 'Política de privacidad',
  cancelado: 'El pago no se completó y no se realizó ningún cargo. Puedes intentarlo nuevamente cuando quieras.',
  tuPlan: 'Tu plan', pagoUnico: 'pago único',
  resumen: (n: number) => [`${n} ${n === 1 ? 'evento' : 'eventos'} para crear cuando quieras`, 'Cobro directo a tu cuenta', 'Entradas con QR y escáner de acceso', 'Sin comisión por entrada'],
  // Mensajes del servidor
  m: {
    revisa: 'Revisa los campos marcados.',
    pronto: 'Este medio de pago estará disponible muy pronto. Mientras tanto, puedes pagar en la otra moneda.',
    muchos: 'Realizaste varios intentos seguidos. Espera unos minutos e inténtalo nuevamente.',
    cuenta: 'Ese correo ya tiene una cuenta en ParyGo. Ingresa con tu correo y contraseña; desde tu panel puedes adquirir eventos.',
    cuentaCampo: 'Ya tiene una cuenta.',
    tomado: 'Ese enlace ya pertenece a otra marca.', tomadoCampo: 'Ya está en uso. Prueba con otro.',
    noPago: 'No pudimos preparar tu pago. Inténtalo nuevamente en un momento.',
    pagoEsperando: 'Ya tienes un pago aprobado pendiente. Revisa tu correo: te enviamos el enlace para terminar de crear tu marca.',
    correoPropio: 'Usa tu propio correo.',
    nombreCorto: 'Escribe el nombre de tu marca.', nombreLargo: 'Máximo 60 caracteres.', slugMal: 'Solo minúsculas, números y guiones (de 2 a 32).',
    correoMal: 'Revisa tu correo.', passCorta: 'Mínimo 8 caracteres.', passLarga: 'Máximo 72 caracteres.', waMal: 'Incluye el código de país, por ejemplo +51 999 999 999.',
  },
  // /empezar/listo
  l: {
    noEncontrado: 'No encontramos ese pago.', noEncontradoTxt: 'Si realizaste el pago y no pudiste ingresar a tu panel, escríbenos a parygoasistencia@gmail.com y lo resolveremos.',
    aprobadoA: 'Pago ', aprobadoB: 'aprobado', aprobadoC: '.',
    aprobadoTxt: (marca: string, n: number, slug: string) => [`${marca} ya tiene ${n} ${n === 1 ? 'evento disponible' : 'eventos disponibles'}. Tu página será `, `${slug}.parygo.com`, '.'],
    lista: 'Tu marca ya está lista.', listaTxt: 'Ingresa con tu correo y tu contraseña para crear tu primer evento.', entrar: 'Ingresar a mi panel',
    fallo: 'El pago no se completó.', falloTxt: 'No se realizó ningún cargo. Puedes intentarlo nuevamente con otro medio de pago.', reintentar: 'Intentar nuevamente',
    confirmando: 'Estamos confirmando tu pago.', confirmandoTxt: 'Suele tardar unos segundos. Esta página se actualiza sola.',
    creando: 'Estamos creando tu cuenta e ingresando a tu panel…',
    elige: 'Elige tu contraseña', eligeTxt: 'Con', eligeTxt2: 'y esta contraseña ingresarás a tu panel.', minimo: 'Mínimo 8 caracteres.',
    linkMal: 'Ese enlace no es válido.', passRango: 'La contraseña debe tener entre 8 y 72 caracteres.', sinConfirmar: 'Tu pago todavía no se confirma. Espera unos segundos e inténtalo nuevamente.',
    yaCuenta: 'Ese correo ya tiene una cuenta en ParyGo. Escríbenos y dejaremos tu marca a tu nombre.',
    noCuenta: 'No pudimos crear tu cuenta. Si ya la creaste en otra pestaña, ingresa con tu correo y contraseña.',
    noAlta: 'No pudimos completar tu registro. Inténtalo nuevamente en un momento.',
  },
};

type T = typeof es;

const en: T = {
  h1a: 'Your brand, ready to ', h1b: 'sell', h1c: '.',
  lede1: 'Choose your package, complete your details and in a few minutes you will have your page', lede2: 'with tickets, direct payments and entry control.',
  elige: 'Choose your package',
  evento: 'event', eventos: 'events', puntual: 'For a one-off event.', porEvento: 'per event',
  masElegido: 'Most popular',
  noDisponible: 'This payment method will be available very soon.',
  monedaLabel: 'Payment currency',
  monedas: { PEN: 'Soles · Mercado Pago', USD: 'US dollars · PayPal' },
  incluido: 'Every package includes your own branded page, QR tickets, direct payments to your account, an entry scanner and a management dashboard.', sinComision: 'No per-ticket fees.',
  tuMarca: 'Your brand',
  nombre: 'Brand name', nombrePh: 'e.g. Southern Nights',
  link: 'Your link', linkPh: 'yourbrand', linkHint: 'This is your page address. Lowercase letters, numbers and hyphens only.', linkLibre: 'Available', linkTomado: 'That link already belongs to another brand. Please try another.',
  correo: 'Your email', correoPh: 'you@email.com', correoHint: 'You will receive your payment confirmation and sales alerts here.',
  pass: 'Password', passHint: 'At least 8 characters. You will use it to log in to your dashboard.', passVer: 'Show password', passOcultar: 'Hide password',
  wa: 'WhatsApp', opcional: '(optional)', waPh: '+1 555 123 4567', waHint: 'Include your country code so your buyers can reach you.',
  pagar: (p) => `Pay ${p}`, momento: 'One moment…',
  finoPago: { PEN: 'Secure card payment through Mercado Pago. When you finish, you will go straight to your dashboard.', USD: 'Secure payment in US dollars with PayPal, using your account or a card. When you finish, you will go straight to your dashboard.' },
  acepta: 'By continuing you accept the', terminos: 'Terms', y: 'and the', privacidad: 'Privacy Policy',
  cancelado: 'The payment was not completed and no charge was made. You can try again whenever you like.',
  tuPlan: 'Your plan', pagoUnico: 'one-time payment',
  resumen: (n) => [`${n} ${n === 1 ? 'event' : 'events'} to create whenever you want`, 'Direct payments to your account', 'QR tickets and entry scanner', 'No per-ticket fees'],
  m: {
    revisa: 'Please review the highlighted fields.',
    pronto: 'This payment method will be available very soon. In the meantime, you can pay in the other currency.',
    muchos: 'You made several attempts in a row. Please wait a few minutes and try again.',
    cuenta: 'That email already has a ParyGo account. Log in with your email and password; you can buy events from your dashboard.',
    cuentaCampo: 'Already has an account.',
    tomado: 'That link already belongs to another brand.', tomadoCampo: 'Already in use. Please try another.',
    noPago: 'We could not prepare your payment. Please try again in a moment.',
    pagoEsperando: 'You already have an approved payment pending. Check your email: we sent you the link to finish creating your brand.',
    correoPropio: 'Please use your own email.',
    nombreCorto: 'Enter your brand name.', nombreLargo: 'Maximum 60 characters.', slugMal: 'Lowercase letters, numbers and hyphens only (2 to 32).',
    correoMal: 'Please check your email.', passCorta: 'At least 8 characters.', passLarga: 'Maximum 72 characters.', waMal: 'Include your country code, for example +1 555 123 4567.',
  },
  l: {
    noEncontrado: 'We could not find that payment.', noEncontradoTxt: 'If you paid and could not access your dashboard, write to us at parygoasistencia@gmail.com and we will sort it out.',
    aprobadoA: 'Payment ', aprobadoB: 'approved', aprobadoC: '.',
    aprobadoTxt: (marca, n, slug) => [`${marca} now has ${n} ${n === 1 ? 'event available' : 'events available'}. Your page will be `, `${slug}.parygo.com`, '.'],
    lista: 'Your brand is ready.', listaTxt: 'Log in with your email and password to create your first event.', entrar: 'Go to my dashboard',
    fallo: 'The payment was not completed.', falloTxt: 'No charge was made. You can try again with another payment method.', reintentar: 'Try again',
    confirmando: 'We are confirming your payment.', confirmandoTxt: 'It usually takes a few seconds. This page refreshes automatically.',
    creando: 'Creating your account and taking you to your dashboard…',
    elige: 'Choose your password', eligeTxt: 'You will log in to your dashboard with', eligeTxt2: 'and this password.', minimo: 'At least 8 characters.',
    linkMal: 'That link is not valid.', passRango: 'Your password must be between 8 and 72 characters.', sinConfirmar: 'Your payment has not been confirmed yet. Please wait a few seconds and try again.',
    yaCuenta: 'That email already has a ParyGo account. Write to us and we will put your brand under your name.',
    noCuenta: 'We could not create your account. If you already created it in another tab, log in with your email and password.',
    noAlta: 'We could not complete your registration. Please try again in a moment.',
  },
};

export const TEXTOS: Record<Lang, T> = { es, en };
export type Textos = T;
