-- 0076 — Tema de la página de compra por marca (Paul, 2026-09-28).
-- El organizador elige cómo ven su sitio los compradores: 'blanco', 'crema',
-- 'negro' o 'marca' (el fondo del color de su marca, con el texto que dé
-- contraste). Motivo: el negro "se ve IA" y la evidencia (Baymard, la
-- competencia) favorece fondo claro al pagar.
--
-- Default 'blanco': las marcas que YA existen (hoy en negro) pasan a blanco
-- (decisión de Paul). El código viejo ignora la columna, así que aplicar
-- esto antes del deploy no cambia nada visible.
--
-- Lectura: el sitio del comprador se lee con la anon key, y brands expone
-- columnas una por una (0023/0043/0052/0073/0074/0075): sin el grant a anon
-- la página de TODAS las marcas se caería. A authenticated también (Mi marca
-- y getSessionUser). La escribe el server (Mi marca, service role acotado a
-- la marca de la sesión): el organizador SÍ puede cambiarla, no hace falta
-- guard.

alter table public.brands add column if not exists tema_compra text not null default 'blanco';
alter table public.brands drop constraint if exists brands_tema_compra_check;
alter table public.brands add constraint brands_tema_compra_check check (tema_compra in ('blanco', 'crema', 'negro', 'marca'));

grant select (tema_compra) on public.brands to anon, authenticated;
