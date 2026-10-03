// País y medio de pago manual de una marca (0088). Regla ÚNICA para todos los
// que escriben brands.metodo_manual / yape_number (la CUENTA del medio) /
// yape_holder (titular; en USDT, la red): Mi marca y la cabina. Una cuenta mal
// tipeada manda la plata de los compradores a otra persona.
import type { Moneda } from './moneda';
import type { Zona } from './zona';

export const MEDIOS = ['yape', 'nequi', 'bizum', 'zelle', 'usdt', 'transferencia'] as const;
export type Medio = (typeof MEDIOS)[number];
export const medioDe = (v: unknown): Medio =>
  typeof v === 'string' && (MEDIOS as readonly string[]).includes(v) ? (v as Medio) : 'yape';

// Igual que el CHECK brands_metodo_moneda_check de la 0088.
const MONEDA_DEL_MEDIO: Partial<Record<Medio, Moneda>> = { yape: 'PEN', nequi: 'COP', bizum: 'EUR', zelle: 'USD', usdt: 'USD' };
export const medioSirve = (medio: Medio, moneda: Moneda) => (MONEDA_DEL_MEDIO[medio] ?? moneda) === moneda;

export type Pais = { id: string; nombre: string; name: string; moneda: Moneda; zona: Zona; medios: Medio[] };
// País = preset de moneda + zona. Los medios en el orden en que se ofrecen.
export const PAISES: Pais[] = [
  { id: 'PE', nombre: 'Perú', name: 'Peru', moneda: 'PEN', zona: 'America/Lima', medios: ['yape', 'transferencia'] },
  { id: 'CO', nombre: 'Colombia', name: 'Colombia', moneda: 'COP', zona: 'America/Bogota', medios: ['nequi', 'transferencia'] },
  { id: 'MX', nombre: 'México', name: 'Mexico', moneda: 'MXN', zona: 'America/Mexico_City', medios: ['transferencia'] },
  { id: 'CL', nombre: 'Chile', name: 'Chile', moneda: 'CLP', zona: 'America/Santiago', medios: ['transferencia'] },
  { id: 'AR', nombre: 'Argentina', name: 'Argentina', moneda: 'ARS', zona: 'America/Argentina/Buenos_Aires', medios: ['transferencia'] },
  { id: 'EC', nombre: 'Ecuador', name: 'Ecuador', moneda: 'USD', zona: 'America/Guayaquil', medios: ['transferencia', 'usdt', 'zelle'] },
  { id: 'ES', nombre: 'España', name: 'Spain', moneda: 'EUR', zona: 'Europe/Madrid', medios: ['bizum', 'transferencia'] },
  { id: 'US', nombre: 'Estados Unidos', name: 'United States', moneda: 'USD', zona: 'America/New_York', medios: ['zelle', 'usdt', 'transferencia'] },
];
// La marca guarda moneda + zona, no el país: se reconoce por las dos.
export const paisDe = (moneda: string, zona: string): Pais =>
  PAISES.find((p) => p.moneda === moneda && p.zona === zona) ?? PAISES[0]!;

// Nombre del medio tal como lo ve el comprador y el organizador.
export const NOMBRE_MEDIO: Record<Medio, { es: string; en: string }> = {
  yape: { es: 'Yape', en: 'Yape' },
  nequi: { es: 'Nequi', en: 'Nequi' },
  bizum: { es: 'Bizum', en: 'Bizum' },
  zelle: { es: 'Zelle', en: 'Zelle' },
  usdt: { es: 'USDT', en: 'USDT' },
  transferencia: { es: 'Transferencia bancaria', en: 'Bank transfer' },
};

// El mismo nombre para usarlo EN MEDIO de una frase ("Pagas con transferencia
// bancaria"): solo la transferencia pasa a minúscula. Yape queda "Yape".
export const medioFrase = (medio: Medio, l: 'es' | 'en' = 'es') =>
  medio === 'transferencia' ? NOMBRE_MEDIO[medio][l].toLowerCase() : NOMBRE_MEDIO[medio][l];

type Ok = { ok: true; cuenta: string; titular: string };
type Mal = { ok: false; es: string; en: string };
const mal = (es: string, en: string): Mal => ({ ok: false, es, en });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RED_USDT = ['TRC20', 'ERC20', 'BEP20', 'POLYGON', 'SOLANA'] as const;

// Limpia y valida la cuenta del medio. Cuenta vacía = "todavía no lo configuró"
// (vale, como el Yape vacío); quien exige que haya método es metodoPago.ts.
export function validarCuenta(medio: Medio, cuentaRaw: string, titularRaw: string): Ok | Mal {
  const titular = titularRaw.trim().slice(0, 120);
  let cuenta = cuentaRaw.trim();
  if (cuenta === '') return { ok: true, cuenta: '', titular };
  switch (medio) {
    case 'yape':
      cuenta = cuenta.replace(/[\s-]/g, '').replace(/^\+?51(?=9\d{8}$)/, '');
      if (!/^9\d{8}$/.test(cuenta)) return mal('Pon el celular de Yape: 9 dígitos, empieza con 9', 'Enter the Yape mobile number: 9 digits, starting with 9');
      break;
    case 'nequi':
      cuenta = cuenta.replace(/[\s-]/g, '').replace(/^\+?57(?=3\d{9}$)/, '');
      if (!/^3\d{9}$/.test(cuenta)) return mal('Pon el celular de Nequi: 10 dígitos, empieza con 3', 'Enter the Nequi mobile number: 10 digits, starting with 3');
      break;
    case 'bizum':
      cuenta = cuenta.replace(/[\s-]/g, '').replace(/^(\+|00)?34(?=[67]\d{8}$)/, '');
      if (!/^[67]\d{8}$/.test(cuenta)) return mal('Pon el móvil de Bizum: 9 dígitos, empieza con 6 o 7', 'Enter the Bizum mobile number: 9 digits, starting with 6 or 7');
      break;
    case 'zelle': {
      const tel = cuenta.replace(/[\s().-]/g, '').replace(/^\+?1(?=\d{10}$)/, '');
      if (EMAIL.test(cuenta)) cuenta = cuenta.toLowerCase();
      else if (/^\d{10}$/.test(tel)) cuenta = tel;
      else return mal('Pon el correo o el teléfono (10 dígitos) de tu Zelle', 'Enter your Zelle email or phone number (10 digits)');
      break;
    }
    case 'usdt': {
      cuenta = cuenta.replace(/\s/g, '');
      const red = titular.toUpperCase().replace(/[\s-]/g, '');
      if (!(RED_USDT as readonly string[]).includes(red)) return mal('Elige la red de tu billetera USDT (TRC20, ERC20, BEP20, Polygon o Solana)', 'Choose your USDT wallet network (TRC20, ERC20, BEP20, Polygon or Solana)');
      const okDir = red === 'TRC20' ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(cuenta)
        : red === 'SOLANA' ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(cuenta)
        : /^0x[0-9a-fA-F]{40}$/.test(cuenta);
      if (!okDir) return mal(`Esa dirección no es de la red ${red}. Cópiala de tu billetera.`, `That address is not a ${red} address. Copy it from your wallet.`);
      return { ok: true, cuenta, titular: red };
    }
    case 'transferencia':
      cuenta = cuenta.replace(/\s+/g, ' ');
      if (cuenta.length < 6 || cuenta.length > 200) return mal('Pon el banco y el número de cuenta (de 6 a 200 caracteres)', 'Enter the bank and account number (6 to 200 characters)');
      break;
  }
  return { ok: true, cuenta, titular };
}
