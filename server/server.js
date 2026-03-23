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
dotenv.config({ path: path.join(__dirname, ".env") });

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

app.use(cors());
app.use(express.json());

// --- FICHIERS STATIQUES (frontend) ---
const frontendPath = path.join(__dirname, '..');
app.use(express.static(frontendPath));
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// --- LOGIQUE MÉTIER (TES OPTIONS) ---
const now = () => new Date().toISOString();

async function processOrderSuccess(session) {
  console.log('--- 🚀 DÉBUT PROCESS ORDER SUCCESS ---');
  const orderId = session.client_reference_id || session.metadata?.order_id;
  console.log('ID de commande trouvé par Stripe :', orderId);
  if (!orderId) {
    console.log('❌ ERREUR : Aucun orderId trouvé dans la session Stripe.');
    return;
  }

  try {
    // 1. Mise à jour statut
    console.log('Mise à jour de la commande en paid dans Supabase...');
    const { error: updateError } = await supabase.from("orders").update({
      status: "paid",
      paid_at: now(),
      customer_email: session.customer_details?.email
    }).eq("id", orderId);
    if (updateError) console.error('❌ Erreur Supabase Update :', updateError.message);
    else console.log('✅ Commande passée en PAID avec succès.');

    // 2. Décrémentation Stock (Option RPC originale)
    console.log('Décrémentation du stock...');
    const { error: rpcError } = await supabase.rpc("decrement_stock_for_order", { order_id: orderId });
    if (rpcError) console.error('❌ Erreur RPC decrement_stock_for_order :', rpcError.message);
    else console.log('✅ Stock décrémenté avec succès.');

    // 3. File d'attente Impression (Option print_jobs)
    console.log('Insertion du job impression...');
    const { error: printError } = await supabase.from("print_jobs").insert({
      order_id: orderId, status: "queued", payload: { email: session.customer_details?.email }
    });
    if (printError) console.error('❌ Erreur print_jobs insert :', printError.message);
    else console.log('✅ Job impression ajouté avec succès.');

    // TODO: Reactivate email later
    // // 4. Email de confirmation
    // console.log('Envoi de l\'email de confirmation...');
    // await mailer.sendMail({
    //   from: process.env.MAIL_FROM,
    //   to: session.customer_details?.email,
    //   subject: "Confirmation Commande",
    //   text: `Merci ! Votre commande ${orderId} est validée.`
    // });
    // console.log('✅ Email de confirmation envoyé.');
  } catch (err) {
    console.error('❌ CRASH DANS PROCESS ORDER SUCCESS :', err.message);
  }
}



// --- ROUTES STANDARDS ---
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { items } = req.body;
    const { data: product } = await supabase.from("products").select("*").limit(1).single();
    const { data: order } = await supabase.from("orders").insert({
      status: "pending", total_cents: product.price_cents * (items[0]?.quantity || 1)
    }).select().single();

    const checkoutMode = product.is_subscription ? "subscription" : "payment";

    const session = await stripe.checkout.sessions.create({
      mode: checkoutMode,
      line_items: [{ price: product.stripe_price_id, quantity: items[0]?.quantity || 1 }],
      client_reference_id: order.id,
      metadata: { order_id: order.id },
      success_url: `${process.env.SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL}/cancel.html`,
    });

    await supabase.from("orders").update({ stripe_session_id: session.id }).eq("id", order.id);
    res.json({ url: session.url, order_id: order.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/public/order-by-session", async (req, res) => {
  const { data } = await supabase.from("orders").select("*").eq("stripe_session_id", req.query.session_id).maybeSingle();
  res.json({ ok: true, order: data });
});

app.get("/admin/orders", async (req, res) => {
  const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(50);
  res.json({ orders: data });
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend Racines & Rituels opérationnel sur port ${PORT}`));