import express from "express";
import cors from "cors";
import Stripe from "stripe";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import path from "path";
import crypto from "crypto";
import { sendTestEmail, orderConfirmationHtml, subscriptionConfirmationHtml, EmailService } from "./emails/index.js";
import { buildOrderConfirmationData, buildSubscriptionConfirmationData, buildOrderNotificationData } from "./emails/order-email.js";
import { insertEmailLog } from "./emails/log.js";
import { renderInvoice } from "./documents/invoice.js";
import { renderPreparationSlip } from "./documents/preparation-slip.js";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createAvisRouter } from "./avis.js";
import { requireAffiliateManagerWith, supabaseActivityAccess } from "./affiliate-auth.js";
import { createOrderProcessor, SHIPPING_LINE_NAME } from "./order-processing.js";

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

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// --- ROUTE WEBHOOK (isolée, avant tout middleware global) ---
// express.raw() fournit req.body comme Buffer brut, sans aucune interférence
app.post("/webhook/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  if (process.env.NODE_ENV !== 'production') {
    console.log('\n=== DEBUG WEBHOOK ===');
    console.log('1. Secret configuré :', !!process.env.STRIPE_WEBHOOK_SECRET);
    console.log('2. Signature reçue :', !!sig);
    console.log('3. Buffer présent :', Buffer.isBuffer(req.body));
    console.log('=====================\n');
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET.trim());
  } catch (err) {
    console.error(`❌ Webhook Signature Error: ${err.message}`);
    return res.status(400).send("Webhook Error: signature invalide.");
  }
  try {
    // Les paiements différés sont confirmés par async_payment_succeeded ; processOrderSuccess
    // ne prépare jamais une session dont le paiement n'est pas encore reçu.
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      await processOrderSuccess(event.data.object);
    } else if (event.type === "checkout.session.async_payment_failed") {
      await recordAsyncPaymentFailure(event.data.object);
    }
    res.json({ received: true });
  } catch (err) {
    // 500 : Stripe relivre l'événement ; les étapes déjà faites ne sont pas refaites.
    console.error(`❌ Webhook ${event.type} ${event.id} non terminé : ${err.message}`);
    res.status(500).json({ error: "Traitement incomplet, nouvelle tentative attendue." });
  }
});

// --- SEO : DOMAINE CANONIQUE — une seule version doit répondre en 200 ---
// racinesetrituels.vercel.app et l'apex non-www redirigent en 301 vers www.racinesetrituels.com
const CANONICAL_HOST = 'www.racinesetrituels.com';
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.hostname && req.hostname !== CANONICAL_HOST) {
      return res.redirect(301, `https://${CANONICAL_HOST}${req.originalUrl}`);
    }
    next();
  });
}

// CORS — whitelist known origins only
const allowedOrigins = new Set([
  process.env.SITE_URL,
  'https://racinesetrituels.com',
  'https://www.racinesetrituels.com',
  'https://racinesetrituels.vercel.app',
  'http://127.0.0.1:8000',
  'http://localhost:8000',
  'http://127.0.0.1:3000',
  `http://localhost:${process.env.PORT || 3000}`,
  // Pilotage360 (gestion des codes influenceurs)
  'https://jarvis.racinesetrituels.com',
  'https://pilotage360.vercel.app',
  'http://localhost:5173',
].filter(Boolean));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.has(origin)) return cb(null, true);
    cb(new Error(`CORS: origine non autorisée : ${origin}`));
  },
}));

// --- SÉCURITÉ : HEADERS HTTP ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "https://esm.sh"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "https://*.supabase.co", "wss://*.supabase.co"],
      frameAncestors: ["'none'"],
      baseUri:    ["'self'"],
      formAction: ["'self'"],
    },
  },
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 63072000, includeSubDomains: true, preload: true }
    : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});

// Admin auth middleware — validates X-Admin-Secret header against ADMIN_SECRET env var
const requireAdmin = (req, res, next) => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(503).json({ error: 'ADMIN_SECRET non configuré côté serveur.' });
  if (req.headers['x-admin-secret'] !== secret) {
    return res.status(401).json({ error: 'Non autorisé.' });
  }
  next();
};

