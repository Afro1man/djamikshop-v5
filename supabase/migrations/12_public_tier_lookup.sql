-- ═══════════════════════════════════════════════════════════════════
--  FIX : permettre de lire publiquement le TIER (sans details prives)
--  Avant : RLS subscriptions bloquait, donc les badges VIP/Premium
--  n'apparaissaient pas pour les autres utilisateurs.
-- ═══════════════════════════════════════════════════════════════════

-- Fonction publique : retourne le tier de plusieurs users
-- (security definer pour bypass RLS, mais expose UNIQUEMENT user_id+tier)
create or replace function public.users_tiers(uids uuid[])
returns table(user_id uuid, tier text)
language sql security definer set search_path = public as $$
  select s.user_id,
         case
           when s.expires_at is null then s.tier
           when s.expires_at > now() then s.tier
           else 'free'
         end as tier
  from subscriptions s
  where s.user_id = any(uids);
$$;

grant execute on function public.users_tiers(uuid[]) to anon, authenticated;

-- Fonction publique single (pratique)
-- public.user_tier(uid) existe deja en security definer (cf 09_subscriptions.sql)
-- on s'assure que anon peut l'appeler aussi
grant execute on function public.user_tier(uuid) to anon, authenticated;

-- Verification
-- select * from public.users_tiers(array(select id from auth.users limit 5));
