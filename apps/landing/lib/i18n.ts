// Textos de la landing en español e inglés. Una sola fuente para todas las
// secciones, el SEO y el JSON-LD. Registro: formal, sobrio y confiable
// (pedido de Paul, 2026-09-25: nada de "plata" ni coloquialismos), en tuteo
// como el resto del producto. Todo lo que se afirma es cómo funciona el
// sistema hoy; lo que viene se dice "Próximamente".
export type Lang = 'es' | 'en';

// Texto con una palabra resaltada: [antes, resaltado, después].
export type Resaltado = [string, string, string];

export type Dict = {
  lang: Lang;
  htmlLang: string;
  ogLocale: string;
  meta: { title: string; description: string; keywords: string[] };
  idioma: { label: string };
  header: { nav: [string, string, string, string]; login: string; loginAria: string; cta: string };
  hero: { l1: string; l2: string; l3: string; sub: string; cta: string; ver: string; chips: [string, string, string]; ticket: { titulo: string; noche: string; fecha: string; escanea: string; puerta: string } };
  uses: { h2: Resaltado; items: string[]; note: Resaltado };
  how: { h2: Resaltado; paso: string; steps: { t: string; d: string }[] };
  seg: { h2: Resaltado; lede: string; flujo: { publico: string; publicoTxt: string; paga: string; cuenta: string; cuentaTxt: string; parygo: string; parygoTxt: string; aria: string }; puntos: { t: string; d: string }[] };
  inc: { h2: Resaltado; feature: [string, string]; items: string[]; note: string };
  cobros: { h2: Resaltado; lede: string; disponible: string; pronto: string; medios: { t: string; d: string }[] };
  demo: { h2: Resaltado; items: { t: string; d: string }[]; tag: string; evt1: string; evt2: string; meta: string; tk1: [string, string]; tk2: [string, string]; buy: string };
  comp: { h2: Resaltado; lede: string; items: { t: string; d: string }[] };
  cmp: { h2: Resaltado; aria: string; p: string; o: string; filas: { t: string; p: string; o: string }[] };
  precios: { h2: Resaltado; lede: string; prueba: { t: string; d: string; cta: string }; evento: string; eventos: string; qty: Record<number, string>; perks: Record<number, string[]>; badge: string; porEvento: string; ahorras: string; pagoUnico: string; elegir: string; note: string; noteUsd: string };
  faq: { h2: Resaltado; lede: string; items: { q: string; a: string }[] };
  final: { h2: string; p: string; cta: string; precios: string };
  footer: { brand: string; producto: string; ayuda: string; legal: string; links: { como: string; seguridad: string; incluye: string; precios: string; crear: string; preguntas: string; panel: string; terminos: string; privacidad: string }; copy: string; made: string };
};

