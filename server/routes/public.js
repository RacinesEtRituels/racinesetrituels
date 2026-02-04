import { Router } from "express";

const RATE_LIMIT_WINDOW_MS_DEFAULT = 60_000;
const RATE_LIMIT_MAX_DEFAULT = 60;
const rateBuckets = new Map(); // key: ip, value: array of timestamps

const maskEmail = (email) => {
  if (!email || typeof email !== "string") return null;
  const [user, domain] = email.split("@");
  if (!domain || !user) return null;
  const maskedUser = user.length <= 2 ? `${user[0] || "*"}*` : `${user[0]}***${user.slice(-1)}`;
  return `${maskedUser}@${domain}`;
};

const allowRate = (ip, windowMs, max) => {
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || [];
  const recent = bucket.filter((t) => now - t < windowMs);
  recent.push(now);
  rateBuckets.set(ip, recent);
  return recent.length <= max;
};

export function createPublicRouter({ supabaseAdmin, rateLimitWindowMs, rateLimitMax }) {
  const router = Router();

  router.get("/order-by-session", async (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || "unknown";
    const windowMs = Number.isFinite(rateLimitWindowMs) && rateLimitWindowMs > 0 ? rateLimitWindowMs : RATE_LIMIT_WINDOW_MS_DEFAULT;
    const maxReq = Number.isFinite(rateLimitMax) && rateLimitMax > 0 ? rateLimitMax : RATE_LIMIT_MAX_DEFAULT;
    if (!allowRate(ip, windowMs, maxReq)) {
      return res.status(429).json({ ok: false, error: "rate_limited" });
    }

    const sessionId = (req.query.session_id || "").toString().trim();

    if (!sessionId) {
      return res
        .status(400)
        .json({ ok: false, error: "missing_session_id", message: "Query param session_id is required" });
    }

    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId) || sessionId.length > 255) {
      return res.status(400).json({ ok: false, error: "invalid_session_id" });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ ok: false, error: "config_error", message: "missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
    }

    try {
      const { data, error } = await supabaseAdmin
        .from("orders")
        .select(
          "id,status,stripe_session_id,stripe_payment_intent_id,paid_at,updated_at,created_at,total_cents,currency,customer_email,email,amount_total"
        )
        .eq("stripe_session_id", sessionId)
        .limit(1)
        .maybeSingle();

      console.log("[success] order-by-session", {
        session_id: sessionId,
        found: Boolean(data),
        status: data?.status || null,
        correlation_id: req.correlationId || null,
      });

      if (error) {
        console.error("[success] order lookup failed", error.message || error);
        return res.status(500).json({ ok: false, error: "db_error", message: error.message || "db_error" });
      }

      if (!data) {
        return res.status(404).json({ ok: false, error: "order_not_found", session_id: sessionId });
      }

      const cents = Number.isFinite(data?.total_cents)
        ? data.total_cents
        : Number.isFinite(data?.amount_total)
        ? data.amount_total
        : null;

      const order = {
        id: data.id,
        status: data.status,
        stripe_session_id: data.stripe_session_id,
        stripe_payment_intent_id: data.stripe_payment_intent_id,
        paid_at: data.paid_at,
        updated_at: data.updated_at,
        created_at: data.created_at,
        amount_total: cents,
        currency: data.currency || null,
        customer_email_masked: maskEmail(data.customer_email || data.email || null),
      };

      return res.json({ ok: true, order });
    } catch (err) {
      console.error("[success] order lookup failed", err?.message || err);
      return res.status(500).json({ ok: false, error: "db_error", message: err?.message || "db_error" });
    }
  });

  return router;
}
