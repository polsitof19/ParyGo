'use server';

import { requireSession, type SessionUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export type ScanResult = {
  ok: boolean;
  status:
    | 'OK'
    | 'REENTRY'
    | 'ALREADY_USED'
    | 'NOT_AUTHORIZED'
    | 'NOT_FOUND'
    | 'INVALIDATED'
    | 'ERROR'
    | 'OFFLINE_UNKNOWN'; // client-only: offline cache miss → verify manually

  attendee_name?: string | null;
  ticket_type_name?: string | null;
  scan_count?: number;
  max_scans?: number | null;
  first_validated_at?: string | null;
  duplicate_sync?: boolean;
  // Documento del comprador (PII) para cruzar con el documento físico en puerta.
  // Solo se entrega al validador autorizado de la marca; nunca a anon, nunca a logs.
  buyer_dni?: string | null;
  buyer_doc_type?: string | null;
};

export type PreloadResult = {
  ok: boolean;
  tickets?: {
    qr_code: string;
    attendee_name: string | null;
    ticket_type_name: string;
    max_scans: number | null;
    scan_count: number;
    buyer_dni: string | null;
    buyer_doc_type: string | null;
  }[];
  validated?: number;
  total?: number;
  message?: string;
};

// Brands where the current user may validate (validator OR brand_admin).
function validatableBrandIds(user: SessionUser): string[] {
  return user.brandMemberships
    .filter((m) => m.role === 'validator' || m.role === 'brand_admin')
    .map((m) => m.brandId);
}

const isUuid = (s: string) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);

export async function validateScanAction(input: {
  qr: string;
  offline?: boolean;
  scannedAt?: string | null;
  deviceId?: string | null;
  clientScanId?: string | null;
}): Promise<ScanResult> {
  const user = await requireSession();
  if (!user.isSuperAdmin && validatableBrandIds(user).length === 0) {
    return { ok: false, status: 'NOT_AUTHORIZED' };
  }
  const qr = (input.qr ?? '').trim();
  if (!isUuid(qr)) return { ok: false, status: 'NOT_FOUND' };

  const admin = createAdminClient();
  // The RPC re-checks that this user is validator/brand_admin of the ticket's
  // brand — defense in depth; the validator id comes from the session.
  const { data, error } = await admin.rpc('validate_ticket', {
    p_qr_code: qr,
    p_validator_user_id: user.id,
    p_offline: input.offline ?? false,
    p_scanned_at: input.scannedAt ?? null,
    p_device_id: input.deviceId ?? null,
    p_client_scan_id: input.clientScanId ?? null,
  });
  if (error || !data) return { ok: false, status: 'ERROR' };
  const result = data as unknown as ScanResult;

  // DNI del comprador para verificar identidad en puerta. Lectura separada (NO
  // toca validate_ticket). Solo para tickets encontrados; el guard de validador
  // ya corrió arriba (validatableBrandIds) + el RPC re-chequea la marca.
  if (result.status === 'OK' || result.status === 'REENTRY' || result.status === 'ALREADY_USED') {
    const { data: tk } = await admin
      .from('tickets')
      .select('order:orders ( buyer_dni, buyer_doc_type )')
      .eq('qr_code', qr)
      .maybeSingle();
    const ord = tk ? (Array.isArray(tk.order) ? tk.order[0] : tk.order) : null;
    result.buyer_dni = ord?.buyer_dni ?? null;
    result.buyer_doc_type = ord?.buyer_doc_type ?? null;
  }
  return result;
}

// ============================================================================
// PREVISUALIZACIÓN (solo lectura) — NO consume el ticket, NO audita.
// La puerta muestra esto primero; el ingreso real lo confirma el botón PASAR
// que dispara validateScanAction (validate_ticket con FOR UPDATE). Acá NO se
// llama a validate_ticket: es un SELECT puro que calcula qué PASARÍA, sin lock
// ni mutación. La concurrencia/idempotencia siguen 100% en validate_ticket.
// Autorización idéntica: validador/brand_admin de la marca del ticket (o super).
// ============================================================================
export async function previewScanAction(input: { qr: string }): Promise<ScanResult> {
  const user = await requireSession();
  if (!user.isSuperAdmin && validatableBrandIds(user).length === 0) {
    return { ok: false, status: 'NOT_AUTHORIZED' };
  }
  const qr = (input.qr ?? '').trim();
  if (!isUuid(qr)) return { ok: false, status: 'NOT_FOUND' };

  const admin = createAdminClient();
  const { data: tk } = await admin
    .from('tickets')
    .select('brand_id, attendee_name, ticket_type_name, max_scans, scan_count, invalidated_at, validated_at, order:orders ( buyer_dni, buyer_doc_type )')
    .eq('qr_code', qr)
    .maybeSingle();
  if (!tk) return { ok: false, status: 'NOT_FOUND' };

  // El validador debe pertenecer a la marca del ticket (defensa: no filtrar PII
  // de otra marca). Mismo criterio que el RPC.
  if (!user.isSuperAdmin && !validatableBrandIds(user).includes(tk.brand_id)) {
    return { ok: false, status: 'NOT_AUTHORIZED' };
  }

  const ord = Array.isArray(tk.order) ? tk.order[0] : tk.order;
  const base: Partial<ScanResult> = {
    attendee_name: tk.attendee_name,
    ticket_type_name: tk.ticket_type_name,
    scan_count: tk.scan_count,
    max_scans: tk.max_scans,
    first_validated_at: tk.validated_at,
    buyer_dni: ord?.buyer_dni ?? null,
    buyer_doc_type: ord?.buyer_doc_type ?? null,
  };

  if (tk.invalidated_at) return { ok: false, status: 'INVALIDATED', ...base };
  const canScan = tk.max_scans === null || tk.scan_count < tk.max_scans;
  if (!canScan) return { ok: false, status: 'ALREADY_USED', ...base };
  // Válido: PUEDE pasar (no consumido). El estado real (OK/REENTRY) lo decide
  // validate_ticket al confirmar.
  return { ok: true, status: 'OK', ...base };
}

export async function preloadEventAction(eventId: string): Promise<PreloadResult> {
  const user = await requireSession();
  const admin = createAdminClient();

  const { data: ev } = await admin
    .from('events')
    .select('brand_id')
    .eq('id', eventId)
    .maybeSingle();
  if (!ev) return { ok: false, message: 'Evento no encontrado.' };
  if (!user.isSuperAdmin && !validatableBrandIds(user).includes(ev.brand_id)) {
    return { ok: false, message: 'No tenés acceso a este evento.' };
  }

  const { data: tickets } = await admin
    .from('tickets')
    .select('qr_code, attendee_name, ticket_type_name, max_scans, scan_count, order:orders ( buyer_dni, buyer_doc_type )')
    .eq('event_id', eventId)
    .is('invalidated_at', null);

  const list = (tickets ?? []).map((t) => {
    const ord = Array.isArray(t.order) ? t.order[0] : t.order;
    return {
      qr_code: t.qr_code,
      attendee_name: t.attendee_name,
      ticket_type_name: t.ticket_type_name,
      max_scans: t.max_scans,
      scan_count: t.scan_count,
      buyer_dni: ord?.buyer_dni ?? null,
      buyer_doc_type: ord?.buyer_doc_type ?? null,
    };
  });
  return {
    ok: true,
    tickets: list,
    validated: list.filter((t) => t.scan_count > 0).length,
    total: list.length,
  };
}