const es: Dict = {
  lang: 'es',
  htmlLang: 'es',
  ogLocale: 'es_LA',
  meta: {
    title: 'ParyGo — Plataforma de venta de entradas con tu propia marca',
    description: 'Vende entradas para tus eventos con tu propia marca. Tu público paga directamente a tu cuenta, sin comisión por entrada, y controlas el acceso con códigos QR. Prueba gratuita disponible.',
    keywords: ['venta de entradas online', 'plataforma de ticketing', 'entradas con QR', 'ticketing sin comisión', 'control de acceso a eventos'],
  },
  idioma: { label: 'Idioma' },
  header: { nav: ['Cómo funciona', 'Seguridad', 'Precios', 'Preguntas'], login: 'Ingresar', loginAria: 'Ingresar al panel de organizadores', cta: 'Comenzar gratis' },
  hero: {
    l1: 'Tus eventos,', l2: 'tus entradas,', l3: 'tus ingresos',
    sub: 'Vende las entradas de tus eventos con tu propia marca. Tu público paga directamente a tu cuenta, sin comisiones por entrada, y tú controlas cada acceso.',
    cta: 'Comenzar gratis', ver: 'Ver cómo funciona',
    chips: ['Pagos directos a tu cuenta', 'Sin comisión por entrada', 'Prueba gratuita, sin tarjeta'],
    ticket: { titulo: 'VERANO SUNSET', noche: 'NOCHE 04', fecha: 'SÁB 24 ENE · 10:00 PM · CLUB DELMAR', escanea: 'ESCANEA', puerta: 'EN PUERTA' },
  },
  uses: {
    h2: ['Diseñado para ', 'cada tipo de evento', '.'],
    items: ['Discotecas y clubes', 'Conciertos', 'Festivales', 'Fiestas privadas', 'Teatro y stand-up', 'Celebraciones', 'Eventos corporativos'],
    note: ['Con entrada pagada, gratuita con registro o por invitación: ', 'siempre sabes quién ingresa', '.'],
  },
  how: {
    h2: ['Tu evento a la venta en ', 'tres pasos', '.'],
    paso: 'Paso',
    steps: [
      { t: 'Crea tu evento', d: 'Define la fecha, el lugar y el flyer, y configura tus entradas: generales, VIP, preventas o gratuitas. Tu página queda publicada en tumarca.parygo.com.' },
      { t: 'Comparte el enlace', d: 'Publícalo en tus redes o donde vendas. Tu público compra en un minuto y recibe su entrada con código QR en su correo.' },
      { t: 'Controla el acceso', d: 'Tu equipo escanea cada QR desde el celular, sin instalar aplicaciones. Cada entrada es válida una sola vez y ves la asistencia en tiempo real.' },
    ],
  },
  seg: {
    h2: ['Los ingresos van ', 'directo a tu cuenta', '.'],
    lede: 'ParyGo no intermedia tus ventas. Tu público paga a tu propio medio de cobro y el dinero es tuyo desde el primer momento. Nuestro servicio se paga por separado, con una tarifa fija por evento.',
    flujo: { publico: 'Tu público', publicoTxt: 'adquiere su entrada', paga: 'paga', cuenta: 'Tu cuenta de cobro', cuentaTxt: 'recibe el 100% de cada venta', parygo: 'ParyGo', parygoTxt: 'tarifa fija por evento, pagada por separado. Sin comisión por entrada.', aria: 'Recorrido del dinero de una venta' },
    puntos: [
      { t: 'No administramos tus fondos', d: 'Tus compradores pagan directamente a tu cuenta de cobro. ParyGo no recibe, retiene ni liquida el dinero de tus ventas.' },
      { t: 'Pagos verificados', d: 'En los pagos con tarjeta confirmamos la operación y el importe con la pasarela antes de emitir la entrada. En las transferencias, como Yape, tú apruebas cada comprobante. El precio no puede alterarse desde el navegador.' },
      { t: 'Cada QR es válido una sola vez', d: 'Si una entrada se reenvía o se copia, el segundo escaneo se rechaza como ya utilizada. Así se evitan las entradas duplicadas.' },
      { t: 'Funciona sin conexión', d: 'El escáner descarga las entradas antes de la apertura y continúa validando aunque se pierda la señal.' },
      { t: 'Accesos individuales', d: 'Cada integrante de tu equipo ingresa con su propio usuario y queda registrado quién validó cada entrada y a qué hora.' },
      { t: 'Credenciales cifradas', d: 'Las credenciales de tus medios de cobro se almacenan cifradas y nunca se muestran en pantalla.' },
    ],
  },
  inc: {
    h2: ['Todo lo que incluye ', 'cada evento', '.'],
    feature: ['Cobro directo a tu cuenta. ', 'Sin comisión por entrada.'],
    items: [
      'Página propia con tu marca, logo y colores',
      'Entradas con código QR enviadas al instante',
      'Escáner de acceso: cada QR es válido una vez',
      'Ventas y asistencia en tiempo real',
      'Códigos de descuento y enlaces para promotores',
      'Preventas con cambio de precio automático',
      'Entradas ilimitadas',
      'Cortesías y listas de invitados con QR',
      'Soporte por correo electrónico',
    ],
    note: 'Además: entradas privadas por enlace, eventos gratuitos con registro, avisos de cada pago por correo y exportación de tu lista de compradores.',
  },
  cobros: {
    h2: ['Tu público paga ', 'como prefiera', '.'],
    lede: 'Conectas tus propias cuentas de cobro y ParyGo las integra en tu página. Incorporamos nuevos medios de pago de forma progresiva.',
    disponible: 'Disponible', pronto: 'Próximamente',
    medios: [
      { t: 'Tarjetas de crédito y débito', d: 'Visa, Mastercard y otras, a través de Mercado Pago' },
      { t: 'Mercado Pago', d: 'Saldo y cuenta, en los países donde opera' },
      { t: 'Yape', d: 'Transferencias inmediatas en Perú' },
      { t: 'PayPal', d: 'Para cobrar a público de cualquier país' },
      { t: 'Bitcoin y criptomonedas', d: 'Pagos con activos digitales' },
      { t: 'Medios de pago locales', d: 'Los métodos habituales de cada país' },
    ],
  },
  demo: {
    h2: ['Una página que ', 'vende por ti', '.'],
    items: [
      { t: 'Tu marca en primer plano', d: 'Tu logo, tus colores y el flyer de tu evento en tumarca.parygo.com.' },
      { t: 'Entradas a tu medida', d: 'Generales, VIP, preventas con aumento de precio, gratuitas o privadas por enlace.' },
      { t: 'Compra en un minuto', d: 'Sin crear una cuenta. El comprador paga y recibe su QR al instante.' },
    ],
    tag: '● A la venta', evt1: 'Verano', evt2: 'Sunset 04', meta: 'SÁB 24 ENE · 10:00 PM · CLUB DELMAR',
    tk1: ['General', 'Acceso al evento'], tk2: ['VIP', 'Zona preferente y barra'], buy: 'Comprar entrada →',
  },
  comp: {
    h2: ['Una compra sencilla para ', 'tu público', '.'],
    lede: 'Menos pasos significan más ventas. Así es la experiencia de tus compradores.',
    items: [
      { t: 'Sin registro', d: 'No necesita crear una cuenta ni recordar contraseñas: elige sus entradas, ingresa su nombre y correo, y paga.' },
      { t: 'Pago en una pasarela segura', d: 'Los datos de su tarjeta los procesa el medio de pago; nunca pasan por ParyGo ni por tu equipo.' },
      { t: 'Entrada inmediata', d: 'Recibe su código QR por correo en cuanto se confirma el pago y también lo ve en pantalla.' },
      { t: 'Fácil de guardar y compartir', d: 'Puede descargar su entrada como imagen o enviarla por WhatsApp a sus acompañantes.' },
      { t: 'Reenvío autónomo', d: 'Si pierde el correo, solicita el reenvío desde la página del evento, sin necesidad de contactarte.' },
      { t: 'Desde cualquier dispositivo', d: 'Todo funciona en el navegador: no hay aplicaciones que instalar, ni para el público ni para tu equipo.' },
    ],
  },
  cmp: {
    h2: ['¿Por qué ParyGo y no ', 'una ticketera', '?'],
    aria: 'ParyGo frente a una ticketera con comisión',
    p: 'ParyGo', o: 'Ticketera con comisión',
    filas: [
      { t: 'Costo del servicio', p: 'Tarifa fija por evento, sin importar cuánto vendas', o: 'Un porcentaje de cada entrada: cuanto más vendes, más pagas' },
      { t: 'Disponibilidad de tus ingresos', p: 'Directo en tu propia cuenta de cobro, sin liquidaciones de terceros', o: 'Cuando la ticketera liquida, a menudo después del evento' },
      { t: 'Tu página', p: 'Con tu marca, tu logo y tus colores: tumarca.parygo.com', o: 'Dentro de su marca, junto a los eventos de otros' },
      { t: 'Datos de tus compradores', p: 'Te pertenecen: puedes consultarlos y exportarlos cuando quieras', o: 'Suelen permanecer en la plataforma' },
      { t: 'Compromiso', p: 'Sin suscripciones ni exclusividad: adquieres eventos cuando los necesitas', o: 'Contratos y, en ocasiones, exclusividad' },
    ],
  },
  precios: {
    h2: ['Pagas una vez ', 'por evento', '.'],
    lede: 'Sin mensualidades ni comisiones por entrada. Todos los paquetes incluyen todas las funciones; solo eliges cuántos eventos necesitas.',
    prueba: { t: 'Comienza con la prueba gratuita', d: '1 evento de hasta 20 entradas, sin tarjeta. Solo necesitas confirmar tu correo.', cta: 'Probar gratis →' },
    evento: 'evento', eventos: 'eventos',
    qty: { 1: 'Para un evento puntual', 3: 'Para eventos recurrentes', 5: 'Para una temporada', 10: 'Para productoras' },
    perks: {
      1: ['Todas las funciones', 'Entradas ilimitadas', 'Soporte por correo electrónico'],
      3: ['Todas las funciones', 'Entradas ilimitadas', 'Soporte prioritario'],
      5: ['Todas las funciones', 'Entradas ilimitadas', 'Acompañamiento personalizado'],
      10: ['Todas las funciones', 'Entradas ilimitadas', 'Configuración guiada por videollamada'],
    },
    badge: 'Más elegido', porEvento: 'por evento', ahorras: 'Ahorras', pagoUnico: 'Pago único', elegir: 'Elegir',
    note: 'Cada evento incluye entradas ilimitadas y todas las funciones.',
    noteUsd: ' Los pagos en dólares se procesan de forma segura con PayPal, con tu cuenta o con tarjeta.',
  },
  faq: {
    h2: ['Preguntas ', 'frecuentes', '.'],
    lede: '¿Tienes otra consulta? Escríbenos a',
    items: [
      { q: '¿ParyGo cobra una comisión por entrada?', a: 'No. Pagas una tarifa fija por evento, independientemente de cuántas entradas vendas. Todo lo que paga tu público es para ti.' },
      { q: '¿Cuándo y cómo recibo los ingresos de mis entradas?', a: 'Tus compradores pagan directamente a tu cuenta de cobro (por ejemplo, Mercado Pago o Yape). ParyGo nunca recibe ese dinero, por lo que no hay liquidaciones ni esperas de nuestra parte: los plazos son los de tu medio de pago.' },
      { q: '¿Puedo probar ParyGo antes de pagar?', a: 'Sí. La prueba gratuita incluye un evento de hasta 20 entradas, sin tarjeta; solo confirmas tu correo con un código.' },
      { q: '¿Qué medios de pago pueden usar mis compradores?', a: 'Actualmente, tarjetas de crédito y débito y saldo de Mercado Pago, además de Yape en Perú. Estamos incorporando PayPal, criptomonedas y más medios locales de forma progresiva.' },
      { q: '¿En qué moneda pago los paquetes de ParyGo?', a: 'Puedes pagarlos en dólares con PayPal, con tu cuenta o con tarjeta, o en soles peruanos con Mercado Pago. El precio es fijo y lo ves antes de pagar.' },
      { q: '¿Mis compradores necesitan crear una cuenta o instalar una aplicación?', a: 'No. Eligen sus entradas, ingresan su nombre y correo, pagan y reciben su código QR al instante, todo desde el navegador.' },
      { q: '¿Qué ocurre si falla la conexión a internet en el acceso?', a: 'El escáner descarga las entradas antes de la apertura y continúa validando sin conexión. Al recuperar la señal, se sincroniza automáticamente.' },
      { q: '¿Una entrada puede usarse dos veces?', a: 'No. Cada código QR es válido una sola vez: si una entrada se reenvía o se copia, el segundo escaneo se rechaza.' },
      { q: '¿Puedo organizar eventos gratuitos o por invitación?', a: 'Sí. Puedes crear eventos de acceso libre con registro, emitir cortesías para tus invitados y ofrecer entradas privadas visibles solo mediante un enlace.' },
      { q: '¿Qué incluye cada evento de un paquete?', a: 'Un evento completo, con entradas ilimitadas y todas las funciones: página con tu marca, escáner, estadísticas, códigos de descuento y cortesías. La prueba gratuita admite hasta 20 entradas.' },
      { q: '¿Necesito conocimientos técnicos?', a: 'No. Puedes crear tu evento en pocos minutos desde el celular y compartir el enlace. Si necesitas ayuda, nuestro equipo te acompaña por correo.' },
    ],
  },
  final: {
    h2: 'Tu próximo evento, a la venta hoy.',
    p: 'Crea tu marca en pocos minutos y prueba ParyGo gratis con tu primer evento. Si prefieres conversarlo antes, escríbenos a',
    cta: 'Comenzar gratis', precios: 'Ver precios',
  },
  footer: {
    brand: 'La plataforma para vender y controlar las entradas de tus eventos, con tu propia marca y cobrando directamente.',
    producto: 'Producto', ayuda: 'Ayuda', legal: 'Legal',
    links: { como: 'Cómo funciona', seguridad: 'Seguridad', incluye: 'Qué incluye', precios: 'Precios', crear: 'Crear mi marca', preguntas: 'Preguntas frecuentes', panel: 'Ingresar al panel', terminos: 'Términos', privacidad: 'Privacidad' },
    copy: '© 2015 ParyGo. Todos los derechos reservados.',
    made: 'Vende con tu marca. Cobra directamente.',
  },
};

