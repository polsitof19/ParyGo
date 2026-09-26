-- =============================================================
-- 0041 — Rate-limit ATÓMICO del reenvío self-service (TANDA 2, Grupo C)
-- =============================================================
-- Endurece el rate-limit del flujo "reenviá mi entrada" tras el security-review:
--  · Cuenta + registra el intento en UNA transacción con pg_advisory_xact_lock
--    por email → elimina la carrera TOCTOU (una ráfaga concurrente ya NO puede
--    superar el tope para spamear la casilla de un tercero).
--  · Devuelve si el intento está permitido (dentro de 3/email/h y 10/ip/h).
-- Registra SIEMPRE el intento (también el bloqueado) para que el sondeo cuente.
-- service_role-only (lockdown 0014). No toca emisión/dinero/aforo.
-- =============================================================

create or replace function public.register_ticket_resend_attempt(
  p_email      text,
  p_ip         text,
  p_brand_id   uuid,
  p_max_email  int default 3,
  p_max_ip     int default 10,
  p_window_secs int default 3600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := lower(btrim(p_email));
  v_ip     text := nullif(btrim(coalesce(p_ip, '')), '');
  v_since  timestamptz := now() - make_interval(secs => greatest(60, p_window_secs));
  v_email_n int;
  v_ip_n   int := 0;
  v_allowed boolean;
begin
  -- Serializa por email → count+insert atómicos frente a ráfagas concurrentes.
  perform pg_advisory_xact_lock(hashtext('tra:' || v_email));

  select count(*) into v_email_n
    from public.ticket_resend_attempts
   where email = v_email and created_at >= v_since;

  if v_ip is not null then
    select count(*) into v_ip_n
      from public.ticket_resend_attempts
     where ip = v_ip and created_at >= v_since;
  end if;

  v_allowed := v_email_n < greatest(1, p_max_email) and v_ip_n < greatest(1, p_max_ip);

  -- Registrar SIEMPRE el intento (también el bloqueado).
  insert into public.ticket_resend_attempts (email, ip, brand_id)
    values (v_email, v_ip, p_brand_id);

  return v_allowed;
end;
$$;

-- Lockdown 0014: revoke explícito anon Y authenticated; solo service_role.
revoke execute on function public.register_ticket_resend_attempt(text, text, uuid, int, int, int) from public, anon, authenticated;
grant execute on function public.register_ticket_resend_attempt(text, text, uuid, int, int, int) to service_role;

notify pgrst, 'reload schema';
