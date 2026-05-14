-- ═══════════════════════════════════════════════════════════════════
--  DJAMIKSHOP — SÉCURITÉ ANTI-ABUSE
--  À exécuter dans Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
--  1. TABLE security_events — historique des tentatives suspectes
-- ───────────────────────────────────────────────────────────────────
create table if not exists security_events (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete set null,
  ip          text,
  user_agent  text,
  event_type  text not null,        -- 'forbidden_word','spam_limit','bypass_attempt','login_brute','suspicious_devtools','rate_limit_offer','rate_limit_message','manual_report'
  severity    text default 'low',   -- 'low','medium','high','critical'
  details     jsonb default '{}'::jsonb,
  resolved    boolean default false,
  created_at  timestamptz default now()
);

create index if not exists sec_events_user_idx     on security_events(user_id, created_at desc);
create index if not exists sec_events_ip_idx       on security_events(ip);
create index if not exists sec_events_severity_idx on security_events(severity, resolved);
create index if not exists sec_events_recent_idx   on security_events(created_at desc);

alter table security_events enable row level security;

-- Drop old policies
drop policy if exists "sec read own"     on security_events;
drop policy if exists "sec insert anyone" on security_events;

-- Personne ne peut lire (admin only via service_role, qui bypass RLS)
-- Mais tout user authentifié peut signaler un incident le concernant
create policy "sec insert self" on security_events for insert
  to authenticated, anon
  with check (true);

-- ───────────────────────────────────────────────────────────────────
--  2. TABLE banned_users — bans temporaires/permanents
-- ───────────────────────────────────────────────────────────────────
create table if not exists banned_users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  reason      text,
  banned_at   timestamptz default now(),
  banned_until timestamptz,           -- null = ban permanent
  ban_count   integer default 1
);

alter table banned_users enable row level security;
-- Seul service_role peut lire/écrire (admin only)

