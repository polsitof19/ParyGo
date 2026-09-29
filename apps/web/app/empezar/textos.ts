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
  // Primera pregunta de /empezar (Paul, 2026-09-28): antes de mostrar los
  // paquetes de marca, se pregunta qué va a organizar. Evento privado
  // (cumpleaños, reunión, 0075) abre el mismo alta con los textos de privado.
  tipo: {
    h1: '¿Qué vas a organizar?',
    sub: 'Elige la opción que se parece más a tu evento.',
    marca: { t: 'Una marca o productora', d: 'Discotecas, conciertos, fiestas y eventos que organizas seguido.' },
    privado: { t: 'Un evento privado', d: 'Cumpleaños, reuniones y celebraciones. Hasta 200 invitados.' },
  },
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
  correo: 'Tu correo', correoPh: 'tu@correo.com', correoHint: 'Revisa que esté bien escrito: es tu forma de entrar y de enterarte de todo.',
  pass: 'Contraseña', passHint: 'Mínimo 8 caracteres. La usarás para ingresar a tu panel.', passVer: 'Ver contraseña', passOcultar: 'Ocultar contraseña',
  wa: 'WhatsApp', opcional: '(opcional)', waPh: '+51 999 999 999', waHint: 'Con código de país, para que tus compradores puedan escribirte.',
  pagar: (p: string) => `Pagar ${p}`, momento: 'Un momento…',
  // Paso a paso (Paul, 2026-09-28): una pregunta por pantalla con vista previa.
  w: {
    paso: (n: number, total: number) => `Paso ${n} de ${total}`,
    continuar: 'Continuar', atras: '‹ Atrás',
    nombre: '¿Cómo se llama tu marca?', nombreHint: 'Es el nombre que verá tu público en tu página y en sus entradas.',
    enlace: '¿Cómo quieres tu enlace?', enlaceHint: 'Es la dirección de tu página: la que compartirás con tu público.',
    contacto: '¿Cuál es tu correo?',
    // Para qué sirve el correo (Paul, 2026-09-28): entrar al panel y los avisos.
    correoUsos: [
      { t: 'Para ingresar a tu panel', d: 'Junto con la contraseña que crearás en el paso siguiente.' },
      { t: 'Para tus avisos', d: 'La confirmación de tu pago y los pagos de tus compradores que tienes por aprobar.' },
    ],
    clave: 'Crea tu contraseña',
    revisa: 'Revisa tu plan', editar: 'Editar',
    rMarca: 'Marca', rEnlace: 'Enlace', rCorreo: 'Correo',
    vista: 'Tu página quedará en',
    ocupadoPaso: 'Ese enlace ya es de otra marca: en el siguiente paso eliges otro.',
    buscando: 'Buscando…',
  },
  finoPago: { PEN: 'Pago seguro con tarjeta a través de Mercado Pago. Al finalizar ingresarás directamente a tu panel.', USD: 'Pago seguro en dólares con PayPal, con tu cuenta o con tarjeta. Al finalizar ingresarás directamente a tu panel.' },
  acepta: 'Al continuar aceptas los', terminos: 'Términos', y: 'y la', privacidad: 'Política de privacidad',
  cancelado: 'El pago no se completó y no se realizó ningún cargo. Puedes intentarlo nuevamente cuando quieras.',
  tuPlan: 'Tu plan', pagoUnico: 'pago único',
  // Todo lo que incluye cada evento (Paul, 2026-09-28: "deben saber por qué
  // pagan"). MISMA lista que la landing (apps/landing/lib/i18n.ts,
  // precios.detalle): si cambias una, cambia la otra. Solo lo que existe hoy.
  incluye: {
    h: 'Todo lo que incluye cada evento',
    grupos: [
      { t: 'Tu página y tus entradas', items: [
        'Tu propia página con tu marca, logo y colores (tumarca.parygo.com)',
        'Entradas ilimitadas: los tipos que quieras (General, VIP, preventas)',
        'Preventas que cambian de precio solas en la fecha que elijas',
        'Entradas privadas por link, con límite de entradas por persona',
        'Eventos gratuitos con registro',
        'Marca una entrada como agotada cuando quieras',
      ] },
      { t: 'Tus cobros', items: [
        'Cobras directo en tu propio método de pago: la plata de las entradas es tuya, ParyGo no la toca',
        'Apruebas cada pago desde tu panel: ves el comprobante, confirmas y la entrada se envía sola',
        'Te avisamos por correo cuando tienes pagos por aprobar',
        'Sin comisión por entrada: pagas lo mismo vendas 10 o 1.000',
      ] },
      { t: 'Tu equipo y la puerta', items: [
        'Escáner en la puerta desde tu iPhone o Android, sin instalar nada',
        'Ves en el momento quién entró y cuándo',
        'Tu equipo de puerta, cada uno con su propio acceso',
        'Cortesías y listas de invitados con QR',
      ] },
      { t: 'Tus ventas', items: [
        'Códigos de descuento y links para tus promotores, con lo que vendió cada uno',
        'Estadísticas de ventas y asistencia en tiempo real',
        'Lista de compradores, descargable en Excel',
        'Reporte del evento al terminar, para guardar en PDF',
        'Tu panel en español o inglés',
      ] },
      { t: 'Tu público', items: [
        'Compra sin crear cuenta: elige, pone su nombre y correo, y paga',
        'Paga con el método que tú elijas',
        'Su entrada con QR le llega automáticamente al correo',
        'La guarda como imagen o la manda por WhatsApp',
        'Si pierde el correo, la pide de nuevo sin escribirte',
        'Agrega el evento a su calendario',
        'Todo desde el navegador, en iPhone, Android o computadora',
      ] },
    ],
  },
  // Evento privado (0075, Paul 2026-09-28): lo que cambia respecto de la
  // marca. EmpezarFlow lo mezcla encima de los textos de siempre. Hasta 200
  // entradas: la lista NO dice "ilimitadas" (sería falso).
  privado: {
    h1a: 'Tu evento, listo para ', h1b: 'celebrar', h1c: '.',
    lede1: 'Elige tu plan, completa tus datos y en pocos minutos tendrás tu página', lede2: 'con entradas con QR, cobro directo y control en la puerta.',
    elige: 'Tu plan', planNombre: '1 evento privado', planDet: 'Hasta 200 entradas en total.',
    incluido: 'Incluye tu página del evento, entradas con QR, cobro directo a tu cuenta y escáner en la puerta.',
    nombrePh: 'Ej. Cumpleaños de Ana',
    // El link del evento (Paul, 2026-09-28): corto y fácil de dictar.
    linkPh: 'tuevento', linkHint: 'Solo minúsculas, números y guiones. Ej.: ana30, boda-luis-y-maria.',
    linkTomado: 'Ese enlace ya está en uso. Prueba con otro.',
    w: { nombre: '¿Cómo se llama tu evento?', nombreHint: 'Es el nombre que verán tus invitados en la página y en sus entradas.', rMarca: 'Evento',
      enlaceHint: 'Es el link que les mandarás a tus invitados por WhatsApp. Mejor corto y fácil de dictar: ana30, boda-luis-y-maria.',
      ocupadoPaso: 'Ese enlace ya está en uso: en el siguiente paso eliges otro.' },
    incluye: {
      h: 'Todo lo que incluye tu evento',
      grupos: [
        { t: 'Tu página y tus entradas', items: [
          'Tu página del evento, con su nombre y su foto (tuevento.parygo.com)',
          'Hasta 200 entradas en total: los tipos que quieras (General, VIP, preventas)',
          'Entradas privadas por link, o solo con invitación',
          'Eventos gratuitos con registro',
        ] },
        { t: 'Tus cobros', items: [
          'Tus invitados te pagan directo en tu propio método de pago: ParyGo no toca esa plata',
          'Apruebas cada pago desde tu panel y la entrada se envía sola',
          'Te avisamos por correo cuando tienes pagos por aprobar',
        ] },
        { t: 'La puerta', items: [
          'Escáner en la puerta desde tu iPhone o Android, sin instalar nada',
          'Ves en el momento quién llegó',
          'Alguien de confianza puede escanear con su propio acceso',
          'Cortesías y listas de invitados con QR',
        ] },
        { t: 'Tus invitados', items: [
          'Sin crear cuenta: ponen su nombre y correo',
          'Su QR les llega automáticamente al correo',
          'Lo guardan como imagen o lo mandan por WhatsApp',
          'Todo desde el navegador, en iPhone, Android o computadora',
        ] },
      ],
    },
  },
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
  tipo: {
    h1: 'What are you organizing?',
    sub: 'Choose the option that fits your event best.',
    marca: { t: 'A brand or promoter', d: 'Clubs, concerts, parties and events you run regularly.' },
    privado: { t: 'A private event', d: 'Birthdays, gatherings and celebrations. Up to 200 guests.' },
  },
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
  correo: 'Your email', correoPh: 'you@email.com', correoHint: 'Make sure it is spelled right: it is how you log in and stay informed.',
  pass: 'Password', passHint: 'At least 8 characters. You will use it to log in to your dashboard.', passVer: 'Show password', passOcultar: 'Hide password',
  wa: 'WhatsApp', opcional: '(optional)', waPh: '+1 555 123 4567', waHint: 'Include your country code so your buyers can reach you.',
  pagar: (p) => `Pay ${p}`, momento: 'One moment…',
  w: {
    paso: (n, total) => `Step ${n} of ${total}`,
    continuar: 'Continue', atras: '‹ Back',
    nombre: "What's your brand called?", nombreHint: 'This is the name your audience will see on your page and on their tickets.',
    enlace: 'How do you want your link?', enlaceHint: 'This is your page address: the one you will share with your audience.',
    contacto: "What's your email?",
    correoUsos: [
      { t: 'To log in to your dashboard', d: 'Together with the password you will create in the next step.' },
      { t: 'For your alerts', d: "Your payment confirmation and your buyers' payments waiting for your approval." },
    ],
    clave: 'Create your password',
    revisa: 'Review your plan', editar: 'Edit',
    rMarca: 'Brand', rEnlace: 'Link', rCorreo: 'Email',
    vista: 'Your page will be at',
    ocupadoPaso: 'That link already belongs to another brand: you will pick another one in the next step.',
    buscando: 'Checking…',
  },
  finoPago: { PEN: 'Secure card payment through Mercado Pago. When you finish, you will go straight to your dashboard.', USD: 'Secure payment in US dollars with PayPal, using your account or a card. When you finish, you will go straight to your dashboard.' },
  acepta: 'By continuing you accept the', terminos: 'Terms', y: 'and the', privacidad: 'Privacy Policy',
  cancelado: 'The payment was not completed and no charge was made. You can try again whenever you like.',
  tuPlan: 'Your plan', pagoUnico: 'one-time payment',
  incluye: {
    h: 'Everything each event includes',
    grupos: [
      { t: 'Your page and your tickets', items: [
        'Your own page with your brand, logo and colors (yourbrand.parygo.com)',
        'Unlimited tickets: any ticket types you want (General, VIP, presales)',
        'Presales that change price on their own on the date you choose',
        'Private tickets by link, with a per-person limit',
        'Free events with registration',
        'Mark a ticket type as sold out whenever you want',
      ] },
      { t: 'Your payments', items: [
        'Get paid directly through your own payment method: ticket money is yours, ParyGo never touches it',
        'Approve each payment from your dashboard: see the receipt, confirm, and the ticket is sent automatically',
        'We email you when you have payments to approve',
        'No per-ticket fee: you pay the same whether you sell 10 or 1,000',
      ] },
      { t: 'Your team and the door', items: [
        'Door scanner on your iPhone or Android, nothing to install',
        'See who got in and when, in real time',
        'Your door team, each with their own access',
        'Complimentary tickets and guest lists with QR',
      ] },
      { t: 'Your sales', items: [
        'Discount codes and promoter links, with what each one sold',
        'Real-time sales and attendance stats',
        'Buyer list, downloadable to Excel',
        'Post-event report, ready to save as PDF',
        'Your dashboard in English or Spanish',
      ] },
      { t: 'Your audience', items: [
        'Buys without creating an account: picks, enters name and email, and pays',
        'Pays with the method you choose',
        'Their QR ticket arrives in their inbox automatically',
        'Saves it as an image or sends it on WhatsApp',
        'If they lose the email, they get it again without contacting you',
        'Adds the event to their calendar',
        'All from the browser, on iPhone, Android or computer',
      ] },
    ],
  },
  privado: {
    h1a: 'Your event, ready to ', h1b: 'celebrate', h1c: '.',
    lede1: 'Choose your plan, complete your details and in a few minutes you will have your page', lede2: 'with QR tickets, direct payments and door control.',
    elige: 'Your plan', planNombre: '1 private event', planDet: 'Up to 200 tickets in total.',
    incluido: 'Includes your event page, QR tickets, direct payments to your account and a door scanner.',
    nombrePh: "e.g. Ana's Birthday",
    linkPh: 'yourevent', linkHint: 'Lowercase letters, numbers and hyphens only. E.g.: ana30, luis-and-maria-wedding.',
    linkTomado: 'That link is already in use. Please try another.',
    w: { nombre: "What's your event called?", nombreHint: 'This is the name your guests will see on the page and on their tickets.', rMarca: 'Event',
      enlaceHint: 'This is the link you will send your guests on WhatsApp. Short and easy to say works best: ana30, luis-and-maria-wedding.',
      ocupadoPaso: 'That link is already in use: you will pick another one in the next step.' },
    incluye: {
      h: 'Everything your event includes',
      grupos: [
        { t: 'Your page and your tickets', items: [
          'Your event page, with its name and photo (yourevent.parygo.com)',
          'Up to 200 tickets in total: any ticket types you want (General, VIP, presales)',
          'Private tickets by link, or invitation only',
          'Free events with registration',
        ] },
        { t: 'Your payments', items: [
          'Your guests pay you directly through your own payment method: ParyGo never touches that money',
          'Approve each payment from your dashboard and the ticket is sent automatically',
          'We email you when you have payments to approve',
        ] },
        { t: 'The door', items: [
          'Door scanner on your iPhone or Android, nothing to install',
          'See who arrived, in real time',
          'Someone you trust can scan with their own access',
          'Complimentary tickets and guest lists with QR',
        ] },
        { t: 'Your guests', items: [
          'No account needed: they enter their name and email',
          'Their QR ticket arrives in their inbox automatically',
          'They save it as an image or send it on WhatsApp',
          'All from the browser, on iPhone, Android or computer',
        ] },
      ],
    },
  },
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
