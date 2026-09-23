// Medidas de una imagen leyendo SOLO su encabezado.
//
// Por qué existe: la página del evento elige su dirección de diseño según la
// forma del flyer (ver lib/concepto.ts), y las medidas no están en la base —
// `pareceCaptura` corre en el navegador del promotor al subir el archivo y no
// guarda nada. Leer el encabezado es lo más barato que hay sin migración:
// los primeros bytes de un PNG/JPEG/WebP/GIF ya traen ancho y alto.
//
// DEUDA ANOTADA: lo correcto a futuro es guardar ancho y alto al subir el
// flyer (una migración chica: events.cover_w / cover_h). Eso saca esta
// petición del camino de la página que cobra. Mientras tanto, acá va con
// Range de 8 KB y un presupuesto de tiempo duro.
//
// Runtime edge: solo fetch y ArrayBuffer, nada de Node.

export type Medidas = { width: number; height: number };

// 2,5s, no 1,2s. La primera lectura de un flyer recién subido va en FRÍO
// (Worker en Lima → storage en us-west-1, con DNS y TLS nuevos): medido el
// 2026-09-23, 1,06s desde Lima solo la descarga. Con 1,2s el detector se pasaba
// del tope justo cuando el promotor abría su evento para ver el flyer nuevo, y la
// página salía en EDITORIAL (flyer en banda, título arriba). Corre en paralelo
// con las consultas, así que solo cuesta en ese primer pedido en frío.
const TOPE_MS = 2500;

// Medidas ya leídas, por URL. La URL del flyer cambia con cada subida (el nombre
// es nuevo), así que no hay nada que invalidar: dentro de un mismo isolate, el
// mismo flyer se mide UNA vez y la dirección deja de depender de la red.
const MEDIDAS = new Map<string, Medidas>();
const MEDIDAS_TOPE = 500;

// 8 KB, no 1 KB. PNG, GIF y WebP traen las medidas en los primeros 30 bytes,
// pero el JPEG las tiene DESPUÉS de sus segmentos de metadatos: un export de
// Photoshop o Canva con perfil ICC mete 3–6 KB antes, y una foto de cámara con
// EXIF y miniatura, más. Con 1 KB el marcador SOF quedaba fuera de la ventana
// en buena parte de los JPEG reales y la página se iba SIEMPRE a editorial,
// aunque el arte fuera bueno. 8 KB los cubre y sigue siendo una migaja.
const VENTANA = 8 * 1024;

function leerPNG(b: DataView): Medidas | null {
  // 8 bytes de firma + 4 de longitud + 'IHDR' → ancho y alto en 16..23.
  if (b.byteLength < 24) return null;
  if (b.getUint32(0) !== 0x89504e47) return null;
  if (b.getUint32(12) !== 0x49484452) return null; // 'IHDR'
  return { width: b.getUint32(16), height: b.getUint32(20) };
}

function leerGIF(b: DataView): Medidas | null {
  if (b.byteLength < 10) return null;
  if (b.getUint32(0) !== 0x47494638) return null; // 'GIF8'
  return { width: b.getUint16(6, true), height: b.getUint16(8, true) };
}

function leerWebP(b: DataView): Medidas | null {
  if (b.byteLength < 30) return null;
  if (b.getUint32(0) !== 0x52494646) return null; // 'RIFF'
  if (b.getUint32(8) !== 0x57454250) return null; // 'WEBP'
  const tipo = b.getUint32(12);
  if (tipo === 0x56503820) {
    // VP8 (lossy): el fotograma clave trae las medidas en 26..29, 14 bits cada una.
    return { width: b.getUint16(26, true) & 0x3fff, height: b.getUint16(28, true) & 0x3fff };
  }
  if (tipo === 0x5650384c) {
    // VP8L (lossless): 14+14 bits empaquetados a partir del byte 21.
    const n = b.getUint32(21, true);
    return { width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1 };
  }
  if (tipo === 0x56503858) {
    // VP8X (extendido): 24 bits menos uno, little-endian, en 24..29.
    const w = b.getUint8(24) | (b.getUint8(25) << 8) | (b.getUint8(26) << 16);
    const h = b.getUint8(27) | (b.getUint8(28) << 8) | (b.getUint8(29) << 16);
    return { width: w + 1, height: h + 1 };
  }
  return null;
}

function leerJPEG(b: DataView): Medidas | null {
  if (b.byteLength < 4 || b.getUint16(0) !== 0xffd8) return null;
  let i = 2;
  while (i + 9 < b.byteLength) {
    if (b.getUint8(i) !== 0xff) { i += 1; continue; }
    const marca = b.getUint8(i + 1);
    // SOF0..SOF15 llevan las medidas; se saltean SOF4 (DHT), SOF8 y SOF12 (DAC/RST).
    if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
      return { width: b.getUint16(i + 7), height: b.getUint16(i + 5) };
    }
    const largo = b.getUint16(i + 2);
    if (largo < 2) return null; // encabezado corrupto: no se adivina
    i += 2 + largo;
  }
  return null;
}

/**
 * Ancho y alto de la imagen, o null si no se pudo saber.
 *
 * NUNCA lanza: quien llama decide qué hacer con el null, y el criterio del
 * producto es fail-safe (ver lib/concepto.ts). Un flyer que no se puede medir
 * no puede tumbar la página del evento.
 */
export async function medidasDeImagen(url: string | null | undefined): Promise<Medidas | null> {
  if (!url) return null;
  const ya = MEDIDAS.get(url);
  if (ya) return ya;
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), TOPE_MS);
  try {
    // SIN `cache`. En el runtime de Workers esa opción no está implementada y
    // el fetch TIRA ("The 'cache' field on 'RequestInitializerDict' is not
    // implemented"): el catch se lo comía y la página caía SIEMPRE en
    // editorial. En local no pasaba —el fetch de Node la acepta— así que el
    // bug solo se veía en producción: koko, con un flyer bueno de 1080×1350,
    // se servía en editorial. Cloudflare ya cachea las subpeticiones GET por
    // su cuenta, así que no hace falta pedírselo.
    const r = await fetch(url, {
      headers: { Range: `bytes=0-${VENTANA - 1}` },
      signal: corte.signal,
    });
    // SOLO 206. Un 200 significa que el servidor ignoró el Range y está
    // mandando el archivo ENTERO: leerlo sería bajarse varios MB en un edge
    // function, en la página que cobra, que es justo lo que este módulo
    // existe para no hacer. Si eso pasa, no se mide y se cae en editorial.
    if (r.status !== 206) return null;
    const buf = await r.arrayBuffer();
    if (buf.byteLength < 10) return null;
    const b = new DataView(buf);
    const m = leerPNG(b) ?? leerJPEG(b) ?? leerWebP(b) ?? leerGIF(b);
    if (!m || !m.width || !m.height) return null;
    if (MEDIDAS.size >= MEDIDAS_TOPE) MEDIDAS.clear();
    MEDIDAS.set(url, m);
    return m;
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}
