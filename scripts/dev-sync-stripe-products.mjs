#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load env from server/.env first, then root .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "server", ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const NODE_ENV = process.env.NODE_ENV || "development";
if (NODE_ENV === "production" && process.env.ALLOW_DEV_STRIPE_SYNC !== "true") {
  console.error("Refusing to run in production. Set ALLOW_DEV_STRIPE_SYNC=true to override (not recommended).");
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!STRIPE_SECRET_KEY) {
  console.error("Missing STRIPE_SECRET_KEY");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const nowIso = () => new Date().toISOString();

const safeSlug = (p) => p.slug || p.id || "unknown";

async function ensureStripeProduct(product) {
  const slug = safeSlug(product);
  if (product.stripe_product_id) return product.stripe_product_id;

  const created = await stripe.products.create({
    name: product.name || slug,
    metadata: { slug },
  });

  console.log(`[STRIPE] created product ${created.id} for slug=${slug}`);
  const { error: updErr } = await supabase
    .from("products")
    .update({ stripe_product_id: created.id, updated_at: nowIso() })
    .eq("id", product.id);

  if (updErr) {
    throw new Error(`Supabase update failed for product ${slug}: ${updErr.message || updErr}`);
  }

  return created.id;
}

async function backfillStripeProductId(product) {
  const slug = safeSlug(product);
  const priceId = (product.stripe_price_id || "").trim();
  if (!priceId || product.stripe_product_id) return product.stripe_product_id || null;

  const price = await stripe.prices.retrieve(priceId);
  const stripeProductId = typeof price.product === "string" ? price.product : price.product?.id || null;
  if (!stripeProductId) return null;

  const { error: updErr } = await supabase
    .from("products")
    .update({ stripe_product_id: stripeProductId, updated_at: nowIso() })
    .eq("id", product.id);

  if (updErr) {
    throw new Error(`Supabase update failed for product ${slug}: ${updErr.message || updErr}`);
  }

  console.log(`[SYNC] backfilled stripe_product_id ${stripeProductId} for slug=${slug}`);
  return stripeProductId;
}

async function ensureStripePrice(product, stripeProductId) {
  const slug = safeSlug(product);
  const priceCents = Number(product.price_cents);
  if (!Number.isFinite(priceCents) || priceCents <= 0) {
    console.warn(`[SKIP] invalid price_cents for slug=${slug}`);
    return null;
  }

  if (product.stripe_price_id) return product.stripe_price_id;

  const params = {
    product: stripeProductId,
    unit_amount: priceCents,
    currency: (product.currency || "eur").toLowerCase(),
  };

  if (product.is_subscription) {
    params.recurring = { interval: "month" };
  }

  const price = await stripe.prices.create(params);
  console.log(`[STRIPE] created price ${price.id} for slug=${slug}`);

  const { error: updErr } = await supabase
    .from("products")
    .update({ stripe_product_id: stripeProductId, stripe_price_id: price.id, updated_at: nowIso() })
    .eq("id", product.id);

  if (updErr) {
    throw new Error(`Supabase update failed for product ${slug}: ${updErr.message || updErr}`);
  }

  return price.id;
}

async function main() {
  const { data: products, error } = await supabase
    .from("products")
    .select("id, slug, name, price_cents, currency, is_subscription, stripe_product_id, stripe_price_id, active")
    .eq("active", true);

  if (error) {
    throw new Error(`Supabase fetch failed: ${error.message || error}`);
  }

  const updatedSlugs = [];

  for (const product of products || []) {
    const slug = safeSlug(product);

    // Only bootstrap missing price entries, but still backfill product id when possible.
    try {
      const productId = product.stripe_product_id || (await backfillStripeProductId(product)) || (await ensureStripeProduct(product));
      const priceId = await ensureStripePrice(product, productId);

      if (priceId && !product.stripe_price_id) {
        updatedSlugs.push(slug);
      }
    } catch (err) {
      console.error(`[ERROR] failed to sync slug=${slug}: ${err?.message || err}`);
      process.exit(1);
    }
  }

  const unique = Array.from(new Set(updatedSlugs));
  console.log(JSON.stringify({ updated_count: unique.length, updated_slugs: unique }));
}

main().catch((err) => {
  console.error(`[FATAL] ${err?.message || err}`);
  process.exit(1);
});
