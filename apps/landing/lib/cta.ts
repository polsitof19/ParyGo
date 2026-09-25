import { SITE } from './site';

// "Empezar" y "Elegir" (packs) van al FORMULARIO de solicitud en el app host
// (Paul, 2026-09-25): el mailto abría Outlook/Microsoft en vez de algo útil.
// El pack se compra después, desde el panel (/admin/comprar). Solo "final"
// sigue siendo un correo (es el link "escríbenos").
const base = `mailto:${SITE.email}`;
const solicitud = 'https://app.parygo.com/organizadores';

const enc = (text: string) => encodeURIComponent(text);

export const CTA = {
  hero: solicitud,
  pack1: solicitud,
  pack3: solicitud,
  pack5: solicitud,
  pack10: solicitud,
  final: `${base}?subject=${enc('Quiero conversar sobre mi próximo evento')}`,
  requestAccess: solicitud,
} as const;

export type CTAKey = keyof typeof CTA;
