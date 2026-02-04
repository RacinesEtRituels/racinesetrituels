# Patch Webhook Stripe - 2026-01-08

## Résumé

Patch minimal et ciblé appliqué sur `server/server.js` pour corriger les bugs critiques du traitement des webhooks Stripe :

1. ✅ Suppression du fallback `SUPABASE_ANON_KEY` côté serveur
2. ✅ Correction de `markOrderPaid()` - suppression de la référence à variable `data` inexistante
3. ✅ Ajout de `recordWebhookEventStatus(eventId, "processed")` en cas de succès
4. ✅ Refactorisation complète de `handleStripeWebhook()` - suppression du double traitement
5. ✅ Dispatch unique sur `webhookHandlers` avec logs structurés JSON
6. ✅ Gestion des erreurs sans renvoyer 500 (toujours 200 pour éviter retries infinis)

**Lignes modifiées : 3 sections principales (≈200 lignes refactorisées)**

---

## 🔧 MODIFICATION 1 : Config Supabase (ligne 63)

### ❌ BEFORE

```javascript
const supabaseKey =
  ENV.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
```

**Problème** : Fallback dangereux sur `SUPABASE_ANON_KEY` côté serveur. Le serveur doit UNIQUEMENT utiliser la clé service_role pour avoir les permissions d'écriture sur `orders`, `webhook_events`, etc.

### ✅ AFTER

```javascript
const supabaseKey = ENV.SUPABASE_SERVICE_ROLE_KEY;
```

**Impact** :

- Le serveur nécessite maintenant explicitement `SUPABASE_SERVICE_ROLE_KEY`
- Si la clé manque, `SUPABASE_CONFIGURED` sera `false` et les webhooks/checkout loggueront clairement l'erreur
- Alignement avec les bonnes pratiques de sécurité

---

## 🔧 MODIFICATION 2 : markOrderPaid() (lignes 1162-1215)

### ❌ BEFORE

```javascript
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
    }),
  );
  await recordWebhookEventStatus(eventId, "error", updateResult.error);
  return {
    status: "error",
    error: updateResult.error,
    recorded: true,
    httpStatus: 200,
  };
}

if (!data || data.length === 0) {
  // ❌ BUG: 'data' n'existe pas !
  console.log("[DB] order already paid or not updatable", {
    order_id: orderId,
  });
  return { status: "ok", alreadyPaid: true };
}

console.log("[DB] order updated", {
  order_id: orderId,
  session_id: session.id,
});

// Post-payment hooks (non bloquants)
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
  console.error("[WEBHOOK] post-payment hooks TODO", err?.message || err);
}

return { status: "ok" };
```

**Problèmes** :

- Référence à `data` inexistante (ligne 1177) → crash potentiel
- Pas d'enregistrement de succès dans `webhook_events`
- Les hooks post-payment s'exécutent même si l'order n'est pas vraiment passé à `paid`

### ✅ AFTER

```javascript
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
    }),
  );
  await recordWebhookEventStatus(eventId, "error", updateResult.error);
  return {
    status: "error",
    error: updateResult.error,
    recorded: true,
    httpStatus: 200,
  };
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
  status: updateResult.status,
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
      error: err?.message || err,
    });
  }
}

return { status: "ok" };
```

**Corrections** :

- ✅ Suppression de la référence à `data` inexistante
- ✅ Utilisation de `updateResult.alreadyPaid` (retourné par `updateOrderPaid()`)
- ✅ Ajout de `recordWebhookEventStatus(eventId, "processed")` en cas de succès
- ✅ Les hooks post-payment ne s'exécutent que si `updateResult.status === "paid"`
- ✅ Logs plus clairs et structurés

---

## 🔧 MODIFICATION 3 : handleStripeWebhook() (lignes 1462-1568)

### ❌ BEFORE (≈300 lignes de code redondant)

