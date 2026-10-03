-- 0090 — PayPal para las entradas (plan en AGENTS.md, 2026-10-03).
-- Sola: un valor nuevo de enum no se puede usar en la misma transacción que lo
-- crea, y la 0091 lo usa en el CHECK de orders y en las RPCs.
alter type public.payment_method add value if not exists 'paypal';
