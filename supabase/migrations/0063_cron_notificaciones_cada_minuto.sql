-- =============================================================
-- 0063 — La cola de notificaciones corre cada MINUTO, no cada 5.
-- =============================================================
-- Con la entrada por email saliendo por la cola (0062), el ritmo de la cola es
-- el ritmo al que la gente recibe su QR por correo. Con 50 por corrida cada 5
-- minutos eran 600 emails por hora: un evento gratis de 3000 entradas tardaba
-- cinco horas. Cada minuto, y con tandas de 200 (BATCH en
-- app/api/cron/notifications), salen ~12.000 por hora — de sobra, y el propio
-- worker sigue respetando el límite de envíos por segundo de Resend con su
-- CONCURRENCY de 4.
--
-- El worker es idempotente y reclama con FOR UPDATE SKIP LOCKED, así que dos
-- corridas pisadas no mandan nada dos veces.
--
-- Queda acá para que el estado del cron sea reproducible desde el historial y
-- no un cambio suelto hecho a mano en la base.
-- =============================================================

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'parygo-notifications';
  if v_jobid is not null then
    perform cron.alter_job(v_jobid, schedule => '* * * * *');
  end if;
end $$;
