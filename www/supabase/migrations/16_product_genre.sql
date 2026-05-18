-- ═══════════════════════════════════════════════════════════════════
--  PRODUCTS : ajout colonne 'genre' (homme/femme/enfant) - facultative
-- ═══════════════════════════════════════════════════════════════════

alter table products add column if not exists genre text[] default '{}'::text[];

create index if not exists products_genre_idx on products using gin(genre);

-- Verification
-- select id, title, genre from products limit 5;
