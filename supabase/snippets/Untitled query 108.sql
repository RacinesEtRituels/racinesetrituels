insert into products (
  name,
  slug,
  description,
  price_cents,
  currency,
  stripe_price_id,
  is_subscription,
  stock,
  active
)
values
(
  'Khamaré',
  'khamare',
  'Racine de vétiver naturelle',
  1200,
  'eur',
  'price_1TENJWDzBV7MTZKP56wqFIbg',
  false,
  100,
  true
),
(
  'Fleurs d''Hibiscus Blanc',
  'hibiscus-blanc',
  'Fleurs naturelles d’hibiscus blanc',
  600,
  'eur',
  'price_1TENKMDzBV7MTZKPuE7kf9FA',
  false,
  100,
  true
),
(
  'Fleurs d''Hibiscus Rouge',
  'hibiscus-rouge',
  'Fleurs naturelles d’hibiscus rouge',
  600,
  'eur',
  'price_1TENKxDzBV7MTZKPCbA8lHAm',
  false,
  100,
  true
);