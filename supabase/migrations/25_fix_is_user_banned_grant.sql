-- ═══════════════════════════════════════════════════════════════════
--  Migration 25 : Fix CRITIQUE - is_user_banned() pas executable par les users
--
--  Bug : la fonction is_user_banned() est utilisee dans la RLS policy
--  "products read non-banned" mais n'avait jamais ete GRANT EXECUTE aux
--  roles anon/authenticated.
--  Resultat : la RLS echouait silencieusement pour TOUS les products,
--  les users ne voyaient que leurs propres annonces (issue du cache local).
-- ═══════════════════════════════════════════════════════════════════

grant execute on function public.is_user_banned(uuid) to anon, authenticated;

-- Au passage, on s'assure aussi que les autres helpers sont accessibles
grant execute on function public.user_email_verified() to anon, authenticated;
