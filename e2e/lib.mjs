// Helpers compartidos del E2E. Solo demotest. Nunca Code/Almighty.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = resolve(ROOT, 'tmp', 'e2e');
mkdirSync(OUT, { recursive: true });

export const env = Object.fromEntries(
  readFileSync(resolve(ROOT, 'apps/web/.env.local'), 'utf8')
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

export const BASE = process.env.E2E_BASE || 'http://localhost:3001';
export const BRAND = 'demotest';
export const FORBIDDEN_SLUGS = new Set(['code']);
export const REF = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];

// service-role: SOLO para lecturas de verificación y para fabricar sesiones.
export const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
export const anon = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const t0 = Date.now();
export const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s]`, ...a);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Sesión real (JWT del rol) sin conocer la contraseña: magic link generado por
// service-role (NO envía email, NO cambia la password) canjeado con verifyOtp.
export async function otpSession(email) {
  const { data, error } = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw new Error(`generateLink ${email}: ${error.message}`);
  const { data: s, error: e2 } = await anon().auth.verifyOtp({
    type: 'magiclink',
    token_hash: data.properties.hashed_token,
  });
  if (e2 || !s?.session) throw new Error(`verifyOtp ${email}: ${e2?.message}`);
  return s.session;
}

// Cookie de @supabase/ssr (base64-, chunked a 3180) para el host local.
export function sessionCookies(session, base = BASE) {
  const u = new URL(base);
  const b64 = Buffer.from(JSON.stringify(session), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const value = 'base64-' + b64;
  const key = `sb-${REF}-auth-token`;
  const parts =
    value.length <= 3180
      ? [{ name: key, value }]
      : Array.from({ length: Math.ceil(value.length / 3180) }, (_, i) => ({
          name: `${key}.${i}`,
          value: value.slice(i * 3180, (i + 1) * 3180),
        }));
  return parts.map((p) => ({
    ...p,
    domain: u.hostname,
    path: '/',
    httpOnly: true,
    secure: u.protocol === 'https:',
    sameSite: 'Lax',
  }));
}

// Fecha para <input type=datetime-local> en hora Lima (UTC-5, sin DST).
export function limaLocal(date) {
  const d = new Date(date.getTime() - 5 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}

export function saveJson(name, obj) {
  writeFileSync(resolve(OUT, name), JSON.stringify(obj, null, 2));
}

export async function toasts(page) {
  return (await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, ' ').trim());
}

export async function bodyText(page, n = 400) {
  return (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, n);
}
