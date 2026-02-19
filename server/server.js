import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import Stripe from "stripe";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import nodemailer from "nodemailer";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Force load server/.env no matter where node is launched from
dotenv.config({ path: path.join(__dirname, ".env") });

const resolvePath = (relPath) => fileURLToPath(new URL(relPath, import.meta.url));

function isProduction() {
  return process.env.NODE_ENV === "production";
}

console.log("[BOOT] NODE_ENV =", process.env.NODE_ENV);

const readEnv = () => {
  const cfg = {
    PORT: Number(process.env.PORT || 3000),
    SITE_URL: process.env.SITE_URL || "http://127.0.0.1:8000",
    CURRENCY: (process.env.CURRENCY || "eur").toLowerCase(),
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || null,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || null,
    SUPABASE_URL: process.env.SUPABASE_URL || null,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || null,
    MAIL_HOST: process.env.MAIL_HOST || "127.0.0.1",
    MAIL_PORT: process.env.MAIL_PORT ? Number(process.env.MAIL_PORT) : null,
    MAIL_SECURE: String(process.env.MAIL_SECURE || "false").toLowerCase() === "true",
    MAIL_USER: process.env.MAIL_USER || null,
    MAIL_PASS: process.env.MAIL_PASS || null,
    MAIL_FROM: process.env.MAIL_FROM || "no-reply@racinesetrituels.local",
    ADMIN_TOKEN: process.env.ADMIN_TOKEN || "",
    RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
    RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX || 60),
  };

  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[BOOT] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!cfg.STRIPE_SECRET_KEY) {
    console.error("[BOOT] Missing STRIPE_SECRET_KEY");
  }
  if (!cfg.STRIPE_WEBHOOK_SECRET) {
    console.error("[BOOT] Missing STRIPE_WEBHOOK_SECRET (webhook verification)");
  }
  return cfg;
};

const ENV = readEnv();

const PORT = ENV.PORT;
const SITE_URL = ENV.SITE_URL;
const CURRENCY = ENV.CURRENCY;
const STRIPE_SECRET_KEY = ENV.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = ENV.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = ENV.SUPABASE_URL;
const supabaseKey = ENV.SUPABASE_SERVICE_ROLE_KEY;
const supabaseServiceRoleKey = ENV.SUPABASE_SERVICE_ROLE_KEY || null;
const SUPABASE_CONFIGURED = Boolean(supabaseUrl && supabaseKey);
const MAIL_HOST = ENV.MAIL_HOST;
const MAIL_PORT_ENV = ENV.MAIL_PORT;
const MAIL_SECURE = ENV.MAIL_SECURE;
const MAIL_USER = ENV.MAIL_USER;
const MAIL_PASS = ENV.MAIL_PASS;
const MAIL_FROM = ENV.MAIL_FROM;
const ADMIN_TOKEN = ENV.ADMIN_TOKEN;
const DEV_FORCE_SECRET = process.env.DEV_FORCE_SECRET || "";
const EXPOSE_STACKS = !isProduction() && String(process.env.EXPOSE_STACKS || "false").toLowerCase() === "true";
const DEV_ALLOW_UNVERIFIED_WEBHOOKS =
  !isProduction() && String(process.env.DEV_ALLOW_UNVERIFIED_WEBHOOKS || "false").toLowerCase() === "true";

// Basic env sanity (do not print full secrets)
console.log("[BOOT] STRIPE_SECRET_KEY loaded:", Boolean(STRIPE_SECRET_KEY));
console.log("[BOOT] SUPABASE configured:", SUPABASE_CONFIGURED);
console.log("[BOOT] SITE_URL:", SITE_URL);
console.log("[BOOT] PORT:", PORT);
const detectMailPortFromDocker = () => {
  try {
    const scriptPath = resolvePath("../scripts/detect-mail-smtp.mjs");
    const detected = execSync(`node "${scriptPath}"`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
      .trim();
    const parsed = Number(detected);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (err) {
    console.warn("[BOOT] MAIL autodetect via docker failed", err?.message || err);
    return null;
  }
};

let mailPort = MAIL_PORT_ENV ? Number(MAIL_PORT_ENV) : null;
let mailPortSource = MAIL_PORT_ENV ? "env" : null;

if (!Number.isFinite(mailPort)) {
  const detected = detectMailPortFromDocker();
  if (Number.isFinite(detected)) {
    mailPort = detected;
    mailPortSource = "docker";
  }
}

if (!Number.isFinite(mailPort)) {
  mailPort = 54325;
  mailPortSource = "fallback";
}

const MAIL_AUTODETECTED = mailPortSource !== "env";

console.log("[BOOT] MAIL:", { host: MAIL_HOST, port: mailPort, secure: MAIL_SECURE });
console.log(`[BOOT] MAIL autodetected: ${MAIL_AUTODETECTED} (source=${mailPortSource})`);
console.log("[BOOT] Debug routes registered: /health, /debug/supabase, /debug/stripe-session/:id");
console.log("[BOOT] SUPABASE_URL present:", Boolean(supabaseUrl));
console.log("[BOOT] SUPABASE key present:", Boolean(supabaseKey));
if (process.env.NODE_ENV !== "production") {
  console.log("[BOOT] debug routes enabled");
}
if (!STRIPE_WEBHOOK_SECRET) {
  console.error("[BOOT] STRIPE_WEBHOOK_SECRET missing — Stripe CLI webhooks will not work (use whsec_... from `stripe listen`)");
}

if (!STRIPE_SECRET_KEY) {
  console.error("[BOOT] Missing STRIPE_SECRET_KEY in server/.env");
  // We still start server so /health is reachable, but checkout will fail.
}

if (!supabaseUrl || !supabaseKey) {
  console.error("[BOOT] Missing SUPABASE_URL or SUPABASE_*_KEY");
} else {
  console.log("[BOOT] SUPABASE_URL:", supabaseUrl);
  console.log("[BOOT] SUPABASE_KEY type:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "service_role" : "anon");
}

const stripe = new Stripe(STRIPE_SECRET_KEY || "sk_test_invalid", {
  apiVersion: "2024-06-20",
});

const supabase = SUPABASE_CONFIGURED ? createClient(supabaseUrl, supabaseKey) : null;
const supabaseAdmin = supabaseServiceRoleKey && supabaseUrl ? createClient(supabaseUrl, supabaseServiceRoleKey) : null;
const PRINT_DISPATCH_SECRET = process.env.PRINT_DISPATCH_SECRET || "";
const SUPABASE_HINT = "Check `curl http://127.0.0.1:54321/health` and `npx supabase status`";
const DEV_ALLOW_DEMO_PRODUCT = !isProduction() && String(process.env.DEV_ALLOW_DEMO_PRODUCT || "false").toLowerCase() === "true";
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORDER_ITEMS_HAS_PRODUCT_SLUG = String(process.env.ORDER_ITEMS_HAS_PRODUCT_SLUG || "false").toLowerCase() === "true";

const nowIso = () => new Date().toISOString();

async function supabaseConnectivityCheck() {
  if (!supabaseUrl) {
    return { ok: false, status: null, error: "missing_supabase_url" };
  }

  const endpoints = ["/health", "/rest/v1/"];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    for (const path of endpoints) {
      const url = `${supabaseUrl.replace(/\/$/, "")}${path}`;
      const res = await fetch(url, { method: "GET", signal: controller.signal });
      if (res.ok || res.status === 404) {
        clearTimeout(timeout);
        return { ok: true, status: res.status };
      }
    }
    clearTimeout(timeout);
    return { ok: false, status: null, error: "unexpected_response" };
  } catch (err) {
    clearTimeout(timeout);
    return { ok: false, status: null, error: err?.message || String(err) };
  }
}

// Manual check when Supabase is down:
// curl -i -X POST -H "Origin: http://127.0.0.1:8000" -H "Content-Type: application/json" \\
//   -d '{"items":[{"product_id":"demo","quantity":1}]}' http://127.0.0.1:3000/create-checkout-session

function classifySupabaseError(err, connectivity) {
  const message = (err?.message || "").toLowerCase();
  const status = err?.status ?? null;
  const connErr = !connectivity?.ok;
  if (connErr || message.includes("fetch failed") || message.includes("failed to fetch") || message.includes("timeout") || message.includes("econnrefused")) {
    return { httpStatus: 503, code: "supabase_unavailable", userMessage: "Supabase unavailable" };
  }
  if (status === 401 || status === 403) {
    return { httpStatus: status, code: "supabase_forbidden", userMessage: "Supabase authentication/authorization failed" };
  }
  if (typeof status === "number" && status >= 500) {
    return { httpStatus: 502, code: "supabase_error", userMessage: "Supabase upstream error" };
  }
  if (status === 404) {
    return { httpStatus: 502, code: "supabase_error", userMessage: "Supabase resource not found" };
  }
  return { httpStatus: 500, code: "supabase_error", userMessage: "Supabase request failed" };
}

const maskEmail = (email) => {
  if (!email || typeof email !== "string") return null;
  const [user, domain] = email.split("@");
  if (!domain || !user) return null;
  const maskedUser = user.length <= 2 ? `${user[0] || "*"}*` : `${user[0]}***${user.slice(-1)}`;
  return `${maskedUser}@${domain}`;
};

const RATE_LIMIT_WINDOW_MS_DEFAULT = 60_000;
const RATE_LIMIT_MAX_DEFAULT = 60;
const rateBuckets = new Map();
const forceBuckets = new Map();

const allowRate = (ip, windowMs, max) => {
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || [];
  const recent = bucket.filter((t) => now - t < windowMs);
  recent.push(now);
  rateBuckets.set(ip, recent);
  return recent.length <= max;
};

class HttpError extends Error {
  constructor(status, body) {
    super(body?.message || body?.error || "error");
    this.httpStatus = status;
    this.body = body;
  }
}

const supabaseErrorToDebugInfo = (error) => ({
  message: error?.message ?? null,
  code: error?.code ?? null,
  details: error?.details ?? null,
  hint: error?.hint ?? null,
});

const safeStr = (val) => (val ? String(val).replace(/\s+/g, " ").slice(0, 300) : null);

const isUuid = (s) => typeof s === "string" && UUID_V4_RE.test(s.trim());

async function supa(opName, fn, { requestId = null, correlationId = null } = {}) {
  try {
    const res = await fn();
    const data = res?.data ?? null;
    const error = res?.error ?? null;
    if (error) {
      const code = error.code || null;
      console.error(
        JSON.stringify({
          level: "error",
          type: "supabase_error",
          op: opName,
          correlation_id: correlationId || null,
          request_id: requestId || null,
          code,
          message: safeStr(error.message),
          details: safeStr(error.details),
          hint: safeStr(error.hint),
        })
      );
      throw new HttpError(500, {
        error: "supabase_error",
        message: `Supabase request failed: ${opName} (${code || safeStr(error.message) || "error"})`,
        requestId,
      });
    }
    return data;
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }
    const code = err?.code || null;
    console.error(
      JSON.stringify({
        level: "error",
        type: "supabase_error",
        op: opName,
        correlation_id: correlationId || null,
        request_id: requestId || null,
        code,
        message: safeStr(err?.message),
        details: safeStr(err?.details),
        hint: safeStr(err?.hint),
      })
    );
    throw new HttpError(500, {
      error: "supabase_error",
      message: `Supabase request failed: ${opName} (${code || safeStr(err?.message) || "error"})`,
      requestId,
    });
  }
}

const mailTransport = nodemailer.createTransport({
  host: MAIL_HOST,
  port: mailPort,
  secure: MAIL_SECURE,
  ignoreTLS: MAIL_SECURE ? false : true,
  requireTLS: MAIL_SECURE,
  auth: MAIL_USER && MAIL_PASS ? { user: MAIL_USER, pass: MAIL_PASS } : undefined,
});

async function sendOrderConfirmationEmail({ to, orderId, amountCents, currency, correlationId }) {
  if (!to) {
    return false;
  }

  const amount = typeof amountCents === "number" ? (amountCents / 100).toFixed(2) : null;
  const subject = "Confirmation de votre commande – Racines & Rituels";
  const text = [
    "Bonjour,",
    orderId ? `Votre commande ${orderId} est confirmée.` : "Votre commande est confirmée.",
    amount ? `Montant: ${amount} ${(currency || "EUR").toUpperCase()}` : null,
    "Merci pour votre confiance.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await mailTransport.sendMail({
      from: MAIL_FROM,
      to,
      subject,
      text,
    });
    console.log(
      JSON.stringify({
        level: "info",
        type: "email_sent",
        order_id: orderId,
        email: maskEmail(to),
        correlation_id: correlationId || null,
      })
    );
    return true;
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        type: "email_failed",
        order_id: orderId,
        error: err?.message || err,
        correlation_id: correlationId || null,
      })
    );
    return false;
  }
}

