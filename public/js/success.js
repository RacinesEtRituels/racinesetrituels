const statusWrap = document.getElementById("status");
const statusText = document.getElementById("status-text");
const messageEl = document.getElementById("message");
const details = document.getElementById("details");
const errorEl = document.getElementById("error");
const retryBtn = document.getElementById("retry");

const orderIdEl = document.getElementById("order-id");
const amountEl = document.getElementById("amount");
const emailEl = document.getElementById("email");
const orderStatusEl = document.getElementById("order-status");
const paymentStatusEl = document.getElementById("payment-status");
const paidAtEl = document.getElementById("paid-at");
const sessionIdEl = document.getElementById("session-id");

const backoffMs = [1000, 2000, 4000, 8000, 12000];
const isDev = window.location.hostname === "127.0.0.1";
const logDev = (...args) => {
  if (isDev) console.log("[success]", ...args);
};

const getCorrelationId = (res) => {
  if (!res || !res.headers || typeof res.headers.get !== "function") return null;
  return res.headers.get("x-correlation-id") || null;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let resolvedBackendUrl = null;
let lastCorrelationId = null;
const getBackendUrl = () => {
  if (resolvedBackendUrl) return resolvedBackendUrl;
  const candidate = window.__ENV__ && window.__ENV__.BACKEND_URL ? window.__ENV__.BACKEND_URL : null;
  if (!candidate) {
    const msg = "BACKEND_URL manquant dans config.js";
    console.error(msg);
    throw new Error(msg);
  }
  try {
    const parsed = new URL(candidate);
    resolvedBackendUrl = parsed.origin;
    return resolvedBackendUrl;
  } catch (_) {
    const msg = `BACKEND_URL invalide: ${candidate}`;
    console.error(msg);
    throw new Error(msg);
  }
};

const formatAmount = (cents, currency) => {
  if (!Number.isFinite(cents)) return "—";
  const cur = (currency || "EUR").toUpperCase();
  return `${(cents / 100).toFixed(2)} ${cur}`;
};

const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR");
};

const setStatus = (text, variant = "pending") => {
  statusText.textContent = text;
  statusWrap.querySelectorAll(".dot").forEach((n) => n.remove());
  if (variant !== "pending") {
    statusWrap.querySelectorAll(".loader").forEach((n) => n.remove());
  }

  const dot = document.createElement("span");
  dot.className = `dot ${variant}`;
  statusWrap.prepend(dot);
};

const clearError = () => {
  errorEl.style.display = "none";
  errorEl.textContent = "";
};

const showError = (msg, correlationId = null) => {
  const suffix = correlationId ? ` (corr=${correlationId})` : "";
  errorEl.textContent = `${msg}${suffix}`;
  errorEl.style.display = "block";
  setStatus("Une erreur est survenue", "error");
  messageEl.textContent = `${msg}${suffix}`;
};

const showDetails = (order, sessionIdParam) => {
  details.style.display = "block";
  orderIdEl.textContent = order?.id || "—";
  const cents = Number.isFinite(order?.total_cents) ? order.total_cents : null;
  amountEl.textContent = formatAmount(cents, order?.currency);
  emailEl.textContent = order?.customer_email_masked || "—";
  orderStatusEl.textContent = order?.status || "—";
  paymentStatusEl.textContent = order?.status || "—";
  paidAtEl.textContent = formatDate(order?.paid_at);
  const sessionId = order?.stripe_session_id || sessionIdParam || null;
  if (sessionIdEl && sessionId) {
    sessionIdEl.textContent = sessionId;
  }
};

