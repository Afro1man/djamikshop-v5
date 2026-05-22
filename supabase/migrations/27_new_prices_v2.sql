-- ═══════════════════════════════════════════════════════════════════
--  Migration 27 : Nouveaux prix - VIP 2500 / PREMIUM 6000
--  N'affecte PAS les abonnements deja en cours (montants stockes dans
--  payment_requests historiques restent intacts). Seulement les nouveaux
--  paiements utiliseront ces tarifs.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.create_payment_request(p_tier text, p_method text, p_user_note text, p_promo_code text default null)
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid; ref text; amt int; rec record; final_amt int; admin_note_val text;
begin
  uid := auth.uid();
  if uid is null then raise exception 'Non authentifie.'; end if;
  if p_tier not in ('vip','premium') then raise exception 'Tier invalide.'; end if;
  if not public.user_email_verified() then raise exception 'Verifiez votre email avant de payer.'; end if;

  -- NOUVEAUX PRIX (mai 2026) : VIP 2500 / PREMIUM 6000
  amt := case p_tier when 'vip' then 2500 when 'premium' then 6000 end;
  final_amt := amt;
  admin_note_val := null;

  -- Promo si eligible (WELCOME50 = -50% sur 1er mois VIP = 1250 FCFA)
  if p_promo_code is not null and p_promo_code != '' then
    if upper(p_promo_code) = 'WELCOME50' and p_tier = 'vip' and public.is_promo_eligible(uid, 'WELCOME50') then
      final_amt := amt / 2;   -- 1250 FCFA pour le 1er mois VIP avec promo
      admin_note_val := 'PROMO:WELCOME50';
    else
      raise exception 'Code promo invalide ou non eligible.';
    end if;
  end if;

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
