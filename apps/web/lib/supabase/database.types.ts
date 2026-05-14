// Placeholder until `supabase gen types typescript` runs against the real
// project. Schemas typed loosely to allow the codebase to compile during
// scaffolding. Replace this file once migrations are applied.
//
// IMPORTANT: keep field names in sync with supabase/migrations/0001_*.sql.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Timestamps = {
  created_at?: string;
  updated_at?: string;
};

type BrandRow = Timestamps & {
  id: string;
  slug: string;
  name: string;
  whatsapp_e164: string | null;
  yape_number: string | null;
  yape_holder: string | null;
  theme_json: {
    logo_url?: string | null;
    cover_url?: string | null;
    primary_color?: string;
    secondary_color?: string;
  };
  mp_access_token_enc?: unknown;
  mp_public_key_enc?: unknown;
  mp_webhook_secret?: string | null;
  contact_email?: string | null;
};

type EventRow = Timestamps & {
  id: string;
  brand_id: string;
  slug: string;
  name: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
  cover_url: string | null;
  min_age: number;
  is_published: boolean;
  refund_policy: string | null;
};

type TicketTypeRow = Timestamps & {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  capacity: number;
  sold: number;
  reserved: number;
  sort_order: number;
  perks: Json;
  color_hex: string | null;
  is_active: boolean;
};

type OrderStatus =
  | 'pending_payment'
  | 'pending_yape_review'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'expired';

type PaymentMethod = 'mercadopago' | 'yape_manual';

type OrderRow = Timestamps & {
  id: string;
  event_id: string;
  brand_id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  buyer_dni: string | null;
  buyer_age_ok: boolean;
  marketing_opt_in: boolean;
  payment_method: PaymentMethod;
  subtotal_cents: number;
  total_cents: number;
  status: OrderStatus;
  mp_preference_id: string | null;
  mp_payment_id: string | null;
  mp_payment_status: string | null;
  paid_at: string | null;
  yape_proof_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  expires_at: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  ticket_type_id: string;
  ticket_type_name: string;
  quantity: number;
  unit_price_cents: number;
  subtotal_cents: number;
};

type YapeProofRow = {
  id: string;
  order_id: string;
  brand_id: string;
  amount_cents: number;
  operation_number: string;
  payer_name: string;
  security_code: string;
  receipt_url: string;
  status: 'pending_review' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
};

type TicketRow = {
  id: string;
  qr_code: string;
  order_id: string;
  event_id: string;
  brand_id: string;
  ticket_type_id: string;
  ticket_type_name: string;
  ticket_number: string;
  attendee_name: string | null;
  validated_at: string | null;
  validated_by: string | null;
  validated_offline: boolean;
  invalidated_at: string | null;
  created_at: string;
};

type UserProfileRow = {
  user_id: string;
  display_name: string | null;
  is_super_admin: boolean;
  created_at: string;
};

type BrandMemberRow = {
  id: string;
  brand_id: string;
  user_id: string;
  role: 'super_admin' | 'brand_admin' | 'validator';
  display_name: string | null;
  created_at: string;
};

type ValidatorCodeRow = {
  id: string;
  brand_id: string;
  user_id: string;
  code: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

type EventsLogRow = {
  id: string;
  brand_id: string | null;
  event_id: string | null;
  order_id: string | null;
  ticket_id: string | null;
  actor_user_id: string | null;
  type: string;
  payload: Json;
  created_at: string;
};

// Helper: define each table with Row/Insert/Update where Insert/Update are
// partial. Loose enough to let the supabase-js builder accept inserts without
// every column.
type Tbl<R> = {
  Row: R;
  Insert: Partial<R> & { [k: string]: unknown };
  Update: Partial<R>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      brands: Tbl<BrandRow>;
      events: Tbl<EventRow>;
      ticket_types: Tbl<TicketTypeRow>;
      orders: Tbl<OrderRow>;
      order_items: Tbl<OrderItemRow>;
      yape_proofs: Tbl<YapeProofRow>;
      tickets: Tbl<TicketRow>;
      user_profiles: Tbl<UserProfileRow>;
      brand_members: Tbl<BrandMemberRow>;
      validator_codes: Tbl<ValidatorCodeRow>;
      events_log: Tbl<EventsLogRow>;
    };
    Views: Record<string, never>;
    Functions: {
      set_brand_mp_credentials: {
        Args: {
          p_brand_id: string;
          p_access_token: string | null;
          p_public_key: string | null;
          p_encryption_key: string;
        };
        Returns: void;
      };
      get_brand_mp_credentials: {
        Args: { p_brand_id: string; p_encryption_key: string };
        Returns: { access_token: string; public_key: string }[];
      };
    };
    Enums: {
      user_role: 'super_admin' | 'brand_admin' | 'validator';
      order_status: OrderStatus;
      payment_method: PaymentMethod;
      yape_proof_status: 'pending_review' | 'approved' | 'rejected';
    };
  };
};
