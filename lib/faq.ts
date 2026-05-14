export const FAQ_ITEMS = [
  {
    q: '¿Cobran comisión sobre las ventas?',
    a: 'No. ParyGo cobra un plan fijo por evento. Todo lo que recaudas en venta de entradas es tuyo (descontando solo el costo de la pasarela de pago, que es transparente y va directo al proveedor).',
  },
  {
    q: '¿Qué métodos de pago acepta la plataforma?',
    a: 'Yape, Plin, tarjeta de crédito y débito (Visa, Mastercard, AMEX). Configuramos los activos durante el onboarding según tu público.',
  },
  {
    q: '¿En cuánto tiempo está lista mi landing?',
    a: 'En 24 horas desde que nos pasas logo, colores e info del evento. Te entregamos un preview antes de publicar para que apruebes cambios.',
  },
  {
    q: '¿Cómo se validan las entradas el día del evento?',
    a: 'Cada compra genera un QR único. Tu staff escanea con cualquier celular desde una web (sin instalar app). El aforo se actualiza en vivo y bloqueamos automáticamente cualquier intento de reutilizar un código.',
  },
  {
    q: '¿Puedo ofrecer distintos tipos de entrada y precios?',
    a: 'Sí. General, VIP, preventa, early bird, descuentos por código, paquetes grupales. Sin límite de categorías.',
  },
  {
    q: '¿Qué pasa si compro un pack y no uso todos los eventos?',
    a: 'Los packs son válidos por 12 meses desde la contratación. Eventos no usados no se reembolsan pero quedan disponibles dentro de ese plazo.',
  },
  {
    q: '¿Me entregan datos de los compradores?',
    a: 'Sí. Exportable completo (nombre, DNI, email, teléfono, tipo de entrada, fecha de compra). Cumpliendo Ley de Protección de Datos Personales — los compradores aceptan compartir con la promotora al checkout.',
  },
  {
    q: '¿Cómo es la garantía de 7 días?',
    a: 'Si en los primeros 7 días desde que activas tu pack consideras que la plataforma no sirve para tu caso, devolvemos el 100% del importe del pack. Sin condiciones, sin preguntas.',
  },
] as const;

export type FaqItem = (typeof FAQ_ITEMS)[number];
