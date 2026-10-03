import { mpCrearPreferenciaApi, mpLeerPago } from '@/lib/mpApi';
import { createAdminClient } from '@/lib/supabase/admin';
import { tokenVigenteMp } from '@/lib/mpConexion';

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

// Desde 0086 la ÚNICA forma de tener credenciales es "Conectar Mercado Pago"
// (OAuth): el token vigente lo da lib/mpConexion.ts, que lo renueva solo.
function getBrandAccessToken(brandId: string, encryptionKey: string): Promise<string> {
  return tokenVigenteMp(createAdminClient(), brandId, encryptionKey);
}

export async function createMercadoPagoPreference(
  input: CreatePreferenceInput
): Promise<{ id: string; initPoint: string }> {
  const accessToken = await getBrandAccessToken(input.brandId, input.encryptionKey);

  // Split full name into first/last for MP payer object
  const [firstName, ...rest] = input.payer.name.trim().split(/\s+/);
  const lastName = rest.join(' ') || firstName;

  // fetch directo (lib/mpApi.ts): el SDK no corre en el edge de Cloudflare.
  return mpCrearPreferenciaApi(accessToken, {
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
  }, input.orderId);
}

export async function fetchMercadoPagoPayment(
  brandId: string,
  paymentId: string,
  encryptionKey: string
) {
  const accessToken = await getBrandAccessToken(brandId, encryptionKey);
  return mpLeerPago(accessToken, paymentId);
}
