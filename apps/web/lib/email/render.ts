// Shell de email con la identidad cálida (mismo sistema que el email del ticket):
// fondo crema, tarjeta blanca, logo de la marca, color de marca con contraste
// automático. Email-safe: tablas + estilos inline, fuentes web-safe.
import { brandColor, brandInk, contrastOn } from '@/lib/brandColors';

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const CREAM = '#FBF7F0', CREAM3 = '#EFE6D6', INK = '#231C17', INK2 = '#6B5F54', INK3 = '#A89B8C';
const ALERT = '#C0392B';

export type WarmEmailOpts = {
  brandName: string;
  primaryColor?: string | null;
  logoUrl?: string | null;
  eyebrow: string;
  tone?: 'brand' | 'alert';   // color del eyebrow + banda superior
  title: string;
  subtitle?: string | null;   // ej. fecha · venue
  paragraphs?: string[];      // cuerpo
  highlight?: { label: string; value: string } | null; // ej. el código grande
  button?: { label: string; url: string } | null;
  footerHtml?: string | null; // contacto / soporte
};

// Devuelve { html, primary, onBrand, ink } por si el caller quiere reusar colores.
export function renderWarmEmail(o: WarmEmailOpts): { html: string } {
  const primary = brandColor(o.primaryColor ?? undefined);
  const onBrand = contrastOn(primary);
  const ink = brandInk(o.primaryColor ?? undefined);
  const band = o.tone === 'alert' ? ALERT : primary;
  const eyebrowColor = o.tone === 'alert' ? ALERT : ink;

  const logo = o.logoUrl
    ? `<img src="${escapeHtml(o.logoUrl)}" alt="${escapeHtml(o.brandName)}" height="44" style="display:block;height:44px;width:auto;max-height:44px;border:0;outline:none;text-decoration:none">`
    : `<span style="font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${INK}">${escapeHtml(o.brandName)}</span>`;

  const paras = (o.paragraphs ?? [])
    .map((p) => `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.5;color:${INK}">${p}</p>`)
    .join('');

  const highlight = o.highlight
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 16px"><tr><td style="border:2px dashed ${CREAM3};border-radius:14px;padding:16px;text-align:center">
        <p style="margin:0 0 4px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${INK3}">${escapeHtml(o.highlight.label)}</p>
        <p style="margin:0;font-family:${FONT};font-size:30px;font-weight:800;letter-spacing:.08em;color:${ink}">${escapeHtml(o.highlight.value)}</p>
      </td></tr></table>`
    : '';

  const button = o.button
    ? `<a href="${o.button.url}" style="display:inline-block;padding:15px 28px;background:${primary};color:${onBrand};text-decoration:none;font-family:${FONT};font-weight:700;font-size:15px;border-radius:999px">${escapeHtml(o.button.label)}</a>`
    : '';

  return {
    html: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(o.title)}</title></head>
<body style="margin:0;padding:0;background:${CREAM}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM}"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid ${CREAM3};border-radius:20px;overflow:hidden">
    <tr><td style="height:6px;background:${band};font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td style="padding:26px 32px 0">${logo}</td></tr>
    <tr><td style="padding:18px 32px 0">
      <p style="margin:0;font-family:${FONT};font-size:11px;line-height:1;font-weight:700;letter-spacing:.14em;color:${eyebrowColor};text-transform:uppercase">${escapeHtml(o.eyebrow)}</p>
      <h1 style="margin:10px 0 0;font-family:${FONT};font-size:26px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;color:${INK}">${escapeHtml(o.title)}</h1>
      ${o.subtitle ? `<p style="margin:7px 0 0;font-family:${FONT};font-size:14px;line-height:1.4;color:${INK2}">${escapeHtml(o.subtitle)}</p>` : ''}
    </td></tr>
    <tr><td style="padding:20px 32px 0">${paras}${highlight}${button}</td></tr>
    <tr><td style="padding:22px 32px 30px">${o.footerHtml ?? ''}
      <p style="margin:18px 0 0;font-family:${FONT};font-size:11px;line-height:1.4;color:${INK3}">Enviado por ${escapeHtml(o.brandName)} &middot; <span style="color:${INK2};font-weight:700">parygo<span style="color:#FF6A3D">.</span></span></p>
    </td></tr>
  </table>
</td></tr></table></body></html>`,
  };
}
