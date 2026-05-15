-- ═══════════════════════════════════════════════════════════════════
--  FIX : ajout 'subscription' dans les types de notifications autorises
-- ═══════════════════════════════════════════════════════════════════

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('order','offer','message','system','promo','subscription','boost','report'));

-- Verification
-- select 'OK' where current_setting('server_version_num')::int > 0;
