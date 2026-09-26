-- 0073 — Idioma del panel por marca (2026-09-25, pedido de Paul: "el panel
-- también que pueda ser en inglés, depende de la marca que compró").
--
-- 'es' por defecto: ninguna marca existente cambia. El alta en inglés
-- (/empezar?lang=en) crea la marca con 'en', y el organizador lo cambia desde
-- Mi marca. Lo escribe SIEMPRE el server con service role acotado a la marca.
--
-- Lectura: las columnas de brands se exponen a `authenticated` una por una
-- (0023/0043/0052). Sin este grant, getSessionUser —que la trae embebida en
-- las membresías— daría "permission denied" y dejaría a TODOS sin panel
-- (lo que pasó con yape_qr_url en la 0054). A anon no: la página pública no
-- la usa.

alter table public.brands add column if not exists idioma text not null default 'es';

alter table public.brands drop constraint if exists brands_idioma_check;
alter table public.brands add constraint brands_idioma_check check (idioma in ('es', 'en'));

grant select (idioma) on public.brands to authenticated;
