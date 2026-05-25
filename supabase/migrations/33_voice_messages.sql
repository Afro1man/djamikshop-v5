-- ═══════════════════════════════════════════════════════════════════
--  Migration 33 : Messages vocaux
--
--  Ajoute 2 colonnes a messages :
--    audio_url      : URL publique du fichier audio dans Supabase Storage
--    audio_duration : duree en secondes (pour afficher 0:23 avant playback)
--
--  Le bucket Storage 'voice-messages' doit etre cree manuellement via
--  Supabase Dashboard (voir instructions plus bas).
-- ═══════════════════════════════════════════════════════════════════

alter table public.messages
  add column if not exists audio_url      text,
  add column if not exists audio_duration int;

-- Pour les messages vocaux, le champ "text" peut etre vide (la colonne est NOT NULL
-- a l'origine). On la rend nullable + on ajoute un check : soit text non vide,
-- soit audio_url non vide.
alter table public.messages
  alter column text drop not null;

-- Drop le constraint si elle existe deja (pour idempotence)
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'messages_text_or_audio_required'
  ) then
    alter table public.messages drop constraint messages_text_or_audio_required;
  end if;
end $$;

alter table public.messages
  add constraint messages_text_or_audio_required
  check (
    (text is not null and length(trim(text)) > 0)
    or audio_url is not null
  );

-- Update du trigger bump_conversation pour gerer les vocaux (afficher [Vocal] dans la preview)
create or replace function public.bump_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations
    set last_message    = coalesce(
                            nullif(new.text, ''),
                            case when new.audio_url is not null then '[Vocal]' else '[Image]' end
                          ),
        last_message_at = now()
  where id = new.conv_id;
  return new;
end; $$;

-- ═══════════════════════════════════════════════════════════════════
--  INSTRUCTIONS MANUELLES (Storage)
-- ═══════════════════════════════════════════════════════════════════
--  Apres avoir lance ce SQL, va sur :
--  https://supabase.com/dashboard/project/iiswzieybgcqrywvopsf/storage/buckets
--
--  1. Cree un nouveau bucket nomme : voice-messages
--     - PUBLIC : OUI (pour que les destinataires puissent ecouter)
--     - File size limit : 5 MB (largement suffisant pour un vocal de 2 min)
--     - Allowed MIME types : audio/webm, audio/mp4, audio/ogg, audio/mpeg
--
--  2. Policies sur le bucket (ajoute via SQL Editor) :
-- ═══════════════════════════════════════════════════════════════════

-- Policies pour le bucket voice-messages
do $$
begin
  -- Insert : authentifie uniquement, et le fichier doit etre dans son dossier
  if not exists (select 1 from pg_policies where policyname = 'voice-messages insert own' and tablename = 'objects' and schemaname = 'storage') then
    create policy "voice-messages insert own" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'voice-messages' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;

  -- Read : public (anyone peut ecouter via URL publique)
  if not exists (select 1 from pg_policies where policyname = 'voice-messages read public' and tablename = 'objects' and schemaname = 'storage') then
    create policy "voice-messages read public" on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'voice-messages');
  end if;

  -- Delete : owner uniquement
  if not exists (select 1 from pg_policies where policyname = 'voice-messages delete own' and tablename = 'objects' and schemaname = 'storage') then
    create policy "voice-messages delete own" on storage.objects
      for delete to authenticated
      using (bucket_id = 'voice-messages' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
