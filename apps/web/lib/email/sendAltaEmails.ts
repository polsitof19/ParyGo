import { sendViaResend, FROM_EMAIL, type SendResult } from '@/lib/email/send';
import { publicEnv } from '@/lib/env';

// Correos del alta con pack (/empezar). Papel crema como los demás que no son
// de entrada. Sin texto libre del formulario salvo el nombre de marca que ya
// quedó creada con ese correo de contacto (no es un canal abierto: hace falta
// haber pagado).
const FONT = "'Hanken Grotesk', Helvetica, Arial, sans-serif";
const limpio = (s: string) => s.replace(/[<>&"']/g, '').slice(0, 60);

function shell(cuerpo: string, boton?: { href: string; label: string }): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#FBF7F0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7F0;padding:32px 16px;">
<tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
<tr><td style="font-family:${FONT};font-size:22px;font-weight:800;color:#231C17;padding-bottom:28px;">parygo<span style="color:#FF6A3D;">.</span></td></tr>
<tr><td style="font-family:${FONT};font-size:17px;line-height:1.55;color:#231C17;">${cuerpo}</td></tr>
${boton ? `<tr><td style="padding-top:24px;"><a href="${boton.href}" style="display:inline-block;background:#FF6A3D;color:#231C17;font-family:${FONT};font-size:16px;font-weight:700;text-decoration:none;padding:14px 26px;border-radius:999px;">${boton.label}</a></td></tr>` : ''}
</table></td></tr></table></body></html>`;
}

// Pagó pero no volvió a la página (cerró la pestaña, otro dispositivo): el
// link lleva a terminar el alta. El id de la compra es el secreto del link.
export async function sendAltaPendiente(a: { to: string; marca: string; compraId: string }): Promise<SendResult> {
  const url = `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/empezar/listo?compra=${a.compraId}`;
  const marca = limpio(a.marca);
  return sendViaResend({
    from: `ParyGo <${FROM_EMAIL()}>`,
    to: [a.to],
    subject: `Tu pago se aprobó: termina de crear ${marca}`,
    html: shell(`Recibimos tu pago. Solo falta un paso: elige tu contraseña y entras a tu panel con tus eventos cargados.`, { href: url, label: 'Terminar de crear mi marca' }),
    text: `Recibimos tu pago para ${marca}. Solo falta elegir tu contraseña: ${url}`,
    tags: [{ name: 'kind', value: 'alta_pendiente' }],
  });
}

// Bienvenida al crear la cuenta. También es el aviso para el dueño real del
// correo: el alta con pack no pide código, así que si no fue él, se entera.
export async function sendAltaBienvenida(a: { to: string; marca: string; slug: string }): Promise<SendResult> {
  const marca = limpio(a.marca);
  const panel = `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/admin`;
  return sendViaResend({
    from: `ParyGo <${FROM_EMAIL()}>`,
    to: [a.to],
    subject: `${marca} ya está en ParyGo`,
    html: shell(`Tu marca <strong>${marca}</strong> está lista. Tu página es <strong>${a.slug}.parygo.com</strong> y entras a tu panel con este correo y la contraseña que elegiste.<br><br><span style="color:rgba(35,28,23,0.70);font-size:15px;">¿No creaste esta cuenta? Responde a este correo y lo revisamos.</span>`, { href: panel, label: 'Ir a mi panel' }),
    text: `Tu marca ${marca} está lista: ${a.slug}.parygo.com. Tu panel: ${panel}\n¿No creaste esta cuenta? Responde a este correo y lo revisamos.`,
    tags: [{ name: 'kind', value: 'alta_bienvenida' }],
  });
}