// Gestion des influenceurs : mot de passe admin du site, OU session Pilotage360
// (Bearer JWT Supabase). La base décide avec le jeton de l'appelant : administrateur
// ou membre de l'activité Racines & Rituels, avec second facteur si son profil l'exige.
const requireAffiliateManager = requireAffiliateManagerWith({
  adminSecret: process.env.ADMIN_SECRET,
  checkAccess: (token) => supabaseActivityAccess({
    createClient,
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    activityId: ACTIVITY_ID,
    getUser: (jwt) => supabase.auth.getUser(jwt),
  })(token),
});

app.use(express.json());

// --- SÉCURITÉ : RATE LIMITING ---
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Merci de réessayer dans quelques minutes.' },
});
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Merci de réessayer dans quelques minutes.' },
});
app.use('/api/admin', adminLimiter);
app.use('/api', apiLimiter);
app.use('/create-checkout-session', apiLimiter);

// Sources d'arrivée des visiteurs (Google, ChatGPT…) : compteur agrégé, sans identifiant.
const SOURCES_VISITE = ['google', 'bing', 'chatgpt', 'perplexity', 'claude', 'copilot', 'duckduckgo', 'autre_moteur', 'autre_site'];
const ROBOTS = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit/i;
const visiteLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

app.post('/api/visite', visiteLimiter, async (req, res) => {
  const { source, page } = req.body || {};
  if (!SOURCES_VISITE.includes(source) || typeof page !== 'string' || !page.startsWith('/')) return res.status(400).end();
  if (ROBOTS.test(req.get('user-agent') || '')) return res.status(204).end();
  const { error } = await supabase.rpc('site_visite_incrementer', {
    p_site: 'racinesetrituels',
    p_source: source,
    p_page: page.split(/[?#]/)[0].slice(0, 200),
  });
  if (error) console.error('[visite] compteur :', error.message);
  res.status(204).end();
});

// --- FICHIERS STATIQUES (frontend) ---
const frontendPath = path.join(__dirname, '..');

// Cache : le CDN Vercel garde pages et fichiers jusqu'au prochain déploiement (qui purge
// son cache), sans rappeler la fonction à chaque visite. Le navigateur, lui, revérifie
// régulièrement car les noms de fichiers ne sont pas versionnés. Désactivé en développement.
const IS_PROD = process.env.NODE_ENV === 'production';
const CDN_ONE_YEAR = 's-maxage=31536000, stale-while-revalidate=86400';
const CACHE = {
  page:  `public, max-age=0, ${CDN_ONE_YEAR}`,
  asset: `public, max-age=3600, ${CDN_ONE_YEAR}`,
  image: `public, max-age=604800, ${CDN_ONE_YEAR}`,
};
const cacheFor = (filePath) =>
  /\.html$/i.test(filePath) ? CACHE.page
  : /\.(jpe?g|png|webp|avif|svg|ico)$/i.test(filePath) ? CACHE.image
  : CACHE.asset;
const sendCached = (res, filePath) => {
  if (IS_PROD) res.setHeader('Cache-Control', cacheFor(filePath));
  res.sendFile(filePath);
};
const staticOptions = IS_PROD
  ? { cacheControl: false, setHeaders: (res, filePath) => res.setHeader('Cache-Control', cacheFor(filePath)) }
  : {};

// --- ROUTES HTML (URLs propres → /pages/) ---
// Déclarées AVANT express.static pour prendre priorité sur les originaux à la racine
[
  'index', 'boutique', 'hibiscus-blanc', 'hibiscus-rouge',
  'panier', 'checkout', 'success', 'cancel', 'profil', 'connexion', 'inscription',
  'assistantIA', 'conseil', 'confreinimotPass', 'recupmotdepass', 'admin', 'khamare',
  'notre-histoire',
  'admin-email-test',
  'admin-email-preview',
  'admin-email-logs',
  'admin-affiliation',
  'mentions-legales',
  'confidentialite',
  'cgv',
  'cookies',
  'retractation-retours',
  'mediateur-consommation',
  'contact',
  'avis',
].forEach(p => {
  app.get(`/${p}.html`, (req, res) => {
    sendCached(res, path.join(frontendPath, 'pages', `${p}.html`));
  });
});

// Les redirections gardent les paramètres (ex. ?utm_source=chatgpt.com) pour le suivi des sources.
const avecParametres = (req, cible) => {
  const i = req.originalUrl.indexOf('?');
  return i === -1 ? cible : cible + req.originalUrl.slice(i);
};

// Abonnements masqués pour le lancement (vente simple d'abord) — retirer cette route
// et remettre 'abonnements' dans le tableau ci-dessus pour réactiver la page.
app.get('/abonnements.html', (req, res) => {
  res.redirect(302, avecParametres(req, '/boutique.html'));
});

// produits.html supprimée (contenu dupliqué avec khamare.html) — redirection permanente
app.get('/produits.html', (req, res) => {
  res.redirect(301, avecParametres(req, '/khamare.html'));
});
app.get('/pages/produits.html', (req, res) => {
  res.redirect(301, avecParametres(req, '/khamare.html'));
});
app.get('/déconnexion.html', (req, res) => {
  sendCached(res, path.join(frontendPath, 'pages', 'déconnexion.html'));
});

// SEO technical files served from root URLs
app.get('/robots.txt', (req, res) => sendCached(res, path.join(frontendPath, 'public', 'robots.txt')));
app.get('/sitemap.xml', (req, res) => sendCached(res, path.join(frontendPath, 'public', 'sitemap.xml')));
app.get('/manifest.json', (req, res) => sendCached(res, path.join(frontendPath, 'public', 'manifest.json')));
app.get('/favicon.png', (req, res) => sendCached(res, path.join(frontendPath, 'public', 'favicon.png')));
app.get('/favicon.ico', (req, res) => sendCached(res, path.join(frontendPath, 'public', 'favicon.png')));

// Dynamic config.js — injects real env vars (overrides static file)
// Les variables ne changent qu'avec un redéploiement, qui purge le cache CDN.
app.get('/public/js/config.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', IS_PROD ? CACHE.page : 'no-store');
  res.send(`window.__ENV__ = ${JSON.stringify({
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    BACKEND_URL: process.env.BACKEND_URL || '',
  })};`);
});

