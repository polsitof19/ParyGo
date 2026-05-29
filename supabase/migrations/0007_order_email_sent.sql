-- =============================================================
-- ParyGo · orders.email_sent_at
-- =============================================================
-- Idempotency marker for the post-payment ticket email. Set after a
-- successful Resend send so a re-approval (yape) or duplicate webhook (MP)
-- doesn't fire a second mail. Nullable to allow operators to clear it for
-- a manual re-send.
-- =============================================================

alter table public.orders
  add column if not exists email_sent_at timestamptz;

comment on column public.orders.email_sent_at is
  'Set after the post-payment ticket email is successfully delivered to Resend. Null means "not sent yet" or "cleared for re-send".';
