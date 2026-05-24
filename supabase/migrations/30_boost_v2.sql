-- ═══════════════════════════════════════════════════════════════════
--  Migration 30 : Refonte systeme BOOSTS v2 (mai 2026)
--
--  Avant :
--    - 1 boost = 24h
--    - 5 par jour (VIP) / 15 par jour (Premium)
--    - VIP et Premium boostes affiches identiquement (memes resultats)
--  Apres :
--    - 1 boost = 7 jours
--    - 5 par MOIS (VIP) / 15 par MOIS (Premium)
--    - VIP boost = liste normale uniquement (avec petite etoile)
--    - Premium boost = liste normale + section "Vedette" (max 3 par vendeur, max 9 total)
--    - Les places vides en Vedette ne sont JAMAIS comblees par les annonces gratuites
-- ═══════════════════════════════════════════════════════════════════

-- 1. Default expires_at devient 7 jours (les nouveaux boosts)
--    Les boosts existants gardent leur expires_at actuel (24h)
alter table public.boosts
  alter column expires_at set default (now() + interval '7 days');

-- 2. Nouvelles limites mensuelles
create or replace function public.tier_boost_monthly_limit(t text)
returns int language sql immutable as $$
  select case t when 'premium' then 15 when 'vip' then 5 else 0 end;
$$;

-- Combien de boosts l'user a fait dans le mois calendaire courant
create or replace function public.boosts_used_this_month(uid uuid)
returns int language sql security definer set search_path = public as $$
  select count(*)::int from boosts
    where user_id = uid
      and started_at >= date_trunc('month', now());
$$;

-- Wrapper retro-compatible (rien dans le code front n'appelle plus today, mais au cas ou)
create or replace function public.boosts_used_today(uid uuid)
returns int language sql security definer set search_path = public as $$
  select public.boosts_used_this_month(uid);
$$;

-- RPC publique pour le frontend
create or replace function public.my_boosts_used_this_month()
returns int language sql security definer set search_path = public as $$
  select public.boosts_used_this_month(auth.uid());
$$;
grant execute on function public.my_boosts_used_this_month() to authenticated;

-- Pour Phase 5 (scoring) : compteur disponible
create or replace function public.tier_boost_daily_limit(t text)
returns int language sql immutable as $$
  -- Deprecated mais conserve pour ne pas casser le code legacy
  select public.tier_boost_monthly_limit(t);
$$;

-- 3. Nouveau validate_boost_insert : quota MENSUEL + 7 jours
create or replace function public.validate_boost_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  tier text;
  monthly_limit int;
  used int;
  already_boosted bool;
begin
  uid := auth.uid();
  if uid is null then raise exception 'Non authentifie.'; end if;
  if new.user_id is null or new.user_id != uid then
    raise exception 'Tu ne peux booster que tes propres annonces.';
  end if;

  -- L'annonce appartient bien a l'user
  if not exists(select 1 from products where id = new.product_id and seller_id = uid) then
    raise exception 'Annonce introuvable ou ne t''appartient pas.';
  end if;

  if public.is_user_banned(uid) then
    raise exception 'Compte suspendu.';
  end if;

  -- Pas un free user
  tier := public.user_tier(uid);
  if tier = 'free' then
    raise exception 'Boost reserve aux comptes VIP & Premium. Voir tarifs.';
  end if;

  -- Anti double-boost sur la meme annonce (s'il est deja boostee, refuse)
  select exists(select 1 from boosts where product_id = new.product_id and expires_at > now())
    into already_boosted;
  if already_boosted then
    raise exception 'Cette annonce est deja boostee.';
  end if;

  -- Quota mensuel
  monthly_limit := public.tier_boost_monthly_limit(tier);
  used := public.boosts_used_this_month(uid);
  if used >= monthly_limit then
    raise exception 'Quota mensuel atteint (% / %). Reset le 1er du mois.', used, monthly_limit;
  end if;

  -- Force la duree a 7 jours (au cas ou un client envoie un expires_at custom)
  if new.expires_at is null or new.expires_at > now() + interval '8 days' then
    new.expires_at := now() + interval '7 days';
  end if;
  if new.started_at is null then
    new.started_at := now();
  end if;

  return new;
end; $$;

-- 4. Helpers Vedette (Premium uniquement)
-- Combien d'annonces du vendeur sont en Vedette actuellement (= boost actif + tier premium)
create or replace function public.vedette_count_for_seller(uid uuid)
returns int language sql security definer set search_path = public as $$
  select count(*)::int
  from boosts b
  join products p on p.id = b.product_id
  where b.user_id = uid
    and b.expires_at > now()
    and p.sold = false
    and p.inactive_at is null
    and public.user_tier(uid) = 'premium';
$$;

-- 5. RPC publique : recupere les annonces Vedette (max 9 total, max 3 par vendeur)
create or replace function public.get_vedette_products(p_limit int default 9, p_per_seller int default 3)
returns table(
  product_id   uuid,
  seller_id    uuid,
  title        text,
  price        int,
  city         text,
  image_url    text,
  images       jsonb,
  views        int,
  clicks       int,
  created_at   timestamptz,
  boosted_at   timestamptz
)
language sql security definer set search_path = public as $$
  with active_boosts as (
    select b.product_id, b.user_id as seller, b.started_at,
           row_number() over (partition by b.user_id order by b.started_at desc) as rk
    from boosts b
    where b.expires_at > now()
  ),
  capped as (
    select * from active_boosts where rk <= p_per_seller
  )
  select p.id as product_id,
         p.seller_id,
         p.title,
         p.price,
         p.city,
         p.image_url,
         coalesce(p.images, '[]'::jsonb) as images,
         coalesce(p.views, 0)  as views,
         coalesce(p.clicks, 0) as clicks,
         p.created_at,
         c.started_at as boosted_at
  from capped c
  join products p on p.id = c.product_id
  where p.sold = false
    and p.inactive_at is null
    and not public.is_user_banned(p.seller_id)
    and public.user_tier(p.seller_id) = 'premium'   -- VEDETTE = PREMIUM ONLY
  order by c.started_at desc
  limit p_limit;
$$;

grant execute on function public.get_vedette_products(int, int) to anon, authenticated;
grant execute on function public.vedette_count_for_seller(uuid) to authenticated;
