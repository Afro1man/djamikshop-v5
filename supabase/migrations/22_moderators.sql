-- ═══════════════════════════════════════════════════════════════════
--  STAFF : hierarchie Admin (chef) + Moderator (adjoint)
-- ═══════════════════════════════════════════════════════════════════
--  - admin    : tout pouvoir (nomme/retire staff, supprime user, etc.)
--  - moderator: peut moderer le contenu et bannir user normal
--               MAIS ne peut PAS toucher au staff ni supprimer user
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
--  1. Colonne role sur admins (default = 'admin' pour preserver l'existant)
-- ───────────────────────────────────────────────────────────────────
alter table admins add column if not exists role text not null default 'admin'
  check (role in ('admin','moderator'));

-- ───────────────────────────────────────────────────────────────────
--  2. is_admin() = strict (role='admin')
--     is_staff() = admin OR moderator
-- ───────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from admins where user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_staff()
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from admins where user_id = auth.uid());
$$;

grant execute on function public.is_admin()  to authenticated;
grant execute on function public.is_staff()  to authenticated;

-- RPC pratique pour le client : mon role
create or replace function public.my_staff_role()
returns text language sql security definer set search_path = public as $$
  select role from admins where user_id = auth.uid();
$$;
grant execute on function public.my_staff_role() to authenticated;

-- ───────────────────────────────────────────────────────────────────
--  3. POLICIES : remplace 'is_admin()' par 'is_staff()' pour les
--               actions courantes ; admin only pour les destructives
-- ───────────────────────────────────────────────────────────────────

-- REPORTS
drop policy if exists "reports admin read"   on reports;
drop policy if exists "reports admin update" on reports;
drop policy if exists "reports admin delete" on reports;
create policy "reports staff read"   on reports for select to authenticated using (public.is_staff());
create policy "reports staff update" on reports for update to authenticated using (public.is_staff());
create policy "reports admin delete" on reports for delete to authenticated using (public.is_admin());

-- BANNED_USERS : staff peut bannir, mais PAS un autre membre du staff
drop policy if exists "bans admin all"     on banned_users;
drop policy if exists "bans staff read"    on banned_users;
drop policy if exists "bans staff insert"  on banned_users;
drop policy if exists "bans staff update"  on banned_users;
drop policy if exists "bans staff delete"  on banned_users;
create policy "bans staff read"   on banned_users for select to authenticated using (public.is_staff());
create policy "bans staff insert" on banned_users for insert to authenticated
  with check (public.is_staff() and not exists(select 1 from admins where user_id = banned_users.user_id));
create policy "bans staff update" on banned_users for update to authenticated
  using (public.is_staff())
  with check (not exists(select 1 from admins where user_id = banned_users.user_id));
create policy "bans staff delete" on banned_users for delete to authenticated using (public.is_staff());

-- FORBIDDEN WORDS : staff peut gerer
drop policy if exists "fwords admin insert" on forbidden_words;
drop policy if exists "fwords admin update" on forbidden_words;
drop policy if exists "fwords admin delete" on forbidden_words;
create policy "fwords staff insert" on forbidden_words for insert to authenticated with check (public.is_staff());
create policy "fwords staff update" on forbidden_words for update to authenticated using (public.is_staff());
create policy "fwords staff delete" on forbidden_words for delete to authenticated using (public.is_staff());

-- SECURITY_EVENTS : staff peut lire
drop policy if exists "sec read admin" on security_events;
create policy "sec read staff" on security_events for select to authenticated using (public.is_staff());

-- PAYMENT_REQUESTS
drop policy if exists "pay admin all" on payment_requests;
drop policy if exists "pay staff read" on payment_requests;
drop policy if exists "pay staff update" on payment_requests;
drop policy if exists "pay admin delete" on payment_requests;
create policy "pay staff read"   on payment_requests for select to authenticated using (public.is_staff() or auth.uid() = user_id);
create policy "pay staff update" on payment_requests for update to authenticated using (public.is_staff());
create policy "pay admin delete" on payment_requests for delete to authenticated using (public.is_admin());

-- SUBSCRIPTIONS : staff peut gerer
drop policy if exists "subs admin all" on subscriptions;
create policy "subs staff all" on subscriptions for all to authenticated
  using (public.is_staff() or auth.uid() = user_id)
  with check (public.is_staff() or auth.uid() = user_id);

-- ADMINS table : staff peut lire (pour voir l'equipe), seul admin peut ecrire
drop policy if exists "admins read self"   on admins;
drop policy if exists "admins read all"    on admins;
drop policy if exists "admins read staff"  on admins;
create policy "admins read auth" on admins for select to authenticated using (true);
-- (toute personne authentifiée peut savoir QUI est dans le staff, mais pas le modifier)

-- ───────────────────────────────────────────────────────────────────
--  4. RPC admin only : nommer / retirer un membre du staff
-- ───────────────────────────────────────────────────────────────────
create or replace function public.admin_promote_to_staff(p_user_id uuid, p_role text default 'moderator')
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Seul un admin peut nommer un membre du staff.'; end if;
  if p_role not in ('admin','moderator') then raise exception 'Role invalide (admin ou moderator).'; end if;
  insert into admins (user_id, role) values (p_user_id, p_role)
    on conflict (user_id) do update set role = p_role;
  return json_build_object('ok', true, 'user_id', p_user_id, 'role', p_role);
end; $$;

create or replace function public.admin_demote_staff(p_user_id uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Seul un admin peut retirer un membre du staff.'; end if;
  if p_user_id = auth.uid() then raise exception 'Tu ne peux pas te retirer toi-meme.'; end if;
  delete from admins where user_id = p_user_id;
  return json_build_object('ok', true);
end; $$;

grant execute on function public.admin_promote_to_staff(uuid, text) to authenticated;
grant execute on function public.admin_demote_staff(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────
--  5. RPC admin_delete_user : refuse si la cible est dans le staff
-- ───────────────────────────────────────────────────────────────────
create or replace function public.admin_delete_user(p_user_id uuid)
returns json language plpgsql security definer set search_path = public, auth as $$
declare admin_uid uuid;
begin
  admin_uid := auth.uid();
  if not public.is_admin() then
    raise exception 'Seul un admin peut supprimer un utilisateur.';
  end if;
  if p_user_id = admin_uid then
    raise exception 'Tu ne peux pas te supprimer toi-meme.';
  end if;
  if exists(select 1 from admins where user_id = p_user_id) then
    raise exception 'Impossible de supprimer un membre du staff. Retire-le du staff d''abord.';
  end if;
  delete from auth.users where id = p_user_id;
  return json_build_object('ok', true, 'deleted', p_user_id);
end; $$;

-- Vérifications
-- select public.my_staff_role();   -- doit retourner 'admin' pour toi
-- select public.is_admin();        -- true
-- select public.is_staff();        -- true
