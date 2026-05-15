-- ═══════════════════════════════════════════════════════════════════
--  TABLE REPORTS — signalements d'annonces par les utilisateurs
-- ═══════════════════════════════════════════════════════════════════

create table if not exists reports (
  id            uuid primary key default uuid_generate_v4(),
  product_id    uuid references products(id) on delete cascade,
  reporter_id   uuid references auth.users(id) on delete set null,
  reason        text not null,    -- 'scam','forbidden','false_price','duplicate','offensive','other'
  message       text,
  status        text default 'open',  -- 'open','reviewed','resolved','rejected'
  created_at    timestamptz default now(),
  resolved_at   timestamptz
);

create index if not exists reports_product_idx on reports(product_id);
create index if not exists reports_status_idx  on reports(status, created_at desc);

alter table reports enable row level security;

drop policy if exists "reports insert auth"  on reports;
drop policy if exists "reports read own"     on reports;

-- Tout user authentifié peut signaler
create policy "reports insert auth" on reports for insert to authenticated
  with check (auth.uid() = reporter_id);

-- Le reporter peut voir ses propres signalements
create policy "reports read own" on reports for select to authenticated
  using (auth.uid() = reporter_id);

-- (Admin via service_role pour traiter — bypass RLS)

-- Vérification
-- select * from reports order by created_at desc limit 10;