const en: Dict = {
  lang: 'en',
  htmlLang: 'en',
  ogLocale: 'en_US',
  meta: {
    title: 'ParyGo — Ticketing platform under your own brand',
    description: 'Sell tickets for your events under your own brand. Your audience pays directly into your account, with no per-ticket fees, and you control entry with QR codes. Free trial available.',
    keywords: ['online ticket sales', 'ticketing platform', 'QR tickets', 'no-fee ticketing', 'event access control'],
  },
  idioma: { label: 'Language' },
  header: { nav: ['How it works', 'Security', 'Pricing', 'FAQ'], login: 'Log in', loginAria: 'Log in to the organizer dashboard', cta: 'Start for free' },
  hero: {
    l1: 'Your events,', l2: 'your tickets,', l3: 'your revenue',
    sub: 'Sell tickets for your events under your own brand. Your audience pays directly into your account, with no per-ticket fees, and you control every entry.',
    cta: 'Start for free', ver: 'See how it works',
    chips: ['Payments straight to your account', 'No per-ticket fees', 'Free trial, no card required'],
    ticket: { titulo: 'SUMMER SUNSET', noche: 'NIGHT 04', fecha: 'SAT JAN 24 · 10:00 PM · CLUB DELMAR', escanea: 'SCAN', puerta: 'AT THE DOOR' },
  },
  uses: {
    h2: ['Built for ', 'every kind of event', '.'],
    items: ['Nightclubs', 'Concerts', 'Festivals', 'Private parties', 'Theater and stand-up', 'Celebrations', 'Corporate events'],
    note: ['Paid, free with registration or by invitation: ', 'you always know who gets in', '.'],
  },
  how: {
    h2: ['Your event on sale in ', 'three steps', '.'],
    paso: 'Step',
    steps: [
      { t: 'Create your event', d: 'Set the date, venue and artwork, and configure your tickets: general admission, VIP, early bird or free. Your page goes live at yourbrand.parygo.com.' },
      { t: 'Share the link', d: 'Post it on social media or wherever you sell. Your audience buys in a minute and receives a QR ticket by email.' },
      { t: 'Control entry', d: 'Your team scans each QR code with a phone, with no app to install. Every ticket is valid once, and you see attendance in real time.' },
    ],
  },
  seg: {
    h2: ['Revenue goes ', 'straight to your account', '.'],
    lede: 'ParyGo does not sit between you and your sales. Your audience pays your own payment account and the money is yours from the very first moment. Our service is billed separately, at a flat fee per event.',
    flujo: { publico: 'Your audience', publicoTxt: 'buys a ticket', paga: 'pays', cuenta: 'Your payment account', cuentaTxt: 'receives 100% of every sale', parygo: 'ParyGo', parygoTxt: 'flat fee per event, billed separately. No per-ticket fees.', aria: 'How the money from a sale flows' },
    puntos: [
      { t: 'We never hold your funds', d: 'Your buyers pay directly into your payment account. ParyGo does not receive, hold or pay out the money from your sales.' },
      { t: 'Verified payments', d: 'For card payments, we confirm the transaction and the amount with the payment provider before issuing the ticket. For bank transfers such as Yape, you approve each receipt. Prices cannot be altered from the browser.' },
      { t: 'Every QR code is valid once', d: 'If a ticket is forwarded or copied, the second scan is rejected as already used. Duplicate tickets are prevented.' },
      { t: 'Works offline', d: 'The scanner downloads tickets before doors open and keeps validating even if the signal drops.' },
      { t: 'Individual access', d: 'Each team member signs in with their own account, and every scan is logged with who validated it and when.' },
      { t: 'Encrypted credentials', d: 'Your payment credentials are stored encrypted and are never displayed on screen.' },
    ],
  },
  inc: {
    h2: ['Everything included with ', 'every event', '.'],
    feature: ['Payments straight to your account. ', 'No per-ticket fees.'],
    items: [
      'Your own page with your brand, logo and colors',
      'QR tickets delivered instantly',
      'Entry scanner: every QR code is valid once',
      'Real-time sales and attendance',
      'Discount codes and links for promoters',
      'Early-bird pricing with automatic price changes',
      'Unlimited tickets',
      'Complimentary tickets and guest lists with QR',
      'Email support',
    ],
    note: 'Plus: private tickets by link, free events with registration, email alerts for every payment and an exportable buyer list.',
  },
  cobros: {
    h2: ['Your audience pays ', 'the way they prefer', '.'],
    lede: 'You connect your own payment accounts and ParyGo integrates them into your page. We are adding new payment methods progressively.',
    disponible: 'Available', pronto: 'Coming soon',
    medios: [
      { t: 'Credit and debit cards', d: 'Visa, Mastercard and more, through Mercado Pago' },
      { t: 'Mercado Pago', d: 'Balance and account, in the countries where it operates' },
      { t: 'Yape', d: 'Instant transfers in Peru' },
      { t: 'PayPal', d: 'To sell to audiences in any country' },
      { t: 'Bitcoin and crypto', d: 'Payments with digital assets' },
      { t: 'Local payment methods', d: 'The methods people use in each country' },
    ],
  },
  demo: {
    h2: ['A page that ', 'sells for you', '.'],
    items: [
      { t: 'Your brand up front', d: 'Your logo, your colors and your event artwork at yourbrand.parygo.com.' },
      { t: 'Tickets your way', d: 'General admission, VIP, early bird with price increases, free or private by link.' },
      { t: 'Checkout in a minute', d: 'No account needed. The buyer pays and receives a QR ticket instantly.' },
    ],
    tag: '● On sale', evt1: 'Summer', evt2: 'Sunset 04', meta: 'SAT JAN 24 · 10:00 PM · CLUB DELMAR',
    tk1: ['General', 'Event admission'], tk2: ['VIP', 'Premium area and bar'], buy: 'Buy ticket →',
  },
  comp: {
    h2: ['A simple checkout for ', 'your audience', '.'],
    lede: 'Fewer steps mean more sales. This is what your buyers experience.',
    items: [
      { t: 'No sign-up', d: 'No account or password to remember: they choose their tickets, enter their name and email, and pay.' },
      { t: 'Secure payment gateway', d: 'Card details are processed by the payment provider and never pass through ParyGo or your team.' },
      { t: 'Instant ticket', d: 'The QR code arrives by email as soon as the payment is confirmed, and is also shown on screen.' },
      { t: 'Easy to save and share', d: 'Buyers can download their ticket as an image or send it via WhatsApp to the people they are going with.' },
      { t: 'Self-service resend', d: 'If they lose the email, they can request it again from the event page, without contacting you.' },
      { t: 'On any device', d: 'Everything runs in the browser: no apps to install, neither for your audience nor for your team.' },
    ],
  },
  cmp: {
    h2: ['Why ParyGo instead of ', 'a ticketing marketplace', '?'],
    aria: 'ParyGo compared with a commission-based ticketing marketplace',
    p: 'ParyGo', o: 'Commission-based marketplace',
    filas: [
      { t: 'Service cost', p: 'A flat fee per event, no matter how much you sell', o: 'A percentage of every ticket: the more you sell, the more you pay' },
      { t: 'Access to your revenue', p: 'Straight into your own payment account, with no third-party payouts', o: 'When the marketplace pays out, often after the event' },
      { t: 'Your page', p: 'Your brand, your logo and your colors: yourbrand.parygo.com', o: 'Inside their brand, next to other organizers\' events' },
      { t: 'Your buyers\' data', p: 'It belongs to you: view and export it whenever you want', o: 'Usually stays on the platform' },
      { t: 'Commitment', p: 'No subscriptions or exclusivity: buy events when you need them', o: 'Contracts and, at times, exclusivity' },
    ],
  },
  precios: {
    h2: ['Pay once ', 'per event', '.'],
    lede: 'No monthly fees and no per-ticket commissions. Every package includes every feature; you simply choose how many events you need.',
    prueba: { t: 'Start with the free trial', d: 'One event with up to 20 tickets, no card required. You only need to confirm your email.', cta: 'Try it free →' },
    evento: 'event', eventos: 'events',
    qty: { 1: 'For a one-off event', 3: 'For recurring events', 5: 'For a full season', 10: 'For production companies' },
    perks: {
      1: ['Every feature', 'Unlimited tickets', 'Email support'],
      3: ['Every feature', 'Unlimited tickets', 'Priority support'],
      5: ['Every feature', 'Unlimited tickets', 'Personal guidance'],
      10: ['Every feature', 'Unlimited tickets', 'Guided setup by video call'],
    },
    badge: 'Most popular', porEvento: 'per event', ahorras: 'You save', pagoUnico: 'One-time payment', elegir: 'Choose',
    note: 'Every event includes unlimited tickets and every feature.',
    noteUsd: ' Payments in US dollars are processed securely through PayPal, with your account or a card.',
  },
  faq: {
    h2: ['Frequently asked ', 'questions', '.'],
    lede: 'Have another question? Write to us at',
    items: [
      { q: 'Does ParyGo charge a fee per ticket?', a: 'No. You pay a flat fee per event, regardless of how many tickets you sell. Everything your audience pays is yours.' },
      { q: 'When and how do I receive my ticket revenue?', a: 'Your buyers pay directly into your payment account (for example, Mercado Pago or Yape). ParyGo never receives that money, so there are no payouts or waiting periods on our side: timing depends on your payment provider.' },
      { q: 'Can I try ParyGo before paying?', a: 'Yes. The free trial includes one event with up to 20 tickets, no card required; you only confirm your email with a code.' },
      { q: 'Which payment methods can my buyers use?', a: 'Currently, credit and debit cards and Mercado Pago balance, plus Yape in Peru. We are progressively adding PayPal, cryptocurrencies and more local methods.' },
      { q: 'In which currency do I pay for ParyGo packages?', a: 'You can pay in US dollars with PayPal, using your account or a card, or in Peruvian soles with Mercado Pago. The price is fixed and shown before you pay.' },
      { q: 'Do my buyers need to create an account or install an app?', a: 'No. They choose their tickets, enter their name and email, pay and receive their QR code instantly, all from the browser.' },
      { q: 'What happens if the internet connection fails at the door?', a: 'The scanner downloads tickets before doors open and keeps validating offline. Once the connection returns, it syncs automatically.' },
      { q: 'Can a ticket be used twice?', a: 'No. Every QR code is valid once: if a ticket is forwarded or copied, the second scan is rejected.' },
      { q: 'Can I run free or invitation-only events?', a: 'Yes. You can create free events with registration, issue complimentary tickets to your guests and offer private tickets that are only visible through a link.' },
      { q: 'What does each event in a package include?', a: 'A complete event with unlimited tickets and every feature: a page with your brand, the scanner, analytics, discount codes and complimentary tickets. The free trial allows up to 20 tickets.' },
      { q: 'Do I need technical knowledge?', a: 'No. You can create your event in a few minutes from your phone and share the link. If you need help, our team supports you by email.' },
    ],
  },
  final: {
    h2: 'Your next event, on sale today.',
    p: 'Create your brand in a few minutes and try ParyGo free with your first event. If you would rather talk first, write to us at',
    cta: 'Start for free', precios: 'See pricing',
  },
  footer: {
    brand: 'The platform to sell and control tickets for your events, under your own brand and with direct payments.',
    producto: 'Product', ayuda: 'Help', legal: 'Legal',
    links: { como: 'How it works', seguridad: 'Security', incluye: 'What\'s included', precios: 'Pricing', crear: 'Create my brand', preguntas: 'FAQ', panel: 'Log in to the dashboard', terminos: 'Terms', privacidad: 'Privacy' },
    copy: '© 2015 ParyGo. All rights reserved.',
    made: 'Sell under your brand. Get paid directly.',
  },
};

export const DICT: Record<Lang, Dict> = { es, en };
export const RUTA: Record<Lang, string> = { es: '/', en: '/en/' };
