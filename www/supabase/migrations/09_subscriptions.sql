-- ═══════════════════════════════════════════════════════════════════
--  SPONSORISATION : abonnements + boosts + paiements
--  3 tiers : free (default) / vip (3000 FCFA/mois) / premium (5000)
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
--  1. SUBSCRIPTIONS — un abonnement actif par user
-- ───────────────────────────────────────────────────────────────────
create table if not exists subscriptions (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  tier         text not null check (tier in ('free','vip','premium')) default 'free',
  starts_at    timestamptz not null default now(),
  expires_at   timestamptz,    -- null si gratuit
  auto_renew   boolean default false,
  granted_by   uuid references auth.users(id) on delete set null,  -- admin qui a active
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists subscriptions_expires_idx on subscriptions(expires_at);
create index if not exists subscriptions_tier_idx    on subscriptions(tier);

alter table subscriptions enable row level security;

drop policy if exists "subs read own"   on subscriptions;
drop policy if exists "subs read admin" on subscriptions;
drop policy if exists "subs admin all"  on subscriptions;

create policy "subs read own"   on subscriptions for select to authenticated using (auth.uid() = user_id);
create policy "subs admin all"  on subscriptions for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- ───────────────────────────────────────────────────────────────────
--  2. PAYMENT_REQUESTS — demandes de paiement Mobile Money
-- ───────────────────────────────────────────────────────────────────
create table if not exists payment_requests (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  tier          text not null check (tier in ('vip','premium')),
  amount        integer not null,    -- 3000 ou 5000
  reference     text unique not null, -- code court ABCD1234
  payment_method text,                 -- 'orange','airtel','moov','mynita','amanata'
  status        text not null check (status in ('pending','confirmed','rejected','expired')) default 'pending',
  user_note     text,
  admin_note    text,
  created_at    timestamptz default now(),
  confirmed_at  timestamptz,
  confirmed_by  uuid references auth.users(id) on delete set null
);

create index if not exists pay_status_idx on payment_requests(status, created_at desc);
create index if not exists pay_user_idx   on payment_requests(user_id, created_at desc);
create index if not exists pay_ref_idx    on payment_requests(reference);

alter table payment_requests enable row level security;

drop policy if exists "pay insert self" on payment_requests;
drop policy if exists "pay read own"    on payment_requests;
drop policy if exists "pay admin all"   on payment_requests;

create policy "pay insert self" on payment_requests for insert to authenticated with check (auth.uid() = user_id);
create policy "pay read own"    on payment_requests for select to authenticated using (auth.uid() = user_id);
create policy "pay admin all"   on payment_requests for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- ───────────────────────────────────────────────────────────────────
--  3. BOOSTS — chaque boost dure 24h
-- ───────────────────────────────────────────────────────────────────
create table if not exists boosts (
  id          uuid primary key default uuid_generate_v4(),
  product_id  uuid not null references products(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  started_at  timestamptz default now(),
  expires_at  timestamptz not null default (now() + interval '24 hours')
);

create index if not exists boost_product_idx on boosts(product_id, expires_at desc);
create index if not exists boost_user_idx    on boosts(user_id, started_at desc);
create index if not exists boost_expires_idx on boosts(expires_at);

alter table boosts enable row level security;

drop policy if exists "boost read public"   on boosts;
drop policy if exists "boost insert owner"  on boosts;
drop policy if exists "boost admin all"     on boosts;

create policy "boost read public"  on boosts for select to anon, authenticated using (true);
create policy "boost insert owner" on boosts for insert to authenticated with check (auth.uid() = user_id);
create policy "boost admin all"    on boosts for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- ───────────────────────────────────────────────────────────────────
--  4. HELPERS
-- ───────────────────────────────────────────────────────────────────

-- Tier actuel d'un user (free par défaut)
create or replace function public.user_tier(uid uuid)
returns text language sql security definer set search_path = public as $$
  select coalesce(
    (select tier from subscriptions
       where user_id = uid
         and (expires_at is null or expires_at > now())
       limit 1),
    'free'
  );
$$;

-- Tier de l'user courant
create or replace function public.my_tier()
returns text language sql security definer set search_path = public as $$
  select public.user_tier(auth.uid());
$$;

-- Limite d'annonces actives par tier
create or replace function public.tier_listing_limit(t text)
returns int language sql immutable as $$
  select case t when 'premium' then 100 when 'vip' then 50 else 10 end;
$$;

-- Limite de boosts par jour par tier
create or replace function public.tier_boost_daily_limit(t text)
returns int language sql immutable as $$
  select case t when 'premium' then 15 when 'vip' then 5 else 0 end;
$$;

-- Combien de boosts l'user a fait dans les dernières 24h
create or replace function public.boosts_used_today(uid uuid)
returns int language sql security definer set search_path = public as $$
  select count(*)::int from boosts
    where user_id = uid and started_at > now() - interval '24 hours';
$$;

-- Un produit est-il actuellement boosté ?
create or replace function public.is_product_boosted(pid uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from boosts where product_id = pid and expires_at > now());
$$;

-- ───────────────────────────────────────────────────────────────────
--  5. UPDATE validate_product_insert : limite par tier
-- ───────────────────────────────────────────────────────────────────
create or replace function public.validate_product_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid          uuid; text_blob text; hit_word text; active_count integer;
  user_t       text; my_limit  integer;
begin
  uid := auth.uid();
  if public.is_user_banned(uid) then
    insert into security_events (user_id, event_type, severity, details)
    values (uid, 'banned_user_attempt', 'high', jsonb_build_object('table','products'));
    raise exception 'Compte suspendu. Contactez contact@djamikshop.com.';
  end if;

  if not public.user_email_verified() then
    raise exception 'Vérifiez votre email avant de publier une annonce.';
  end if;

  if new.seller_id is null or new.seller_id != uid then
    insert into security_events (user_id, event_type, severity, details)
    values (uid, 'bypass_attempt', 'critical',
            jsonb_build_object('action','insert_product','seller_id_mismatch', new.seller_id));
    raise exception 'Identifiant vendeur invalide.';
  end if;

  text_blob := lower(coalesce(new.title,'') || ' ' || coalesce(new.description,''));
  select word into hit_word from forbidden_words
    where text_blob like '%' || word || '%' limit 1;
  if hit_word is not null then
    insert into security_events (user_id, event_type, severity, details)
    values (uid, 'forbidden_word', 'medium', jsonb_build_object('word', hit_word, 'title', new.title));
    raise exception 'Annonce refusée : contenu interdit (« % »).', hit_word;
  end if;

  -- Limite par tier au lieu du 30 hardcodé
  user_t   := public.user_tier(uid);
  my_limit := public.tier_listing_limit(user_t);
  select count(*) into active_count from products
    where seller_id = uid and sold = false;
  if active_count >= my_limit then
    insert into security_events (user_id, event_type, severity, details)
    values (uid, 'spam_limit', 'medium',
            jsonb_build_object('limit', my_limit, 'current', active_count, 'tier', user_t));
    raise exception 'Limite atteinte : % annonces max sur le plan %. Passe en VIP/Premium pour en publier plus.', my_limit, user_t;
  end if;

  return new;
end; $$;

-- ───────────────────────────────────────────────────────────────────
--  6. TRIGGER boost : check tier + quota
-- ───────────────────────────────────────────────────────────────────
create or replace function public.validate_boost_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid; t text; lim int; used int; is_owner boolean;
begin
  uid := auth.uid();
  if uid is null then raise exception 'Non authentifié.'; end if;
  if uid != new.user_id then
    raise exception 'Tu ne peux booster que tes propres annonces.';
  end if;
  -- Vérifie que l'user est bien propriétaire du produit
  select exists(select 1 from products where id = new.product_id and seller_id = uid) into is_owner;
  if not is_owner then
    raise exception 'Ce produit ne t''appartient pas.';
  end if;

  t   := public.user_tier(uid);
  lim := public.tier_boost_daily_limit(t);
  if lim = 0 then
    raise exception 'Le plan Gratuit ne permet pas de booster. Passe en VIP ou Premium.';
  end if;

  used := public.boosts_used_today(uid);
  if used >= lim then
    raise exception 'Quota de boosts atteint (%/jour). Réessaye demain.', lim;
  end if;

  return new;
end; $$;

drop trigger if exists boosts_validate on boosts;
create trigger boosts_validate before insert on boosts for each row execute function public.validate_boost_insert();

-- ───────────────────────────────────────────────────────────────────
--  7. RPC publique : créer une demande de paiement
-- ───────────────────────────────────────────────────────────────────
create or replace function public.create_payment_request(p_tier text, p_method text, p_user_note text)
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid; ref text; amt int; rec record;
begin
  uid := auth.uid();
  if uid is null then raise exception 'Non authentifié.'; end if;
  if p_tier not in ('vip','premium') then raise exception 'Tier invalide.'; end if;
  if not public.user_email_verified() then raise exception 'Vérifiez votre email avant de payer.'; end if;

  amt := case p_tier when 'vip' then 3000 when 'premium' then 5000 end;

  -- Génère un code court unique (8 caractères alphanumériques)
  loop
    ref := upper(substring(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists(select 1 from payment_requests where reference = ref);
  end loop;

  insert into payment_requests (user_id, tier, amount, reference, payment_method, user_note)
  values (uid, p_tier, amt, ref, p_method, p_user_note)
  returning * into rec;

  return row_to_json(rec);
end; $$;

grant execute on function public.create_payment_request(text, text, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────
--  8. RPC ADMIN : confirmer un paiement -> active l'abonnement
-- ───────────────────────────────────────────────────────────────────
create or replace function public.admin_confirm_payment(p_request_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare admin_uid uuid; req payment_requests; new_expires timestamptz; sub record;
begin
  admin_uid := auth.uid();
  if not public.is_admin() then raise exception 'Action admin uniquement.'; end if;

  select * into req from payment_requests where id = p_request_id;
  if req is null then raise exception 'Demande introuvable.'; end if;
  if req.status != 'pending' then raise exception 'Demande déjà traitée.'; end if;

  -- Si l'user a déjà un abonnement actif, on prolonge depuis expires_at, sinon depuis now
  select * into sub from subscriptions where user_id = req.user_id;
  if sub is null then
    new_expires := now() + interval '30 days';
    insert into subscriptions (user_id, tier, starts_at, expires_at, granted_by)
    values (req.user_id, req.tier, now(), new_expires, admin_uid);
  else
    new_expires := greatest(coalesce(sub.expires_at, now()), now()) + interval '30 days';
    update subscriptions set
      tier        = req.tier,
      expires_at  = new_expires,
      granted_by  = admin_uid,
      updated_at  = now()
    where user_id = req.user_id;
  end if;

  update payment_requests set
    status       = 'confirmed',
    confirmed_at = now(),
    confirmed_by = admin_uid
  where id = p_request_id;

  -- Notification à l'utilisateur
  insert into notifications (user_id, type, title, body, data)
  values (req.user_id, 'subscription',
          'Abonnement ' || req.tier || ' activé !',
          'Bienvenue dans le plan ' || req.tier || '. Valide jusqu''au ' || to_char(new_expires, 'DD/MM/YYYY') || '.',
          jsonb_build_object('tier', req.tier, 'expires_at', new_expires));

  return json_build_object('ok', true, 'tier', req.tier, 'expires_at', new_expires);
end; $$;

grant execute on function public.admin_confirm_payment(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────
--  9. RPC ADMIN : rejeter un paiement
-- ───────────────────────────────────────────────────────────────────
create or replace function public.admin_reject_payment(p_request_id uuid, p_reason text)
returns json language plpgsql security definer set search_path = public as $$
declare admin_uid uuid; req payment_requests;
begin
  admin_uid := auth.uid();
  if not public.is_admin() then raise exception 'Action admin uniquement.'; end if;
  select * into req from payment_requests where id = p_request_id;
  if req is null then raise exception 'Demande introuvable.'; end if;
  if req.status != 'pending' then raise exception 'Demande déjà traitée.'; end if;

  update payment_requests set
    status       = 'rejected',
    confirmed_at = now(),
    confirmed_by = admin_uid,
    admin_note   = p_reason
  where id = p_request_id;

  insert into notifications (user_id, type, title, body, data)
  values (req.user_id, 'subscription',
          'Paiement non confirmé',
          'Ton paiement (réf ' || req.reference || ') n''a pas été validé. ' || coalesce(p_reason, 'Contacte-nous via WhatsApp.'),
          jsonb_build_object('reference', req.reference, 'reason', p_reason));

  return json_build_object('ok', true);
end; $$;

grant execute on function public.admin_reject_payment(uuid, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────
--  10. Initialise un abonnement 'free' pour les users existants
-- ───────────────────────────────────────────────────────────────────
insert into subscriptions (user_id, tier, expires_at)
  select id, 'free', null from auth.users
  on conflict (user_id) do nothing;

-- Vérifications
-- select public.my_tier();
-- select public.tier_listing_limit('vip');
-- select public.tier_boost_daily_limit('premium');
