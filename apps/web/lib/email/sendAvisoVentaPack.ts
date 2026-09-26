import { sendViaResend, FROM_EMAIL } from '@/lib/email/send';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv, serverEnv } from '@/lib/env';

// Aviso a PAUL (SUPER_ADMIN_EMAIL) cada vez que alguien le paga un paquete
// (2026-09-26, pedido de Paul). Lo llaman los tres caminos que acreditan una
// compra —webhook de MP, vuelta de MP y vuelta de PayPal— SOLO cuando
// settle_pack_purchase devuelve 'credited', que pasa una única vez por compra:
// un reintento del webhook o volver a abrir la página no manda otro correo.
// Las marcas de prueba (is_test) no avisan. Nunca tira: si el correo falla,
// el pago ya quedó acreditado igual.
const limpio = (s: string) => s.replace(/[<>&"']/g, '').slice(0, 80);

export async function avisarVentaPack(compraId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: c } = await admin
      .from('pack_purchases')
      .select('pack, currency, amount_cents, provider, created_by, brand:brands ( name, slug, contact_email, is_test, event_balance )')
      .eq('id', compraId)
      .maybeSingle();
    const b = (Array.isArray(c?.brand) ? c?.brand[0] : c?.brand) as
      | { name: string; slug: string; contact_email: string | null; is_test: boolean; event_balance: number }
      | null
      | undefined;
    if (!c || !b || b.is_test) return;

    const monto = `${c.currency === 'USD' ? 'US$' : 'S/'}${(c.amount_cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    const eventos = `${c.pack} evento${c.pack === 1 ? '' : 's'}`;
    const via = c.provider === 'paypal' ? 'PayPal' : 'Mercado Pago';
    // created_by nulo = alta nueva desde /empezar; con usuario = recompra desde el panel.
    const tipo = c.created_by ? 'Recompra desde su panel' : 'Marca nueva (alta desde /empezar)';
    const marca = limpio(b.name);
    const cabina = `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/cabina-7k29x/brands/${encodeURIComponent(b.slug)}`;

    const filas: [string, string][] = [
      ['Marca', `${marca} · ${b.slug}.parygo.com`],
      ['Compró', `${eventos} · ${monto}`],
      ['Pago', via],
      ['Tipo', tipo],
      ['Contacto', limpio(b.contact_email ?? '—')],
      ['Saldo ahora', `${b.event_balance} evento${b.event_balance === 1 ? '' : 's'}`],
    ];
    const html = `<!doctype html><html lang="es"><body style="margin:0;background:#FFFFFF;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;font-family:Helvetica,Arial,sans-serif;color:#0A0A0A;">
<tr><td style="font-size:22px;font-weight:700;padding-bottom:6px;">Nueva venta: ${monto}</td></tr>
<tr><td style="font-size:15px;color:#555555;padding-bottom:20px;">${marca} compró ${eventos}.</td></tr>
${filas.map(([k, v]) => `<tr><td style="font-size:15px;line-height:1.5;padding:8px 0;border-top:1px solid #EAEAEA;"><span style="color:#555555;">${k}</span><br>${v}</td></tr>`).join('')}
<tr><td style="padding-top:22px;"><a href="${cabina}" style="display:inline-block;background:#0A0A0A;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;">Ver la marca en la cabina</a></td></tr>
</table></td></tr></table></body></html>`;
    const text = [`Nueva venta: ${monto}`, `${marca} compró ${eventos}.`, '', ...filas.map(([k, v]) => `${k}: ${v}`), '', `Cabina: ${cabina}`].join('\n');

    await sendViaResend({
      from: `ParyGo <${FROM_EMAIL()}>`,
      to: [serverEnv.SUPER_ADMIN_EMAIL],
      subject: `💰 Nueva venta: ${marca} · ${eventos} · ${monto}`,
      html,
      text,
      tags: [{ name: 'kind', value: 'aviso_venta_pack' }],
    });
  } catch (e) {
    console.error('[avisarVentaPack] no se pudo avisar', e instanceof Error ? e.message : String(e));
  }
}
