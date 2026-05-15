-- ═══════════════════════════════════════════════════════════════════
--  AUTO-DOWNGRADE : abonnement expire -> repasse en free
--  + grace 48h sur les annonces excedentaires avant suppression
-- ═══════════════════════════════════════════════════════════════════

-- Colonne sur products : si non-null, l'annonce est "inactive" et sera
-- supprimee 48h apres ce timestamp (sauf renouvellement)
alter table products add column if not exists inactive_at timestamptz;
create index if not exists products_inactive_idx on products(inactive_at) where inactive_at is not null;

-- Fonction principale : a appeler periodiquement (ou a chaque chargement
-- de l'app cote client). Idempotent.
create or replace function public.process_expired_subscriptions()
returns json language plpgsql security definer set search_path = public as $$
declare
  rec record;
  downgraded_count int := 0;
  restored_count int := 0;
  deleted_count int := 0;
  marked_count int := 0;
begin
  -- 1. Downgrade des abonnements expires
  for rec in
    select user_id, tier from subscriptions
    where expires_at is not null and expires_at < now() and tier != 'free'
  loop
    update subscriptions set
      tier = 'free',
      expires_at = null,
      updated_at = now()
    where user_id = rec.user_id;
    downgraded_count := downgraded_count + 1;

    -- Marque comme inactives les annonces excedentaires (>10)
    -- en gardant les 10 plus recentes
    with kept as (
      select id from products
      where seller_id = rec.user_id and sold = false and inactive_at is null
      order by created_at desc limit 10
    ), marked as (
      update products set inactive_at = now()
      where seller_id = rec.user_id and sold = false and inactive_at is null
        and id not in (select id from kept)
      returning id
    )
    select count(*) into rec from marked;
    marked_count := marked_count + coalesce(rec.user_id::int, 0);

    -- Notification
    insert into notifications (user_id, type, title, body, data)
    values (rec.user_id, 'subscription',
            'Ton abonnement ' || rec.tier || ' a expire',
            'Ton compte repasse en Gratuit. Tes annonces excedentaires (au-dela de 10) seront supprimees dans 48h sauf si tu renouvelles.',
            jsonb_build_object('expired_tier', rec.tier));
  end loop;

  -- 2. Restaure les annonces inactives si l'user a un nouveau plan paye
  update products set inactive_at = null
  where inactive_at is not null
    and seller_id in (
      select user_id from subscriptions
      where tier != 'free' and (expires_at is null or expires_at > now())
    );
  GET DIAGNOSTICS restored_count = ROW_COUNT;

  -- 3. Suppression definitive des annonces inactives depuis >48h
  delete from products
  where inactive_at is not null and inactive_at < now() - interval '48 hours';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  return json_build_object(
    'downgraded', downgraded_count,
    'restored',   restored_count,
    'deleted',    deleted_count
  );
end; $$;

grant execute on function public.process_expired_subscriptions() to authenticated;

-- Helper : annonces inactives d'un user (avec h restantes avant suppression)
create or replace function public.my_inactive_products()
returns table(id uuid, title text, inactive_at timestamptz, hours_left int)
language sql security definer set search_path = public as $$
  select id, title, inactive_at,
    greatest(0, extract(epoch from (inactive_at + interval '48 hours' - now()))/3600)::int as hours_left
  from products
  where seller_id = auth.uid() and inactive_at is not null
  order by inactive_at;
$$;

grant execute on function public.my_inactive_products() to authenticated;

-- Vue pratique : mon abonnement courant + jours restants
create or replace function public.my_subscription_info()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'tier',        tier,
    'expires_at',  expires_at,
    'days_left',   case
      when expires_at is null then null
      when expires_at < now() then 0
      else greatest(0, ceil(extract(epoch from (expires_at - now()))/86400))::int
    end,
    'auto_renew',  auto_renew
  )
  from subscriptions where user_id = auth.uid();
$$;

grant execute on function public.my_subscription_info() to authenticated;

-- Verifications
-- select public.process_expired_subscriptions();
-- select public.my_subscription_info();
-- select * from public.my_inactive_products();
