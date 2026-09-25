import { sendViaResend, FROM_EMAIL, type SendResult } from '@/lib/email/send';

// Código de verificación del alta de /empezar. Papel crema como los demás
// emails que no son de entrada (CLAUDE.md). El código va grande y separado
// en dos grupos de cuatro para leerlo y tipearlo sin perderse. NO lleva el
// nombre de marca que escribió quien pidió el código: es texto libre que
// cualquiera podía hacer llegar a cualquier casilla desde el dominio de
// ParyGo (security review 2026-09-25).
export async function sendCodigoAlta(a: { to: string; codigo: string }): Promise<SendResult> {
  const grupos = a.codigo.length === 8 ? `${a.codigo.slice(0, 4)} ${a.codigo.slice(4)}` : a.codigo;
  const FONT = "'Hanken Grotesk', Helvetica, Arial, sans-serif";
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#FBF7F0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7F0;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
<tr><td style="font-family:${FONT};font-size:22px;font-weight:800;color:#231C17;padding-bottom:28px;">parygo<span style="color:#FF6A3D;">.</span></td></tr>
<tr><td style="font-family:${FONT};font-size:17px;line-height:1.5;color:#231C17;padding-bottom:20px;">Este es tu código para crear tu marca en ParyGo:</td></tr>
<tr><td style="font-family:${FONT};font-size:40px;font-weight:800;letter-spacing:0.08em;color:#231C17;padding:20px 0;border-top:1px solid rgba(35,28,23,0.13);border-bottom:1px solid rgba(35,28,23,0.13);">${grupos}</td></tr>
<tr><td style="font-family:${FONT};font-size:15px;line-height:1.5;color:rgba(35,28,23,0.70);padding-top:20px;">Escríbelo en la página donde te registraste. Vence en una hora.<br>Si no fuiste tú, ignora este correo: sin el código no se crea nada.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    `Tu código para crear tu marca en ParyGo: ${grupos}`,
    '',
    'Escríbelo en la página donde te registraste. Vence en una hora.',
    'Si no fuiste tú, ignora este correo: sin el código no se crea nada.',
  ].join('\n');
  return sendViaResend({
    from: `ParyGo <${FROM_EMAIL()}>`,
    to: [a.to],
    subject: `${grupos} es tu código de ParyGo`,
    html,
    text,
    tags: [{ name: 'kind', value: 'codigo_alta' }],
  });
}
