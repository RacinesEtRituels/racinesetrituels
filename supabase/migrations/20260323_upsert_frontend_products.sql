-- ============================================================
-- Migration : Upsert des produits utilisés par le frontend
-- Date      : 2026-03-23
-- Contexte  : Le front utilise désormais les slugs khamare,
--             hibiscus-blanc et hibiscus-rouge. Cette migration
--             insère ces produits s'ils n'existent pas encore,
--             ou met à jour leurs données si le slug est déjà
--             présent (UPSERT ON CONFLICT slug).
--
-- ⚠️  AVANT LA MISE EN PRODUCTION :
--     Remplacer les valeurs stripe_price_id et stripe_product_id
--     par les identifiants réels obtenus depuis le dashboard
--     Stripe (https://dashboard.stripe.com/products).
--     Les placeholders utilisés ici commencent par "price_REPLACE"
--     et "prod_REPLACE" — une recherche sur ce motif vous permettra
--     de les identifier facilement.
-- ============================================================

INSERT INTO public.products (
  name,
  slug,
  description,
  price_cents,
  currency,
  stripe_product_id,
  stripe_price_id,
  is_subscription,
  stock,
  active
)
VALUES
  (
    'Khamaré (Racine de Vétiver)',
    'khamare',
    'Plante traditionnelle purifiante et apaisante. Utilisée depuis des générations pour le bien-être féminin. Sachet artisanal récolté à la main en Afrique de l''Ouest.',
    1200,       -- 12,00 €
    'eur',
    'prod_REPLACE_khamare',       -- ⚠️ Remplacer par l'ID Stripe réel
    'price_REPLACE_khamare',      -- ⚠️ Remplacer par l'ID Stripe réel
    false,
    100,
    true
  ),
  (
    'Fleurs d''Hibiscus Blanc',
    'hibiscus-blanc',
    'Sachet de 100g. Doux et réconfortant. Riche en antioxydants. Idéal en infusion chaude ou froide.',
    600,        -- 6,00 €
    'eur',
    'prod_REPLACE_hibiscus_blanc',  -- ⚠️ Remplacer par l'ID Stripe réel
    'price_REPLACE_hibiscus_blanc', -- ⚠️ Remplacer par l'ID Stripe réel
    false,
    100,
    true
  ),
  (
    'Fleurs d''Hibiscus Rouge',
    'hibiscus-rouge',
    'Sachet de 100g. Riche en antioxydants. Saveur acidulée et naturelle.',
    600,        -- 6,00 €
    'eur',
    'prod_REPLACE_hibiscus_rouge',  -- ⚠️ Remplacer par l'ID Stripe réel
    'price_REPLACE_hibiscus_rouge', -- ⚠️ Remplacer par l'ID Stripe réel
    false,
    100,
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  description       = EXCLUDED.description,
  price_cents       = EXCLUDED.price_cents,
  currency          = EXCLUDED.currency,
  stripe_product_id = EXCLUDED.stripe_product_id,
  stripe_price_id   = EXCLUDED.stripe_price_id,
  is_subscription   = EXCLUDED.is_subscription,
  stock             = EXCLUDED.stock,
  active            = EXCLUDED.active,
  updated_at        = now();
