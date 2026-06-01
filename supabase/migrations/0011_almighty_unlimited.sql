-- =============================================================
-- 0011 · Flip Code/Almighty General + VIP to unlimited
-- =============================================================
-- Removes the capacity=100000 "bridge" for the live Almighty event by
-- switching both ticket types to the real unlimited model (is_unlimited=true,
-- capacity=0). MUST be applied ONLY AFTER the is_unlimited-aware app code is
-- deployed — otherwise the previous deployed code would read capacity=0 and
-- render the in-flight sale as sold out.
--
-- Idempotent.
-- =============================================================

update public.ticket_types
set is_unlimited = true,
    capacity = 0
where id in (
  'ccfea311-3607-4959-89b9-ee6009894dea',  -- Almighty · General
  'c0c0d710-672d-4874-9f34-7ab998fe9a2e'   -- Almighty · VIP
);
