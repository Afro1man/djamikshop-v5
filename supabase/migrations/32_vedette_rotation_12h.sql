-- ═══════════════════════════════════════════════════════════════════
--  Migration 32 : Recyclage automatique Vedette toutes les 12h
--
--  Quand il y a plus de 9 annonces eligibles, on alterne entre elles
--  par slot de 12h. Le SCORE reste le facteur dominant (les bonnes
--  annonces restent toujours visibles), mais a score equivalent on
--  rotate via un hash deterministe base sur l'epoch 12h.
--
--  Comportement :
--    - Matin (00h-12h) : top 9 selon score + rotation_seed_A
--    - Soir (12h-24h) : top 9 selon score + rotation_seed_B (rotation tiebreak)
--    - Si seulement 5 annonces eligibles : pas de rotation visible (les 5 restent)
--    - Si 30 annonces eligibles : matrice rotative qui change toutes les 12h
-- ═══════════════════════════════════════════════════════════════════

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
  boosted_at   timestamptz,
  score        numeric
)
language sql security definer set search_path = public as $$
  with epoch_slot as (
    -- Slot de 12h : entier qui change toutes les 12h
    -- (ex: slot 12345 le matin, slot 12346 le soir, etc.)
    select floor(extract(epoch from now()) / (12.0 * 3600.0))::bigint as slot
  ),
  active_boosts as (
    select b.product_id, b.user_id as seller, b.started_at as boosted_at
    from boosts b
    where b.expires_at > now()
  ),
  enriched as (
    select ab.product_id,
           ab.seller,
           ab.boosted_at,
           p.title,
           p.price,
           p.city,
           p.image_url,
           coalesce(p.images, '[]'::jsonb) as images,
           coalesce(p.views, 0)  as views,
           coalesce(p.clicks, 0) as clicks,
           p.created_at,
           -- ── 40% CTR ──
           least(1.0, coalesce(p.clicks, 0)::numeric / greatest(coalesce(p.views, 0)::numeric, 1.0))
             as ctr_score,
           -- ── 30% Fraicheur (decay 7 jours) ──
           exp(- extract(epoch from (now() - p.created_at)) / (7.0 * 24.0 * 3600.0))
             as freshness_score,
           -- ── 20% Qualite vendeur ──
           (
             least(1.0, extract(epoch from (now() - prof.created_at)) / (365.0 * 24.0 * 3600.0)) * 0.5
             + least(1.0, (
                 select count(*)::numeric from products p2
                 where p2.seller_id = ab.seller and p2.sold = true
               ) / 10.0) * 0.5
           ) as seller_quality_score,
           -- ── 10% Anciennete abo Premium ──
           coalesce((
             select least(1.0, extract(epoch from (now() - s.created_at)) / (180.0 * 24.0 * 3600.0))
             from subscriptions s
             where s.user_id = ab.seller
             order by s.created_at asc
             limit 1
           ), 0.0) as sub_age_score,
           -- ── Tiebreak rotation 12h : hash(product_id, slot) deterministe ──
           ('x' || substr(md5(ab.product_id::text || (select slot from epoch_slot)::text), 1, 8))::bit(32)::int / 2147483647.0
             as rotation_tiebreak
    from active_boosts ab
    join products p on p.id = ab.product_id
    left join profiles prof on prof.id = ab.seller
    where p.sold = false
      and p.inactive_at is null
      and not public.is_user_banned(ab.seller)
      and public.user_tier(ab.seller) = 'premium'
  ),
  scored as (
    select *,
      -- Score principal (95% du poids) : 40+30+20+10 = 100% mais on garde 95%
      -- pour qu'il prime largement sur la rotation (5%)
      (ctr_score          * 0.40
       + freshness_score   * 0.30
       + seller_quality_score * 0.20
       + sub_age_score     * 0.10) * 0.95
      + rotation_tiebreak * 0.05
      as score
    from enriched
  ),
  ranked_per_seller as (
    select *, row_number() over (partition by seller order by score desc, boosted_at desc) as rk
    from scored
  ),
  capped as (
    select * from ranked_per_seller where rk <= p_per_seller
  )
  select product_id, seller as seller_id, title, price, city, image_url, images,
         views, clicks, created_at, boosted_at, score
  from capped
  order by score desc, boosted_at desc
  limit p_limit;
$$;

grant execute on function public.get_vedette_products(int, int) to anon, authenticated;
