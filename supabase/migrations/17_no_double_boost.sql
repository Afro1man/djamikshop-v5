-- ═══════════════════════════════════════════════════════════════════
--  RULE : impossible de booster une annonce deja boostee
--  (jusqu'a la fin du boost en cours)
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.validate_boost_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid; t text; lim int; used int;
  is_owner boolean; already_boosted boolean;
begin
  uid := auth.uid();
  if uid is null then raise exception 'Non authentifie.'; end if;
  if uid != new.user_id then
    raise exception 'Tu ne peux booster que tes propres annonces.';
  end if;

  select exists(select 1 from products where id = new.product_id and seller_id = uid) into is_owner;
  if not is_owner then
    raise exception 'Ce produit ne t''appartient pas.';
  end if;

  -- ── NOUVELLE REGLE : pas de double boost actif sur le meme produit ──
  select exists(
    select 1 from boosts
    where product_id = new.product_id
      and expires_at > now()
  ) into already_boosted;
  if already_boosted then
    raise exception 'Cette annonce est deja boostee. Attends la fin du boost actuel (24h max).';
  end if;

  t   := public.user_tier(uid);
  lim := public.tier_boost_daily_limit(t);
  if lim = 0 then
    raise exception 'Le plan Gratuit ne permet pas de booster. Passe en VIP ou Premium.';
  end if;

  used := public.boosts_used_today(uid);
  if used >= lim then
    raise exception 'Quota de boosts atteint (%/jour). Reessaye demain.', lim;
  end if;

  return new;
end; $$;
