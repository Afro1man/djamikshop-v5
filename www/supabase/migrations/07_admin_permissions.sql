-- ═══════════════════════════════════════════════════════════════════
--  ADMIN PERMISSIONS — accès admin aux tables de modération
-- ═══════════════════════════════════════════════════════════════════

-- ── BANNED_USERS : admin peut tout faire ──
drop policy if exists "bans admin all" on banned_users;
create policy "bans admin all" on banned_users for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── FORBIDDEN_WORDS : admin peut INSERT/UPDATE/DELETE ──
-- (la SELECT publique existait déjà via "fwords read public")
drop policy if exists "fwords admin insert" on forbidden_words;
drop policy if exists "fwords admin update" on forbidden_words;
drop policy if exists "fwords admin delete" on forbidden_words;

create policy "fwords admin insert" on forbidden_words for insert to authenticated
  with check (public.is_admin());
create policy "fwords admin update" on forbidden_words for update to authenticated
  using (public.is_admin());
create policy "fwords admin delete" on forbidden_words for delete to authenticated
  using (public.is_admin());

-- ── SECURITY_EVENTS : admin peut tout lire ──
drop policy if exists "sec read admin" on security_events;
create policy "sec read admin" on security_events for select to authenticated
  using (public.is_admin());

-- ── ADMINS : admin peut SELECT all (pour voir tous les admins) ──
drop policy if exists "admins read all" on admins;
create policy "admins read all" on admins for select to authenticated
  using (public.is_admin());

-- ── PROFILES : déjà publiques en lecture, pas de changement ──

-- Vérification
-- select count(*) from banned_users;
-- select count(*) from forbidden_words;
-- select count(*) from security_events;
