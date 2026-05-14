-- ═══════════════════════════════════════════════════════════════════
--  DJAMIKSHOP v5 — SCHÉMA COMPLET
--  À exécuter dans Supabase SQL Editor en une fois.
--  Idempotent : peut être ré-exécuté sans casser les données existantes.
-- ═══════════════════════════════════════════════════════════════════

-- Extensions utiles
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ═══════════════════════════════════════════════════════════════════
--  RESET — supprime tout pour repartir de zéro
--  ⚠️ ATTENTION : ce bloc EFFACE TOUTES LES DONNÉES des tables ci-dessous.
--  Les buckets Storage et leurs fichiers ne sont PAS supprimés.
--  Commente ce bloc si tu veux préserver les données existantes.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Désactive le trigger auth pour pouvoir drop la function après
drop trigger if exists on_auth_user_created on auth.users;

-- 2. Drop des tables (cascade pour gérer les FK et indexes automatiquement)
drop table if exists push_subscriptions  cascade;
drop table if exists wishlists            cascade;
drop table if exists offers               cascade;
drop table if exists reviews              cascade;
drop table if exists notifications        cascade;
drop table if exists orders               cascade;
drop table if exists messages             cascade;
drop table if exists conversations        cascade;
drop table if exists products             cascade;
drop table if exists profiles             cascade;

-- 3. Drop des functions custom
drop function if exists public.handle_new_user()    cascade;
drop function if exists public.set_updated_at()     cascade;
drop function if exists public.bump_conversation()  cascade;

-- 4. Retire les tables de la publication realtime (si présentes — silencieux sinon)
--    NB : `alter publication ... drop table if exists` n'existe pas en SQL,
--    on itère et on swallow l'erreur "table not in publication".
do $$
declare t text;
begin
  for t in select unnest(array['messages','notifications','conversations','offers']) loop
    begin
      execute format('alter publication supabase_realtime drop table %I', t);
    exception when others then null;
    end;
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────────────
--  1. PROFILES — données publiques d'un utilisateur
-- ───────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  email        text,
  phone        text,
  location     text,
  avatar_url   text,
  bio          text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- Auto-création d'un profile quand un user s'inscrit (trigger)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, created_at)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), now())
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────────────────────────────────────────────
--  2. PRODUCTS — annonces
-- ───────────────────────────────────────────────────────────────────
create table if not exists products (
  id               uuid primary key default uuid_generate_v4(),
  seller_id        uuid not null references auth.users(id) on delete cascade,
  title            text not null,
  description      text,
  price            integer not null check (price >= 0),
  category         text,
  condition        text,
  city             text,
  image_url        text,
  images           jsonb default '[]'::jsonb,
  payment_methods  jsonb default '[]'::jsonb,
  negotiable       boolean default false,
  sold             boolean default false,
  views            integer default 0,
  boost_until      timestamptz,
  featured         boolean default false,
  discount         integer check (discount is null or (discount >= 0 and discount <= 90)),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index if not exists products_seller_idx     on products(seller_id);
create index if not exists products_category_idx   on products(category);
create index if not exists products_city_idx       on products(city);
create index if not exists products_sold_idx       on products(sold);
create index if not exists products_created_at_idx on products(created_at desc);

-- ───────────────────────────────────────────────────────────────────
--  3. CONVERSATIONS — fils de discussion
-- ───────────────────────────────────────────────────────────────────
create table if not exists conversations (
  id              uuid primary key default uuid_generate_v4(),
  product_id      uuid references products(id) on delete set null,
  participants    uuid[] not null,
  last_message    text,
  last_message_at timestamptz,
  created_at      timestamptz default now()
);

create index if not exists conversations_participants_idx on conversations using gin(participants);
create index if not exists conversations_product_idx      on conversations(product_id);

-- ───────────────────────────────────────────────────────────────────
--  4. MESSAGES — messages individuels
-- ───────────────────────────────────────────────────────────────────
create table if not exists messages (
  id            uuid primary key default uuid_generate_v4(),
  conv_id       uuid not null references conversations(id) on delete cascade,
  sender_id     uuid not null references auth.users(id) on delete cascade,
  recipient_id  uuid references auth.users(id) on delete cascade,
  text          text not null,
  read_at       timestamptz,
  created_at    timestamptz default now()
);

create index if not exists messages_conv_idx     on messages(conv_id, created_at);
create index if not exists messages_sender_idx   on messages(sender_id);
create index if not exists messages_unread_idx   on messages(recipient_id) where read_at is null;

-- ───────────────────────────────────────────────────────────────────
--  5. ORDERS — commandes
-- ───────────────────────────────────────────────────────────────────
create table if not exists orders (
  id                 uuid primary key default uuid_generate_v4(),
  buyer_id           uuid not null references auth.users(id) on delete cascade,
  items              jsonb not null default '[]'::jsonb,
  total              integer not null check (total >= 0),
  address            text,
  note               text,
  payment_method     text,
  payment_phone      text,
  payment_reference  text,
  payment_status     text default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  status             text default 'pending' check (status in ('pending','paid','shipped','delivered','cancelled')),
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index if not exists orders_buyer_idx      on orders(buyer_id, created_at desc);
create index if not exists orders_status_idx     on orders(status);

-- ───────────────────────────────────────────────────────────────────
--  6. NOTIFICATIONS
-- ───────────────────────────────────────────────────────────────────
create table if not exists notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in ('order','offer','message','system','promo')),
  title       text not null,
  body        text,
  data        jsonb default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz default now()
);

