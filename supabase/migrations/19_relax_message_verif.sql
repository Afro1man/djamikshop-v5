-- ═══════════════════════════════════════════════════════════════════
--  Relaxe la regle email-verifie pour les messages
--  (la verif reste obligatoire pour publier une annonce / faire offre / payer)
-- ═══════════════════════════════════════════════════════════════════
--  Raison : empechait les nouveaux users de chatter avec un vendeur
--  avant d'avoir verifie leur email -> friction qui faisait perdre
--  des leads. Le chat reste safe (rate limit 100/h + ban check).
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.validate_message_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare cnt int; uid uuid;
begin
  uid := auth.uid();
  if uid is null then raise exception 'Non authentifie.'; end if;

  if public.is_user_banned(uid) then
    raise exception 'Compte suspendu. Contactez contact@djamikshop.com.';
  end if;

  if public.is_user_banned(new.recipient_id) then
    raise exception 'Ce destinataire n''est plus disponible.';
  end if;

  -- ← email verification check RETIRE (etait trop strict pour les nouveaux users)

  select count(*) into cnt from messages
    where sender_id = uid and created_at > now() - interval '1 hour';
  if cnt >= 100 then
    insert into security_events (user_id, event_type, severity, details)
    values (uid, 'rate_limit_message', 'medium', jsonb_build_object('count', cnt));
    raise exception 'Trop de messages envoyes (100 max/heure).';
  end if;

  return new;
end; $$;