const throwDbWriteFailed = ({ requestId, table, action, error }) => {
  const dbInfo = { ...supabaseErrorToDebugInfo(error), table, action };

  console.error("[SUPABASE WRITE ERROR]", {
    requestId,
    table,
    action,
    message: dbInfo.message,
    code: dbInfo.code,
    details: dbInfo.details,
    hint: dbInfo.hint,
  });

  if (isProduction()) {
    throw new HttpError(500, { error: "db_write_failed", requestId });
  }

  throw new HttpError(500, { error: "db_write_failed", requestId, db: dbInfo });
};

async function recordWebhookEventStart(event) {
  if (!supabase) return true; // allow no-op in local misconfig
  const payload = { id: event.id, type: event.type, status: "received", created_at: nowIso() };
  const { error } = await supabase.from("webhook_events").insert(payload);
  if (error) {
    if (error.code === "23505") {
      console.log("[WEBHOOK] duplicate event", { event_id: event.id, type: event.type });
      return false;
    }
    console.error("[DB] webhook_events insert failed", error.message || error);
  }
  return true;
}

async function recordWebhookEventStatus(eventId, status, errorMessage = null) {
  if (!supabase) return;
  const { error } = await supabase
    .from("webhook_events")
    .update({ status, error: errorMessage || null, processed_at: nowIso() })
    .eq("id", eventId);
  if (error) {
    console.error("[DB] webhook_events update failed", error.message || error);
  }
}

async function upsertCustomer(stripeCustomerId, details = {}) {
  if (!supabase || !stripeCustomerId) return null;
  const payload = {
    stripe_customer_id: stripeCustomerId,
    email: details.email || null,
    name: details.name || null,
    phone: details.phone || null,
    address: details.address || null,
    updated_at: nowIso(),
  };
  const { data, error } = await supabase
    .from("customers")
    .upsert(payload, { onConflict: "stripe_customer_id" })
    .select("id, stripe_customer_id")
    .limit(1);

  if (error) {
    console.error("[DB] upsert customer failed", error.message || error);
    return null;
  }
  return data && data.length ? data[0] : null;
}

async function fetchOrderItems(orderId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("order_items")
    .select("product_id, quantity, unit_price_cents")
    .eq("order_id", orderId);
  if (error) {
    console.error("[DB] fetch order_items failed", error.message || error);
    return [];
  }
  return data || [];
}

async function decrementStock(orderId) {
  if (!supabase || !orderId) return;
  const { data, error } = await supabase.rpc("decrement_stock_for_order", { order_id: orderId });
  if (error) {
    console.error("[DB] stock decrement failed", error.message || error);
    return;
  }
  if (data && data.length) {
    console.log("[DB] stock decremented", { order_id: orderId });
  }
}

async function enqueuePrintJob(orderId, payload) {
  if (!supabase || !orderId) return;
  const { error } = await supabase
    .from("print_jobs")
    .insert({ order_id: orderId, payload, status: "queued" });
  if (error && error.code !== "23505") {
    console.error("[DB] enqueue print job failed", error.message || error);
  }
}

async function enqueueIntegrationEvent(type, payload) {
  if (!supabase) return;
  const { error } = await supabase.from("integration_events").insert({ type, payload, status: "pending" });
  if (error) {
    console.error("[DB] integration event insert failed", error.message || error);
  }
}

async function fetchProductSample() {
  if (!supabase) {
    throw new HttpError(500, { error: { message: "supabase_not_configured" } });
  }

  const { data, error } = await supabase.from("products").select("id, name, price_cents").limit(1);

  if (error) {
    throw new HttpError(500, {
      error: {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      },
    });
  }

  if (!data || !data.length) {
    throw new HttpError(404, { error: { message: "no_product_found" } });
  }

  return data[0];
}

