import express from "express";
import cors from "cors";
import Stripe from "stripe";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import path from "path";
import nodemailer from "nodemailer";
import crypto from "crypto";

// --- CONFIGURATION ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env.local from project root first (dev priority — never committed)
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
// Fallback: server/.env for secrets absent from .env.local (STRIPE, SERVICE_ROLE)
dotenv.config({ path: path.join(__dirname, '.env') });

// Startup guard — fail fast if required secrets are absent or still placeholder
const _PLACEHOLDER = /REMPLACER|À_REMPLIR/i;
for (const _v of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) {
  if (!process.env[_v] || _PLACEHOLDER.test(process.env[_v])) {
    console.error(`❌ Variable manquante ou non configurée : ${_v}`);
    console.error('   → vérifier .env.local (projet) ou server/.env');
    process.exit(1);
  }
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const mailer = nodemailer.createTransport({
  host: process.env.MAIL_HOST || "127.0.0.1",
  port: process.env.MAIL_PORT || 54325,
  secure: false
});

const app = express();

// --- ROUTE WEBHOOK (isolée, avant tout middleware global) ---
// express.raw() fournit req.body comme Buffer brut, sans aucune interférence
app.post("/webhook/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  console.log('\n=== 🕵️‍♂️ DEBUG WEBHOOK ===');
  console.log('1. Secret .env lu ? :', process.env.STRIPE_WEBHOOK_SECRET ? 'OUI (' + process.env.STRIPE_WEBHOOK_SECRET.substring(0, 15) + '...)' : '❌ NON ! VIDE !');
  console.log('2. Signature reçue ? :', sig ? 'OUI' : '❌ NON !');
  console.log('3. Corps Brut (body buffer) présent ? :', Buffer.isBuffer(req.body));
  console.log('==========================\n');
  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET.trim());

    if (event.type === "checkout.session.completed") {
      await processOrderSuccess(event.data.object);
    }
    res.json({ received: true });
  } catch (err) {
    console.error(`❌ Webhook Signature Error: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// CORS — whitelist known origins only
const allowedOrigins = new Set([
  process.env.SITE_URL,
  'https://racinesetrituels.vercel.app',
  'http://127.0.0.1:8000',
  'http://localhost:8000',
  `http://localhost:${process.env.PORT || 3000}`,
].filter(Boolean));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.has(origin)) return cb(null, true);
    cb(new Error(`CORS: origine non autorisée : ${origin}`));
  },
}));

// Admin auth middleware — validates X-Admin-Secret header against ADMIN_SECRET env var
const requireAdmin = (req, res, next) => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(503).json({ error: 'ADMIN_SECRET non configuré côté serveur.' });
  if (req.headers['x-admin-secret'] !== secret) {
    return res.status(401).json({ error: 'Non autorisé.' });
  }
  next();
};

app.use(express.json());

// --- FICHIERS STATIQUES (frontend) ---
const frontendPath = path.join(__dirname, '..');

// --- ROUTES HTML (URLs propres → /pages/) ---
// Déclarées AVANT express.static pour prendre priorité sur les originaux à la racine
[
  'index', 'boutique', 'produits', 'abonnements', 'hibiscus-blanc', 'hibiscus-rouge',
  'panier', 'checkout', 'success', 'cancel', 'profil', 'connexion', 'inscription',
  'assistantIA', 'conseil', 'confreinimotPass', 'recupmotdepass', 'admin', 'khamare'
].forEach(p => {
  app.get(`/${p}.html`, (req, res) => {
    res.sendFile(path.join(frontendPath, 'pages', `${p}.html`));
  });
});
app.get('/déconnexion.html', (req, res) => {
  res.sendFile(path.join(frontendPath, 'pages', 'déconnexion.html'));
});

// SEO technical files served from root URLs
app.get('/robots.txt', (req, res) => res.sendFile(path.join(frontendPath, 'public', 'robots.txt')));
app.get('/sitemap.xml', (req, res) => res.sendFile(path.join(frontendPath, 'public', 'sitemap.xml')));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(frontendPath, 'public', 'manifest.json')));
app.get('/favicon.png', (req, res) => res.sendFile(path.join(frontendPath, 'public', 'favicon.png')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(frontendPath, 'public', 'favicon.png')));

