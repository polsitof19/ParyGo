// Avisos push (0079): cifra un aviso como el server (lib/push.ts) y lo
// descifra como el teléfono (RFC 8291 + 8188). Verifica aes128gcm (lo único
// que acepta Apple), la firma VAPID con la clave pública derivada del JWK y
// que el teléfono lee el mismo aviso. No manda nada a ningún servicio.
//   cd apps/web && npx tsx ../../e2e/push-cifrado.mts
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { buildPushPayload } from '@block65/webcrypto-web-push';

if (!process.env.VAPID_PRIVATE_JWK) {
  const linea = readFileSync('.env.local', 'utf8').split('\n').find((l) => l.startsWith('VAPID_PRIVATE_JWK='));
  if (!linea) throw new Error('Falta VAPID_PRIVATE_JWK en apps/web/.env.local');
  process.env.VAPID_PRIVATE_JWK = linea.slice('VAPID_PRIVATE_JWK='.length).trim().replace(/^'|'$/g, '');
}
const { vapidPublica } = await import('../apps/web/lib/push.ts');
const pub = vapidPublica()!;
const k = JSON.parse(process.env.VAPID_PRIVATE_JWK!);
const b64u = (b: ArrayBuffer | Uint8Array) => Buffer.from(b as ArrayBuffer).toString('base64url');

const tel = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const telPub = new Uint8Array(await crypto.subtle.exportKey('raw', tel.publicKey));
const authSecret = crypto.getRandomValues(new Uint8Array(16));
const aviso = { title: '💰 S/ 150 · Marca', body: '1 evento · Mercado Pago', url: '/cabina-7k29x', tag: 'venta-x' };
const r = await buildPushPayload({ data: aviso, options: { ttl: 86400, urgency: 'high' } },
  { endpoint: 'https://web.push.apple.com/abc', expirationTime: null, keys: { p256dh: b64u(telPub), auth: b64u(authSecret) } },
  { subject: 'mailto:parygoasistencia@gmail.com', publicKey: pub, privateKey: k.d });
assert.equal(r.headers['content-encoding'], 'aes128gcm');
assert.match(r.headers.authorization, new RegExp(`^vapid t=.+, k=${pub}$`));

const [, jwt] = r.headers.authorization.match(/t=([^,]+)/)!;
const [h, p, s] = jwt.split('.');
const vk = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: k.x, y: k.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vk, Buffer.from(s, 'base64url'), Buffer.from(`${h}.${p}`)), 'firma VAPID válida');
assert.equal(JSON.parse(Buffer.from(p, 'base64url').toString()).aud, 'https://web.push.apple.com');

const body = new Uint8Array(r.body);
const salt = body.slice(0, 16); const idlen = body[20]; const srvPub = body.slice(21, 21 + idlen); const ct = body.slice(21 + idlen);
const srvKey = await crypto.subtle.importKey('raw', srvPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: srvKey }, tel.privateKey, 256));
const hkdf = async (sal: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sal, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), len * 8));
const ikm = await hkdf(authSecret, ecdh, Buffer.concat([Buffer.from('WebPush: info\0'), telPub, srvPub]), 32);
const cek = await hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
const nonce = await hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ct));
assert.deepEqual(JSON.parse(Buffer.from(plain.slice(0, plain.lastIndexOf(2))).toString()), aviso, 'el teléfono lee el mismo aviso');
console.log('✔ push: aes128gcm, firma VAPID válida, el teléfono descifra el aviso');