// Seuls les dossiers utilisés par le site sont publics (le code serveur ne doit pas l'être)
app.use('/public', express.static(path.join(frontendPath, 'public'), staticOptions));
app.use('/components', express.static(path.join(frontendPath, 'components'), staticOptions));
// Route racine → pages/index.html
app.get('/', (req, res) => {
  sendCached(res, path.join(frontendPath, 'pages', 'index.html'));
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

// --- AFFILIATION INFLUENCEURS ---
const AFFILIATE_CODE_RE = /^[A-Z0-9_-]{3,30}$/;

async function findActiveAffiliateByCode(code) {
  if (!AFFILIATE_CODE_RE.test(code)) return null;
  const { data, error } = await supabase
    .from("affiliates")
    .select("id, code, commission_rate, discount_percent, stripe_promotion_code_id")
    .eq("activity_id", ACTIVITY_ID)
    .ilike("code", code)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`Erreur lecture code influenceur : ${error.message}`);
  return data?.stripe_promotion_code_id ? data : null;
}

// --- FRAIS DE LIVRAISON ---
// Le client choisit son pays dans le panier ; Stripe n'accepte ensuite qu'une adresse de ce pays.
// Abonnements : la livraison est facturée à chaque envoi (12 envois pour un abonnement annuel).
const SHIPPING_ZONES = {
  FR: { countries: ["FR"], rateCents: 590, freeFromCents: 4000, label: "Livraison France" },
  EU: { countries: ["BE", "LU", "DE", "CH"], rateCents: 990, freeFromCents: null, label: "Livraison Europe" },
};

// Destinataires de l'email interne « Nouvelle commande » (surchargeable : ORDER_NOTIFICATION_EMAILS="a@x,b@y")
const ORDER_NOTIFICATION_DEFAULT = "commandes@racinesetrituels.com";

function shippingZoneFor(country) {
  return Object.values(SHIPPING_ZONES).find((zone) => zone.countries.includes(country)) || null;
}

// Montant de livraison pour un envoi, selon le montant produits de cet envoi (après réduction)
function shippingCentsFor(zone, perShipmentCents) {
  if (zone.freeFromCents != null && perShipmentCents >= zone.freeFromCents) return 0;
  return zone.rateCents;
}

const { processOrderSuccess, recordAsyncPaymentFailure } = createOrderProcessor({
  supabase, stripe, EmailService, insertEmailLog, activityId: ACTIVITY_ID,
  notificationRecipients: (process.env.ORDER_NOTIFICATION_EMAILS || ORDER_NOTIFICATION_DEFAULT)
    .split(",").map((s) => s.trim()).filter(Boolean),
  isSubscriptionProduct, subscriptionBillingCycle,
  buildOrderConfirmationData, buildSubscriptionConfirmationData, buildOrderNotificationData,
});

// --- ROUTES STANDARDS ---
// Avis clients (demande par email, dépôt, lecture des avis publiés)
app.use('/api/avis', createAvisRouter({ supabase, activityId: ACTIVITY_ID, siteUrl: process.env.SITE_URL || 'https://www.racinesetrituels.com' }));

app.post("/create-checkout-session", async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Panier vide ou invalide." });
    }

    const shippingCountry = typeof req.body.shipping_country === "string" ? req.body.shipping_country.toUpperCase() : "FR";
    const shippingZone = shippingZoneFor(shippingCountry);
    if (!shippingZone) {
      return res.status(400).json({ error: "Pays de livraison non desservi." });
    }

    // Source d'arrivée (Google, ChatGPT…), transmise seulement si le client a accepté la mesure d'audience
    const sourceAcquisition = SOURCES_VISITE.includes(req.body.source_acquisition) ? req.body.source_acquisition : null;

    // Code influenceur saisi dans le panier ou mémorisé via lien ?ref=CODE
    const promoCode = typeof req.body.promo_code === "string" ? req.body.promo_code.trim().toUpperCase() : "";
    let affiliate = null;
    if (promoCode) {
      affiliate = await findActiveAffiliateByCode(promoCode);
      if (!affiliate) {
        return res.status(400).json({ error: `Le code « ${promoCode} » n'est pas valide.`, invalid_promo_code: true });
      }
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
          .eq("slug", item.product_slug).eq("is_active", true).eq("activity_id", ACTIVITY_ID).maybeSingle();
        if (error) console.error(`[checkout] erreur Supabase (slug="${item.product_slug}"):`, error.message, error.code);
        console.log(`[checkout] résultat Supabase:`, data ? `trouvé id=${data.id}` : 'null');
        product = data;
      } else if (item.product_id) {
        console.log(`[checkout] pas de slug, recherche Supabase par id: "${item.product_id}"`);
        const { data, error } = await supabase.from("products")
          .select("id,name,price_cents,type,stock,stripe_price_id")
          .eq("id", item.product_id).eq("is_active", true).eq("activity_id", ACTIVITY_ID).maybeSingle();
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

    // Livraison offerte au-delà du seuil, calculé après réduction du code influenceur
    let shippingCents;
    let subscriptionShippingLine = null;
    if (checkoutMode === "payment") {
      const discountCents = affiliate ? Math.round(totalCents * Number(affiliate.discount_percent) / 100) : 0;
      shippingCents = shippingCentsFor(shippingZone, totalCents - discountCents);
    } else {
      const subscription = resolvedProducts.find(({ product }) => isSubscriptionProduct(product)).product;
      const shipmentsPerPeriod = stripeRecurringInterval(subscription) === "year" ? 12 : 1;
      const perShipmentCents = Math.round(totalCents / shipmentsPerPeriod);
      shippingCents = shippingCentsFor(shippingZone, perShipmentCents) * shipmentsPerPeriod;
      if (shippingCents > 0) {
        subscriptionShippingLine = {
          price_data: {
            currency: "eur",
            unit_amount: shippingCents,
            product_data: { name: SHIPPING_LINE_NAME },
            recurring: { interval: stripeRecurringInterval(subscription) },
          },
          quantity: 1,
        };
      }
    }

    const { data: order, error: orderError } = await supabase.from("orders").insert({
      activity_id: ACTIVITY_ID,
      channel_id: CHANNEL_ID,
      status: "pending",
      payment_status: "pending",
      fulfillment_status: "pending",
      total_ttc_cents: totalCents,
      ...(affiliate ? { affiliate_id: affiliate.id, promo_code: affiliate.code } : {}),
      ...(sourceAcquisition ? { source_acquisition: sourceAcquisition } : {}),
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
      line_items: [
        ...resolvedProducts.map(({ product, qty }) => ({
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
        ...(subscriptionShippingLine ? [subscriptionShippingLine] : []),
      ],
      // shipping_options n'existe qu'en mode paiement ; les abonnements ont une ligne « Livraison »
      ...(checkoutMode === "payment" ? {
        shipping_options: [{
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: shippingCents, currency: "eur" },
            display_name: shippingCents === 0 ? `${shippingZone.label} offerte` : shippingZone.label,
          },
        }],
      } : {}),
      client_reference_id: order.id,
      metadata: { order_id: order.id },
      // Code connu → appliqué d'office ; sinon le client peut le saisir sur la page Stripe
      ...(affiliate
        ? { discounts: [{ promotion_code: affiliate.stripe_promotion_code_id }] }
        : { allow_promotion_codes: true }),
      ...(checkoutMode === "payment" ? { customer_creation: "always" } : {}),
      // Seul le pays choisi dans le panier est accepté, pour que le tarif corresponde à l'adresse
      shipping_address_collection: { allowed_countries: [shippingCountry] },
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
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'missing_session_id', status: 400, correlation_id: crypto.randomUUID() });
    }
    // Reject obviously invalid session IDs before hitting Stripe API
    if (!sessionId.startsWith('cs_')) {
      return res.status(400).json({ ok: false, error: 'invalid_session_id', status: 400, correlation_id: crypto.randomUUID() });
    }
    // stripe_session_id absent en prod → on récupère l'order.id via Stripe (client_reference_id)
    const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
    const orderId = stripeSession.client_reference_id;
    if (!orderId) return res.json({ ok: false, order: null });
    const { data } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
    res.json({ ok: true, order: data });
  } catch (err) {
    console.error('[order-by-session] erreur :', err.message);
    // Stripe throws for invalid/nonexistent session IDs
    if (err.message?.includes('No such checkout.session') || err.statusCode === 404) {
      return res.status(400).json({ ok: false, error: 'invalid_session_id', status: 400, correlation_id: crypto.randomUUID() });
    }
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

// --- ADMIN : INFLUENCEURS / AFFILIATION ---
app.get(['/api/admin/affiliates', '/api/affiliates'], requireAffiliateManager, async (req, res) => {
  try {
    const [{ data: affiliates, error: affError }, { data: commissions, error: comError }] = await Promise.all([
      supabase.from('affiliates').select('*').eq('activity_id', ACTIVITY_ID).order('created_at', { ascending: false }),
      supabase.from('affiliate_commissions')
        .select('id, affiliate_id, order_id, base_cents, commission_rate, commission_cents, status, paid_at, created_at, orders(order_number)')
        .order('created_at', { ascending: false })
        .limit(500),
    ]);
    if (affError) throw new Error(affError.message);
    if (comError) throw new Error(comError.message);
    res.json({ affiliates: affiliates || [], commissions: commissions || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/admin/affiliates', '/api/affiliates'], requireAffiliateManager, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const code = String(req.body.code || '').trim().toUpperCase();
    const commissionRate = Number(req.body.commission_percent ?? 10) / 100;
    const discountPercent = Number(req.body.discount_percent ?? 10);
    if (!name) return res.status(400).json({ error: 'Nom obligatoire.' });
    if (!AFFILIATE_CODE_RE.test(code)) {
      return res.status(400).json({ error: 'Code invalide : 3 à 30 caractères, lettres, chiffres, - ou _.' });
    }
    if (!(commissionRate >= 0 && commissionRate <= 0.5)) return res.status(400).json({ error: 'Commission entre 0 et 50 %.' });
    if (!(discountPercent > 0 && discountPercent <= 50)) return res.status(400).json({ error: 'Réduction entre 1 et 50 %.' });

    const { data: existing } = await supabase.from('affiliates').select('id').ilike('code', code).maybeSingle();
    if (existing) return res.status(409).json({ error: `Le code ${code} existe déjà.` });

    // duration "once" : pour un abonnement, la réduction ne s'applique qu'au 1er paiement
    const coupon = await stripe.coupons.create({
      percent_off: discountPercent,
      duration: 'once',
      name: `Influenceur ${name} -${discountPercent}%`,
      metadata: { type: 'affiliate', affiliate_code: code },
    });
    const promotionCode = await stripe.promotionCodes.create({
      coupon: coupon.id,
      code,
      metadata: { type: 'affiliate' },
    });

    const { data: affiliate, error } = await supabase.from('affiliates').insert({
      activity_id: ACTIVITY_ID,
      name,
      email: String(req.body.email || '').trim() || null,
      instagram: String(req.body.instagram || '').trim() || null,
      code,
      commission_rate: commissionRate,
      discount_percent: discountPercent,
      stripe_coupon_id: coupon.id,
      stripe_promotion_code_id: promotionCode.id,
      notes: String(req.body.notes || '').trim() || null,
    }).select().single();
    if (error) {
      await stripe.promotionCodes.update(promotionCode.id, { active: false }).catch(() => {});
      throw new Error(error.message);
    }
    res.json({ affiliate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch(['/api/admin/affiliates/:id', '/api/affiliates/:id'], requireAffiliateManager, async (req, res) => {
  try {
    const { data: affiliate, error: readError } = await supabase
      .from('affiliates').select('*').eq('id', req.params.id).eq('activity_id', ACTIVITY_ID).maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!affiliate) return res.status(404).json({ error: 'Influenceur introuvable.' });

    const updates = { updated_at: now() };
    if (req.body.commission_percent !== undefined) {
      const rate = Number(req.body.commission_percent) / 100;
      if (!(rate >= 0 && rate <= 0.5)) return res.status(400).json({ error: 'Commission entre 0 et 50 %.' });
      updates.commission_rate = rate;
    }
    if (typeof req.body.is_active === 'boolean') {
      if (affiliate.stripe_promotion_code_id) {
        await stripe.promotionCodes.update(affiliate.stripe_promotion_code_id, { active: req.body.is_active });
      }
      updates.is_active = req.body.is_active;
    }
    const { data, error } = await supabase.from('affiliates').update(updates).eq('id', affiliate.id).select().single();
    if (error) throw new Error(error.message);
    res.json({ affiliate: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Passe des commissions en "payée" (après virement) ou "annulée" (retour / remboursement)
app.post('/api/admin/affiliate-commissions/status', requireAdmin, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter((id) => typeof id === 'string') : [];
    const status = req.body.status;
    if (!ids.length) return res.status(400).json({ error: 'Aucune commission sélectionnée.' });
    if (!['paid', 'cancelled', 'pending'].includes(status)) return res.status(400).json({ error: 'Statut invalide.' });
    const { data, error } = await supabase.from('affiliate_commissions')
      .update({ status, paid_at: status === 'paid' ? now() : null })
      .in('id', ids)
      .select('id');
    if (error) throw new Error(error.message);
    res.json({ updated: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Interface admin temporaire — logs emails envoyés via Resend.
// ATTENTION : route réservée aux environnements de développement ou si
// ADMIN_EMAIL_LOGS_ENABLED=true est explicitement défini en production.
// Ne pas exposer publiquement sans cette garde.
app.get('/api/admin/email-logs', requireAdmin, async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.ADMIN_EMAIL_LOGS_ENABLED !== 'true') {
    return res.status(403).json({
      error: 'Interface désactivée en production. Définir ADMIN_EMAIL_LOGS_ENABLED=true pour l\'activer.',
    });
  }

  try {
    const { data, error } = await supabase
      .from('email_logs')
      .select('id, created_at, template, recipient, status, provider, provider_message_id, error_message, order_id, customer_id, metadata')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);
    res.json({ logs: data || [] });
  } catch (err) {
    console.error('[email-logs] ❌', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- DOCUMENTS COMMANDES (facture + bon de préparation) ---

app.get('/admin/orders/:orderId/invoice', requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        id, order_number, invoice_number, ordered_at, total_ttc_cents, shipping_cost_cents, discount_cents, promo_code,
        shipping_name, shipping_address1, shipping_address2, shipping_postcode, shipping_city, shipping_country,
        customers(id, full_name, email),
        order_items(qty, unit_sale_price_ttc_cents, product_name, products(name))
      `)
      .eq('id', orderId)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });

    const html = renderInvoice({
      invoice_number: order.invoice_number,
      order_number: order.order_number,
      ordered_at: order.ordered_at,
      customer: order.customers,
      shipping: {
        name: order.shipping_name,
        address1: order.shipping_address1,
        address2: order.shipping_address2,
        postcode: order.shipping_postcode,
        city: order.shipping_city,
        country: order.shipping_country,
      },
      items: (order.order_items || []).map((i) => ({
        product_name: i.product_name || i.products?.name || 'Produit',
        qty: i.qty,
        unit_sale_price_ttc_cents: i.unit_sale_price_ttc_cents,
      })),
      total_ttc_cents: order.total_ttc_cents || 0,
      shipping_cost_cents: order.shipping_cost_cents || 0,
      discount_cents: order.discount_cents || 0,
      promo_code: order.promo_code,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/orders/:orderId/preparation', requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        id, order_number, ordered_at, notes,
        shipping_name, shipping_address1, shipping_address2, shipping_postcode, shipping_city, shipping_country,
        customers(id, full_name, email),
        order_items(qty, product_name, products(name, sku))
      `)
      .eq('id', orderId)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });

    const html = renderPreparationSlip({
      order_number: order.order_number,
      ordered_at: order.ordered_at,
      customer: order.customers,
      shipping: {
        name: order.shipping_name,
        address1: order.shipping_address1,
        address2: order.shipping_address2,
        postcode: order.shipping_postcode,
        city: order.shipping_city,
        country: order.shipping_country,
      },
      items: (order.order_items || []).map((i) => ({
        product_name: i.product_name || i.products?.name || 'Produit',
        qty: i.qty,
        product_sku: i.products?.sku || null,
      })),
      notes: order.notes || null,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

// --- EMAIL ---

// Données d'exemple pour les aperçus (aucun email envoyé)
const EMAIL_PREVIEW_SAMPLES = {
  'order-confirmation': {
    customerName: 'Alexandre',
    orderNumber: 'RR-2026-0001',
    items: [
      { name: 'Khamaré', quantity: 1, price: '12,00 €' },
      { name: 'Hibiscus Rouge', quantity: 2, price: '6,00 €' },
    ],
    total: '24,00 €',
    shippingName: 'Alexandre Boehler',
    shippingAddress: '12 rue des Herbes, 75011 Paris, FR',
  },
  'subscription-confirmation': {
    customerName: 'Alexandre',
    planName: 'Box Bien-être Mensuel',
    amount: '7,00 € / mois',
    renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
  },
};

// Rendu HTML d'un template sans envoyer d'email (utilisé par admin-email-preview)
app.get('/api/email-preview', (req, res) => {
  const { template } = req.query;
  const sample = EMAIL_PREVIEW_SAMPLES[template];
  if (!sample) {
    return res.status(400).json({
      error: `Template inconnu : "${template}". Disponibles : ${Object.keys(EMAIL_PREVIEW_SAMPLES).join(', ')}`,
    });
  }

  let html;
  if (template === 'order-confirmation') html = orderConfirmationHtml(sample);
  else if (template === 'subscription-confirmation') html = subscriptionConfirmationHtml(sample);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.send(html);
});

// Outil interne (pages/admin-email-test.html) : réservé au mot de passe admin,
// pour qu'un appel anonyme ne puisse pas déclencher d'envoi.
app.post("/api/test-email", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const data = await sendTestEmail();
    console.log('[test-email] ✅ envoyé —', data?.id);
    res.json({ ok: true, id: data?.id });
  } catch (err) {
    console.error('[test-email] ❌', err.message);
    const isConfig = err.message.includes('manquante');
    res.status(isConfig ? 503 : 500).json({ ok: false, error: isConfig ? 'Envoi des emails non configuré.' : 'Envoi impossible. Consultez les journaux du serveur.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend Racines & Rituels opérationnel sur port ${PORT}`));