// Dynamic config.js — injects real env vars (overrides static file)
app.get('/public/js/config.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`window.__ENV__ = ${JSON.stringify({
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    BACKEND_URL: process.env.BACKEND_URL || '',
  })};`);
});

app.use(express.static(frontendPath));
// Route racine → pages/index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'pages', 'index.html'));
});

// --- LOGIQUE MÉTIER ---
const now = () => new Date().toISOString();
// activity_id et channel_id requis NOT NULL dans orders
const ACTIVITY_ID = process.env.SUPABASE_ACTIVITY_ID || "23823b14-7ed5-4ce2-a35d-87d1715ac95a";
const CHANNEL_ID  = process.env.SUPABASE_CHANNEL_ID  || "a96d625a-a933-444d-a560-1f6671137028";

const isSubscriptionProduct = (product) => product?.type === "subscription";
const subscriptionBillingCycle = (product) => (
  /annuel|annual|year/i.test(product?.name || "") ? "annual" : "monthly"
);
const stripeRecurringInterval = (product) => (
  subscriptionBillingCycle(product) === "annual" ? "year" : "month"
);

async function findOrCreateCustomerFromSession(session) {
  const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;
  const email = session.customer_details?.email || null;
  const fullName = session.customer_details?.name || null;
  if (!stripeCustomerId && !email) return null;

  const customerUpdates = {
    ...(stripeCustomerId ? { stripe_customer_id: stripeCustomerId } : {}),
    ...(email ? { email } : {}),
    ...(fullName ? { full_name: fullName } : {}),
    stage: "client",
    is_active: true,
  };

  if (stripeCustomerId) {
    const { data: stripeCustomer, error: stripeReadError } = await supabase
      .from("customers")
      .select("id")
      .eq("activity_id", ACTIVITY_ID)
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();

    if (stripeReadError) throw new Error(`Erreur lecture client Stripe : ${stripeReadError.message}`);
    if (stripeCustomer) {
      const { error: updateError } = await supabase
        .from("customers")
        .update(customerUpdates)
        .eq("id", stripeCustomer.id);
      if (updateError) throw new Error(`Erreur mise à jour client Stripe : ${updateError.message}`);
      return stripeCustomer;
    }
  }

  if (!email) return null;

  const { data: existingCustomers, error: readError } = await supabase
    .from("customers")
    .select("id, stage, is_active, created_at")
    .eq("activity_id", ACTIVITY_ID)
    .eq("email", email)
    .order("created_at", { ascending: true })
    .limit(20);

  if (readError) throw new Error(`Erreur lecture client : ${readError.message}`);
  const existingCustomer = (existingCustomers || []).sort((a, b) => {
    const rank = (customer) => (
      (customer.is_active ? 0 : 10) +
      ({ client: 0, prospect: 1, inactive: 2 }[customer.stage] ?? 3)
    );
    return rank(a) - rank(b);
  })[0];

  if (existingCustomer) {
    const { error: updateError } = await supabase
      .from("customers")
      .update(customerUpdates)
      .eq("id", existingCustomer.id);
    if (updateError) throw new Error(`Erreur mise à jour client : ${updateError.message}`);
    return existingCustomer;
  }

  const { data: createdCustomer, error: insertError } = await supabase
    .from("customers")
    .insert({
      activity_id: ACTIVITY_ID,
      source: "stripe",
      full_name: session.customer_details?.name || null,
      email,
      type: "individual",
      stage: "client",
      is_active: true,
      ...(stripeCustomerId ? { stripe_customer_id: stripeCustomerId } : {}),
    })
    .select("id")
    .single();

  if (insertError) throw new Error(`Erreur création client : ${insertError.message}`);
  return createdCustomer;
}

async function persistSubscriptionsForOrder(session, orderId, orderItems) {
  const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : null;
  if (!stripeSubscriptionId) {
    console.warn("⚠️ Session abonnement sans stripe_subscription_id — subscription Core non créée.");
    return;
  }

  const customer = await findOrCreateCustomerFromSession(session);
  if (!customer) {
    console.warn("⚠️ Session abonnement sans email client — subscription Core non créée.");
    return;
  }

  await supabase.from("orders").update({
    customer_id: customer.id,
    stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
  }).eq("id", orderId);

  for (const item of orderItems.filter((i) => isSubscriptionProduct(i.products))) {
    const product = item.products;
    const billingCycle = subscriptionBillingCycle(product);
    const { data: existingSubscription, error: readError } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .eq("product_id", item.product_id)
      .maybeSingle();

    if (readError) throw new Error(`Erreur lecture abonnement : ${readError.message}`);
    if (existingSubscription) continue;

    const { error: insertError } = await supabase.from("subscriptions").insert({
      customer_id: customer.id,
      product_id: item.product_id,
      status: "active",
      frequency: billingCycle,
      billing_cycle: billingCycle,
      price_cents: item.unit_sale_price_ttc_cents,
      stripe_subscription_id: stripeSubscriptionId,
      notes: JSON.stringify({
        order_id: orderId,
        stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
        customer_email: session.customer_details?.email || null,
      }),
    });

    if (insertError) throw new Error(`Erreur création abonnement : ${insertError.message}`);
  }
}

async function processOrderSuccess(session) {
  console.log('--- 🚀 DÉBUT PROCESS ORDER SUCCESS ---');
  if (!session.client_reference_id || !session.metadata?.order_id || !session.payment_intent) {
    console.log('Session webhook incomplète — récupération Stripe API :', session.id);
    session = await stripe.checkout.sessions.retrieve(session.id);
  }
  const orderId = session.client_reference_id || session.metadata?.order_id;
  console.log('ID de commande trouvé par Stripe :', orderId);
  if (!orderId) {
    console.log('❌ ERREUR : Aucun orderId trouvé dans la session Stripe.');
    return;
  }

  try {
    const { data: existingOrder, error: readError } = await supabase
      .from("orders")
      .select("id,payment_status")
      .eq("id", orderId)
      .maybeSingle();

    if (readError) throw new Error(`Erreur lecture commande : ${readError.message}`);
    if (!existingOrder) {
      console.error(`❌ Commande introuvable pour Stripe session ${session.id}`);
      return;
    }

    if (existingOrder.payment_status === "paid") {
      await supabase.from("orders").update({
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
        stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
      }).eq("id", orderId);
      console.log('ℹ️ Commande déjà payée — effets secondaires ignorés.');
      return;
    }

    // 1. Mise à jour statut + adresse de livraison
    console.log('Mise à jour de la commande en paid dans Supabase...');
    const shipping = session.shipping_details || session.collected_information?.shipping_details;
    const shippingFields = shipping ? {
      shipping_name: shipping.name || null,
      shipping_address1: shipping.address?.line1 || null,
      shipping_address2: shipping.address?.line2 || null,
      shipping_postcode: shipping.address?.postal_code || null,
      shipping_city: shipping.address?.city || null,
      shipping_country: shipping.address?.country || null,
    } : {};
    const { data: paidOrder, error: updateError } = await supabase.from("orders").update({
        status: "paid",
        payment_status: "paid",
        fulfillment_status: "pending",
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
        stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
        ...shippingFields,
        notes: JSON.stringify({
          customer_email: session.customer_details?.email,
          paid_at: now(),
        }),
      })
      .eq("id", orderId)
      .neq("payment_status", "paid")
      .select("id")
      .maybeSingle();
    if (updateError) throw new Error(`Erreur Supabase Update : ${updateError.message}`);
    if (!paidOrder) {
      console.log('ℹ️ Commande déjà payée par un webhook concurrent — effets secondaires ignorés.');
      return;
    }
    console.log('✅ Commande passée en PAID avec succès.');

    const customer = await findOrCreateCustomerFromSession(session);
    if (customer) {
      const { error: customerUpdateError } = await supabase.from("orders").update({
        customer_id: customer.id,
        stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
      }).eq("id", orderId);
      if (customerUpdateError) throw new Error(`Erreur liaison client commande : ${customerUpdateError.message}`);
      console.log('✅ Client Core lié à la commande.');
    }

    const { data: orderItemsForEffects, error: effectsItemsError } = await supabase
      .from("order_items")
      .select("product_id, qty, unit_sale_price_ttc_cents, products(id, name, type)")
      .eq("order_id", orderId);
    if (effectsItemsError) throw new Error(`Erreur lecture articles commande : ${effectsItemsError.message}`);

    const hasPhysicalItems = (orderItemsForEffects || []).some((item) => !isSubscriptionProduct(item.products));
    const hasSubscriptionItems = (orderItemsForEffects || []).some((item) => isSubscriptionProduct(item.products));

    if (hasPhysicalItems) {
      console.log('Décrémentation du stock...');
      const { error: rpcError } = await supabase.rpc("decrement_stock_for_order", { order_id: orderId });
      if (rpcError) console.error('❌ Erreur RPC decrement_stock_for_order :', rpcError.message);
      else console.log('✅ Stock décrémenté avec succès.');
    } else {
      console.log('ℹ️ Commande abonnement — décrémentation stock ignorée.');
    }

    if (hasSubscriptionItems) {
      await persistSubscriptionsForOrder(session, orderId, orderItemsForEffects || []);
      console.log('✅ Abonnement Core synchronisé.');
    }

    // 3. File d'attente Impression — table print_jobs absente en production, étape ignorée
    console.log('ℹ️ print_jobs non disponible en production — ignoré.');

    // 4. Email de confirmation
    const customerEmail = session.customer_details?.email;
    const customerName = session.customer_details?.name || "Client";
    if (customerEmail) {
      try {
        console.log('Récupération des articles de la commande...');
        const { data: orderItems, error: itemsError } = await supabase
          .from("order_items")
          .select("qty, unit_sale_price_ttc_cents, products(name)")
          .eq("order_id", orderId);

        if (itemsError) console.error('❌ Erreur récupération order_items :', itemsError.message);

        const items = orderItems || [];
        const totalCents = items.reduce((sum, i) => sum + i.unit_sale_price_ttc_cents * i.qty, 0);
        const fmt = (cents) => (cents / 100).toFixed(2).replace('.', ',') + ' €';

        const itemsText = items.map(i =>
          `  • ${i.products?.name || 'Produit'} × ${i.qty}  →  ${fmt(i.unit_sale_price_ttc_cents * i.qty)}`
        ).join('\n');

        const itemsHtml = items.map(i => `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #1a1a1a;">${i.products?.name || 'Produit'}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #1a1a1a;text-align:center;">${i.qty}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #1a1a1a;text-align:right;">${fmt(i.unit_sale_price_ttc_cents)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #1a1a1a;text-align:right;font-weight:700;">${fmt(i.unit_sale_price_ttc_cents * i.qty)}</td>
          </tr>`).join('');

        const textBody = `Bonjour ${customerName},