const fetchOrder = async (sessionId, attempt) => {
  const backend = getBackendUrl();
  const url = `${backend}/public/order-by-session?session_id=${encodeURIComponent(sessionId)}`;
  logDev("[success] fetching", url, "attempt", attempt + 1);
  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (err) {
    const networkErr = new Error("Appel backend impossible (réseau ou CORS).");
    networkErr.cause = err;
    throw networkErr;
  }

  const correlationId = getCorrelationId(res);

  let payload = null;
  let parseError = null;
  try {
    payload = await res.json();
  } catch (err) {
    parseError = err;
  }

  if (parseError) {
    logDev("backend response non-JSON", { status: res.status, correlationId, error: parseError?.message });
    const err = new Error("Réponse non JSON du backend.");
    err.correlationId = correlationId;
    throw err;
  }

  const payloadCorrelation = payload?.correlation_id || null;
  const effectiveCorrelation = correlationId || payloadCorrelation || null;

  if (res.status === 404) return { notFound: true, correlationId: effectiveCorrelation };
  if (!res.ok) {
    const msg = (payload && (payload.message || payload.error)) || `Backend error ${res.status}`;
    const err = new Error(effectiveCorrelation ? `${msg} (corr=${effectiveCorrelation})` : msg);
    err.correlationId = effectiveCorrelation;
    throw err;
  }

  if (!payload || payload.ok !== true) {
    const msg = (payload && (payload.message || payload.error)) || "Réponse backend invalide (ok:false).";
    const err = new Error(effectiveCorrelation ? `${msg} (corr=${effectiveCorrelation})` : msg);
    err.correlationId = effectiveCorrelation;
    throw err;
  }

  if (!payload.order) {
    const msg = "Réponse backend invalide (order manquant).";
    const err = new Error(effectiveCorrelation ? `${msg} (corr=${effectiveCorrelation})` : msg);
    err.correlationId = effectiveCorrelation;
    throw err;
  }

  if (!payload.order.status || typeof payload.order.status !== "string") {
    const err = new Error("Réponse backend invalide (status manquant).");
    err.correlationId = effectiveCorrelation;
    throw err;
  }

  logDev("order payload", { correlationId: effectiveCorrelation, status: res.status, orderId: payload.order.id });

  return { order: payload.order, correlationId: effectiveCorrelation };
};

const run = async () => {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");
  clearError();
  retryBtn.style.display = "none";
  details.style.display = "none";
  messageEl.textContent = "Nous récupérons les informations Stripe et votre commande.";
  statusWrap.querySelectorAll(".loader").forEach((n) => n.remove());
  const loader = document.createElement("span");
  loader.className = "loader";
  statusWrap.prepend(loader);
  setStatus("Paiement en cours de validation...", "pending");

  if (sessionIdEl) sessionIdEl.textContent = sessionId || "—";

  if (!sessionId) {
    showError("Identifiant de session manquant.");
    return;
  }

  for (let attempt = 0; attempt < backoffMs.length; attempt++) {
    const attemptLabel = `${attempt + 1}/${backoffMs.length}`;
    setStatus(`Vérification de la commande (${attemptLabel})...`, "pending");
    try {
      const { order, notFound, correlationId } = await fetchOrder(sessionId, attempt);
      lastCorrelationId = correlationId;

      if (order) {
        showDetails(order, sessionId);
        if (order.status === "paid") {
          logDev("[success] order confirmed", { orderId: order.id, sessionId: order.stripe_session_id, correlationId });
          setStatus("Paiement confirmé", "success");
          messageEl.textContent = order.customer_email_masked
            ? "Merci pour votre commande. Un email de confirmation vous a été envoyé."
            : "Merci pour votre commande. Votre paiement est confirmé.";
          retryBtn.style.display = "none";
          try {
            localStorage.removeItem("rr_cart");
            window.dispatchEvent(new CustomEvent("rr-cart-updated", { detail: { subtotal: 0, total: 0, count: 0 } }));
          } catch (_) {}
          return;
        }

        setStatus("Paiement en cours de confirmation", "pending");
        messageEl.textContent = "Paiement en validation. Cela peut prendre quelques secondes.";
      } else if (notFound) {
        messageEl.textContent = "Commande introuvable pour l'instant. Nouvelle tentative...";
        if (correlationId) logDev("order not found", { correlationId });
      }
    } catch (err) {
      logDev("order fetch error", { error: err, correlationId: err?.correlationId });
      if (attempt === backoffMs.length - 1) {
        const msg = err?.message || "Impossible de récupérer la commande.";
        const normalized = msg.includes("order_not_found") ? "Commande introuvable." : msg;
        showError(normalized, err?.correlationId || lastCorrelationId || null);
        retryBtn.style.display = "inline-flex";
        return;
      }
    }

    if (attempt < backoffMs.length - 1) {
      await sleep(backoffMs[attempt]);
    }
  }

  setStatus("Paiement en cours", "pending");
  messageEl.textContent = "La commande est toujours en attente. Vous pouvez réessayer.";
  retryBtn.style.display = "inline-flex";
};

retryBtn.addEventListener("click", () => {
  run().catch((err) => {
    logDev("retry failed", err);
    showError(err?.message || "Échec du rafraîchissement.", err?.correlationId || lastCorrelationId || null);
  });
});

run().catch((err) => {
  logDev("fatal", err);
  showError(err?.message || "Une erreur est survenue.", err?.correlationId || lastCorrelationId || null);
});
