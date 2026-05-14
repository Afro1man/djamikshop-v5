-- Table pour stocker les subscriptions Web Push
-- Une row par device/browser. La clé naturelle est l'endpoint.

create table if not exists push_subscriptions (
  endpoint    text primary key,
  user_id     text not null,
  keys        jsonb not null,           -- { p256dh, auth }
  user_agent  text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);

-- RLS : chaque user ne voit que ses subs (mais l'edge function utilise service_role,
-- donc elle bypass RLS et peut lire toutes les subs pour envoyer)
alter table push_subscriptions enable row level security;

-- Permet à l'app authentifiée d'insérer/upsert sa propre sub
create policy if not exists "user inserts own sub"
  on push_subscriptions for insert
  to authenticated
  with check (true);

create policy if not exists "user updates own sub"
  on push_subscriptions for update
  to authenticated
  using (true)
  with check (true);

create policy if not exists "user deletes own sub"
  on push_subscriptions for delete
  to authenticated
  using (true);

create policy if not exists "user reads own sub"
  on push_subscriptions for select
  to authenticated
  using (true);

-- Pour les utilisateurs en mode démo (pas de session Supabase auth) :
-- on autorise aussi anon à upsert/delete avec leur endpoint comme clé.
create policy if not exists "anon manages by endpoint"
  on push_subscriptions for all
  to anon
  using (true)
  with check (true);