```javascript
const eventId = event?.id || "unknown";

console.log(
  JSON.stringify({
    level: "info",
    type: "webhook_event_received",
    request_id: requestId,
    event_id: eventId,
    event_type: event.type,
  }),
);

const ignoreEvents = new Set([
  "charge.updated",
  "charge.succeeded",
  "payment_intent.created",
  "price.created",
  "product.created",
]);

const allowEvents = new Set([
  "checkout.session.completed",
  "payment_intent.succeeded",
]);

if (ignoreEvents.has(event.type)) {
  console.log(
    JSON.stringify({
      level: "info",
      type: "webhook_event_ignored",
      event_type: event.type,
      event_id: event.id,
      request_id: requestId,
    }),
  );
  return res.json({ received: true, ignored: true });
}

if (!allowEvents.has(event.type)) {
  console.log(
    JSON.stringify({
      level: "info",
      type: "webhook_event_ignored",
      event_type: event.type,
      event_id: event.id,
      request_id: requestId,
    }),
  );
  return res.json({ received: true, ignored: true });
}

if (event.type === "payment_intent.succeeded") {
  await handlePaymentIntentSucceeded(event.data?.object || {});
  return res.json({ received: true });
}

const session = event.data?.object || {};
const sessionId = session.id;
const paymentIntentId = session.payment_intent || null;
const amountTotal = Number.isFinite(session.amount_total)
  ? Number(session.amount_total)
  : null;
const currency = session.currency || null;
const customerEmailRaw =
  session.customer_details?.email || session.customer_email || null;
const normalizedEmail =
  typeof customerEmailRaw === "string" && customerEmailRaw.trim()
    ? customerEmailRaw.trim()
    : null;
const maskedEmail = maskEmail(normalizedEmail);

if (!supabaseAdmin) {
  console.error(
    JSON.stringify({
      level: "error",
      type: "webhook_config_error",
      request_id: requestId,
    }),
  );
  return res.json({ received: true, error: "supabase_service_role_missing" });
}

try {
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from("orders")
    .select(
      "id, status, stripe_payment_intent_id, stripe_session_id, paid_at, total_cents, currency, customer_email, receipt_email_sent_at, receipt_email_status",
    )
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  // ... 150+ lignes de logique de mise à jour redondante avec markOrderPaid ...

  return res.json({ received: true });
} catch (err) {
  console.error(
    JSON.stringify({
      level: "error",
      type: "webhook_internal_error",
      request_id: requestId,
      event_id: eventId,
      session_id: sessionId,
      error: err?.message || err,
    }),
  );
  return res.json({ received: true, error: "webhook_internal_error" });
}
```

**Problèmes** :

- 🔴 Double traitement : `webhookHandlers` définis mais pas utilisés + gros bloc supabaseAdmin qui refait tout
- 🔴 Logique redondante avec `markOrderPaid()` (2 chemins pour mettre à jour le même order)
- 🔴 Code non maintenable (300 lignes dans le handler)
- 🔴 `allowEvents` trop restrictif → beaucoup d'événements ne passent jamais dans les handlers
- 🔴 Pas de logs clairs sur pourquoi un événement est ignoré

### ✅ AFTER (≈100 lignes, architecture propre)

```javascript
const eventId = event?.id || "unknown";

console.log(
  JSON.stringify({
    level: "info",
    type: "webhook_event_received",
    request_id: requestId,
    event_id: eventId,
    event_type: event.type,
  }),
);

// Événements ignorés (trop verbeux, pas d'action nécessaire)
const ignoreEvents = new Set([
  "charge.updated",
  "charge.succeeded",
  "payment_intent.created",
  "price.created",
  "product.created",
]);

if (ignoreEvents.has(event.type)) {
  console.log(
    JSON.stringify({
      level: "info",
      type: "webhook_event_ignored",
      event_type: event.type,
      event_id: eventId,
      request_id: requestId,
      reason: "ignored_event_type",
    }),
  );
  return res.json({ received: true, ignored: true });
}

// Vérifier si on a un handler pour cet événement
const handler = webhookHandlers[event.type];

if (!handler) {
  console.log(
    JSON.stringify({
      level: "info",
      type: "webhook_event_ignored",
      event_type: event.type,
      event_id: eventId,
      request_id: requestId,
      reason: "no_handler",
    }),
  );
  return res.json({ received: true, ignored: true });
}

// Vérifier que Supabase est configuré
if (!supabase) {
  console.error(
    JSON.stringify({
      level: "error",
      type: "webhook_handler_skipped",
      event_type: event.type,
      event_id: eventId,
      request_id: requestId,
      reason: "supabase_not_configured",
    }),
  );
  return res.json({ received: true, error: "supabase_not_configured" });
}

// Appeler le handler
try {
  const dataObject = event.data?.object || {};
  await handler(dataObject, event);

  console.log(
    JSON.stringify({
      level: "info",
      type: "webhook_handler_success",
      event_type: event.type,
      event_id: eventId,
      request_id: requestId,
    }),
  );

  return res.json({ received: true });
} catch (err) {
  console.error(
    JSON.stringify({
      level: "error",
      type: "webhook_handler_failed",
      event_type: event.type,
      event_id: eventId,
      request_id: requestId,
      error: err?.message || String(err),
      stack: EXPOSE_STACKS ? err?.stack : undefined,
    }),
  );

  // Enregistrer l'erreur dans webhook_events si possible
  try {
    await recordWebhookEventStatus(
      eventId,
      "error",
      err?.message || "handler_failed",
    );
  } catch (recordErr) {
    console.error("[WEBHOOK] failed to record error status", {
      error: recordErr?.message || recordErr,
    });
  }

  // Toujours renvoyer 200 pour éviter les retries infinis de Stripe
  return res.json({ received: true, error: "handler_failed" });
}
```

