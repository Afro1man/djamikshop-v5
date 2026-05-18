-- ═══════════════════════════════════════════════════════════════════
--  BAN ENFORCEMENT — Style TikTok : compte suspendu = invisible partout
-- ═══════════════════════════════════════════════════════════════════
--  Avant ce fix:
--   - Ban refusait seulement nouveaux inserts (annonces/offres)
--   - User banni voyait quand meme ses annonces, pouvait chatter, etc.
--   - Ses annonces restaient visibles au public
--  Apres:
--   - Annonces masquees pour TOUT LE MONDE (y compris lui-meme)
--   - Messages bloques (entrant ET sortant)
--   - Profil "Compte suspendu" affiche
--   - Conversations gelees
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
--  1. PRODUCTS : hide products from banned sellers (public + self)
-- ───────────────────────────────────────────────────────────────────
drop policy if exists "products read public"      on products;
drop policy if exists "products read non-banned"  on products;

create policy "products read non-banned" on products for select to anon, authenticated
  using (not public.is_user_banned(seller_id));

-- ───────────────────────────────────────────────────────────────────
--  2. PROFILES : keep readable (we need to display "Compte suspendu")
--     mais on ajoute un helper pour le savoir
-- ───────────────────────────────────────────────────────────────────
-- Pas de changement RLS sur profiles (reste public pour pouvoir afficher
-- le statut "suspendu" sur le profil consulté).

-- ───────────────────────────────────────────────────────────────────
--  3. MESSAGES : refuse si sender OU recipient est banni
-- ───────────────────────────────────────────────────────────────────
create or replace function public.validate_message_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare cnt int; uid uuid;
begin
  uid := auth.uid();
  if uid is null then raise exception 'Non authentifie.'; end if;

  if public.is_user_banned(uid) then
    raise exception 'Compte suspendu. Contactez contact@djamikshop.com.';
  end if;

  -- Ne peut pas envoyer a un user banni non plus
  if public.is_user_banned(new.recipient_id) then
    raise exception 'Ce destinataire n''est plus disponible.';
  end if;

  if not public.user_email_verified() then
    raise exception 'Verifiez votre email avant d''envoyer des messages.';
  end if;

  select count(*) into cnt from messages
    where sender_id = uid and created_at > now() - interval '1 hour';
  if cnt >= 100 then
    insert into security_events (user_id, event_type, severity, details)
    values (uid, 'rate_limit_message', 'medium', jsonb_build_object('count', cnt));
    raise exception 'Trop de messages envoyes (100 max/heure).';
  end if;

  return new;
end; $$;

-- ───────────────────────────────────────────────────────────────────
--  4. REPORTS : refuse si reporter banni (deja partiellement geré
--     via validate_report_insert, on s'assure)
-- ───────────────────────────────────────────────────────────────────
create or replace function public.validate_report_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare cnt int; uid uuid; dup int;
begin
  uid := auth.uid();
  if uid is null then raise exception 'Non authentifie.'; end if;

  if public.is_user_banned(uid) then
    raise exception 'Compte suspendu.';
  end if;

  select count(*) into dup from reports
    where reporter_id = uid and product_id = new.product_id and status = 'open';
  if dup > 0 then
    raise exception 'Vous avez deja signale cette annonce.';
  end if;

  select count(*) into cnt from reports
    where reporter_id = uid and created_at > now() - interval '1 hour';
  if cnt >= 5 then
    insert into security_events (user_id, event_type, severity, details)
    values (uid, 'rate_limit_report', 'medium', jsonb_build_object('count', cnt));
    raise exception 'Trop de signalements recents (5 max/heure).';
  end if;

  return new;
end; $$;

-- ───────────────────────────────────────────────────────────────────
--  5. OFFERS : refuse si buyer banni (deja fait via validate_offer_insert)
-- ───────────────────────────────────────────────────────────────────
-- Pas de changement — validate_offer_insert checke deja is_user_banned

-- ───────────────────────────────────────────────────────────────────
--  6. PRODUCTS UPDATE : refuse si banni (empeche edits sur ses annonces)
-- ───────────────────────────────────────────────────────────────────
create or replace function public.block_banned_product_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_user_banned(auth.uid()) then
    raise exception 'Compte suspendu. Impossible de modifier des annonces.';
  end if;
  return new;
end; $$;

drop trigger if exists products_block_banned_update on products;
create trigger products_block_banned_update
  before update on products
  for each row execute function public.block_banned_product_update();

-- ───────────────────────────────────────────────────────────────────
--  7. RPC PUBLIQUE : am_i_banned() pour que le client puisse checker
-- ───────────────────────────────────────────────────────────────────
create or replace function public.am_i_banned()
returns json language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if auth.uid() is null then return null; end if;
  select * into b from banned_users where user_id = auth.uid();
  if not found then return null; end if;
  return json_build_object(
    'banned',       true,
    'reason',       b.reason,
    'banned_at',    b.banned_at,
    'banned_until', b.banned_until,
    'permanent',    b.banned_until is null,
    'ban_count',    b.ban_count
  );
end; $$;

grant execute on function public.am_i_banned() to authenticated;

-- Verifications
-- select public.am_i_banned();
-- select * from products limit 5;  -- ne doit pas montrer les annonces des users bannis