async function createCheckoutSessionInternal({ itemsNormalized, incomingOrderId = null, userId = null, requestId, correlationId = null }) {
  if (!supabase) {
    throw new HttpError(500, { error: "supabase_not_configured", requestId });
  }

  if (!Array.isArray(itemsNormalized) || !itemsNormalized.length) {
    throw new HttpError(400, { error: "invalid_payload", requestId });
  }

  const productIds = itemsNormalized.map((i) => i.product_id_uuid || i.product_slug);

  const resolveProductsForCheckout = async () => {
    let ids = productIds;
    if (DEV_ALLOW_DEMO_PRODUCT && ids.includes("demo")) {
      const demoRow = await supa(
        "checkout_demo_lookup",
        () =>
          supabase
            .from("products")
            .select("id, slug")
            .eq("slug", "demo")
            .eq("active", true)
            .limit(1)
            .maybeSingle(),
        { requestId, correlationId }
      );
      if (demoRow?.slug) {
        ids = ids.map((pid) => (pid === "demo" ? demoRow.slug : pid));
      }
    }

    const slugs = ids.filter((pid) => pid && !isUuid(pid));
    const uuids = ids.filter((pid) => pid && isUuid(pid));

    const ors = [];
    if (uuids.length) ors.push(`id.in.(${uuids.join(",")})`);
    if (slugs.length) ors.push(`slug.in.(${slugs.map((s) => s.replace(/,/g, "")).join(",")})`);

    if (!ors.length) {
      return { resolvedItems: [], errors: [{ type: "product_not_found", input: null }] };
    }

    const products = await supa(
      "checkout_products_resolve",
      () =>
        supabase
          .from("products")
          .select("id, slug, name, price_cents, currency, stripe_price_id, active, stock, is_subscription")
          .or(ors.join(",")),
      { requestId, correlationId }
    );

    const map = new Map();
    for (const p of products || []) {
      const priceCents = Number.isFinite(p.price_cents) ? Number(p.price_cents) : null;
      const normalized = { ...p, price_cents: priceCents };
      if (p.id) map.set(p.id, normalized);
      if (p.slug) map.set(p.slug, normalized);
    }

    const resolvedItems = [];
    const errors = [];

    for (const it of itemsNormalized) {
      const key = it.product_id_uuid || it.product_slug;
      const prod = map.get(key);
      if (!prod) {
        errors.push({ type: "product_not_found", input: key });
        continue;
      }
      if (prod.active === false) {
        errors.push({ type: "product_inactive", input: key });
        continue;
      }
      if (Number.isInteger(prod.stock) && prod.stock >= 0 && it.quantity > prod.stock) {
        errors.push({ type: "out_of_stock", input: key });
        continue;
      }
      if (!prod.stripe_price_id) {
        console.error(
          JSON.stringify({
            level: "error",
            type: "stripe_price_missing",
            op: "checkout_resolve_products",
            correlation_id: correlationId || requestId || null,
            request_id: requestId,
            code: "stripe_price_missing",
            message: `Missing stripe_price_id for product ${prod.slug || prod.id}`,
          })
        );
        throw new HttpError(500, {
          error: "stripe_price_missing",
          message: `Missing stripe_price_id for product ${prod.slug || prod.id}. Run scripts/dev-sync-stripe-products.sh`,
          requestId,
        });
      }
      resolvedItems.push({
        input_product_id: key,
        product_uuid: prod.id,
        product_slug: prod.slug || null,
        quantity: it.quantity,
        product: prod,
      });
    }

    return { resolvedItems, errors };
  };

  const { resolvedItems, errors } = await resolveProductsForCheckout();

  if (errors.length) {
    const first = errors[0];
    let code = first.type;
    let status = 400;
    let message = "Invalid products";

    if (first.type === "product_not_found") {
      status = 404;
      message = `Product not found: ${first.input}`;
    } else if (first.type === "product_inactive") {
      status = 409;
      message = `Product inactive: ${first.input}`;
    } else if (first.type === "out_of_stock") {
      status = 409;
      message = `Product out of stock: ${first.input}`;
    }

    console.error(
      JSON.stringify({
        level: "error",
        type: code,
        op: "checkout_resolve_products",
        correlation_id: correlationId || requestId || null,
        request_id: requestId,
        code,
        message,
      })
    );

    throw new HttpError(status, {
      error: code,
      message,
      requestId,
    });
  }

  console.log(
    JSON.stringify({
      level: "debug",
      type: "checkout_resolved_items",
      correlation_id: correlationId || requestId || null,
      request_id: requestId,
      items: resolvedItems.map((it) => ({ input: it.input_product_id, product_uuid: it.product_uuid, product_slug: it.product_slug })),
    })
  );

  console.log(
    JSON.stringify({
      level: "info",
      type: "checkout_resolved_summary",
      correlation_id: correlationId || requestId || null,
      request_id: requestId,
      resolved_count: resolvedItems.length,
    })
  );

  let totalCents = 0;
  const orderItemsPayload = [];
  const lineItems = [];

  for (const it of resolvedItems) {
    const prod = it.product;
    if (!prod || !Number.isFinite(prod.price_cents) || prod.price_cents <= 0) {
      console.error("[CHECKOUT] invalid price", { requestId, item: it, prod });
      throw new HttpError(400, { error: "invalid_payload", item: it, requestId });
    }

    const line = { price: prod.stripe_price_id, quantity: it.quantity };

    totalCents += prod.price_cents * it.quantity;

    orderItemsPayload.push({
      product_id: prod.id,
      ...(ORDER_ITEMS_HAS_PRODUCT_SLUG && prod.slug ? { product_slug: prod.slug } : {}),
      quantity: it.quantity,
      unit_price_cents: prod.price_cents,
    });

    lineItems.push(line);
  }

  console.log("[CHECKOUT_CALC]", { requestId, total_cents: totalCents, items: itemsNormalized.length });

  if (!Number.isFinite(totalCents) || totalCents <= 0) {
    console.error("[CHECKOUT] total invalid", { requestId, total_cents: totalCents });
    throw new HttpError(400, { error: "invalid_total", requestId });
  }

  let orderId = incomingOrderId;

  if (incomingOrderId) {
    const existingOrder = await supa(
      "checkout_order_lookup",
      () =>
        supabase
          .from("orders")
          .select("id")
          .eq("id", incomingOrderId)
          .maybeSingle(),
      { requestId, correlationId }
    );

    if (!existingOrder) {
      console.error("[CHECKOUT] order_id not found", { requestId, order_id: incomingOrderId });
      throw new HttpError(400, { error: "order_not_found", requestId });
    }

    await supa(
      "checkout_order_update",
      () =>
        supabase
          .from("orders")
          .update({ total_cents: totalCents, currency: CURRENCY, status: "pending" })
          .eq("id", incomingOrderId),
      { requestId, correlationId }
    );
  } else {
    console.log("[DB] inserting orders...");
    const orderRows = await supa(
      "checkout_order_insert",
      () =>
        supabase
          .from("orders")
          .insert({
            status: "pending",
            total_cents: totalCents,
            currency: CURRENCY,
            user_id: userId || null,
          })
          .select("id")
          .limit(1),
      { requestId, correlationId }
    );

    if (!orderRows || orderRows.length === 0) {
      console.error("[DB] create order error", { requestId, error: "no rows returned" });
      throw new HttpError(500, { error: "supabase_error", requestId, message: "Supabase request failed: checkout_order_insert (no rows)" });
    }

    orderId = orderRows[0].id;
  }

  console.log(`[checkout] order created ${orderId}`, { requestId });

  await supa(
    "checkout_order_items_delete",
    () => supabase.from("order_items").delete().eq("order_id", orderId),
    { requestId, correlationId }
  );

  const orderItems = orderItemsPayload.map((oi) => ({ ...oi, order_id: orderId }));
  console.log("[DB] inserting order_items...");
  await supa(
    "checkout_order_items_insert",
    () => supabase.from("order_items").insert(orderItems),
    { requestId, correlationId }
  );

  console.log("[CHECKOUT] Stripe line_items", { requestId, line_items_count: lineItems.length });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    client_reference_id: orderId,
    metadata: { order_id: orderId },
    payment_intent_data: { metadata: { order_id: orderId } },
    line_items: lineItems,
    success_url: `${SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/cancel.html`,
  });

  console.log(`[checkout] stripe session created ${session.id} for order ${orderId}`, { requestId });

  console.log("[DB] update orders stripe_session_id...");
  await supa(
    "checkout_order_session_update",
    () =>
      supabase
        .from("orders")
        .update({ stripe_session_id: session.id, stripe_payment_intent_id: session.payment_intent || null })
        .eq("id", orderId),
    { requestId, correlationId }
  );

  console.log("[CHECKOUT] done", { requestId, order_id: orderId, session_id: session.id, total_cents: totalCents });

  return { session, orderId, totalCents };
}

const app = express();

// Correlation id middleware
app.use((req, res, next) => {
  const incoming = req.headers["x-correlation-id"];
  const correlationId = typeof incoming === "string" && incoming.trim() ? incoming.trim() : crypto.randomUUID();
  req.correlationId = correlationId;
  res.locals.correlationId = correlationId;
  res.setHeader("x-correlation-id", correlationId);
  const start = Date.now();
  res.on("finish", () => {
    const latency = Date.now() - start;
    const log = {
      level: "info",
      type: "request_end",
      path: req.path,
      method: req.method,
      status: res.statusCode,
      latency_ms: latency,
      correlation_id: correlationId,
      origin: req.headers.origin || null,
    };
    console.log(JSON.stringify(log));
  });
  next();
});

const parseExtraOrigins = (raw) =>
  (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const respondError = (res, opts) => {
  const {
    status = 500,
    code = "error",
    message = "Unexpected error",
    correlationId = null,
    requestId = null,
    error = null,
    type = null,
    op = null,
  } = opts || {};
  const corr =
    correlationId ??
    res?.locals?.correlationId ??
    (typeof res?.getHeader === "function" ? res.getHeader("x-correlation-id") : null) ??
    crypto.randomUUID();
  const payload = {
    ok: false,
    error: code,
    message,
    correlation_id: corr,
    request_id: requestId,
    status,
  };
  if (EXPOSE_STACKS && error?.stack) {
    payload.stack = error.stack;
  }

  console.error(
    JSON.stringify({
      level: "error",
      type: type || code,
      op: op || null,
      correlation_id: corr,
      request_id: requestId,
      code,
      message,
    })
  );

  return res.status(status).json(payload);
};

// CORS allowlist by environment (exact matches only) — register early
const corsAllowlist = (() => {
  const extraOrigins = parseExtraOrigins(process.env.CORS_EXTRA_ORIGINS);
  const list = new Set();
  if (isProduction()) {
    if (SITE_URL) {
      list.add(SITE_URL);
      if (SITE_URL.startsWith("http://")) {
        try {
          const u = new URL(SITE_URL);
          list.add(`https://${u.host}`);
        } catch (_) {
          // ignore parse errors
        }
      }
    }
    extraOrigins.forEach((o) => list.add(o));
  } else {
    list.add("http://127.0.0.1:8000");
    list.add("http://127.0.0.1:3000");
    if (SITE_URL) list.add(SITE_URL);
    extraOrigins.forEach((o) => list.add(o));
  }
  console.log("[BOOT] CORS allowed origins:", Array.from(list).join(","));
  return list;
})();

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow curl/postman
    const allowed = corsAllowlist.has(origin);
    if (!allowed) {
      console.warn("[CORS] origin rejected", { origin });
    }
    return callback(null, allowed ? origin : false);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept", "Authorization", "X-Requested-With"],
  maxAge: 600,
  optionsSuccessStatus: 204,
};