Merci pour votre commande ! Nous avons bien reçu votre paiement.

─────────────────────────────
RÉCAPITULATIF — Commande #${orderId}
─────────────────────────────
${itemsText || '  (détail non disponible)'}

TOTAL : ${fmt(totalCents)}
─────────────────────────────

Vous recevrez vos produits très prochainement.

L'équipe Racines & Rituels`;

        const htmlBody = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;color:#e0e0e0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#111;border-top:4px solid #ff5500;">
        <!-- Header -->
        <tr>
          <td style="padding:36px 40px 24px;text-align:center;border-bottom:1px solid #1a1a1a;">
            <div style="font-family:Georgia,serif;font-size:22px;font-weight:700;letter-spacing:2px;color:#fff;text-transform:uppercase;">Racines &amp; Rituels</div>
            <div style="margin-top:6px;font-size:13px;color:#888;letter-spacing:1px;">Cosmétiques naturels</div>
          </td>
        </tr>
        <!-- Confirmation message -->
        <tr>
          <td style="padding:32px 40px 20px;">
            <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#fff;">Merci, ${customerName} !</p>
            <p style="margin:0;font-size:15px;color:#aaa;line-height:1.6;">Votre commande a bien été reçue et votre paiement confirmé. Nous préparons votre colis avec soin.</p>
          </td>
        </tr>
        <!-- Order summary -->
        <tr>
          <td style="padding:0 40px 28px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#ff5500;text-transform:uppercase;margin-bottom:14px;">Récapitulatif de commande #${orderId}</div>
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
              <thead>
                <tr style="background:#1a1a1a;">
                  <th style="padding:10px 12px;text-align:left;color:#888;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Produit</th>
                  <th style="padding:10px 12px;text-align:center;color:#888;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Qté</th>
                  <th style="padding:10px 12px;text-align:right;color:#888;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Prix unit.</th>
                  <th style="padding:10px 12px;text-align:right;color:#888;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Sous-total</th>
                </tr>
              </thead>
              <tbody style="color:#ddd;">
                ${itemsHtml || '<tr><td colspan="4" style="padding:12px;color:#666;">Détail non disponible</td></tr>'}
              </tbody>
              <tfoot>
                <tr style="background:#1a1a1a;">
                  <td colspan="3" style="padding:14px 12px;text-align:right;font-weight:700;color:#fff;font-size:15px;text-transform:uppercase;letter-spacing:1px;">Total</td>
                  <td style="padding:14px 12px;text-align:right;font-weight:700;color:#ff5500;font-size:18px;">${fmt(totalCents)}</td>
                </tr>
              </tfoot>
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #1a1a1a;text-align:center;">
            <p style="margin:0;font-size:13px;color:#555;line-height:1.6;">Des questions ? Contactez-nous à <a href="mailto:contact@racinesetrituels.fr" style="color:#ff5500;text-decoration:none;">contact@racinesetrituels.fr</a></p>
            <p style="margin:12px 0 0;font-size:12px;color:#333;">© ${new Date().getFullYear()} Racines &amp; Rituels — Tous droits réservés</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

        console.log(`Envoi email de confirmation à ${customerEmail}...`);
        await mailer.sendMail({
          from: process.env.MAIL_FROM || 'no-reply@racinesetrituels.local',
          to: customerEmail,
          subject: `✅ Confirmation de commande #${orderId} — Racines & Rituels`,
          text: textBody,
          html: htmlBody,
        });
        console.log('✅ Email de confirmation envoyé.');
      } catch (mailErr) {
        console.error('❌ Erreur envoi email (non bloquant) :', mailErr.message);
      }
    } else {
      console.warn('⚠️ Pas d\'email client — email de confirmation non envoyé.');
    }
  } catch (err) {
    console.error('❌ CRASH DANS PROCESS ORDER SUCCESS :', err.message);
  }
}