**Améliorations** :

- ✅ Architecture propre : dispatch unique sur `webhookHandlers`
- ✅ Suppression du code redondant (250 lignes supprimées)
- ✅ Tous les événements définis dans `webhookHandlers` sont maintenant routés correctement :
  - `checkout.session.completed` → `handleCheckoutSessionCompleted()` → `markOrderPaid()`
  - `checkout.session.async_payment_succeeded` → `handleCheckoutSessionAsyncPaymentSucceeded()` → `markOrderPaid()`
  - `checkout.session.expired` → `handleCheckoutSessionExpired()`
  - `payment_intent.payment_failed` → `handlePaymentIntentFailed()`
  - `payment_intent.succeeded` → `handlePaymentIntentSucceeded()` (informatif)
  - `invoice.paid` → `handleInvoicePaid()`
  - `customer.subscription.*` → `handleSubscriptionEvent()`
- ✅ Logs structurés JSON avec `reason` explicite
- ✅ Gestion des erreurs : toujours 200, pas de retry infini
- ✅ Tentative d'enregistrement dans `webhook_events` même en cas d'erreur

---

## 📊 Événements webhook routés

| Événement Stripe                           | Handler                                      | Action                                                     |
| ------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------- |
| `checkout.session.completed`               | `handleCheckoutSessionCompleted`             | Marque l'order `paid`, décrémente stock, enqueue print job |
| `checkout.session.async_payment_succeeded` | `handleCheckoutSessionAsyncPaymentSucceeded` | Marque l'order `paid` (paiements asynchrones)              |
| `checkout.session.expired`                 | `handleCheckoutSessionExpired`               | Marque l'order `expired`                                   |
| `payment_intent.succeeded`                 | `handlePaymentIntentSucceeded`               | Log informatif (pas d'action DB)                           |
| `payment_intent.payment_failed`            | `handlePaymentIntentFailed`                  | Marque l'order `payment_failed`                            |
| `invoice.paid`                             | `handleInvoicePaid`                          | Upsert subscription                                        |
| `customer.subscription.created`            | `handleSubscriptionEvent`                    | Sync subscription                                          |
| `customer.subscription.updated`            | `handleSubscriptionEvent`                    | Sync subscription                                          |
| `customer.subscription.deleted`            | `handleSubscriptionEvent`                    | Sync subscription                                          |
| `charge.updated`, `charge.succeeded`, etc. | _(ignoré)_                                   | Événements trop verbeux                                    |
| Autres événements                          | _(ignoré)_                                   | Pas de handler défini                                      |

---

## 🧪 Tests manuels recommandés

### 1. Test checkout complet

```bash
# Terminal 1: Server
cd server && npm start

# Terminal 2: Webhook listener
stripe listen --forward-to http://127.0.0.1:3000/webhook/stripe

# Terminal 3: Test checkout
curl -X POST http://127.0.0.1:3000/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{"items":[{"product_id":"<UUID_PRODUCT>","quantity":1}]}'

# Dans le navigateur:
# - Ouvrir l'URL session retournée
# - Payer avec carte 4242 4242 4242 4242
# - Vérifier que le webhook checkout.session.completed est reçu
# - Vérifier dans les logs: "webhook_handler_success"

# Vérifier l'order:
curl "http://127.0.0.1:3000/public/order-by-session?session_id=<SESSION_ID>"
# Attendu: {"order": {"status": "paid", ...}}
```

### 2. Test webhook duplicate (idempotence)

```bash
# Déclencher 2 fois le même événement
stripe trigger checkout.session.completed
stripe trigger checkout.session.completed

# Dans les logs, vérifier:
# 1er appel: "webhook_handler_success", order mis à jour
# 2ème appel: "order already paid", alreadyPaid: true
```

### 3. Test webhook sans Supabase

```bash
# Arrêter Supabase
docker stop $(docker ps -q --filter name=supabase)

# Déclencher webhook
stripe trigger checkout.session.completed

# Dans les logs, vérifier:
# "webhook_handler_skipped", reason: "supabase_not_configured"
```

### 4. Vérifier table webhook_events

```sql
-- Dans Supabase Studio ou psql
SELECT id, type, status, error, processed_at
FROM webhook_events
ORDER BY created_at DESC
LIMIT 10;

-- Attendu: status='processed' pour les webhooks réussis
```

---

## ⚠️ Points d'attention

### Configuration requise

- `SUPABASE_SERVICE_ROLE_KEY` est maintenant **obligatoire** (plus de fallback)
- Sans cette clé, le serveur démarre mais les webhooks/checkout retournent des erreurs explicites

### Migration table webhook_events

Si la table `webhook_events` n'existe pas encore, créer :

```sql
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);
```

### Comportement idempotent

- La fonction `recordWebhookEventStatus()` utilise `UPDATE ... WHERE id = eventId`
- Si l'`eventId` n'existe pas dans `webhook_events`, aucune erreur (update silencieux)
- Pour une idempotence complète, ajouter un `INSERT` initial dans le webhook (optionnel)

### Logs structurés

Tous les logs webhook utilisent maintenant `JSON.stringify()` avec :

- `level`: "info" | "error"
- `type`: "webhook_event_received" | "webhook_handler_success" | "webhook_handler_failed" | etc.
- `request_id`: correlation ID unique
- `event_id`: ID Stripe de l'événement
- `event_type`: Type d'événement Stripe

---

## 📝 Compatibilité

### API publique (INCHANGÉE)

- ✅ `POST /create-checkout-session` : identique
- ✅ `GET /public/order-by-session` : identique
- ✅ `POST /webhook/stripe`, `/webhooks/stripe`, `/webhook` : identiques

### Signature Stripe (PRÉSERVÉE)

- ✅ Vérification via `STRIPE_WEBHOOK_SECRET` conservée
- ✅ Raw body parsing avec `bodyParser.raw()` conservé
- ✅ Fallback `DEV_ALLOW_UNVERIFIED_WEBHOOKS` conservé (dev uniquement)

---

## 🎯 Résultat attendu

Après ce patch, le flux de paiement doit fonctionner de manière fiable :

1. **Checkout** : `POST /create-checkout-session` → Stripe session créée, order `pending` dans DB
2. **Paiement** : Utilisateur paie avec carte test → Stripe déclenche webhook
3. **Webhook** : `checkout.session.completed` → `handleStripeWebhook()` → `handleCheckoutSessionCompleted()` → `markOrderPaid()` → order `paid`, stock décrémenté, print job enqueued
4. **Vérification** : `GET /public/order-by-session` → `{"order": {"status": "paid"}}`

Logs attendus :

```json
{"level":"info","type":"webhook_event_received","event_type":"checkout.session.completed","event_id":"evt_..."}
{"level":"info","type":"webhook_handler_success","event_type":"checkout.session.completed"}
[WEBHOOK] order updated successfully {"order_id":"...","status":"paid"}
```

---

## 🔄 Rollback (si nécessaire)

Si ce patch cause des problèmes, rollback via git :

```bash
git checkout HEAD -- server/server.js
npm restart
```

Ou appliquer le patch inverse en restaurant les 3 sections modifiées.

---

**Date du patch** : 2026-01-08  
**Fichier** : `server/server.js`  
**Lignes modifiées** : ≈200 lignes (3 sections)  
**Tests** : Manuel (à effectuer après déploiement)