console.log("[BOOT] CORS enabled for POST /create-checkout-session");

// Guardrail: reject disallowed origins early with a clear JSON error
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) return next();
  if (corsAllowlist.has(origin)) return next();

  const correlationId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
  console.warn("[CORS] origin rejected", { origin, path: req.path, correlation_id: correlationId });
  return res.status(403).json({ ok: false, error: "cors_denied", correlation_id: correlationId });
});

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Ensure Vary header is present when CORS is applied
app.use((req, res, next) => {
  if (res.getHeader("Access-Control-Allow-Origin")) {
    res.append("Vary", "Origin");
  }
  next();
});

// Security headers (minimal)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  const connectSrcDev = "http://127.0.0.1:3000 http://127.0.0.1:8000 https://*.stripe.com";
  const connectSrcProd = `${SITE_URL || ""} ${SITE_URL?.replace(/^http:\/\//, "https://") || ""} https://*.stripe.com`;
  const connectSrc = isProduction() ? connectSrcProd : connectSrcDev;
  res.setHeader("Content-Security-Policy", `default-src 'self'; connect-src 'self' ${connectSrc};`);
  next();
});


// --- Webhook endpoint (requires raw body) ---
// Utility: Find order by stripe_session_id
async function findOrderBySessionId(sessionId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("orders")
    .select("id, status, stripe_session_id")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  if (error) {
    console.error("[DB] order lookup by session failed", error.message || error);
    return null;
  }
  return data;
}

// Utility: Check if webhook event already processed
async function isAlreadyProcessedEvent(eventId) {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("webhook_events")
    .select("id, status")
    .eq("id", eventId)
    .maybeSingle();
  if (error) {
    console.error("[DB] webhook_events lookup failed", error.message || error);
    return false;
  }
  return data && data.status === "processed";
}

// Utility: Upsert customer by email
async function upsertCustomerByEmail(email, details = {}) {
  if (!supabase || !email) return null;
  const payload = {
    email,
    name: details.name || null,
    phone: details.phone || null,
    address: details.address || null,
    stripe_customer_id: details.stripe_customer_id || null,
    updated_at: nowIso(),
  };
  
  // Try upsert on email
  const { data, error } = await supabase
    .from("customers")
    .upsert(payload, { onConflict: "email" })
    .select("id, email")
    .limit(1);

  if (error) {
    console.error("[DB] upsert customer by email failed", error.message || error);
    return null;
  }
  return data && data.length ? data[0] : null;
}

// Utility: Update order to paid status
async function updateOrderPaid({
  orderId,
  sessionId,
  paymentIntentId,
  customerEmail,
  customerId,
  shippingAddress,
  paymentStatus,
  eventId,
  correlationId = null,
}) {
  if (!supabase) return { success: false, error: "supabase_not_configured" };

  // Determine final status based on payment_status
  const finalStatus = paymentStatus === "paid" ? "paid" : "pending";

  const { data, error } = await supabase
    .from("orders")
    .update({
      status: finalStatus,
      stripe_payment_intent_id: paymentIntentId || null,
      stripe_session_id: sessionId,
      customer_id: customerId || null,
      customer_email: customerEmail || null,
      shipping_address: shippingAddress || null,
      paid_at: finalStatus === "paid" ? nowIso() : null,
      updated_at: nowIso(),
    })
    .eq("id", orderId)
    .neq("status", "paid")
    .select("id, status");

  if (error) {
    console.error(
      JSON.stringify({
        level: "error",
        type: "order_update_failed",
        order_id: orderId,
        session_id: sessionId,
        event_id: eventId || null,
        correlation_id: correlationId || null,
        error: error.message || error,
      })
    );
    return { success: false, error: "order_update_failed" };
  }

  if (!data || data.length === 0) {
    console.log("[DB] order already paid or not updatable", { order_id: orderId });
    return { success: true, alreadyPaid: true };
  }

  console.log("[WEBHOOK] order updated", { 
    order_id: orderId, 
    session: sessionId, 
    status: finalStatus,
    event_id: eventId 
  });

  return { success: true, status: finalStatus };
}

async function markOrderPaid(session, event) {
  const eventId = event?.id || "unknown";
  const requestId = `whk_${Date.now()}`;

  console.log(`[WEBHOOK] received ${event.type} id=${eventId}`, { 
    requestId,
    session_id: session.id 
  });

  if (!supabase) {
    console.error("[WEBHOOK] Supabase not configured; skipping order update", { requestId });
    await recordWebhookEventStatus(eventId, "error", "supabase_not_configured");
    return { status: "error", error: "supabase_not_configured", recorded: true, httpStatus: 200 };
  }

  // Get order_id from session metadata or client_reference_id
  let orderId = session.client_reference_id || session.metadata?.order_id || null;
  
  // If no orderId in metadata, try to find by stripe_session_id
  if (!orderId) {
    console.log("[WEBHOOK] no order_id in metadata, searching by session_id", { 
      requestId, 
      session_id: session.id 
    });
    const foundOrder = await findOrderBySessionId(session.id);
    if (foundOrder) {
      orderId = foundOrder.id;
      console.log("[WEBHOOK] order found by session_id", { requestId, order_id: orderId });
    }
  }

  if (!orderId) {
    console.error("[WEBHOOK] missing order_id in session", { 
      requestId, 
      session_id: session.id 
    });
    await recordWebhookEventStatus(eventId, "error", "missing_order_id");
    return { status: "error", error: "missing_order_id", recorded: true, httpStatus: 200 };
  }

  const { data: orderRow, error: orderLookupErr } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();

  if (orderLookupErr) {
    console.error("[WEBHOOK] order lookup failed", { 
      requestId, 
      error: orderLookupErr.message || orderLookupErr 
    });
    await recordWebhookEventStatus(eventId, "error", "order_lookup_failed");
    return { status: "error", error: "order_lookup_failed", recorded: true, httpStatus: 200 };
  }

  if (!orderRow) {
    console.error("[WEBHOOK] order not found", { requestId, order_id: orderId, session: session.id });
    await recordWebhookEventStatus(eventId, "error", "order_not_found");
    return { status: "error", error: "order_not_found", recorded: true, httpStatus: 200 };
  }

  if (orderRow.status === "paid") {
    console.log("[WEBHOOK] order already paid", { requestId, order_id: orderId });
    return { status: "ok", alreadyPaid: true };
  }

  const customerDetails = session.customer_details || {};
  const customerEmail = customerDetails.email || session.customer_email || null;
  const shipping = session.shipping_details || customerDetails.address || null;
  const paymentStatus = session.payment_status || "unpaid";

  // Upsert customer by Stripe customer ID
  let customer = await upsertCustomer(session.customer, {
    email: customerEmail,
    name: customerDetails.name,
    phone: customerDetails.phone,
    address: shipping,
  });

  // If no stripe customer but we have email, try upsert by email
  if (!customer && customerEmail) {
    customer = await upsertCustomerByEmail(customerEmail, {
      name: customerDetails.name,
      phone: customerDetails.phone,
      address: shipping,
      stripe_customer_id: session.customer || null,
    });
  }

  const updateResult = await updateOrderPaid({
    orderId,
    sessionId: session.id,
    paymentIntentId: session.payment_intent || null,
    customerEmail,
    customerId: customer?.id || null,
    shippingAddress: shipping,
    paymentStatus,
    eventId,
    correlationId: requestId,
  });

  if (!updateResult.success) {
    console.error(
      JSON.stringify({
        level: "error",
        type: "order_update_failed",
        order_id: orderId,
        session_id: session.id,
        event_id: eventId,
        correlation_id: requestId,
        error: updateResult.error,
      })
    );
    await recordWebhookEventStatus(eventId, "error", updateResult.error);
    return { status: "error", error: updateResult.error, recorded: true, httpStatus: 200 };
  }

  if (updateResult.alreadyPaid) {
    console.log("[WEBHOOK] order already paid", { requestId, order_id: orderId });
    await recordWebhookEventStatus(eventId, "processed");
    return { status: "ok", alreadyPaid: true };
  }

  console.log("[WEBHOOK] order updated successfully", { 
    requestId, 
    order_id: orderId, 
    session_id: session.id,
    status: updateResult.status 
  });

  // Record success in webhook_events
  await recordWebhookEventStatus(eventId, "processed");

  // Post-payment hooks (non-bloquants, seulement si order vraiment passé en paid)
  if (updateResult.status === "paid") {
    try {
      await decrementStock(orderId);
      const orderItems = await fetchOrderItems(orderId);
      await enqueuePrintJob(orderId, {
        order_id: orderId,
        shipping,
        items: orderItems,
      });
      await enqueueIntegrationEvent("order_paid", {
        order_id: orderId,
        stripe_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent || null,
      });
    } catch (err) {
      console.error("[WEBHOOK] post-payment hooks error", { 
        requestId, 
        error: err?.message || err 
      });
    }
  }

  return { status: "ok" };
}

