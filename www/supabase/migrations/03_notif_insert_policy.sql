-- ═══════════════════════════════════════════════════════════════════
--  FIX : autorise les utilisateurs authentifiés à créer des notifications
--        pour autrui (sinon offres/messages ne génèrent pas de notif).
-- ═══════════════════════════════════════════════════════════════════

drop policy if exists "notif insert any"   on notifications;
drop policy if exists "notif insert auth"  on notifications;

create policy "notif insert auth" on notifications for insert to authenticated
  with check (auth.uid() is not null);

-- Vérification
-- select * from notifications limit 5;