-- ───────────────────────────────────────────────────────────────────
--  3. FONCTION : check si user est actuellement banni
-- ───────────────────────────────────────────────────────────────────
create or replace function public.is_user_banned(uid uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare b record;
begin
  select * into b from banned_users where user_id = uid;
  if not found then return false; end if;
  if b.banned_until is null then return true; end if;            -- ban permanent
  if b.banned_until > now() then return true; end if;            -- ban encore actif
  delete from banned_users where user_id = uid;                  -- ban expiré → cleanup
  return false;
end; $$;

-- ───────────────────────────────────────────────────────────────────
--  4. LISTE DES MOTS INTERDITS (côté serveur, modifiable sans deploy)
-- ───────────────────────────────────────────────────────────────────
create table if not exists forbidden_words (
  word        text primary key,
  category    text,                  -- 'drug','weapon','counterfeit','sexual','animal','organ','document'
  severity    text default 'high',
  added_at    timestamptz default now()
);

alter table forbidden_words enable row level security;
create policy "fwords read public" on forbidden_words for select to anon, authenticated using (true);

-- Seed initial — modifiable plus tard par l'admin
insert into forbidden_words (word, category, severity) values
  ('drogue','drug','high'),('cocaine','drug','high'),('cocaïne','drug','high'),('heroine','drug','high'),
  ('héroïne','drug','high'),('cannabis','drug','medium'),('weed','drug','medium'),('crack','drug','high'),
  ('arme à feu','weapon','high'),('pistolet','weapon','high'),('kalashnikov','weapon','critical'),
  ('ak-47','weapon','critical'),('grenade','weapon','critical'),('munition','weapon','high'),
  ('contrefaçon','counterfeit','medium'),('faux billet','counterfeit','high'),('passeport','document','high'),
  ('escort','sexual','high'),('sexe payant','sexual','high'),('prostitution','sexual','high'),
  ('ivoire','animal','high'),('peau de léopard','animal','high'),('rhinocéros','animal','critical'),
  ('rhinoceros','animal','critical'),('enfant à vendre','organ','critical'),
  ('rein à vendre','organ','critical'),('organe humain','organ','critical')
on conflict (word) do nothing;

-- ───────────────────────────────────────────────────────────────────
--  5. TRIGGER : valide AVANT chaque insert dans products
--     (modération + anti-spam, impossible à bypass via DevTools)
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

  -- 1. Le seller_id doit être l'auth user (déjà couvert par RLS, garde-fou)
  if new.seller_id is null or new.seller_id != uid then
    insert into security_events (user_id, event_type, severity, details)
    values (uid, 'bypass_attempt', 'critical',
            jsonb_build_object('action','insert_product','seller_id_mismatch', new.seller_id));
    raise exception 'Identifiant vendeur invalide.';
  end if;

  -- 2. Modération : check mots interdits
  text_blob := lower(coalesce(new.title,'') || ' ' || coalesce(new.description,''));
  select word into hit_word
    from forbidden_words
    where text_blob like '%' || word || '%'
    limit 1;
  if hit_word is not null then
    insert into security_events (user_id, event_type, severity, details)
    values (uid, 'forbidden_word', 'medium',
            jsonb_build_object('word', hit_word, 'title', new.title));
    raise exception 'Annonce refusée : contenu interdit (« % »). Voir nos CGU.', hit_word;
  end if;

  -- 3. Anti-spam : max 30 annonces actives par user
  select count(*) into active_count
    from products where seller_id = uid and sold = false;
  if active_count >= 30 then
    insert into security_events (user_id, event_type, severity, details)
    values (uid, 'spam_limit', 'medium',
            jsonb_build_object('limit', 30, 'current', active_count));
    raise exception 'Limite atteinte : 30 annonces actives max.';
  end if;

  return new;
end; $$;

drop trigger if exists products_validate on products;
create trigger products_validate
  before insert on products
  for each row execute function public.validate_product_insert();

-- ───────────────────────────────────────────────────────────────────
--  6. TRIGGER : auto-ban si user accumule trop d'incidents
--     (5 events medium+ en 1h → ban 24h ; 10 → ban 7j ; 20 → permanent)
-- ───────────────────────────────────────────────────────────────────
create or replace function public.check_auto_ban()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cnt integer;
  existing record;
  duration interval;
begin
  if new.user_id is null or new.severity = 'low' then return new; end if;

  -- Compte les incidents medium+ de l'user dans la dernière heure
  select count(*) into cnt
    from security_events
    where user_id = new.user_id
      and severity in ('medium','high','critical')
      and created_at > now() - interval '1 hour';

  if cnt < 5 then return new; end if;

  -- Récupère le ban existant pour escalader
  select * into existing from banned_users where user_id = new.user_id;

  if existing is null then
    duration := interval '24 hours';
  elsif existing.ban_count = 1 then
    duration := interval '7 days';
  else
    duration := null;        -- permanent au 3e ban
  end if;

  insert into banned_users (user_id, reason, banned_until, ban_count)
  values (new.user_id, 'Auto-ban : ' || cnt || ' incidents en 1h',
          case when duration is null then null else now() + duration end,
          coalesce(existing.ban_count, 0) + 1)
  on conflict (user_id) do update
    set banned_until = case when duration is null then null else now() + duration end,
        ban_count    = banned_users.ban_count + 1,
        reason       = 'Auto-ban escaladé : ' || cnt || ' incidents';

  -- Log l'event de ban
  insert into security_events (user_id, event_type, severity, details)
  values (new.user_id, 'auto_ban', 'high',
          jsonb_build_object('duration', duration::text, 'incidents_1h', cnt));

  return new;
end; $$;

drop trigger if exists sec_events_autoban on security_events;
create trigger sec_events_autoban
  after insert on security_events
  for each row execute function public.check_auto_ban();

-- ───────────────────────────────────────────────────────────────────
--  7. VUE pratique pour l'admin : récents incidents non résolus
-- ───────────────────────────────────────────────────────────────────
create or replace view security_dashboard as
select
  e.id, e.created_at, e.event_type, e.severity, e.ip, e.user_agent, e.details,
  e.user_id,
  p.email as user_email,
  p.full_name as user_name,
  exists(select 1 from banned_users b where b.user_id = e.user_id) as is_banned
from security_events e
left join profiles p on p.id = e.user_id
where e.resolved = false
order by e.created_at desc
limit 200;

-- ───────────────────────────────────────────────────────────────────
--  Vérification
-- ───────────────────────────────────────────────────────────────────
-- select * from security_dashboard;
-- select * from banned_users;
-- select count(*) from forbidden_words;