async function handleInvoicePaid(invoice) {
  if (!supabase) {
    console.error("[WEBHOOK] Supabase not configured; skipping invoice handling");
    return;
  }

  const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  const price = invoice.lines?.data?.[0]?.price;
  const customer = await upsertCustomer(invoice.customer, {
    email: invoice.customer_email || null,
    name: invoice.customer_name || null,
  });

  const payload = {
    stripe_subscription_id: subscriptionId || null,
    stripe_customer_id: invoice.customer || null,
    status: invoice.status || "paid",
    price_id: price?.id || null,
    interval: price?.recurring?.interval || null,
    current_period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
    current_period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
    updated_at: nowIso(),
  };

  const { error } = await supabase
    .from("subscriptions")
    .upsert(payload, { onConflict: "stripe_subscription_id" });

  if (error) {
    console.error("[DB] upsert subscription (invoice) failed", error.message || error);
  }

  await enqueueIntegrationEvent("subscription_paid", {
    invoice_id: invoice.id,
    subscription_id: subscriptionId,
    stripe_customer_id: invoice.customer,
  });

  // Optional: could also create a print job for invoices if needed later
  if (customer) {
    await enqueueIntegrationEvent("customer_updated", customer);
  }
}

async function handleSubscriptionEvent(subscription) {
  if (!supabase) {
    console.error("[WEBHOOK] Supabase not configured; skipping subscription event");
    return;
  }

  const payload = {
    stripe_subscription_id: subscription.id,
    stripe_customer_id: subscription.customer || null,
    status: subscription.status || null,
    price_id: subscription.items?.data?.[0]?.price?.id || null,
    interval: subscription.items?.data?.[0]?.price?.recurring?.interval || null,
    current_period_start: subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000).toISOString()
      : null,
    current_period_end: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: subscription.cancel_at_period_end ?? null,
    canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
    updated_at: nowIso(),
  };

  const { error } = await supabase
    .from("subscriptions")
    .upsert(payload, { onConflict: "stripe_subscription_id" });

  if (error) {
    console.error("[DB] upsert subscription failed", error.message || error);
  }

  await enqueueIntegrationEvent("subscription_sync", {
    subscription_id: subscription.id,
    status: subscription.status,
  });
}

async function handlePaymentIntentSucceeded(intent) {
  // Currently informational only; kept for future fraud/async flows
  console.log("[WEBHOOK] payment_intent.succeeded", {
    id: intent.id,
    amount: intent.amount_received,
    currency: intent.currency,
  });
}

async function handlePaymentIntentFailed(intent, event) {
  const eventId = event?.id || "unknown";
  const requestId = `whk_${Date.now()}`;
  const orderId = intent.metadata?.order_id || null;

  console.error(`[WEBHOOK] received payment_intent.payment_failed id=${eventId}`, {
    requestId,
    payment_intent: intent.id,
    order_id: orderId,
    failure_message: intent.last_payment_error?.message || null,
  });

  if (!supabase || !orderId) {
    console.log("[WEBHOOK] payment_intent.payment_failed: no order to update", { requestId });
    return;
  }

  // Optional: mark order as failed
  const { error } = await supabase
    .from("orders")
    .update({ 
      status: "payment_failed",
      updated_at: nowIso(),
    })
    .eq("id", orderId);

  if (error) {
    console.error("[WEBHOOK] failed to update order status", { requestId, error: error.message });
  } else {
    console.log("[WEBHOOK] order marked as payment_failed", { requestId, order_id: orderId });
  }
}

async function handleCheckoutSessionCompleted(session, event) {
  console.log("[WEBHOOK] checkout.session.completed", {
    id: session.id,
    order_id: session.client_reference_id || session.metadata?.order_id || null,
  });
  return await markOrderPaid(session, event);
}

async function handleCheckoutSessionAsyncPaymentSucceeded(session, event) {
  console.log("[WEBHOOK] checkout.session.async_payment_succeeded", {
    id: session.id,
    order_id: session.client_reference_id || session.metadata?.order_id || null,
  });
  return await markOrderPaid(session, event);
}

async function handleCheckoutSessionExpired(session, event) {
  const eventId = event?.id || "unknown";
  const requestId = `whk_${Date.now()}`;
  const orderId = session.client_reference_id || session.metadata?.order_id || null;

  console.log(`[WEBHOOK] received checkout.session.expired id=${eventId}`, {
    requestId,
    session_id: session.id,
    order_id: orderId,
  });

  if (!supabase || !orderId) {
    console.log("[WEBHOOK] session expired: no order to update", { requestId });
    return;
  }

  // Mark order as expired
  const { error } = await supabase
    .from("orders")
    .update({ 
      status: "expired",
      updated_at: nowIso(),
    })
    .eq("id", orderId)
    .eq("status", "pending");

  if (error) {
    console.error("[WEBHOOK] failed to mark order expired", { requestId, error: error.message });
  } else {
    console.log("[WEBHOOK] order marked as expired", { requestId, order_id: orderId });
  }
}

const webhookHandlers = {
  "checkout.session.completed": handleCheckoutSessionCompleted,
  "checkout.session.async_payment_succeeded": handleCheckoutSessionAsyncPaymentSucceeded,
  "checkout.session.expired": handleCheckoutSessionExpired,
  "payment_intent.payment_failed": handlePaymentIntentFailed,
  "invoice.paid": handleInvoicePaid,
  "customer.subscription.created": handleSubscriptionEvent,
  "customer.subscription.updated": handleSubscriptionEvent,
  "customer.subscription.deleted": handleSubscriptionEvent,
  "payment_intent.succeeded": handlePaymentIntentSucceeded,
};

const handleStripeWebhook = async (req, res) => {
  const requestId = req.correlationId || `whk_${Date.now()}`;
  const sig = req.headers["stripe-signature"];

  // Check if webhook secret is configured
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error(
      JSON.stringify({
        level: "error",
        type: "webhook_secret_missing",
        request_id: requestId,
        timestamp: new Date().toISOString(),
      })
    );
    return res.status(500).json({
      error: "STRIPE_WEBHOOK_SECRET is required",
      request_id: requestId,
    });
  }

  // Verify Stripe signature
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        type: "webhook_signature_verification_failed",
        request_id: requestId,
        error: err?.message || String(err),
        has_signature: Boolean(sig),
        timestamp: new Date().toISOString(),
      })
    );
    return res.status(400).json({
      error: "Invalid signature",
      request_id: requestId,
    });
  }

  const eventId = event?.id || "unknown";
  const eventType = event?.type || "unknown";

  // Log every event received
  console.log(
    JSON.stringify({
      level: "info",
      type: "webhook_event_received",
      event_id: eventId,
      event_type: eventType,
      request_id: requestId,
      timestamp: new Date().toISOString(),
    })
  );

  // Handle checkout.session.completed
  if (eventType === "checkout.session.completed") {
    const session = event.data?.object;

    if (!session) {
      console.error(
        JSON.stringify({
          level: "error",
          type: "webhook_missing_session_data",
          event_id: eventId,
          request_id: requestId,
          timestamp: new Date().toISOString(),
        })
      );
      // Return 200 to avoid Stripe retries
      return res.json({ received: true, error: "missing_session_data" });
    }

    // Wrap business logic in try/catch to prevent crashes
    try {
      console.log(
        JSON.stringify({
          level: "info",
          type: "webhook_processing_checkout",
          event_id: eventId,
          session_id: session.id,
          order_id: session.client_reference_id || session.metadata?.order_id || null,
          request_id: requestId,
          timestamp: new Date().toISOString(),
        })
      );

      // Call existing business logic
      await handleCheckoutSessionCompleted(session, event);

      console.log(
        JSON.stringify({
          level: "info",
          type: "webhook_checkout_completed_success",
          event_id: eventId,
          session_id: session.id,
          request_id: requestId,
          timestamp: new Date().toISOString(),
        })
      );

      return res.json({ received: true });
    } catch (err) {
      // Log error but return 200 to avoid Stripe retries
      console.error(
        JSON.stringify({
          level: "error",
          type: "webhook_checkout_processing_failed",
          event_id: eventId,
          session_id: session.id,
          request_id: requestId,
          error: err?.message || String(err),
          stack: EXPOSE_STACKS ? err?.stack : undefined,
          timestamp: new Date().toISOString(),
        })
      );

      // Try to record error status (best effort)
      try {
        await recordWebhookEventStatus(
          eventId,
          "error",
          err?.message || "checkout_processing_failed"
        );
      } catch (recordErr) {
        console.error(
          JSON.stringify({
            level: "error",
            type: "webhook_record_status_failed",
            event_id: eventId,
            request_id: requestId,
            error: recordErr?.message || String(recordErr),
            timestamp: new Date().toISOString(),
          })
        );
      }

      // Always return 200 to prevent infinite Stripe retries
      return res.json({ 
        received: true, 
        error: "processing_failed",
        request_id: requestId 
      });
    }
  }

  // All other event types: log and return 200
  console.log(
    JSON.stringify({
      level: "info",
      type: "webhook_event_ignored",
      event_id: eventId,
      event_type: eventType,
      request_id: requestId,
      reason: "unhandled_event_type",
      timestamp: new Date().toISOString(),
    })
  );

  return res.json({ 
    received: true, 
    ignored: true,
    event_type: eventType,
    request_id: requestId 
  });
};

