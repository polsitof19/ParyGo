-- =============================================================
-- 0036 — Órdenes de CORTESÍA (comps). Bloque 2: emitir entradas gratis y
-- enviarlas por email. EMITE ENTRADAS REALES.
-- =============================================================
-- Un comp es una orden con payment_method='courtesy' (valor de enum agregado
-- fuera de banda, antes de esta migración) y total_cents=0. Reusa el camino
-- atómico existente: reserve_order_stock (ledger 0031 → descuenta aforo, respeta
-- reservas, NO permite pasar la capacity en tipos limitados) + issue_tickets_atomic
-- (0034 → gate duro de cupo, hereda max_scans, flip a paid, libera reserva). No
-- se agrega ninguna RPC nueva de emisión: el comp es solo una orden total 0.
--
-- Lo único que cambia el schema: orders_check no contemplaba 'courtesy' (exigía
-- mp_preference_id para MP, o yape_manual) → una orden courtesy violaba el check.
-- Lo extendemos para permitir courtesy sin mp_preference_id. Los datos existentes
-- (mercadopago/yape) siguen satisfaciendo el check. NO toca otra cosa.
-- =============================================================

alter table public.orders drop constraint if exists orders_check;
alter table public.orders add constraint orders_check check (
  (payment_method = 'mercadopago'::payment_method and mp_preference_id is not null)
  or payment_method = 'yape_manual'::payment_method
  or payment_method = 'courtesy'::payment_method
);
