-- ═══════════════════════════════════════════════════════════════════
--  Migration 24 : Support OAuth Google dans handle_new_user
--  Google envoie `name` + `picture` au lieu de `full_name` + `avatar_url`.
--  On gere les 2 cas pour avoir un profil complet au premier login.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_avatar text;
begin
  -- Nom : full_name (notre signup) > name (Google) > email
  v_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    split_part(new.email, '@', 1)
  );

  -- Avatar : avatar_url (notre upload) > picture (Google)
  v_avatar := coalesce(
    nullif(new.raw_user_meta_data->>'avatar_url', ''),
    nullif(new.raw_user_meta_data->>'picture', '')
  );

  insert into public.profiles (id, email, full_name, avatar_url, created_at)
  values (new.id, new.email, v_name, v_avatar, now())
  on conflict (id) do update
    set email      = coalesce(excluded.email, profiles.email),
        full_name  = coalesce(profiles.full_name, excluded.full_name),
        avatar_url = coalesce(profiles.avatar_url, excluded.avatar_url);
  return new;
end; $$;

-- Le trigger existe deja (cree dans 00_full_schema.sql), pas besoin de le recreer.