// Webhook endpoints (Stripe CLI forward target) — raw body is required for signature verification
// Primary path (documented): /webhook/stripe
// Aliases added for convenience (/webhooks/stripe, /webhook) to avoid 404 when CLI is misconfigured
// Test manually (in server/):
//   stripe listen --forward-to http://127.0.0.1:3000/webhook/stripe
//   stripe trigger checkout.session.completed
const stripeRawBody = bodyParser.raw({ type: "application/json" });
app.post("/webhook/stripe", stripeRawBody, handleStripeWebhook);
app.post("/webhooks/stripe", stripeRawBody, handleStripeWebhook);
app.post("/webhook", stripeRawBody, handleStripeWebhook);

// JSON parsers for the rest of the app (must come AFTER the raw webhook route)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public routes (JSON-only)
app.get("/public/order-by-session", async (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const windowMs = Number.isFinite(ENV.RATE_LIMIT_WINDOW_MS) && ENV.RATE_LIMIT_WINDOW_MS > 0 ? ENV.RATE_LIMIT_WINDOW_MS : RATE_LIMIT_WINDOW_MS_DEFAULT;
  const maxReq = Number.isFinite(ENV.RATE_LIMIT_MAX) && ENV.RATE_LIMIT_MAX > 0 ? ENV.RATE_LIMIT_MAX : RATE_LIMIT_MAX_DEFAULT;
  if (!allowRate(ip, windowMs, maxReq)) {
    return respondError(res, {
      status: 429,
      code: "rate_limited",
      message: "Too many requests",
      correlationId: req.correlationId,
    });
  }

  const sessionId = (req.query.session_id || "").toString().trim();
  const sessionPattern = /^cs_(test|live)_[A-Za-z0-9]{20,}$/;

  if (!sessionId) {
    return respondError(res, {
      status: 400,
      code: "missing_session_id",
      message: "Query param session_id is required",
      correlationId: req.correlationId,
    });
  }

  if (!sessionPattern.test(sessionId) || sessionId.length > 255) {
    return respondError(res, {
      status: 400,
      code: "invalid_session_id",
      message: "session_id format is invalid",
      correlationId: req.correlationId,
    });
  }

  if (!supabaseAdmin) {
    return respondError(res, {
      status: 500,
      code: "config_error",
      message: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      correlationId: req.correlationId,
    });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("id,status,stripe_session_id,paid_at,created_at,updated_at,total_cents,currency,customer_email")
      .eq("stripe_session_id", sessionId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[success] order lookup failed", error.message || error);
      return respondError(res, {
        status: 500,
        code: "db_error",
        message: error.message || "db_error",
        correlationId: req.correlationId,
      });
    }

    if (!data) {
      return respondError(res, {
        status: 404,
        code: "order_not_found",
        message: "Order not found for session",
        correlationId: req.correlationId,
      });
    }

    const correlationId = req.correlationId || res.locals?.correlationId || crypto.randomUUID();
    console.log("[success] order-by-session", {
      session_id: sessionId,
      found: Boolean(data),
      status: data?.status || null,
      correlation_id: correlationId,
    });

    const maskedEmail = data.customer_email ? maskEmail(data.customer_email) || "***" : null;

    // Stable response contract for success page polling
    // order: { id, stripe_session_id, status, total_cents, currency, paid_at, created_at, updated_at, customer_email_masked }
    const order = {
      id: data.id,
      stripe_session_id: data.stripe_session_id,
      status: data.status,
      total_cents: Number.isFinite(data?.total_cents) ? data.total_cents : null,
      currency: data.currency || null,
      paid_at: data.paid_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
      customer_email_masked: maskedEmail,
    };

    if (order.status === "paid") {
      console.log(
        JSON.stringify({
          level: "info",
          type: "order_lookup_paid",
          order_id: order.id,
          session_id: order.stripe_session_id,
          correlation_id: correlationId,
        })
      );
    }

    return res.json({ ok: true, order, correlation_id: correlationId });
  } catch (err) {
    const correlationId = req.correlationId || res.locals?.correlationId || crypto.randomUUID();
    console.error("[success] order lookup failed", err?.message || err, { correlation_id: correlationId });
    return respondError(res, {
      status: 500,
      code: "db_error",
      message: err?.message || "db_error",
      correlationId,
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

if (!isProduction()) {
  app.get("/debug/cors", (req, res) => {
    const origin = req.headers.origin || null;
    const allowed = origin ? corsAllowlist.has(origin) : true;
    res.json({
      ok: true,
      origin,
      allowed,
      allowlist: Array.from(corsAllowlist),
    });
  });

  app.get("/debug/origin", (req, res) => {
    const origin = req.headers.origin || null;
    const allowed = origin ? corsAllowlist.has(origin) : true;
    res.json({
      ok: true,
      origin_received: origin,
      origin_allowed: allowed,
      allowed_origins: Array.from(corsAllowlist),
      site_url: SITE_URL,
      backend_url_guess: `http://127.0.0.1:${PORT}`,
    });
  });
}

app.get("/ready", async (req, res) => {
  const problems = [];
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    problems.push("supabase_config_missing");
  }
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    problems.push("stripe_config_missing");
  }

  if (supabaseAdmin) {
    try {
      const { error } = await supabaseAdmin.from("orders").select("id").limit(1);
      if (error) problems.push("supabase_unreachable");
    } catch (_) {
      problems.push("supabase_unreachable");
    }
  } else {
    problems.push("supabase_client_absent");
  }

  const status = problems.length ? 503 : 200;
  res.status(status).json({ ok: problems.length === 0, problems });
});

app.get("/debug/supabase", async (req, res) => {
  try {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).send("Not found");
    }

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ ok: false, error: "Missing SUPABASE_URL or key", url: supabaseUrl || null });
    }

    const { data, error, count } = await supabase
      .from("products")
      .select("id", { count: "exact" })
      .limit(1);

    if (error) {
      return res.status(500).json({
        ok: false,
        keyType: process.env.SUPABASE_SERVICE_ROLE_KEY ? "service_role" : "anon",
        url: supabaseUrl,
        error: {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
      });
    }

    return res.json({
      ok: true,
      keyType: process.env.SUPABASE_SERVICE_ROLE_KEY ? "service_role" : "anon",
      url: supabaseUrl,
      sample: data?.[0] || null,
      products_count: typeof count === "number" ? count : null,
      error: null,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, url: supabaseUrl, error: String(e) });
  }
});

app.get("/debug/supabase-check", async (req, res) => {
  if (isProduction()) {
    return res.status(404).send("Not found");
  }

  const requestId = req.correlationId || `dbg_${Date.now()}`;
  const correlationId = req.correlationId || requestId;
  const slug = (req.query.slug || "").toString().trim();

  if (!slug) {
    return respondError(res, {
      status: 400,
      code: "missing_slug",
      message: "slug query param is required",
      correlationId,
      requestId,
    });
  }

  try {
    const product = await supa(
      "debug_fetch_product",
      () =>
        supabase
          .from("products")
          .select("id, slug, stripe_price_id, stock, active")
          .eq("slug", slug)
          .maybeSingle(),
      { requestId, correlationId }
    );

    if (!product) {
      return respondError(res, {
        status: 404,
        code: "product_not_found",
        message: "Product not found",
        correlationId,
        requestId,
      });
    }

    return res.json({ ok: true, product });
  } catch (err) {
    const status = err?.httpStatus || 500;
    const message = err?.body?.message || err?.message || "Supabase request failed";
    return respondError(res, {
      status,
      code: "supabase_error",
      message,
      correlationId,
      requestId,
    });
  }
});

app.get("/debug/stripe-session/:id", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).send("Not found");
  }

  const sessionId = req.params.id;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
    let orderFromDb = null;
    const orderId = session.metadata?.order_id || session.client_reference_id || null;
    if (orderId && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from("orders")
        .select("id, status, total_cents, currency, customer_email")
        .eq("id", orderId)
        .maybeSingle();
      if (!error) {
        orderFromDb = data;
      }
    }
    res.json({
      id: session.id,
      order_id: orderId,
      client_reference_id: session.client_reference_id || null,
      metadata: session.metadata || null,
      payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
      customer: session.customer || null,
      customer_email:
        orderFromDb?.customer_email || session.customer_details?.email || session.customer_email || null,
      amount_total: orderFromDb?.total_cents ?? session.amount_total,
      currency: orderFromDb?.currency || session.currency,
      payment_status: orderFromDb?.status || session.payment_status || session.status || null,
      hint:
        (orderFromDb?.status || session.payment_status || session.status || null) === "paid"
          ? null
          : "Session not paid yet; Stripe will not emit checkout.session.completed for this session.",
    });
  } catch (err) {
    console.error("[DEBUG] fetch session failed", err?.message || err);
    res.status(404).json({ error: "session_not_found" });
  }
});

