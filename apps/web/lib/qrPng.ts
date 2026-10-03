import QRCode from 'qrcode';

// =============================================================
// QR → PNG, en el EDGE
// =============================================================
// El email de la entrada lleva el QR como imagen (inline por cid y adjunto).
// `QRCode.toDataURL` del lado del server pasa por pngjs + Buffer + zlib de
// Node, y eso no es algo en lo que confiar dentro de un Worker. Acá se usa
// solo la MATRIZ del QR (`QRCode.create`, JS puro) y el PNG se arma a mano:
// escala de grises de 1 bit, un IDAT comprimido con CompressionStream
// ('deflate' = zlib, lo que pide PNG), que existe en Workers, en el runtime
// edge de Next y en Node ≥ 18. Si no existiera, se cae a bloques deflate SIN
// comprimir (válidos igual; el archivo pesa más, ~25 KB, no se rompe).
//
// El payload va SOLO dentro del QR. Nada de esto se escribe como texto.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length; i++) { a = (a + bytes[i]!) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function chunk(tipo: string, data: Uint8Array): Uint8Array {
  const t = new TextEncoder().encode(tipo);
  const td = concat([t, data]);
  return concat([u32(data.length), td, u32(crc32(td))]);
}

/** zlib (RFC 1950). Comprimido si hay CompressionStream; si no, bloques "stored". */
async function zlib(raw: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== 'undefined') {
    try {
      const cs = new CompressionStream('deflate');
      const stream = new Blob([raw]).stream().pipeThrough(cs);
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      // cae al camino sin comprimir
    }
  }
  const parts: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let i = 0; i < raw.length || i === 0; i += 65535) {
    const blk = raw.subarray(i, Math.min(i + 65535, raw.length));
    const last = i + 65535 >= raw.length ? 1 : 0;
    parts.push(new Uint8Array([last, blk.length & 255, blk.length >>> 8, ~blk.length & 255, (~blk.length >>> 8) & 255]), blk);
    if (raw.length === 0) break;
  }
  parts.push(u32(adler32(raw)));
  return concat(parts);
}

/**
 * PNG del QR (negro sobre blanco, margen de 4 módulos). `escala` = px por
 * módulo: con 12, un QR de UUID (29 módulos) sale de 444 px, nítido a 216 px
 * en una pantalla retina.
 */
export async function qrPng(payload: string, escala = 12): Promise<Uint8Array> {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const margen = 4;
  const lado = (n + margen * 2) * escala;
  const bytesFila = Math.ceil(lado / 8);
  const raw = new Uint8Array((bytesFila + 1) * lado);
  // Cada fila de MÓDULOS se arma una vez y se copia `escala` veces: el
  // trabajo por píxel baja de lado² a lado × (n + 2·margen). Corre en el
  // Worker que manda el correo, y ahí la CPU cuenta.
  for (let my = -margen; my < n + margen; my++) {
    const linea = new Uint8Array(bytesFila + 1); // [0] = filtro "None"
    for (let x = 0; x < lado; x++) {
      const mx = Math.floor(x / escala) - margen;
      const oscuro = mx >= 0 && my >= 0 && mx < n && my < n && qr.modules.get(my, mx) === 1;
      // 1 bit por píxel: 1 = blanco, 0 = negro.
      if (!oscuro) linea[1 + (x >> 3)]! |= 0x80 >> (x & 7);
    }
    const y0 = (my + margen) * escala;
    for (let k = 0; k < escala; k++) raw.set(linea, (y0 + k) * (bytesFila + 1));
  }
  const ihdr = concat([u32(lado), u32(lado), new Uint8Array([1, 0, 0, 0, 0])]); // 1 bit, gris
  return concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', await zlib(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

export function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
