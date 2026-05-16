-- ═══════════════════════════════════════════════════════════════════
--  PROMO WELCOME50 : -50% sur le 1er mois VIP
--  Eligible : user inscrit depuis < 30j ET aucun abonnement paye precedent
-- ═══════════════════════════════════════════════════════════════════

-- Helper : eligibilite promo
create or replace function public.is_promo_eligible(p_user_id uuid, p_code text)
returns boolean language plpgsql security definer set search_path = public, auth as $$
declare
  signup_at timestamptz;
  has_paid boolean;
  has_used boolean;
begin
  if p_user_id is null then return false; end if;

  -- Code WELCOME50 : -50% sur 1er mois VIP
  if upper(coalesce(p_code,'')) = 'WELCOME50' then
    -- Inscription < 30j
    select created_at into signup_at from auth.users where id = p_user_id;
    if signup_at is null or signup_at < now() - interval '30 days' then
      return false;
    end if;
    -- Aucun abonnement paye precedent (jamais ete VIP/Premium)
    select exists(
      select 1 from payment_requests
      where user_id = p_user_id and status = 'confirmed'
    ) into has_paid;
    if has_paid then return false; end if;
    -- Pas deja utilise ce code
    select exists(
      select 1 from payment_requests
      where user_id = p_user_id and admin_note = 'PROMO:WELCOME50'
    ) into has_used;
    if has_used then return false; end if;
    return true;
  end if;

  return false;
end; $$;

grant execute on function public.is_promo_eligible(uuid, text) to authenticated;

-- Vue pratique : ai-je une promo eligible ?
create or replace function public.my_active_promo()
returns json language sql security definer set search_path = public, auth as $$
  select case
    when public.is_promo_eligible(auth.uid(), 'WELCOME50') then
      json_build_object('code','WELCOME50','tier','vip','discount_pct',50,'label','1er mois VIP a -50%')
    else null
  end;
$$;

grant execute on function public.my_active_promo() to authenticated;

-- Mise a jour : create_payment_request accepte un code promo
create or replace function public.create_payment_request(p_tier text, p_method text, p_user_note text, p_promo_code text default null)
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid; ref text; amt int; rec record; final_amt int; admin_note_val text;
begin
  uid := auth.uid();
  if uid is null then raise exception 'Non authentifie.'; end if;
  if p_tier not in ('vip','premium') then raise exception 'Tier invalide.'; end if;
  if not public.user_email_verified() then raise exception 'Verifiez votre email avant de payer.'; end if;

  amt := case p_tier when 'vip' then 3000 when 'premium' then 5000 end;
  final_amt := amt;
  admin_note_val := null;

  -- Applique la promo si eligible
  if p_promo_code is not null and p_promo_code != '' then
    if upper(p_promo_code) = 'WELCOME50' and p_tier = 'vip' and public.is_promo_eligible(uid, 'WELCOME50') then
      final_amt := amt / 2;
      admin_note_val := 'PROMO:WELCOME50';
    else
      raise exception 'Code promo invalide ou non eligible.';
    end if;
  end if;

  -- Genere ref unique
  loop
    ref := upper(substring(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists(select 1 from payment_requests where reference = ref);
  end loop;

  insert into payment_requests (user_id, tier, amount, reference, payment_method, user_note, admin_note)
  values (uid, p_tier, final_amt, ref, p_method, p_user_note, admin_note_val)
  returning * into rec;

  return row_to_json(rec);
end; $$;

grant execute on function public.create_payment_request(text, text, text, text) to authenticated;

-- Verification
-- select public.my_active_promo();
