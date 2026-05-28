-- ═══════════════════════════════════════════════════════════════════
--  Migration 34 : V2 - Modele booster a l'unite (mai 2026)
--
--  CHANGEMENTS :
--    - Cree user_boosters : stock de boosters par user (jamais expirent)
--    - Cree booster_purchases : historique d'achat des packs
--    - Modifie boosts : ajoute vedette boolean (1 boost simple ou 2 = vedette)
--    - RPC publiques :
--        - use_booster(product_id, vedette)         -> consomme stock
--        - my_booster_stock()                       -> stock dispo
--        - buy_booster_pack(pack, payment_method)   -> cree payment_request
--        - grant_booster(user_id, qty, source)      -> admin / signup gift
--    - Suspend les VIP/Premium dans la logique boost
--    - GARDE le code subscriptions/payment_requests pour pas casser
-- ═══════════════════════════════════════════════════════════════════

-- 1. Stock de boosters par user (jamais expire, c'est l'argument cle)
create table if not exists public.user_boosters (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  count       int not null default 0 check (count >= 0),
  total_received int not null default 0,    -- historique (jamais decremente)
  total_spent    int not null default 0,    -- compteur d'usage
  updated_at  timestamptz default now()
);

alter table public.user_boosters enable row level security;

drop policy if exists "boosters read own" on public.user_boosters;
drop policy if exists "boosters admin all" on public.user_boosters;

create policy "boosters read own" on public.user_boosters
  for select to authenticated using (auth.uid() = user_id);
create policy "boosters admin all" on public.user_boosters
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 2. Historique d'achats packs (pour audit + statistiques)
create table if not exists public.booster_purchases (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  pack          text not null check (pack in ('starter','business','pro','single')),
  qty           int not null check (qty > 0),
  amount        int not null check (amount > 0),
  payment_ref   text,
  status        text default 'pending' check (status in ('pending','confirmed','rejected')),
  source        text default 'purchase' check (source in ('purchase','signup_gift','admin_grant','migration_v2')),
  created_at    timestamptz default now(),
  confirmed_at  timestamptz
);

create index if not exists booster_purchases_user_idx on public.booster_purchases(user_id, created_at desc);
create index if not exists booster_purchases_status_idx on public.booster_purchases(status);

alter table public.booster_purchases enable row level security;

drop policy if exists "purchases read own" on public.booster_purchases;
drop policy if exists "purchases admin all" on public.booster_purchases;

create policy "purchases read own" on public.booster_purchases
  for select to authenticated using (auth.uid() = user_id);
create policy "purchases admin all" on public.booster_purchases
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 3. Modifie boosts : ajoute vedette flag
alter table public.boosts
  add column if not exists vedette boolean default false;

-- 4. RPC : stock actuel
create or replace function public.my_booster_stock()
returns int language sql security definer set search_path = public as $$
  select coalesce((select count from user_boosters where user_id = auth.uid()), 0);
$$;
grant execute on function public.my_booster_stock() to authenticated;

