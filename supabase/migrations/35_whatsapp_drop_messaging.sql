-- ═══════════════════════════════════════════════════════════════════
--  Migration 35 : Remplacement messagerie par WhatsApp
--
--  - Ajoute profiles.whatsapp_number (text, format international +227...)
--  - Drop les tables messages + conversations (donnees perdues, volontaire)
--  - Drop les fonctions/triggers liees
-- ═══════════════════════════════════════════════════════════════════

-- 1. Nouveau champ WhatsApp sur profiles
alter table public.profiles
  add column if not exists whatsapp_number text;

-- On le pre-remplit avec phone existant pour pas perdre les users actuels
update public.profiles
  set whatsapp_number = phone
  where whatsapp_number is null and phone is not null;

-- 2. Drop tables messagerie (CASCADE pour les FK/policies)
drop table if exists public.messages cascade;
drop table if exists public.conversations cascade;

-- 3. Drop fonctions/triggers liees
drop function if exists public.bump_conversation() cascade;
drop function if exists public.validate_message_insert() cascade;