app.post("/debug/force-mark-paid", async (req, res) => {
  if (process.env.NODE_ENV !== "development") {
    return res.status(404).send("Not found");
  }

  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const windowMs = 5 * 60 * 1000;
  const maxReq = 10;
  const now = Date.now();
  const bucket = forceBuckets.get(ip) || [];
  const recent = bucket.filter((t) => now - t < windowMs);
  recent.push(now);
  forceBuckets.set(ip, recent);
  if (recent.length > maxReq) {
    return res.status(429).json({ ok: false, error: "rate_limited" });
  }

  if (!DEV_FORCE_SECRET || req.headers["x-dev-secret"] !== DEV_FORCE_SECRET) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const ct = req.headers["content-type"] || "";
  if (!ct.includes("application/json")) {
    return res.status(415).json({ ok: false, error: "invalid_content_type" });
  }

  const sessionId = (req.body?.stripe_session_id || "").toString().trim();
  const sessionPattern = /^cs_(test_)?[A-Za-z0-9]+$/;
  if (!sessionId) {
    return res.status(400).json({ ok: false, error: "missing_session_id" });
  }
  if (!sessionPattern.test(sessionId)) {
    return res.status(400).json({ ok: false, error: "invalid_session_id" });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ ok: false, error: "config_error" });
  }

  const correlationId = req.correlationId || `dbg_${Date.now()}`;

  const { data: existing, error: findErr } = await supabaseAdmin
    .from("orders")
    .select("id,status,total_cents,currency,paid_at,created_at,updated_at,customer_email,stripe_session_id,stripe_payment_intent_id")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  if (findErr) {
    console.error(JSON.stringify({ level: "error", type: "force_mark_paid_lookup_failed", session_id: sessionId, error: findErr.message || findErr, correlation_id: correlationId }));
    return res.status(500).json({ ok: false, error: "db_error" });
  }

  if (!existing) {
    return res.status(404).json({ ok: false, error: "order_not_found" });
  }

  if (existing.status === "paid") {
    console.log(JSON.stringify({ level: "info", type: "force_mark_paid", session_id: sessionId, order_id: existing.id, already_paid: true, correlation_id: correlationId }));
    return res.json({
      ok: true,
      order: {
        id: existing.id,
        status: existing.status,
        total_cents: Number.isFinite(existing.total_cents) ? existing.total_cents : null,
        currency: existing.currency || null,
        paid_at: existing.paid_at,
        created_at: existing.created_at,
        updated_at: existing.updated_at,
        stripe_session_id: existing.stripe_session_id,
        stripe_payment_intent_id: existing.stripe_payment_intent_id || null,
        customer_email_masked: maskEmail(existing.customer_email || null),
      },
    });
  }

  let paymentIntentId = existing.stripe_payment_intent_id || null;
  let emailToSet = null;
  if (!paymentIntentId || !existing.customer_email) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
      paymentIntentId = paymentIntentId || session.payment_intent || null;
      const candidateEmail = session.customer_details?.email || session.customer_email || null;
      if (candidateEmail && !existing.customer_email) {
        const trimmed = candidateEmail.trim();
        emailToSet = trimmed ? trimmed : null;
      }
    } catch (err) {
      console.error(JSON.stringify({ level: "error", type: "force_mark_paid_stripe_fetch_failed", session_id: sessionId, error: err?.message || err, correlation_id: correlationId }));
    }
  }

  const nowIsoVal = nowIso();
  const payload = {
    status: "paid",
    paid_at: existing.paid_at || nowIsoVal,
    updated_at: nowIsoVal,
    stripe_payment_intent_id: existing.stripe_payment_intent_id || paymentIntentId || null,
  };

  if (emailToSet && !existing.customer_email) {
    payload.customer_email = emailToSet;
  }

  const { data: updatedRows, error: updErr } = await supabaseAdmin
    .from("orders")
    .update(payload)
    .eq("id", existing.id)
    .select("id,status,total_cents,currency,paid_at,created_at,updated_at,customer_email,stripe_session_id,stripe_payment_intent_id")
    .maybeSingle();

  if (updErr) {
    console.error(JSON.stringify({ level: "error", type: "force_mark_paid_update_failed", session_id: sessionId, order_id: existing.id, error: updErr.message || updErr, correlation_id: correlationId }));
    return res.status(500).json({ ok: false, error: "db_error" });
  }

  const updated = updatedRows || existing;
  const mergedEmail = updated.customer_email || payload.customer_email || existing.customer_email || null;

  console.log(JSON.stringify({ level: "info", type: "force_mark_paid", session_id: sessionId, order_id: existing.id, already_paid: false, correlation_id: correlationId }));

  return res.json({
    ok: true,
    order: {
      id: updated.id,
      status: updated.status || "paid",
      total_cents: Number.isFinite(updated.total_cents) ? updated.total_cents : null,
      currency: updated.currency || null,
      paid_at: updated.paid_at || payload.paid_at,
      created_at: updated.created_at,
      updated_at: updated.updated_at || payload.updated_at,
      stripe_session_id: updated.stripe_session_id || sessionId,
      stripe_payment_intent_id: updated.stripe_payment_intent_id || payload.stripe_payment_intent_id || null,
      customer_email_masked: maskEmail(mergedEmail),
    },
  });
});

app.get("/debug/mail", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).send("Not found");
  }

  const to = req.query.to;
  if (!to) {
    return res.status(400).json({ ok: false, error: "missing_to" });
  }

  const mailDebugInfo = { host: MAIL_HOST, port: mailPort, source: mailPortSource };

  try {
    await mailTransport.sendMail({
      from: MAIL_FROM,
      to,
      subject: "Test mail – Racines & Rituels",
      text: "Ceci est un email de test depuis /debug/mail.",
    });
    return res.json({ ok: true, ...mailDebugInfo });
  } catch (err) {
    console.error("[mail] debug send failed", err?.message || err);
    return res.status(500).json({ ok: false, error: err?.message || String(err), ...mailDebugInfo });
  }
});

app.get("/debug/orders/:id", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).send("Not found");
  }

  if (!supabase) {
    return res.status(500).json({ error: "supabase_not_configured" });
  }

  try {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, status, total_cents, currency, stripe_session_id, stripe_payment_intent_id, paid_at, customer_email, user_id, updated_at, created_at"
      )
      .eq("id", req.params.id)
      .maybeSingle();

    if (error) {
      console.error("[DEBUG] order lookup failed", error.message || error);
      return res.status(500).json({ error: "order_lookup_failed" });
    }

    if (!data) {
      return res.status(404).json({ error: "order_not_found" });
    }

    return res.json({ ok: true, order: data });
  } catch (err) {
    console.error("[DEBUG] unexpected order lookup error", err?.message || err);
    return res.status(500).json({ error: "unexpected_error" });
  }
});

app.get("/debug/checkout-ping", (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).send("Not found");
  }

  res.json({
    ok: true,
    siteUrl: SITE_URL,
    stripeKeyLoaded: Boolean(STRIPE_SECRET_KEY),
    supabaseConfigured: SUPABASE_CONFIGURED,
  });
});

app.get("/debug/product-sample", async (req, res) => {
  if (isProduction()) {
    return res.status(404).send("Not found");
  }

  try {
    const product = await fetchProductSample();
    console.log("[DEBUG] product sample:", product?.id || "null");
    return res.json({ ok: true, product });
  } catch (err) {
    const status = err?.httpStatus || 500;
    let errorPayload;

    if (err?.body?.error) {
      errorPayload = typeof err.body.error === "object" ? { ...err.body.error } : { message: err.body.error };
    } else if (typeof err?.body === "object") {
      errorPayload = { ...err.body };
    } else {
      errorPayload = { message: err?.message || "unexpected_error" };
    }

    if (!isProduction() && err?.stack) {
      errorPayload.stack = err.stack;
    }

    return res.status(status).json({ ok: false, error: errorPayload });
  }
});
if (!isProduction()) {
  console.log("[DEBUG] /debug/product-sample registered");
}

app.get("/debug/checkout-test", async (req, res) => {
  if (isProduction()) {
    return res.status(404).send("Not found");
  }

  const requestId = `dbg_${Date.now()}`;

  try {
    const product = await fetchProductSample();
    console.log("[DEBUG] product sample:", product.id);

    const { session } = await createCheckoutSessionInternal({
      itemsNormalized: [{ product_id: product.id, quantity: 1 }],
      requestId,
      correlationId: req.correlationId,
    });

    console.log("[DEBUG] checkout url:", session.url);

    return res.json({ ok: true, url: session.url, product_id: product.id, session_id: session.id });
  } catch (err) {
    const status = err?.httpStatus || 500;
    let errorPayload;

    if (err?.body?.error) {
      errorPayload = typeof err.body.error === "object" ? { ...err.body.error } : { message: err.body.error };
    } else if (typeof err?.body === "object") {
      errorPayload = { ...err.body };
    } else {
      errorPayload = { message: err?.message || "unexpected_error" };
    }

    if (!isProduction() && err?.stack) {
      errorPayload.stack = err.stack;
    }

    return res.status(status).json({ ok: false, error: errorPayload });
  }
});

