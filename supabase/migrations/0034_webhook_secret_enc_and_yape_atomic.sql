-- =============================================================
-- 0034 — Auditoría pre-prod: (A) encriptar mp_webhook_secret, (B) emisión Yape
-- atómica con flip a paid + consumo de promo. DINERO/AUTH.
-- =============================================================
-- (A) mp_webhook_secret estaba en TEXTO PLANO (las otras creds MP están _enc).
-- Riesgo: dump/breach de DB → forjar un webhook "approved" → emitir sin pago.
-- Fix: columna mp_webhook_secret_enc (pgp_sym, igual que mp_*_enc) + RPCs
-- set/get/migrate (lockdown 0014). El backfill que encripta lo existente y NULLea
-- el plano se corre fuera de banda (la clave la pasa el server, nunca en SQL).
-- No hay MP configurado en ninguna marca hoy (0 creds) → migrar es inocuo.
--
-- (B) approveYapeProof / promo-free emitían y DESPUÉS marcaban paid + consumían
-- promo en pasos separados → ventana de crash dejaba la orden con tickets pero
-- sin status=paid, sin auto-reparación (a diferencia de settle_mp_payment).
-- Fix: issue_tickets_atomic ahora hace el flip a paid + mark_promo_redemption_
-- consumed DENTRO de la misma transacción bloqueada que la emisión (paridad con
-- settle_mp_payment). Idempotente. NO cambia el gate de cupo ni la idempotencia.
--
-- NO toca: validate_ticket, settle_mp_payment, apply_promo, precio, aforo (0031),
-- contador (0032). Lockdown 0014. Idempotente.
-- =============================================================

-- ---------- (A) webhook secret encriptado ----------
alter table public.brands add column if not exists mp_webhook_secret_enc bytea;

create or replace function public.set_brand_mp_webhook_secret(
  p_brand_id uuid, p_secret text, p_encryption_key text
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.brands set
    mp_webhook_secret_enc = case when p_secret is null then null
                                 else extensions.pgp_sym_encrypt(p_secret, p_encryption_key) end,
    mp_webhook_secret = null  -- nunca más en plano
  where id = p_brand_id;
end; $$;

create or replace function public.get_brand_mp_webhook_secret(
  p_brand_id uuid, p_encryption_key text
) returns text language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select extensions.pgp_sym_decrypt(mp_webhook_secret_enc, p_encryption_key)::text
    into v from public.brands where id = p_brand_id;
  return v;  -- null si la marca no tiene secret
end; $$;

-- Backfill one-shot: encripta el plano existente y lo NULLea. El plano se lee
-- internamente (no sale del DB); la clave la pasa el server (no va en SQL).
create or replace function public.migrate_brand_webhook_secret_to_enc(
  p_encryption_key text
) returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update public.brands set
    mp_webhook_secret_enc = extensions.pgp_sym_encrypt(mp_webhook_secret, p_encryption_key),
    mp_webhook_secret = null
  where mp_webhook_secret is not null;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

revoke execute on function public.set_brand_mp_webhook_secret(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.get_brand_mp_webhook_secret(uuid, text) from public, anon, authenticated;
revoke execute on function public.migrate_brand_webhook_secret_to_enc(text) from public, anon, authenticated;
grant execute on function public.set_brand_mp_webhook_secret(uuid, text, text) to service_role;
grant execute on function public.get_brand_mp_webhook_secret(uuid, text) to service_role;
grant execute on function public.migrate_brand_webhook_secret_to_enc(text) to service_role;

-- ---------- (B) issue_tickets_atomic: paid + promo atómicos ----------
create or replace function public.issue_tickets_atomic(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_existing int;
  v_count int;
  v_cap jsonb;
begin
  -- Lock de la orden: serializa emisiones concurrentes de la MISMA orden.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'action', 'order_not_found');
  end if;

  -- Idempotencia atómica bajo el lock.
  select count(*) into v_existing from public.tickets where order_id = p_order_id;
  if v_existing > 0 then
    -- Bookkeeping idempotente (cubre crash-after-issue, igual que settle_mp_payment):
    -- si por una corrida vieja quedaron tickets sin marcar paid, lo asegura.
    if v_order.status <> 'paid' then
      update public.orders set status = 'paid', paid_at = coalesce(paid_at, now()) where id = p_order_id;
      perform public.mark_promo_redemption_consumed(p_order_id);
    end if;
    return jsonb_build_object('ok', true, 'action', 'already_issued', 'ticket_count', v_existing);
  end if;

  -- GATE de cupo (backstop atómico): nunca emitir por encima del aforo.
  v_cap := public._order_capacity_overflow(p_order_id);
  if (v_cap->>'ok')::boolean is false then
    return jsonb_build_object('ok', false, 'action', 'oversold_no_capacity', 'detail', v_cap->'overflow');
  end if;

  -- Pasó el gate → comprometemos la venta: flip a paid + consumo de promo +
  -- emisión, TODO atómico (paridad con settle_mp_payment → sin estados a medias).
  if v_order.status <> 'paid' then
    update public.orders set status = 'paid', paid_at = now() where id = p_order_id;
  end if;
  perform public.mark_promo_redemption_consumed(p_order_id);

  insert into public.tickets
    (order_id, event_id, brand_id, ticket_type_id, ticket_type_name, ticket_number, attendee_name, max_scans)
  select v_order.id, v_order.event_id, v_order.brand_id, oi.ticket_type_id, oi.ticket_type_name,
         public._gen_ticket_number(), v_order.buyer_name, coalesce(tt.max_scans, 1)
    from public.order_items oi
         left join public.ticket_types tt on tt.id = oi.ticket_type_id
         cross join lateral generate_series(1, oi.quantity)
   where oi.order_id = p_order_id;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'action', 'no_items');
  end if;

  perform public.release_stock_reservations_for_order(p_order_id);

  return jsonb_build_object('ok', true, 'action', 'issued', 'ticket_count', v_count);
end;
$$;

revoke execute on function public.issue_tickets_atomic(uuid) from public, anon, authenticated;
grant execute on function public.issue_tickets_atomic(uuid) to service_role;

notify pgrst, 'reload schema';