-- 5. RPC : consomme N booster(s) pour booster une annonce
--    qty=1 : boost simple (etoile, en haut de liste, 7j)
--    qty=2 : boost Vedette (section Vedette + brille, 7j)
create or replace function public.use_booster(p_product_id uuid, p_vedette boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  v_qty int;
  v_stock int;
  v_already_boosted record;
  v_boost_id uuid;
begin
  uid := auth.uid();
  if uid is null then raise exception 'Non authentifie.'; end if;

  if public.is_user_banned(uid) then
    raise exception 'Compte suspendu.';
  end if;

  -- Verifie ownership
  if not exists (select 1 from products where id = p_product_id and seller_id = uid) then
    raise exception 'Annonce introuvable ou ne t''appartient pas.';
  end if;

  v_qty := case when p_vedette then 2 else 1 end;

  -- Stock dispo ?
  select coalesce(count, 0) into v_stock from user_boosters where user_id = uid;
  if coalesce(v_stock, 0) < v_qty then
    raise exception 'Stock insuffisant. Tu as % booster(s), il en faut %. Achete un pack.', coalesce(v_stock, 0), v_qty;
  end if;

  -- Si annonce deja boostee, on REMPLACE (pas de cumul)
  select id, vedette, expires_at into v_already_boosted
    from boosts where product_id = p_product_id and expires_at > now()
    order by started_at desc limit 1;

  if v_already_boosted.id is not null then
    -- Cas 1 : deja boost simple + on veut Vedette => on consomme 1 booster de plus
    if not v_already_boosted.vedette and p_vedette then
      v_qty := 1;   -- on n'a deja 1 boost actif, faut juste 1 de plus pour upgrade
      update boosts set vedette = true, started_at = now(), expires_at = now() + interval '7 days'
        where id = v_already_boosted.id;
      v_boost_id := v_already_boosted.id;
    -- Cas 2 : deja boost meme niveau => refresh la duree (consomme 1 ou 2 selon nouveau)
    elsif v_already_boosted.vedette = p_vedette then
      update boosts set started_at = now(), expires_at = now() + interval '7 days'
        where id = v_already_boosted.id;
      v_boost_id := v_already_boosted.id;
    -- Cas 3 : deja Vedette + on demande simple => bloque (downgrade nul)
    else
      raise exception 'Cette annonce est deja en Vedette (mieux que boost simple).';
    end if;
  else
    -- Pas deja boostee : insert nouveau boost
    insert into boosts (product_id, user_id, vedette, expires_at)
    values (p_product_id, uid, p_vedette, now() + interval '7 days')
    returning id into v_boost_id;
  end if;

  -- Decrement le stock
  update user_boosters
    set count = count - v_qty,
        total_spent = total_spent + v_qty,
        updated_at = now()
    where user_id = uid;

  return json_build_object(
    'ok', true,
    'boost_id', v_boost_id,
    'vedette', p_vedette,
    'consumed', v_qty,
    'stock_left', (select count from user_boosters where user_id = uid)
  );
end; $$;
grant execute on function public.use_booster(uuid, boolean) to authenticated;

-- 6. RPC : achat de pack (cree payment_request, status pending)
create or replace function public.buy_booster_pack(p_pack text, p_payment_method text, p_user_note text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  v_qty int;
  v_amount int;
  v_ref text;
  v_purchase_id uuid;
begin
  uid := auth.uid();
  if uid is null then raise exception 'Non authentifie.'; end if;
  if public.is_user_banned(uid) then raise exception 'Compte suspendu.'; end if;

  -- Pricing
  if    p_pack = 'starter'  then v_qty := 3;  v_amount := 1200;
  elsif p_pack = 'business' then v_qty := 10; v_amount := 3500;
  elsif p_pack = 'pro'      then v_qty := 25; v_amount := 7500;
  elsif p_pack = 'single'   then v_qty := 1;  v_amount := 500;
  else raise exception 'Pack invalide.';
  end if;

  -- Reference unique
  loop
    v_ref := upper(substring(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists(select 1 from booster_purchases where payment_ref = v_ref);
  end loop;

  insert into booster_purchases (user_id, pack, qty, amount, payment_ref, status, source)
  values (uid, p_pack, v_qty, v_amount, v_ref, 'pending', 'purchase')
  returning id into v_purchase_id;

  -- Cree aussi un payment_request pour que l'admin valide via le meme flow
  insert into payment_requests (user_id, tier, amount, reference, payment_method, user_note, admin_note)
  values (uid, 'booster_pack:' || p_pack, v_amount, v_ref, p_payment_method, p_user_note, 'PURCHASE_ID:' || v_purchase_id::text);

  return json_build_object(
    'ok', true,
    'purchase_id', v_purchase_id,
    'pack', p_pack,
    'qty', v_qty,
    'amount', v_amount,
    'reference', v_ref
  );
end; $$;
grant execute on function public.buy_booster_pack(text, text, text) to authenticated;

-- 7. RPC admin : confirme l'achat → credite les boosters
create or replace function public.admin_confirm_booster_purchase(p_reference text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_purchase record;
begin
  if not public.is_admin() then raise exception 'Admin uniquement.'; end if;

  select * into v_purchase from booster_purchases
    where payment_ref = p_reference and status = 'pending';
  if not found then raise exception 'Achat introuvable ou deja traite.'; end if;

  -- Update purchase
  update booster_purchases
    set status = 'confirmed', confirmed_at = now()
    where id = v_purchase.id;

  -- Update payment_request
  update payment_requests
    set status = 'confirmed', confirmed_at = now()
    where reference = p_reference;

  -- Credite les boosters
  insert into user_boosters (user_id, count, total_received)
    values (v_purchase.user_id, v_purchase.qty, v_purchase.qty)
    on conflict (user_id) do update
    set count = user_boosters.count + excluded.count,
        total_received = user_boosters.total_received + excluded.total_received,
        updated_at = now();

  -- Notif au user
  insert into notifications (user_id, type, title, body, data)
  values (
    v_purchase.user_id,
    'subscription',
    'Boosters credites !',
    v_purchase.qty || ' booster(s) ont ete ajoutes a ton stock. Ils n''expirent jamais.',
    '{"link": "/pages/my-profile.html"}'::jsonb
  );

  return json_build_object('ok', true, 'qty', v_purchase.qty);
end; $$;
grant execute on function public.admin_confirm_booster_purchase(text) to authenticated;

-- 8. RPC admin : grant gratuit (admin ou auto-signup)
create or replace function public.grant_booster(p_user_id uuid, p_qty int, p_source text default 'admin_grant')
returns json language plpgsql security definer set search_path = public as $$
begin
  -- Si appele par admin, OK. Si appele par auto-signup, c'est le trigger qui le fait avec security definer.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Admin uniquement.';
  end if;

  insert into user_boosters (user_id, count, total_received)
    values (p_user_id, p_qty, p_qty)
    on conflict (user_id) do update
    set count = user_boosters.count + excluded.count,
        total_received = user_boosters.total_received + excluded.total_received,
        updated_at = now();

  insert into booster_purchases (user_id, pack, qty, amount, status, source, confirmed_at)
  values (p_user_id, 'single', p_qty, 0, 'confirmed', p_source, now());

  return json_build_object('ok', true);
end; $$;
grant execute on function public.grant_booster(uuid, int, text) to authenticated;

-- 9. Trigger : 1 booster offert a l'inscription
create or replace function public.on_user_signup_gift_booster()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Cree le row user_boosters avec 1 booster gratuit
  insert into public.user_boosters (user_id, count, total_received)
  values (new.id, 1, 1)
  on conflict (user_id) do nothing;

  insert into public.booster_purchases (user_id, pack, qty, amount, status, source, confirmed_at)
  values (new.id, 'single', 1, 0, 'confirmed', 'signup_gift', now());

  -- Notif de bienvenue
  insert into public.notifications (user_id, type, title, body, data)
  values (
    new.id,
    'subscription',
    'Bienvenue ! 1 booster offert',
    'Tu as 1 booster gratuit pour mettre une annonce en avant pendant 7 jours.',
    '{"link": "/pages/my-profile.html"}'::jsonb
  );

  return new;
end; $$;

drop trigger if exists on_user_signup_gift_booster on auth.users;
create trigger on_user_signup_gift_booster
  after insert on auth.users
  for each row execute function public.on_user_signup_gift_booster();

-- 10. BACKFILL : donner 1 booster a tous les users existants (sauf ceux qui en ont deja)
insert into public.user_boosters (user_id, count, total_received)
  select id, 1, 1 from auth.users u
  where not exists (select 1 from user_boosters ub where ub.user_id = u.id)
on conflict (user_id) do nothing;

-- Notif "Bonne nouvelle V2" pour tous les users existants
insert into public.notifications (user_id, type, title, body, data)
  select u.id, 'subscription',
         'DjamikShop devient gratuit illimite !',
         'Annonces illimitees + 1 booster offert pour celebrer. Achete des packs des 1200 FCFA quand tu veux.',
         '{"link": "/pages/buy-boosters.html"}'::jsonb
  from auth.users u
  where not exists (
    select 1 from notifications n
    where n.user_id = u.id and n.title = 'DjamikShop devient gratuit illimite !'
  );

-- 11. Supprime la limite d'annonces (free = illimite maintenant)
--     On garde la fonction tier_listing_limit pour compat mais elle retourne tjs illimite
create or replace function public.tier_listing_limit(t text)
returns int language sql immutable as $$
  -- v2 : annonces illimitees pour tout le monde
  select 999999;
$$;

-- 12. Vue admin pour stats v2
create or replace view public.v2_stats as
  select
    (select count(*) from auth.users) as total_users,
    (select count(*) from user_boosters where count > 0) as users_with_boosters,
    (select sum(count) from user_boosters) as total_boosters_in_circulation,
    (select sum(total_spent) from user_boosters) as total_boosters_consumed,
    (select count(*) from boosts where expires_at > now()) as active_boosts,
    (select count(*) from boosts where expires_at > now() and vedette = true) as active_vedette,
    (select sum(amount) from booster_purchases where status = 'confirmed' and source = 'purchase') as revenue_total;

grant select on public.v2_stats to authenticated;
