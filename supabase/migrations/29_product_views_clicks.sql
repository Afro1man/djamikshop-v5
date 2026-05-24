-- ═══════════════════════════════════════════════════════════════════
--  Migration 29 : Stats vues + clics sur les annonces
--
--  - Colonnes views (vues = annonce vue dans une liste) et clicks
--    (annonce ouverte sur sa page detail)
--  - RPC bump_product_stats(jsonb) : batch update efficace en 1 round-trip
--    Format input : { "product_id1": {"v": 3, "c": 1}, "product_id2": {...}, ... }
--  - Public read (les vendeurs peuvent voir leurs stats, public = pour CTR)
-- ═══════════════════════════════════════════════════════════════════

-- 1. Colonnes
alter table public.products
  add column if not exists views  integer not null default 0,
  add column if not exists clicks integer not null default 0;

-- Index pour algo Vedette plus tard (CTR = clicks/views)
create index if not exists products_views_idx  on public.products(views desc);
create index if not exists products_clicks_idx on public.products(clicks desc);

-- 2. RPC batch : prend { "id1": {"v": n, "c": m}, ... } et incremente
create or replace function public.bump_product_stats(p_batch jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  k text;
  v_int int;
  c_int int;
  total_v int := 0;
  total_c int := 0;
begin
  if p_batch is null or jsonb_typeof(p_batch) <> 'object' then
    return json_build_object('ok', false, 'reason', 'invalid input');
  end if;

  for k in select jsonb_object_keys(p_batch) loop
    v_int := coalesce((p_batch->k->>'v')::int, 0);
    c_int := coalesce((p_batch->k->>'c')::int, 0);
    if v_int < 0 then v_int := 0; end if;
    if c_int < 0 then c_int := 0; end if;
    -- Cap par produit pour eviter abus / boucles infinies
    if v_int > 100 then v_int := 100; end if;
    if c_int > 100 then c_int := 100; end if;

    if v_int = 0 and c_int = 0 then continue; end if;

    update public.products
      set views  = views  + v_int,
          clicks = clicks + c_int
      where id = k::uuid;

    total_v := total_v + v_int;
    total_c := total_c + c_int;
  end loop;

  return json_build_object('ok', true, 'views_added', total_v, 'clicks_added', total_c);
end; $$;

-- Accessible sans auth (visiteurs comptent aussi)
grant execute on function public.bump_product_stats(jsonb) to anon, authenticated;
