// Verificación de la firma de los webhooks de MercadoPago (Web Crypto, edge).
// Compartida por el webhook de entradas (por marca) y el de paquetes de ParyGo.
// =============================================================
// MP signature verification (Web Crypto / edge-runtime compatible)
// Header format: "ts=<ts>,v1=<hex_hmac>"
// HMAC string: `id:<data_id>;request-id:<x_request_id>;ts:<ts>;`
// =============================================================
export async function verifyMpSignature({
  header,
  secret,
  dataId,
  requestId,
}: {
  header: string;
  secret: string;
  dataId: string;
  requestId: string;
}): Promise<boolean> {
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      // split SOLO en el primer '=' (un valor podría contener '=', p. ej. base64).
      const idx = p.indexOf('=');
      const k = idx === -1 ? p : p.slice(0, idx);
      const v = idx === -1 ? '' : p.slice(idx + 1);
      return [k.trim(), v.trim()];
    })
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  // Anti-replay: rechazar firmas viejas (> 5 min de skew). La idempotencia de
  // settle_mp_payment (mp_payment_id único) ya evita duplicados; esto agrega
  // defensa contra el replay de una firma HMAC capturada. MP firma CADA intento
  // de notificación con su propio ts, así que los reintentos legítimos traen un
  // ts fresco y NO se rechazan — solo se descarta un payload viejo reenviado.
  const tsNum = parseInt(ts, 10);
  if (!Number.isFinite(tsNum)) return false;
  const tsMs = tsNum > 1e12 ? tsNum : tsNum * 1000; // MP usa segundos (a veces ms)
  if (Math.abs(Date.now() - tsMs) > 300_000) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(manifest)
  );
  const computed = bufferToHex(sigBuf);
  return timingSafeHexEqual(computed, v1);
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i]!.toString(16).padStart(2, '0');
  }
  return s;
}

// Constant-time string compare. Inputs must be lowercase hex.
function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

