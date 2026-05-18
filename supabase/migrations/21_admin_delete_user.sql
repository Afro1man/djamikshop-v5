-- ═══════════════════════════════════════════════════════════════════
--  ADMIN DELETE USER : permet à l'admin de supprimer un user et tout
--  ses contenus (annonces, messages, offres, signalements...).
-- ═══════════════════════════════════════════════════════════════════

-- RPC : supprime un user (et cascade tous ses contenus via FK ON DELETE CASCADE)
create or replace function public.admin_delete_user(p_user_id uuid)
returns json language plpgsql security definer set search_path = public, auth as $$
declare admin_uid uuid;
begin
  admin_uid := auth.uid();
  if not public.is_admin() then
    raise exception 'Action admin uniquement.';
  end if;
  if p_user_id = admin_uid then
    raise exception 'Tu ne peux pas te supprimer toi-meme.';
  end if;
  if exists(select 1 from admins where user_id = p_user_id) then
    raise exception 'Impossible de supprimer un autre admin.';
  end if;

  -- Supprime de auth.users -> cascade vers profiles, products, messages, etc.
  delete from auth.users where id = p_user_id;

  return json_build_object('ok', true, 'deleted', p_user_id);
end; $$;

grant execute on function public.admin_delete_user(uuid) to authenticated;

-- RPC : supprime tous les paiements vieux et traites (cleanup)
create or replace function public.admin_cleanup_old_payments(p_days_old int default 30)
returns json language plpgsql security definer set search_path = public as $$
declare deleted_count int;
begin
  if not public.is_admin() then raise exception 'Action admin uniquement.'; end if;
  delete from payment_requests
    where status in ('confirmed','rejected')
      and created_at < now() - (p_days_old || ' days')::interval;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  return json_build_object('ok', true, 'deleted', deleted_count);
end; $$;

grant execute on function public.admin_cleanup_old_payments(int) to authenticated;

-- Vérification
-- select public.admin_delete_user('00000000-0000-0000-0000-000000000000'::uuid);  -- ne doit pas exister
