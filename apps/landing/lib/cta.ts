import { SITE } from './site';

const base = `https://wa.me/${SITE.whatsappNumber}`;

const enc = (text: string) => encodeURIComponent(text);

export const CTA = {
  hero: `${base}?text=${enc('Hola ParyGo, quiero conocer la plataforma')}`,
  pack1: `${base}?text=${enc('Hola ParyGo, quiero contratar 1 evento (S/200)')}`,
  pack3: `${base}?text=${enc('Hola ParyGo, quiero contratar el Pack 3 (S/540)')}`,
  pack5: `${base}?text=${enc('Hola ParyGo, quiero contratar el Pack 5 (S/850)')}`,
  pack10: `${base}?text=${enc('Hola ParyGo, quiero contratar el Pack 10 (S/1,500)')}`,
  final: `${base}?text=${enc('Hola ParyGo, quiero conversar sobre mi próximo evento')}`,
  // "Pedir acceso" de organizadores. Interino por WhatsApp; cuando el form de
  // solicitud (Grupo C) esté en prod, se repunta a https://app.parygo.com/organizadores.
  requestAccess: `${base}?text=${enc('Hola ParyGo, soy organizador y quiero pedir acceso a la plataforma')}`,
} as const;

export type CTAKey = keyof typeof CTA;
