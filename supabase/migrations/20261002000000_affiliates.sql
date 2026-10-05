-- Programme d'affiliation influenceurs
-- Chaque influenceur a un code promo Stripe (réduction client) et touche une commission
-- sur le montant produits payé (hors frais de port). Paiement manuel par virement.

create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null,
  name text not null,
  email text,
  instagram text,
  code text not null,
  commission_rate numeric(5,4) not null default 0.10 check (commission_rate >= 0 and commission_rate <= 1),
  discount_percent numeric(5,2) not null default 10 check (discount_percent >= 0 and discount_percent <= 100),
  stripe_coupon_id text,
  stripe_promotion_code_id text unique,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists affiliates_code_upper_key on public.affiliates (upper(code));

create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  base_cents integer not null,
  commission_rate numeric(5,4) not null,
  commission_cents integer not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists affiliate_commissions_affiliate_status_idx
  on public.affiliate_commissions (affiliate_id, status);

alter table public.orders add column if not exists affiliate_id uuid references public.affiliates(id) on delete set null;
alter table public.orders add column if not exists promo_code text;
alter table public.orders add column if not exists discount_cents integer not null default 0;

-- Accès réservé au backend (service role) — même politique deny-all que les autres tables sensibles
alter table public.affiliates enable row level security;
alter table public.affiliate_commissions enable row level security;
revoke all on public.affiliates from anon, authenticated;
revoke all on public.affiliate_commissions from anon, authenticated;
