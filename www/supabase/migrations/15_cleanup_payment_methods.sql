-- ═══════════════════════════════════════════════════════════════════
--  CLEANUP : retire orange/airtel/moov des payment_methods existants
-- ═══════════════════════════════════════════════════════════════════

-- Nettoie la colonne payment_methods des produits existants en
-- retirant les 6 valeurs (orange_money, airtel_money, moov_money +
-- les variantes courtes). Garde mynita, amanata, cod, main_propre.

update products
set payment_methods = coalesce(
  (
    select jsonb_agg(elem)
    from jsonb_array_elements(payment_methods) elem
    where elem::text not in (
      '"orange_money"', '"airtel_money"', '"moov_money"',
      '"orange"', '"airtel"', '"moov"'
    )
  ),
  '[]'::jsonb
)
where payment_methods ?| array[
  'orange_money', 'airtel_money', 'moov_money',
  'orange', 'airtel', 'moov'
];

-- Verification
-- select id, title, payment_methods from products
--   where payment_methods ?| array['orange_money','airtel_money','moov_money','orange','airtel','moov']
--   limit 5;
-- (devrait renvoyer 0 ligne)
