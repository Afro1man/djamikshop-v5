-- ═══════════════════════════════════════════════════════════════════
--  TABLE ADMINS — qui peut moderer les signalements et le contenu
-- ═══════════════════════════════════════════════════════════════════

create table if not exists admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  added_at    timestamptz default now()
);

alter table admins enable row level security;

drop policy if exists "admins read self" on admins;
create policy "admins read self" on admins for select to authenticated
  using (auth.uid() = user_id);

-- ⚠️ Ajoute ton propre user_id ici (Afro1man / maliksaley19@gmail.com)
insert into admins (user_id) values
  ('e21f27dc-697a-4543-bb2a-01b9f4bbd69d')
on conflict do nothing;

-- Helper SQL : retourne true si l'user courant est admin
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from admins where user_id = auth.uid());
$$;

-- ── Policies admin sur reports ──
drop policy if exists "reports admin read"   on reports;
drop policy if exists "reports admin update" on reports;
drop policy if exists "reports admin delete" on reports;

create policy "reports admin read"   on reports for select to authenticated using (public.is_admin());
create policy "reports admin update" on reports for update to authenticated using (public.is_admin());
create policy "reports admin delete" on reports for delete to authenticated using (public.is_admin());

-- ── Permet aux admins de supprimer n'importe quel produit (modération) ──
drop policy if exists "products admin delete" on products;
create policy "products admin delete" on products for delete to authenticated
  using (public.is_admin());

-- Vérification
-- select * from admins;
-- select public.is_admin();   -- doit retourner true si tu es connecté
