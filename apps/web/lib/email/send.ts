// Envío vía Resend (edge-safe: fetch, sin SDK). NUNCA tira: devuelve un resultado
// tipado para que el caller no rompa su flujo si el email falla.
import { serverEnv } from '@/lib/env';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type SendResult =
  | { ok: true; status: 'sent'; resendId: string }
  | { ok: true; status: 'skipped'; reason: 'no_api_key' }
  | { ok: false; status: 'error'; reason: string };

export async function sendViaResend(payload: {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  tags?: { name: string; value: string }[];
}): Promise<SendResult> {
  const apiKey = serverEnv.RESEND_API_KEY;
  if (!apiKey) return { ok: true, status: 'skipped', reason: 'no_api_key' };

  const body: Record<string, unknown> = {
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  };
  if (payload.replyTo) body.reply_to = payload.replyTo;
  if (payload.tags) body.tags = payload.tags;

  try {
    const resp = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      // NUNCA loguear la API key.
      console.error('[sendViaResend] resend rejected', { status: resp.status, body: t.slice(0, 300) });
      return { ok: false, status: 'error', reason: `resend_${resp.status}` };
    }
    const data = (await resp.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, status: 'sent', resendId: data?.id ?? '' };
  } catch (err) {
    console.error('[sendViaResend] network error', { error: err instanceof Error ? err.message : String(err) });
    return { ok: false, status: 'error', reason: 'network' };
  }
}

export const FROM_EMAIL = () => serverEnv.RESEND_FROM_EMAIL ?? 'tickets@parygo.com';