app.get("/admin/orders", async (req, res) => {
  const isDev = process.env.NODE_ENV === "development";
  const token = req.headers["x-admin-token"];

  if (!isDev) {
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return res.status(403).json({ error: "forbidden" });
    }
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: "supabase_not_configured" });
  }

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id, status, total_cents, created_at, paid_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[admin] fetch orders failed", error.message || error);
    return res.status(500).json({ error: "orders_fetch_failed" });
  }

  return res.json({ orders: data || [] });
});

app.post("/create-checkout-session", async (req, res) => {
  const requestId = `chk_${Date.now()}`;
  const correlationId = req.correlationId || requestId;

  try {
    const contentType = req.headers["content-type"] || "";
    const bodyKeys = req.body ? Object.keys(req.body) : [];
    const rawBodyPreview = typeof req.body === "string" ? req.body.slice(0, 500) : null;

    console.log("[CHECKOUT] start", { requestId, correlationId, contentType, bodyKeys, rawBodyPreview });

    const rawItems = Array.isArray(req.body?.items)
      ? req.body.items
      : Array.isArray(req.body?.cart)
      ? req.body.cart
      : [];

    if (!rawItems.length) {
      return respondError(res, {
        status: 400,
        code: "invalid_payload",
        message: "items array is required",
        type: "invalid_payload",
        op: "checkout_validate",
        correlationId,
        requestId,
      });
    }

    const itemsNormalized = rawItems.map((it, idx) => {
      const str = (v) => (typeof v === "string" ? v.trim() : "");
      const uuidCandidate = [it.product_id_uuid, it.product_uuid, it.product_id, it.id].map(str).find((v) => isUuid(v));
      const slugCandidate = [it.product_slug, it.slug, it.product_id, it.id]
        .map(str)
        .find((v) => v && !isUuid(v) && v.length >= 2);

      const product_id_uuid = uuidCandidate || null;
      const product_slug = slugCandidate || null;

      return {
        product_id_uuid,
        product_slug,
        quantity: Number(it.quantity ?? it.qty ?? 0),
        _raw_index: idx,
      };
    });

    for (let idx = 0; idx < itemsNormalized.length; idx++) {
      const it = itemsNormalized[idx];
      const hasUuid = Boolean(it.product_id_uuid);
      const hasSlug = Boolean(it.product_slug);

      if (!hasUuid && !hasSlug) {
        return respondError(res, {
          status: 400,
          code: "invalid_payload",
          type: "invalid_payload",
          op: "checkout_normalize",
          message: "Use product_id_uuid or product_slug",
          correlationId,
          requestId,
        });
      }

      if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 99) {
        return respondError(res, {
          status: 400,
          code: "invalid_payload",
          type: "invalid_payload",
          op: "checkout_normalize",
          message: "quantity must be an integer between 1 and 99",
          correlationId,
          requestId,
        });
      }
    }

    const { session, orderId } = await createCheckoutSessionInternal({
      itemsNormalized,
      incomingOrderId: req.body?.order_id || null,
      userId: req.user?.id || req.body?.user_id || null,
      requestId,
      correlationId,
    });

    res.json({ url: session.url, order_id: orderId, session_id: session.id });
  } catch (err) {
    const status = err?.httpStatus || 500;
    const code =
      (typeof err?.body?.error === "string" && err.body.error) || err?.body?.code || err?.code || "checkout_failed";
    const message = err?.body?.message || err?.message || "Checkout failed";

    return respondError(res, {
      status,
      code,
      type: "checkout_error",
      op: "create_checkout_session",
      message,
      correlationId,
      requestId,
      error: err,
    });
  }
});

app.post("/print/dispatch", async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  if (PRINT_DISPATCH_SECRET && req.headers["x-print-secret"] !== PRINT_DISPATCH_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { data, error } = await supabase
    .from("print_jobs")
    .select("id, order_id, payload")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(5);

  if (error) {
    console.error("[PRINT] fetch queued jobs failed", error.message || error);
    return res.status(500).json({ error: "Cannot fetch print jobs" });
  }

  if (data && data.length) {
    const ids = data.map((j) => j.id);
    const { error: updErr } = await supabase
      .from("print_jobs")
      .update({ status: "processing", processed_at: nowIso() })
      .in("id", ids);
    if (updErr) {
      console.error("[PRINT] mark processing failed", updErr.message || updErr);
    }
  }

  res.json({ jobs: data || [] });
});

function startServer() {
  const server = app.listen(PORT, () => {
    console.log(`🚀 Backend running on http://127.0.0.1:${PORT}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[BOOT] Port ${PORT} already in use. Close the process or change PORT.`);
    } else {
      console.error("[BOOT] Server error", err?.message || err);
    }
    process.exit(1);
  });
}

// Global JSON 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "not_found", path: req.path });
});

startServer();

/*
=====================================================
TESTS - Webhook Stripe
=====================================================

1. SETUP LOCAL WEBHOOK FORWARDING
   --------------------------------
   Dans un terminal séparé, lancer Stripe CLI pour forward les webhooks:
   
   $ stripe listen --forward-to http://localhost:3000/webhook/stripe
   
   Copier le webhook signing secret (whsec_...) et le mettre dans server/.env:
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx

2. CRÉER UN CHECKOUT ET TESTER LE PAIEMENT
   -----------------------------------------
   # Créer une session de checkout
   $ curl -X POST http://localhost:3000/create-checkout-session \
     -H "Content-Type: application/json" \
     -d '{"items": [{"product_id": "<UUID_PRODUIT>", "quantity": 1}]}'
   
   # Résultat attendu: {"url": "https://checkout.stripe.com/...", "order_id": "...", "session_id": "cs_test_..."}
   
   # Ouvrir l'URL dans le navigateur et payer avec carte test:
   # - Numéro: 4242 4242 4242 4242
   # - Date: n'importe quelle date future
   # - CVC: n'importe quel 3 chiffres
   # - ZIP: n'importe quel code postal
   
   # Observer les logs dans le terminal où tourne le serveur:
   # [WEBHOOK] received checkout.session.completed id=evt_...
   # [WEBHOOK] order updated order_id=... session=cs_test_... status=paid

3. VÉRIFIER LA DB SUPABASE
   -------------------------
   # Dans Supabase SQL Editor:
   SELECT id, status, total_cents, customer_email, customer_id, paid_at, stripe_session_id 
   FROM orders 
   WHERE stripe_session_id = 'cs_test_...';
   
   # Résultat attendu:
   # - status = 'paid'
   # - customer_email = email saisi dans le checkout
   # - customer_id = UUID du customer (si table customers existe)
   # - paid_at = timestamp

4. TESTER WEBHOOK IDEMPOTENCE
   ---------------------------
   # Retrigger le même événement avec Stripe CLI:
   $ stripe trigger checkout.session.completed
   
   # Observer les logs:
   # [WEBHOOK] duplicate event id=evt_... (ne devrait pas traiter 2 fois)

5. TESTER SESSION EXPIRÉE
   ------------------------
   # Créer une session et attendre l'expiration (ou trigger manuellement):
   $ stripe trigger checkout.session.expired
   
   # Observer:
   # [WEBHOOK] received checkout.session.expired
   # [WEBHOOK] order marked as expired

6. DEBUG STRIPE SESSION
   ---------------------
   # Récupérer les détails d'une session Stripe:
   $ curl http://localhost:3000/debug/stripe-session/<SESSION_ID>
   
   # Résultat: JSON avec payment_status, amount_total, customer, etc.

7. TESTER PAIEMENT ÉCHOUÉ
   -----------------------
   # Utiliser une carte de test qui échoue:
   # - Numéro: 4000 0000 0000 0002 (card declined)
   
   # Observer:
   # [WEBHOOK] received payment_intent.payment_failed
   # [WEBHOOK] order marked as payment_failed

8. VÉRIFIER TABLE WEBHOOK_EVENTS
   ------------------------------
   SELECT id, type, status, created_at, processed_at 
   FROM webhook_events 
   ORDER BY created_at DESC 
   LIMIT 10;
   
   # Doit montrer tous les events reçus avec status = 'processed' ou 'error'

9. VÉRIFIER DÉCRÉMENTATION STOCK
   --------------------------------
   # Après paiement, vérifier:
   SELECT id, name, stock FROM products WHERE id = '<UUID_PRODUIT>';
   
   # Le stock doit avoir diminué de la quantité commandée
   
   SELECT * FROM inventory_movements WHERE product_id = '<UUID_PRODUIT>' ORDER BY created_at DESC LIMIT 5;
   # Doit montrer les mouvements de stock

10. LOGS EN PRODUCTION
    -------------------
    En production (NODE_ENV=production), les logs sont réduits.
    Seuls les événements importants sont loggés.
    Les logs détaillés sont désactivés pour éviter la fuite de données sensibles.

=====================================================
NOTES IMPORTANTES
=====================================================

- Le webhook DOIT recevoir le raw body (express.raw middleware)
- La signature est vérifiée avec STRIPE_WEBHOOK_SECRET
- Toujours répondre 200 même en cas d'erreur (sauf signature invalide = 400)
- L'idempotence est assurée par la table webhook_events (unique sur event.id)
- Les customer_email et customer_id sont mis à jour si disponibles
- Si table customers n'existe pas, seul customer_email est rempli
- Les fonctions post-paiement (stock, print_jobs, integration_events) ne bloquent pas
- En cas d'erreur DB, le webhook renvoie 200 pour éviter les retry infinis

*/