create index if not exists notif_user_idx        on notifications(user_id, created_at desc);
create index if not exists notif_unread_idx      on notifications(user_id) where read_at is null;

-- ───────────────────────────────────────────────────────────────────
--  7. REVIEWS — avis sur produits
-- ───────────────────────────────────────────────────────────────────
create table if not exists reviews (
  id          uuid primary key default uuid_generate_v4(),
  product_id  uuid not null references products(id) on delete cascade,
  author_id   uuid not null references auth.users(id) on delete cascade,
  rating      integer not null check (rating >= 1 and rating <= 5),
  text        text,
  created_at  timestamptz default now(),
  unique (product_id, author_id)   -- 1 avis max par user par produit
);

create index if not exists reviews_product_idx on reviews(product_id);

-- ───────────────────────────────────────────────────────────────────
--  8. OFFERS — propositions d'achat
-- ───────────────────────────────────────────────────────────────────
create table if not exists offers (
  id           uuid primary key default uuid_generate_v4(),
  product_id   uuid not null references products(id) on delete cascade,
  buyer_id     uuid not null references auth.users(id) on delete cascade,
  amount       integer not null check (amount >= 0),
  note         text,
  status       text default 'pending' check (status in ('pending','accepted','rejected','expired')),
  created_at   timestamptz default now()
);

create index if not exists offers_product_idx on offers(product_id);
create index if not exists offers_buyer_idx   on offers(buyer_id);

-- ───────────────────────────────────────────────────────────────────
--  9. WISHLISTS — favoris
-- ───────────────────────────────────────────────────────────────────
create table if not exists wishlists (
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  created_at  timestamptz default now(),
  primary key (user_id, product_id)
);

create index if not exists wishlists_user_idx on wishlists(user_id, created_at desc);

-- ───────────────────────────────────────────────────────────────────
--  10. PUSH_SUBSCRIPTIONS — abonnements Web Push
-- ───────────────────────────────────────────────────────────────────
create table if not exists push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  keys        jsonb not null,
  user_agent  text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists push_user_idx on push_subscriptions(user_id);


-- ═══════════════════════════════════════════════════════════════════
--  RLS — ROW LEVEL SECURITY
--  Active RLS sur toutes les tables, puis crée les policies.
-- ═══════════════════════════════════════════════════════════════════

alter table profiles            enable row level security;
alter table products            enable row level security;
alter table conversations       enable row level security;
alter table messages            enable row level security;
alter table orders              enable row level security;
alter table notifications       enable row level security;
alter table reviews             enable row level security;
alter table offers              enable row level security;
alter table wishlists           enable row level security;
alter table push_subscriptions  enable row level security;

-- ── Helper : drop & recreate les policies (idempotent) ──────────────
do $$ declare r record; begin
  for r in (select policyname, tablename from pg_policies
            where schemaname = 'public'
              and tablename in ('profiles','products','conversations','messages','orders','notifications','reviews','offers','wishlists','push_subscriptions'))
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ── PROFILES ──
create policy "profiles read public" on profiles for select to anon, authenticated using (true);
create policy "profiles insert self" on profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles update self" on profiles for update to authenticated using (auth.uid() = id);

-- ── PRODUCTS ──
create policy "products read public" on products for select to anon, authenticated using (true);
create policy "products insert own"  on products for insert to authenticated with check (auth.uid() = seller_id);
create policy "products update own"  on products for update to authenticated using (auth.uid() = seller_id);
create policy "products delete own"  on products for delete to authenticated using (auth.uid() = seller_id);

-- ── CONVERSATIONS ──
create policy "conv read participants" on conversations for select to authenticated
  using (auth.uid() = any(participants));
create policy "conv insert participant" on conversations for insert to authenticated
  with check (auth.uid() = any(participants));
create policy "conv update participants" on conversations for update to authenticated
  using (auth.uid() = any(participants));

-- ── MESSAGES ──
create policy "messages read participants" on messages for select to authenticated
  using (
    auth.uid() = sender_id
    or auth.uid() = recipient_id
    or exists (
      select 1 from conversations c
      where c.id = messages.conv_id and auth.uid() = any(c.participants)
    )
  );
create policy "messages insert as sender" on messages for insert to authenticated
  with check (auth.uid() = sender_id);
create policy "messages mark read" on messages for update to authenticated
  using (auth.uid() = recipient_id);

