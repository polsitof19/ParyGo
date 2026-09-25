import { sendViaResend, FROM_EMAIL, type SendResult } from '@/lib/email/send';

// Código de verificación del alta de /empezar. Papel crema como los demás
// emails que no son de entrada (CLAUDE.md). El código va grande y separado
// en dos grupos de cuatro para leerlo y tipearlo sin perderse. NO lleva el
// nombre de marca que escribió quien pidió el código: es texto libre que
// cualquiera podía hacer llegar a cualquier casilla desde el dominio de
// ParyGo (security review 2026-09-25). En español o inglés según el alta.
const TXT = {
  es: {
    intro: 'Este es tu código para crear tu marca en ParyGo:',
    uso: 'Ingrésalo en la página donde te registraste. Vence en una hora.',
    noFuiste: 'Si no solicitaste este código, ignora este correo: sin él no se crea ninguna cuenta.',
    asunto: (c: string) => `${c} es tu código de ParyGo`,
  },
  en: {
    intro: 'This is your code to create your brand on ParyGo:',
    uso: 'Enter it on the page where you signed up. It expires in one hour.',
    noFuiste: 'If you did not request this code, please ignore this email: no account is created without it.',
    asunto: (c: string) => `${c} is your ParyGo code`,
  },
};

export async function sendCodigoAlta(a: { to: string; codigo: string; lang?: 'es' | 'en' }): Promise<SendResult> {
  const t = TXT[a.lang === 'en' ? 'en' : 'es'];
  const grupos = a.codigo.length === 8 ? `${a.codigo.slice(0, 4)} ${a.codigo.slice(4)}` : a.codigo;
  const FONT = "'Hanken Grotesk', Helvetica, Arial, sans-serif";
  const html = `<!doctype html><html lang="${a.lang === 'en' ? 'en' : 'es'}"><body style="margin:0;background:#FBF7F0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7F0;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
<tr><td style="font-family:${FONT};font-size:22px;font-weight:800;color:#231C17;padding-bottom:28px;">parygo<span style="color:#FF6A3D;">.</span></td></tr>
<tr><td style="font-family:${FONT};font-size:17px;line-height:1.5;color:#231C17;padding-bottom:20px;">${t.intro}</td></tr>
<tr><td style="font-family:${FONT};font-size:40px;font-weight:800;letter-spacing:0.08em;color:#231C17;padding:20px 0;border-top:1px solid rgba(35,28,23,0.13);border-bottom:1px solid rgba(35,28,23,0.13);">${grupos}</td></tr>
<tr><td style="font-family:${FONT};font-size:15px;line-height:1.5;color:rgba(35,28,23,0.70);padding-top:20px;">${t.uso}<br>${t.noFuiste}</td></tr>
</table></td></tr></table></body></html>`;
  return sendViaResend({
    from: `ParyGo <${FROM_EMAIL()}>`,
    to: [a.to],
    subject: t.asunto(grupos),
    html,
    text: [`${t.intro} ${grupos}`, '', t.uso, t.noFuiste].join('\n'),
    tags: [{ name: 'kind', value: 'codigo_alta' }],
  });
}