// --- ROUTES STANDARDS ---
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Panier vide ou invalide." });
    }

    console.log('[checkout] req.body:', JSON.stringify(req.body));
    const resolvedProducts = [];
    for (const item of items) {
      console.log('[checkout] item reçu:', JSON.stringify(item));
      const qty = Number(item.quantity ?? 1);
      if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
        return res.status(400).json({ error: "Quantité invalide (1–99)." });
      }

      let product = null;
      if (item.product_slug) {
        console.log(`[checkout] recherche Supabase par slug: "${item.product_slug}"`);
        const { data, error } = await supabase.from("products")
          .select("id,name,price_cents,type,stock,stripe_price_id")
          .eq("slug", item.product_slug).eq("is_active", true).maybeSingle();
        if (error) console.error(`[checkout] erreur Supabase (slug="${item.product_slug}"):`, error.message, error.code);
        console.log(`[checkout] résultat Supabase:`, data ? `trouvé id=${data.id}` : 'null');
        product = data;
      } else if (item.product_id) {
        console.log(`[checkout] pas de slug, recherche Supabase par id: "${item.product_id}"`);
        const { data, error } = await supabase.from("products")
          .select("id,name,price_cents,type,stock,stripe_price_id")
          .eq("id", item.product_id).eq("is_active", true).maybeSingle();
        if (error) console.error(`[checkout] erreur Supabase (id="${item.product_id}"):`, error.message, error.code);
        console.log(`[checkout] résultat Supabase:`, data ? `trouvé slug=${data.slug || '(sans slug)'}` : 'null');
        product = data;
      } else {
        console.warn(`[checkout] item sans product_slug ni product_id:`, JSON.stringify(item));
      }
      if (!product) {
        return res.status(400).json({
          error: `Produit introuvable : ${item.product_slug || item.product_id || '(inconnu)'}`,
          correlation_id: crypto.randomUUID(),
        });
      }
      resolvedProducts.push({ product, qty });
    }

    const hasSubscriptionItems = resolvedProducts.some(({ product }) => isSubscriptionProduct(product));
    const hasPhysicalItems = resolvedProducts.some(({ product }) => !isSubscriptionProduct(product));
    if (hasSubscriptionItems && hasPhysicalItems) {
      return res.status(400).json({
        error: "Panier mixte abonnement + produit physique non supporté pour le moment.",
        correlation_id: crypto.randomUUID(),
      });
    }

    for (const { product, qty } of resolvedProducts.filter(({ product }) => !isSubscriptionProduct(product))) {
      const stock = Number(product.stock ?? 0);
      if (stock < qty) {
        return res.status(400).json({
          error: `Stock insuffisant pour ${product.name}. Disponible : ${stock}.`,
          correlation_id: crypto.randomUUID(),
        });
      }
    }

    const totalCents = resolvedProducts.reduce((sum, { product, qty }) => sum + product.price_cents * qty, 0);
    const checkoutMode = hasSubscriptionItems ? "subscription" : "payment";

    const { data: order, error: orderError } = await supabase.from("orders").insert({
      activity_id: ACTIVITY_ID,
      channel_id: CHANNEL_ID,
      status: "pending",
      payment_status: "pending",
      fulfillment_status: "pending",
      total_ttc_cents: totalCents,
    }).select().single();
    if (orderError) throw new Error(`Erreur création commande : ${orderError.message}`);

    const { error: itemsError } = await supabase.from("order_items").insert(
      resolvedProducts.map(({ product, qty }) => ({
        order_id: order.id,
        product_id: product.id,
        qty: qty,
        unit_sale_price_ttc_cents: product.price_cents,
      }))
    );
    if (itemsError) throw new Error(`Erreur création articles commande : ${itemsError.message}`);

    const session = await stripe.checkout.sessions.create({
      mode: checkoutMode,
      line_items: resolvedProducts.map(({ product, qty }) => ({
        price_data: {
          currency: "eur",
          unit_amount: product.price_cents,
          product_data: {
            name: product.name,
          },
          ...(isSubscriptionProduct(product) ? {
            recurring: { interval: stripeRecurringInterval(product) },
          } : {}),
        },
        quantity: qty,
      })),
      client_reference_id: order.id,
      metadata: { order_id: order.id },
      ...(checkoutMode === "payment" ? { customer_creation: "always" } : {}),
      shipping_address_collection: { allowed_countries: ['FR', 'BE', 'CH', 'LU', 'DE'] },
      success_url: `${process.env.SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL}/cancel.html`,
    });

    const { error: sessionUpdateError } = await supabase.from("orders").update({
      stripe_checkout_session_id: session.id,
    }).eq("id", order.id);
    if (sessionUpdateError) throw new Error(`Erreur stockage session Stripe : ${sessionUpdateError.message}`);

    res.json({ url: session.url, order_id: order.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/public/order-by-session", async (req, res) => {
  try {
    const sessionId = req.query.session_id;
    if (!sessionId) return res.json({ ok: false, order: null });
    // stripe_session_id absent en prod → on récupère l'order.id via Stripe (client_reference_id)
    const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
    const orderId = stripeSession.client_reference_id;
    if (!orderId) return res.json({ ok: false, order: null });
    const { data } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
    res.json({ ok: true, order: data });
  } catch (err) {
    console.error('[order-by-session] erreur :', err.message);
    res.json({ ok: false, order: null, error: err.message });
  }
});

app.get("/admin/orders", requireAdmin, async (req, res) => {
  const { data } = await supabase
    .from("orders")
    .select("*, order_items(qty, unit_sale_price_ttc_cents, products(name, slug))")
    .order("created_at", { ascending: false })
    .limit(100);
  res.json({ orders: data });
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend Racines & Rituels opérationnel sur port ${PORT}`));
