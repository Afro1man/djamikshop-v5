-- ═══════════════════════════════════════════════════════════════════
--  PUBLIC_ID : code court lisible pour chaque utilisateur
--  Format : DJ-XXXXXX (6 caracteres alphanumeriques, sans 0/O/1/I)
--  Auto-genere a l'inscription, unique, partageable verbalement
-- ═══════════════════════════════════════════════════════════════════

-- 1. Ajoute la colonne public_id (unique)
alter table profiles add column if not exists public_id text unique;
create index if not exists profiles_public_id_idx on profiles(public_id);

-- 2. Fonction : genere un code court unique 'DJ-XXXXXX'
--    Caracteres : A-H, J-N, P-Z, 2-9 (exclut 0, O, 1, I pour eviter confusion)
create or replace function public.generate_public_id()
returns text language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code  text;
  attempt int := 0;
begin
  loop
    code := 'DJ-';
    for i in 1..6 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    -- Verifie unicite
    exit when not exists(select 1 from profiles where public_id = code);
    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'Impossible de generer un public_id unique apres 20 tentatives';
    end if;
  end loop;
  return code;
end; $$;

-- 3. Trigger : auto-genere a chaque insert
create or replace function public.trg_profile_set_public_id()
returns trigger language plpgsql as $$
begin
  if new.public_id is null or new.public_id = '' then
    new.public_id := public.generate_public_id();
  end if;
  return new;
end; $$;

drop trigger if exists profiles_set_public_id on profiles;
create trigger profiles_set_public_id
  before insert on profiles
  for each row execute function public.trg_profile_set_public_id();

-- 4. Backfill : assigne un public_id aux profils existants qui n'en ont pas
update profiles
   set public_id = public.generate_public_id()
   where public_id is null or public_id = '';

-- 5. Permet la recherche d'un user par public_id (RPC publique)
create or replace function public.find_user_by_public_id(p_code text)
returns table(id uuid, full_name text, public_id text, avatar_url text)
language sql security definer set search_path = public as $$
  select id, full_name, public_id, avatar_url
    from profiles
    where upper(public_id) = upper(trim(p_code))
    limit 1;
$$;

grant execute on function public.find_user_by_public_id(text) to authenticated;

-- Verifications
-- select id, public_id, full_name from profiles order by created_at desc limit 5;
-- select public.find_user_by_public_id('DJ-A7B3C9');
