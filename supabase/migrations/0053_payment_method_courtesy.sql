-- =============================================================
-- 0053 — Repara el HISTORIAL: 'courtesy' en el enum payment_method.
-- =============================================================
-- El valor existe en producción desde el bloque de cortesías, pero se agregó
-- FUERA DE BANDA: la 0036 lo dice en su cabecera ("valor de enum agregado fuera
-- de banda, antes de esta migración") y ninguna migración lo crea.
--
-- Consecuencia práctica, que costó descubrir: el historial NO puede reconstruir
-- la base. Si alguien levanta un branch de Supabase o una base limpia y replica
-- de 0001 en adelante, la 0036 falla al referirse a un valor de enum que no
-- existe. O sea: hoy no tenemos forma de ensayar DDL contra una copia fiel.
-- Esta migración cierra ese agujero para adelante.
--
-- En producción es un NO-OP (el valor ya está); el `if not exists` lo garantiza.
-- =============================================================

alter type public.payment_method add value if not exists 'courtesy';
