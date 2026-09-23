-- =============================================================
-- 0065 — Ancho y alto del flyer, guardados al subirlo.
-- =============================================================
-- Para qué: la página de compra elige su dirección de diseño (Canvas o
-- Editorial) por la FORMA del flyer (lib/concepto.ts). Hoy la mide en cada
-- pedido leyendo el encabezado de la imagen por red, con un tope de tiempo, y si
-- se pasa cae en Editorial. El 2026-09-23 eso sirvió Standly (Tío Code) en
-- Editorial justo después de subir el flyer: la primera lectura va en frío
-- (Worker en Lima → storage en us-west-1) y superó el tope. Paul lo vio "roto".
--
-- Con las medidas en la fila, la decisión deja de depender de la red: el panel
-- ya tiene los bytes del archivo en memoria cuando lo sube, así que medir ahí no
-- cuesta nada. La lectura por red queda solo como respaldo para las filas viejas
-- que el backfill no alcance.
--
-- Two-phase: columnas NULLABLE, sin default. La app desplegada hoy no las lee
-- ni las escribe, así que aplicar esto no le cambia nada. Después va el deploy
-- que las escribe al subir y las lee en la página.
-- =============================================================

set lock_timeout = '5s';

alter table public.events add column if not exists cover_w integer;
alter table public.events add column if not exists cover_h integer;

-- Las dos o ninguna, y en un rango de imagen razonable.
alter table public.events drop constraint if exists events_cover_dims_chk;
alter table public.events add constraint events_cover_dims_chk check (
  (cover_w is null and cover_h is null)
  or (cover_w between 1 and 20000 and cover_h between 1 and 20000)
);

comment on column public.events.cover_w is
  'Ancho en px del flyer (cover_url), medido al subirlo (0065). NULL = sin medir: la página lo lee por red.';
comment on column public.events.cover_h is
  'Alto en px del flyer (cover_url), medido al subirlo (0065). NULL = sin medir: la página lo lee por red.';
