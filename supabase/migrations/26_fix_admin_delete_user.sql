-- ═══════════════════════════════════════════════════════════════════
--  Migration 26 : Fix admin_delete_user qui echouait silencieusement
--
--  Probleme : delete from auth.users peut echouer si des FK pointent
--  vers auth.users sans ON DELETE CASCADE, ou si la fonction n'a pas
--  les bonnes permissions sur le schema auth.
--
--  Fix : on cascade manuellement les contenus du schema public AVANT,
--  puis on tente le delete auth.users avec gestion d'erreur explicite.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.admin_delete_user(p_user_id uuid)
returns json language plpgsql security definer set search_path = public, auth as $$
declare
  admin_uid uuid;
  v_email   text;
  v_count   int := 0;
begin
  admin_uid := auth.uid();

  -- Verifs preliminaires
  if not public.is_admin() then
    raise exception 'Action reservee aux administrateurs.';
  end if;
  if p_user_id = admin_uid then
    raise exception 'Tu ne peux pas te supprimer toi-meme.';
  end if;
  if exists(select 1 from admins where user_id = p_user_id) then
    raise exception 'Impossible de supprimer un autre membre du staff. Retire-le du staff d''abord.';
  end if;

  -- Garde l'email pour le log
  select email into v_email from public.profiles where id = p_user_id;

  -- ── Cascade manuelle dans schema public (au cas ou les FK ne sont pas cascade) ──
  -- Ordre : tables sans dependance d'abord

  delete from public.security_events    where user_id = p_user_id;
  delete from public.push_subscriptions where user_id = p_user_id;
  delete from public.banned_users       where user_id = p_user_id;
  delete from public.boosts             where user_id = p_user_id;
  delete from public.subscriptions      where user_id = p_user_id;
  delete from public.payment_requests   where user_id = p_user_id;
  delete from public.notifications      where user_id = p_user_id;
  delete from public.wishlists          where user_id = p_user_id;
  delete from public.reviews            where reviewer_id = p_user_id or seller_id = p_user_id;
  delete from public.reports            where reporter_id = p_user_id;
  delete from public.offers             where buyer_id = p_user_id;
  delete from public.messages           where sender_id = p_user_id or recipient_id = p_user_id;
  delete from public.conversations      where buyer_id  = p_user_id or seller_id    = p_user_id;
  delete from public.orders             where buyer_id  = p_user_id;
  -- Reports / offers sur les products du user supprimes
  delete from public.reports            where product_id in (select id from public.products where seller_id = p_user_id);
  delete from public.offers             where product_id in (select id from public.products where seller_id = p_user_id);
  delete from public.products           where seller_id = p_user_id;
  delete from public.profiles           where id = p_user_id;

  -- ── Delete auth.users (peut requerir privileges) ──
  begin
    delete from auth.users where id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  exception when others then
    -- Si le delete auth echoue, on retourne quand meme OK car les donnees public/ sont nettoyees
    -- L'admin peut supprimer le user via le dashboard Supabase manuellement
    return json_build_object(
      'ok', true,
      'deleted', p_user_id,
      'email', v_email,
      'auth_deleted', false,
      'note', 'Donnees supprimees, mais le compte auth doit etre supprime manuellement : ' || SQLERRM
    );
  end;

  return json_build_object(
    'ok', true,
    'deleted', p_user_id,
    'email', v_email,
    'auth_deleted', v_count > 0
  );
end; $$;

grant execute on function public.admin_delete_user(uuid) to authenticated;

-- Verification
-- select public.admin_delete_user('00000000-0000-0000-0000-000000000000'::uuid);
