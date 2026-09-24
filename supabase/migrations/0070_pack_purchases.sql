-- =============================================================
-- 0070 · Compra automática de paquetes de eventos (MercadoPago y PayPal)
-- =============================================================
-- Pedido de Paul (2026-09-24). El organizador compra un paquete desde su
-- panel y, cuando la pasarela confirma el pago, el saldo se suma SOLO.
--
-- pack_purchases: una fila por intento de compra. El monto y la moneda se
-- CONGELAN al crearla (los fija el server desde lib/packs.ts; el navegador
-- solo elige paquete y pasarela). Tabla SOLO service role: RLS activa y sin
-- policies; revoke explícito a anon y authenticated.
--
-- settle_pack_purchase: el ÚNICO camino que suma saldo por una compra.
--   - FOR UPDATE sobre la compra → dos avisos simultáneos del mismo pago =
--     1 acreditación, el otro ve 'already_paid'.
--   - pasarela, moneda y monto deben coincidir con lo congelado; si no,
--     'mismatch' y NO se acredita (queda log para revisar a mano).
--   - unique (provider, provider_payment_id): un mismo pago no puede
--     acreditar dos compras distintas.
-- No toca create_brand_event, la compra de entradas ni nada de Code.
-- =============================================================

create table if not exists public.pack_purchases (
  id                  uuid primary key default gen_random_uuid(),
  brand_id            uuid not null references public.brands(id) on delete restrict,
  pack                integer not null check (pack in (1, 3, 5, 10)),
  provider            text not null check (provider in ('mercadopago', 'paypal')),
  currency            text not null check (currency in ('PEN', 'USD')),
  amount_cents        integer not null check (amount_cents > 0),
  status              text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  provider_ref        text,          -- preferencia de MP / orden de PayPal
  provider_payment_id text,          -- pago de MP / captura de PayPal
  created_by          uuid,
  created_at          timestamptz not null default now(),
  paid_at             timestamptz,
  constraint pack_purchases_moneda check ((provider = 'mercadopago' and currency = 'PEN') or (provider = 'paypal' and currency = 'USD')),
  constraint pack_purchases_pagada check (status <> 'paid' or (provider_payment_id is not null and paid_at is not null))
);
create unique index if not exists pack_purchases_pago_uniq
  on public.pack_purchases (provider, provider_payment_id) where provider_payment_id is not null;
create index if not exists pack_purchases_brand_idx on public.pack_purchases (brand_id, created_at desc);

alter table public.pack_purchases enable row level security;
revoke all on public.pack_purchases from public, anon, authenticated;
grant select, insert, update on public.pack_purchases to service_role;

create or replace function public.settle_pack_purchase(
  p_purchase_id  uuid,
  p_provider     text,
  p_payment_id   text,
  p_paid_cents   integer,
  p_currency     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.pack_purchases%rowtype;
  v_new_balance int;
begin
  select * into c from public.pack_purchases where id = p_purchase_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'action', 'not_found');
  end if;
  if c.status = 'paid' then
    return jsonb_build_object('ok', true, 'action', 'already_paid', 'brand_id', c.brand_id);
  end if;
  if p_payment_id is null or length(p_payment_id) = 0 then
    return jsonb_build_object('ok', false, 'action', 'no_payment_id');
  end if;
  if c.provider <> p_provider or c.currency <> p_currency or c.amount_cents <> p_paid_cents then
    insert into public.events_log (brand_id, type, payload)
    values (c.brand_id, 'pack_purchase_mismatch', jsonb_build_object(
      'purchase_id', c.id, 'payment_id', p_payment_id,
      'expected', jsonb_build_object('provider', c.provider, 'currency', c.currency, 'cents', c.amount_cents),
      'got', jsonb_build_object('provider', p_provider, 'currency', p_currency, 'cents', p_paid_cents)));
    return jsonb_build_object('ok', false, 'action', 'mismatch');
  end if;

  begin
    update public.pack_purchases
       set status = 'paid', provider_payment_id = p_payment_id, paid_at = now()
     where id = c.id;
  exception when unique_violation then
    -- Ese pago ya acreditó OTRA compra: no se acredita dos veces.
    return jsonb_build_object('ok', false, 'action', 'payment_reused');
  end;

  update public.brands
     set event_balance = event_balance + c.pack
   where id = c.brand_id
  returning event_balance into v_new_balance;

  insert into public.events_log (brand_id, actor_user_id, type, payload)
  values (c.brand_id, c.created_by, 'event_balance_pack_purchased', jsonb_build_object(
    'purchase_id', c.id, 'pack', c.pack, 'provider', c.provider, 'currency', c.currency,
    'amount_cents', c.amount_cents, 'payment_id', p_payment_id, 'new_balance', v_new_balance));

  return jsonb_build_object('ok', true, 'action', 'credited', 'brand_id', c.brand_id, 'pack', c.pack, 'new_balance', v_new_balance);
end;
$$;

-- Service role only. `revoke from public` NO basta (lección 0014).
revoke execute on function public.settle_pack_purchase(uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.settle_pack_purchase(uuid, text, text, integer, text) to service_role;
