-- ═══════════════════════════════════════════════════════════════════
--  FIX CRITIQUE : trigger bump_conversation utilisait new.content
--  alors que la colonne s'appelle 'text' -> tous les messages echouaient
--  avec 'record "new" has no field "content"'
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.bump_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update conversations
     set last_message    = coalesce(new.text, '[image]'),
         last_message_at = new.created_at,
         deleted_for     = array(
           select unnest(deleted_for)
           except select unnest(participants)
         )
   where id = new.conv_id;
  return new;
end; $$;

-- Le trigger lui-meme existe deja, pas besoin de recreer