-- ── ORDERS ──
create policy "orders read own"   on orders for select to authenticated using (auth.uid() = buyer_id);
create policy "orders insert own" on orders for insert to authenticated with check (auth.uid() = buyer_id);
create policy "orders update own" on orders for update to authenticated using (auth.uid() = buyer_id);

-- ── NOTIFICATIONS ──
create policy "notif read own"    on notifications for select to authenticated using (auth.uid() = user_id);
create policy "notif update own"  on notifications for update to authenticated using (auth.uid() = user_id);
create policy "notif delete own"  on notifications for delete to authenticated using (auth.uid() = user_id);
-- Les notifs sont créées par l'edge function send-push (service_role qui bypass RLS),
-- donc pas besoin de policy d'insert pour les utilisateurs.

-- ── REVIEWS ──
create policy "reviews read public" on reviews for select to anon, authenticated using (true);
create policy "reviews insert self" on reviews for insert to authenticated with check (auth.uid() = author_id);
create policy "reviews update self" on reviews for update to authenticated using (auth.uid() = author_id);
create policy "reviews delete self" on reviews for delete to authenticated using (auth.uid() = author_id);

-- ── OFFERS ──
-- Lecture : le buyer voit son offre + le seller voit toutes les offres sur ses produits
create policy "offers read involved" on offers for select to authenticated
  using (
    auth.uid() = buyer_id
    or exists (select 1 from products p where p.id = offers.product_id and p.seller_id = auth.uid())
  );
create policy "offers insert as buyer" on offers for insert to authenticated with check (auth.uid() = buyer_id);
create policy "offers update by seller" on offers for update to authenticated
  using (exists (select 1 from products p where p.id = offers.product_id and p.seller_id = auth.uid()));

-- ── WISHLISTS ──
create policy "wishlist read own"   on wishlists for select to authenticated using (auth.uid() = user_id);
create policy "wishlist insert own" on wishlists for insert to authenticated with check (auth.uid() = user_id);
create policy "wishlist delete own" on wishlists for delete to authenticated using (auth.uid() = user_id);

-- ── PUSH_SUBSCRIPTIONS ──
create policy "push read own"   on push_subscriptions for select to authenticated using (auth.uid() = user_id);
create policy "push insert own" on push_subscriptions for insert to authenticated with check (auth.uid() = user_id);
create policy "push update own" on push_subscriptions for update to authenticated using (auth.uid() = user_id);
create policy "push delete own" on push_subscriptions for delete to authenticated using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════
--  STORAGE BUCKETS — avatars + product-images
-- ═══════════════════════════════════════════════════════════════════

-- Crée les buckets (publics en lecture, write authentifié)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true;

-- Drop & recreate les policies storage
do $$ declare r record; begin
  for r in (select policyname from pg_policies where schemaname='storage' and tablename='objects'
            and policyname like 'avatars %' or policyname like 'product-images %')
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

-- AVATARS : lecture publique, upload/update/delete par l'owner (sous-dossier {user_id}/)
create policy "avatars read public"
  on storage.objects for select to public
  using (bucket_id = 'avatars');

create policy "avatars upload own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars update own"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- PRODUCT-IMAGES : pareil
create policy "product-images read public"
  on storage.objects for select to public
  using (bucket_id = 'product-images');

create policy "product-images upload own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "product-images update own"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "product-images delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);


-- ═══════════════════════════════════════════════════════════════════
--  REALTIME — active la diffusion en temps réel sur les tables clés
-- ═══════════════════════════════════════════════════════════════════
-- (Les apps clientes peuvent s'abonner aux INSERT/UPDATE/DELETE)

alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table offers;

-- ═══════════════════════════════════════════════════════════════════
--  TRIGGERS UTILES
-- ═══════════════════════════════════════════════════════════════════

-- Met à jour updated_at automatiquement
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_set_updated  on profiles;
drop trigger if exists products_set_updated  on products;
drop trigger if exists orders_set_updated    on orders;
drop trigger if exists pushsubs_set_updated  on push_subscriptions;

create trigger profiles_set_updated  before update on profiles            for each row execute function public.set_updated_at();
create trigger products_set_updated  before update on products            for each row execute function public.set_updated_at();
create trigger orders_set_updated    before update on orders              for each row execute function public.set_updated_at();
create trigger pushsubs_set_updated  before update on push_subscriptions  for each row execute function public.set_updated_at();

-- Met à jour conversations.last_message_at quand un message est inséré
create or replace function public.bump_conversation()
returns trigger language plpgsql as $$
begin
  update conversations
  set last_message    = left(new.text, 200),
      last_message_at = new.created_at
  where id = new.conv_id;
  return new;
end; $$;

drop trigger if exists messages_bump_conv on messages;
create trigger messages_bump_conv
  after insert on messages
  for each row execute function public.bump_conversation();


-- ═══════════════════════════════════════════════════════════════════
--  DONE !
--  Vérification rapide :
--    select tablename from pg_tables where schemaname='public' order by tablename;
-- ═══════════════════════════════════════════════════════════════════
