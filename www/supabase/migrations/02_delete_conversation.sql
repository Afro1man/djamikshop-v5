-- ═══════════════════════════════════════════════════════════════════
--  DJAMIKSHOP — SUPPRESSION DE CONVERSATION (soft delete par user)
--  À exécuter dans Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Colonne deleted_for : liste des user_id qui ont "supprimé" la conv
alter table conversations
  add column if not exists deleted_for uuid[] default '{}'::uuid[];

create index if not exists conv_deleted_for_idx on conversations using gin(deleted_for);

-- 2. RLS : on autorise l'update du champ deleted_for par les participants
--    (la policy "conv update participants" couvre déjà ça via auth.uid())

-- 3. Trigger bump_conversation : quand un nouveau message arrive,
--    on retire le destinataire de deleted_for (auto-restore).
create or replace function public.bump_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update conversations
     set last_message    = coalesce(new.content, '[image]'),
         last_message_at = new.created_at,
         deleted_for     = array(
           select unnest(deleted_for)
           except select unnest(participants)
         )
   where id = new.conv_id;
  return new;
end; $$;

drop trigger if exists messages_bump_conv on messages;
create trigger messages_bump_conv
  after insert on messages
  for each row execute function public.bump_conversation();

-- Vérification
-- select id, participants, deleted_for from conversations limit 5;
