import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { createAdminClient } from '@/lib/supabase/admin';

// =============================================================
// Per-brand MercadoPago client builder
// =============================================================
// Each promoter has their own MP access token (encrypted at rest in Postgres).
// We fetch + decrypt server-side using the BRAND_CREDS_ENCRYPTION_KEY.

type CreatePreferenceInput = {
  brandId: string;
  orderId: string;
  eventName: string;
  items: {
    id: string;
    title: string;
    quantity: number;
    unitPrice: number; // in soles, not cents
  }[];
  payer: {
    name: string;
    email: string;
    phone: string;
  };
  backUrls: {
    success: string;
    failure: string;
    pending: string;
  };
  notificationUrl: string;
  externalReference: string;
  encryptionKey: string;
};

async function getBrandAccessToken(
  brandId: string,
  encryptionKey: string
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('get_brand_mp_credentials', {
    p_brand_id: brandId,
    p_encryption_key: encryptionKey,
  });
  if (error) throw new Error(`No se pudieron leer credenciales MP: ${error.message}`);
  const first = Array.isArray(data) ? data[0] : null;
  const token = first?.access_token;
  if (!token) {
    throw new Error('La marca no tiene credenciales de MercadoPago configuradas. El dueño puede cargarlas desde Configuración → Cobro con tarjeta.');
  }
  return token;
}

export async function createMercadoPagoPreference(
  input: CreatePreferenceInput
): Promise<{ id: string; initPoint: string }> {
  const accessToken = await getBrandAccessToken(input.brandId, input.encryptionKey);
  const config = new MercadoPagoConfig({
    accessToken,
    options: { timeout: 15_000, idempotencyKey: input.orderId },
  });
  const preferenceClient = new Preference(config);

  // Split full name into first/last for MP payer object
  const [firstName, ...rest] = input.payer.name.trim().split(/\s+/);
  const lastName = rest.join(' ') || firstName;

  const result = await preferenceClient.create({
    body: {
      items: input.items.map((i) => ({
        id: i.id,
        title: i.title,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        currency_id: 'PEN',
      })),
      payer: {
        name: firstName,
        surname: lastName,
        email: input.payer.email,
        phone: { number: input.payer.phone },
      },
      back_urls: input.backUrls,
      auto_return: 'approved',
      external_reference: input.externalReference,
      notification_url: input.notificationUrl,
      statement_descriptor: 'PARYGO',
      payment_methods: {
        installments: 6,
      },
      metadata: {
        brand_id: input.brandId,
        order_id: input.orderId,
        event_name: input.eventName,
      },
    },
  });
  if (!result.id || !result.init_point) {
    throw new Error('MercadoPago no devolvió preference válida');
  }
  return { id: result.id, initPoint: result.init_point };
}

// Validate an access token by hitting MP's /users/me. Used at save-time so a
// promoter can't store a typo'd / revoked token that would silently break
// checkout later. Returns { ok } on 200, a friendly error otherwise.
export async function validateMercadoPagoToken(
  accessToken: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: 'El access token no es válido o fue revocado por MercadoPago.' };
    }
    return { ok: false, error: `MercadoPago rechazó la validación (HTTP ${res.status}).` };
  } catch {
    return { ok: false, error: 'No se pudo contactar a MercadoPago para validar el token.' };
  }
}

export async function fetchMercadoPagoPayment(
  brandId: string,
  paymentId: string,
  encryptionKey: string
) {
  const accessToken = await getBrandAccessToken(brandId, encryptionKey);
  const config = new MercadoPagoConfig({ accessToken, options: { timeout: 15_000 } });
  const paymentClient = new Payment(config);
  return paymentClient.get({ id: paymentId });
}
