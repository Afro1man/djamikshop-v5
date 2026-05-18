-- ═══════════════════════════════════════════════════════════════════
--  SOFT-DELETE des offres (cache pour un user, garde pour l'autre).
-- ═══════════════════════════════════════════════════════════════════

alter table offers
  add column if not exists deleted_for uuid[] default '{}'::uuid[];

create index if not exists offers_deleted_for_idx on offers using gin(deleted_for);

-- Vérification
-- select id, buyer_id, deleted_for from offers limit 5;
