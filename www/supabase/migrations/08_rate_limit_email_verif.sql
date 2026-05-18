-- ═══════════════════════════════════════════════════════════════════
--  RATE LIMITING + VERIFICATION EMAIL OBLIGATOIRE
--  Protège contre spam (offres, messages, signalements) et oblige
--  les utilisateurs à confirmer leur email avant d'agir.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
--  HELPER : email vérifié ?
-- ───────────────────────────────────────────────────────────────────
create or replace function public.user_email_verified()
returns boolean
language plpgsql security definer set search_path = public, auth
as $$
declare v boolean;
begin
  select email_confirmed_at is not null into v
    from auth.users where id = auth.uid();
  return coalesce(v, false);
end; $$;

grant execute on function public.user_email_verified() to authenticated;

-- ───────────────────────────────────────────────────────────────────
--  TRIGGER : check email + rate limit sur OFFERS (max 10/h)
-- ───────────────────────────────────────────────────────────────────
create or replace function public.validate_offer_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare cnt int; uid uuid;
begin
  uid := auth.uid();
  if uid is null then raise exception 'Non authentifié.'; end if;

  if public.is_user_banned(uid) then
    raise exception 'Compte suspendu.';
  end if;

  if not public.user_email_verified() then
    raise exception 'Vérifiez votre email avant d''envoyer une offre.';
  end if;

  select count(*) into cnt from offers
    where buyer_id = uid and created_at > now() - interval '1 hour';
  if cnt >= 10 then
    insert into security_events (user_id, event_type, severity, details)
    values (uid, 'rate_limit_offer', 'medium', jsonb_build_object('count', cnt));
    raise exception 'Trop d''offres récentes (10 max/heure). Réessayez plus tard.';
  end if;

  return new;
end; $$;

drop trigger if exists offers_validate on offers;
create trigger offers_validate
  before insert on offers
  for each row execute function public.validate_offer_insert();

-- ───────────────────────────────────────────────────────────────────
--  TRIGGER : check email + rate limit sur MESSAGES (max 100/h)
-- ───────────────────────────────────────────────────────────────────
create or replace function public.validate_message_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare cnt int; uid uuid;
begin
  uid := auth.uid();
  if uid is null then raise exception 'Non authentifié.'; end if;

  if public.is_user_banned(uid) then
    raise exception 'Compte suspendu.';
  end if;

  if not public.user_email_verified() then
    raise exception 'Vérifiez votre email avant d''envoyer des messages.';
  end if;

  -- Rate limit : 100 messages / heure (large mais bloque le spam massif)
  select count(*) into cnt from messages
    where sender_id = uid and created_at > now() - interval '1 hour';
  if cnt >= 100 then
    insert into security_events (user_id, event_type, severity, details)
    values (uid, 'rate_limit_message', 'medium', jsonb_build_object('count', cnt));
    raise exception 'Trop de messages envoyés (100 max/heure).';
  end if;

  return new;
end; $$;

drop trigger if exists messages_validate on messages;
create trigger messages_validate
  before insert on messages
  for each row execute function public.validate_message_insert();

-- ───────────────────────────────────────────────────────────────────
--  TRIGGER : rate limit sur REPORTS (max 5/h pour anti-spam signalement)
-- ───────────────────────────────────────────────────────────────────
create or replace function public.validate_report_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare cnt int; uid uuid; dup int;
begin
  uid := auth.uid();
  if uid is null then raise exception 'Non authentifié.'; end if;

  -- Anti-doublon : pas 2 signalements identiques sur le même produit
  select count(*) into dup from reports
    where reporter_id = uid and product_id = new.product_id and status = 'open';
  if dup > 0 then
    raise exception 'Vous avez déjà signalé cette annonce.';
  end if;

  -- Rate limit : 5 signalements / heure
  select count(*) into cnt from reports
    where reporter_id = uid and created_at > now() - interval '1 hour';
  if cnt >= 5 then
    insert into security_events (user_id, event_type, severity, details)
    values (uid, 'rate_limit_report', 'medium', jsonb_build_object('count', cnt));
    raise exception 'Trop de signalements récents (5 max/heure).';
  end if;

  return new;
end; $$;

drop trigger if exists reports_validate on reports;
create trigger reports_validate
  before insert on reports
  for each row execute function public.validate_report_insert();

-- ───────────────────────────────────────────────────────────────────
--  AJOUT : email vérifié dans validate_product_insert (existant)
-- ───────────────────────────────────────────────────────────────────
create or replace function public.validate_product_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid          uuid;
  text_blob    text;
  hit_word     text;
  active_count integer;
begin
  uid := auth.uid();

  -- 0. Refus si banni
  if public.is_user_banned(uid) then
    insert into security_events (user_id, event_type, severity, details)
    values (uid, 'banned_user_attempt', 'high', jsonb_build_object('table','products'));
    raise exception 'Compte suspendu. Contactez contact@djamikshop.com.';
  end if;

  -- 0bis. Email vérifié obligatoire pour publier
  if not public.user_email_verified() then
    raise exception 'Vérifiez votre email avant de publier une annonce. Lien envoyé à votre inscription.';
  end if;

  -- 1. seller_id = auth user
  if new.seller_id is null or new.seller_id != uid then
    insert into security_events (user_id, event_type, severity, details)
    values (uid, 'bypass_attempt', 'critical',
            jsonb_build_object('action','insert_product','seller_id_mismatch', new.seller_id));
    raise exception 'Identifiant vendeur invalide.';
  end if;

  -- 2. Modération mots interdits
  text_blob := lower(coalesce(new.title,'') || ' ' || coalesce(new.description,''));
  select word into hit_word from forbidden_words
    where text_blob like '%' || word || '%' limit 1;
  if hit_word is not null then
    insert into security_events (user_id, event_type, severity, details)
    values (uid, 'forbidden_word', 'medium',
            jsonb_build_object('word', hit_word, 'title', new.title));
    raise exception 'Annonce refusée : contenu interdit (« % »).', hit_word;
  end if;

  -- 3. Anti-spam : 30 annonces actives max
  select count(*) into active_count from products
    where seller_id = uid and sold = false;
  if active_count >= 30 then
    insert into security_events (user_id, event_type, severity, details)
    values (uid, 'spam_limit', 'medium',
            jsonb_build_object('limit', 30, 'current', active_count));
    raise exception 'Limite atteinte : 30 annonces actives max.';
  end if;

  return new;
end; $$;

-- Vérification
-- select public.user_email_verified();
