-- =============================================================
-- 0062 — La entrada por email sale por la COLA, no en el camino del reclamo.
-- =============================================================
-- Hasta hoy, emitir una entrada gratis terminaba con `await sendTicketEmail()`
-- DENTRO del reclamo: el comprador esperaba a que Resend contestara para ver su
-- QR. Con miles de personas a la vez eso es doblemente malo:
--   · Resend tiene límite de envíos por segundo, así que la cola se forma igual
--     — pero se forma ENCIMA del comprador, que ve el botón girando;
--   · si Resend falla o tarda, el reclamo podía morir DESPUÉS de emitir la
--     entrada, y la persona se quedaba sin saber que ya la tenía.
--
-- Ahora el reclamo emite, muestra el QR y ENCOLA el email. La cola
-- (notification_jobs, con claim atómico, reintentos y tope de 5) ya existía
-- para los avisos de Yape y los recordatorios: esto solo agrega su tipo.
--
-- El QR en pantalla y /t/<uuid> nunca dependieron del email, y ahora tampoco
-- depende de ellos el reclamo.
-- =============================================================

alter table public.notification_jobs drop constraint if exists notification_jobs_kind_check;

alter table public.notification_jobs
  add constraint notification_jobs_kind_check
  check (kind = any (array[
    'yape_recovery',
    'yape_pending_digest',
    'event_reminder',
    'event_cancelled',
    'ticket_email'
  ]));

comment on column public.notification_jobs.kind is
  'yape_recovery · yape_pending_digest · event_reminder · event_cancelled · ticket_email (la entrada con QR, encolada por el reclamo/emisión)';
