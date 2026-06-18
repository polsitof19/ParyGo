-- =============================================================
-- 0052 — Instagram de la marca (para el rail de redes del landing)
-- =============================================================
-- Campo opcional: handle (@marca) o URL de Instagram. Lo carga el organizador en
-- su panel y se muestra en el landing público (<slug>.parygo.com). brands usa
-- grants por columna → hay que conceder SELECT a anon (lo lee el landing público)
-- y UPDATE a authenticated (lo edita el dueño). RLS sigue gobernando las filas.
-- Aditivo; no toca datos ni lógica existente.
-- =============================================================

alter table public.brands add column if not exists instagram text;

grant select (instagram) on public.brands to anon, authenticated;
grant update (instagram) on public.brands to authenticated;

notify pgrst, 'reload schema';
