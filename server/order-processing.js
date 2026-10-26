// Traitement des commandes payées (webhook Stripe).
// Séparé de server.js pour être testé sans Stripe, Supabase ni Resend réels.

export const SHIPPING_LINE_NAME = "Livraison (à chaque envoi)";
// Stripe : « paid » pour une carte, « no_payment_required » pour une commande entièrement remisée.
export const PAID_SESSION_STATUSES = new Set(["paid", "no_payment_required"]);
const IN_PROGRESS_MS = 2 * 60 * 1000;

const parseNotes = (notes) => { try { return JSON.parse(notes || "{}") || {}; } catch { return {}; } };

export function createOrderProcessor({
  supabase, stripe, EmailService, insertEmailLog, activityId, notificationRecipients,
  isSubscriptionProduct, subscriptionBillingCycle,
  buildOrderConfirmationData, buildSubscriptionConfirmationData, buildOrderNotificationData,
  clock = () => Date.now(),
}) {
  // Lit les montants réellement facturés par Stripe et les enregistre sur la commande :
  // frais de port, réduction (code passé par le site ou saisi sur la page Stripe) et commission influenceur.
  // Base de commission = montant produits payé après réduction, hors frais de port.
  async function recordSessionAmounts(session, orderId) {
    const full = await stripe.checkout.sessions.retrieve(session.id, { expand: ["total_details.breakdown", "line_items"] });
    const discountCents = full.total_details?.amount_discount || 0;
    const lineItems = full.line_items?.data || [];
    const shippingLine = lineItems.find((li) => li.description === SHIPPING_LINE_NAME);
    const shippingCents = (full.total_details?.amount_shipping || 0) + (shippingLine?.amount_subtotal || 0);
    const productsPaidCents = lineItems
      .filter((li) => li !== shippingLine)
      .reduce((sum, li) => sum + (li.amount_subtotal || 0) - (li.amount_discount || 0), 0);

    if (shippingCents) {
      const { error: shippingError } = await supabase.from("orders")
        .update({ shipping_cost_cents: shippingCents }).eq("id", orderId);
      if (shippingError) throw new Error(`Erreur enregistrement frais de port : ${shippingError.message}`);
    }
    if (!discountCents) return { discountCents: 0, promoCode: null, shippingCents };

    const promotionCodeIds = (full.total_details?.breakdown?.discounts || [])
      .map((d) => d.discount?.promotion_code)
      .map((p) => (typeof p === "string" ? p : p?.id))
      .filter(Boolean);

    let affiliate = null;
    if (promotionCodeIds.length) {
      const { data, error } = await supabase
        .from("affiliates")
        .select("id, code, commission_rate")
        .in("stripe_promotion_code_id", promotionCodeIds)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Erreur lecture influenceur : ${error.message}`);
      affiliate = data;
    }

    const { error: orderError } = await supabase.from("orders").update({
      discount_cents: discountCents,
      ...(affiliate ? { affiliate_id: affiliate.id, promo_code: affiliate.code } : {}),
    }).eq("id", orderId);
    if (orderError) throw new Error(`Erreur enregistrement réduction : ${orderError.message}`);

    if (affiliate) {
      const baseCents = Math.max(0, productsPaidCents);
      const rate = Number(affiliate.commission_rate);
      const { error: commissionError } = await supabase.from("affiliate_commissions").insert({
        affiliate_id: affiliate.id,
        order_id: orderId,
        base_cents: baseCents,
        commission_rate: rate,
        commission_cents: Math.round(baseCents * rate),
      });
      // 23505 = commission déjà enregistrée pour cette commande (webhook rejoué)
      if (commissionError && commissionError.code !== "23505") {
        throw new Error(`Erreur création commission : ${commissionError.message}`);
      }
    }
    return { discountCents, promoCode: affiliate?.code || null, shippingCents };
  }

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
        .eq("activity_id", activityId)
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
      .select("id, stripe_customer_id, stage, is_active, created_at")
      .eq("activity_id", activityId)
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
      const emailUpdatePayload = {
        ...(fullName ? { full_name: fullName } : {}),
        stage: "client",
        is_active: true,
        // Ne jamais écraser un stripe_customer_id existant — on le définit seulement s'il manque
        ...(!existingCustomer.stripe_customer_id && stripeCustomerId
          ? { stripe_customer_id: stripeCustomerId }
          : {}),
      };
      const { error: updateError } = await supabase
        .from("customers")
        .update(emailUpdatePayload)
        .eq("id", existingCustomer.id);
      if (updateError) throw new Error(`Erreur mise à jour client : ${updateError.message}`);
      return existingCustomer;
    }

    const { data: createdCustomer, error: insertError } = await supabase
      .from("customers")
      .insert({
        activity_id: activityId,
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

    if (insertError) {
      // Contrainte unique sur email : deux webhooks concurrents — le premier a déjà créé le customer
      if (insertError.code === "23505") {
        const { data: raceFallback } = await supabase
          .from("customers")
          .select("id")
          .eq("activity_id", activityId)
          .eq("email", email)
          .maybeSingle();
        if (raceFallback) return raceFallback;
      }
      throw new Error(`Erreur création client : ${insertError.message}`);
    }
    return createdCustomer;
  }

  async function persistSubscriptionsForOrder(session, orderId, orderItems, customer) {
    const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : null;
    if (!stripeSubscriptionId) {
      console.warn("⚠️ Session abonnement sans stripe_subscription_id — subscription Core non créée.");
      return;
    }

    if (!customer) {
      console.warn("⚠️ Session abonnement sans client résolu — subscription Core non créée.");
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

  // Lit les envois déjà tracés pour cette commande : un email envoyé (ou impossible faute
  // d'adresse) n'est jamais renvoyé quand Stripe relivre l'événement.
  async function alreadyLogged(orderId, template) {
    const { data, error } = await supabase.from("email_logs")
      .select("id").eq("order_id", orderId).eq("template", template).in("status", ["sent", "skipped"]).limit(1);
    if (error) throw new Error(`Erreur lecture journal emails : ${error.message}`);
    return Boolean(data?.length);
  }

  // Attribue les numéros manquants (RR-YYYY-NNNN, FAC-YYYY-NNNNN) sans jamais écraser un numéro déjà posé.
  async function ensureDocumentNumbers(orderId, current) {
    const numbers = { order_number: current.order_number || null, invoice_number: current.invoice_number || null };
    for (const [column, prefix, padding] of [["order_number", "RR", 4], ["invoice_number", "FAC", 5]]) {
      if (numbers[column]) continue;
      const { data: generated, error } = await supabase.rpc("next_document_number", { p_prefix: prefix, p_padding: padding });
      if (error) throw new Error(`${column} non généré : ${error.message}`);
      const { error: updateError } = await supabase.from("orders").update({ [column]: generated }).eq("id", orderId).is(column, null);
      if (updateError) throw new Error(`${column} non enregistré : ${updateError.message}`);
    }
    const { data: saved, error: readError } = await supabase.from("orders").select("order_number, invoice_number").eq("id", orderId).single();
    if (readError) throw new Error(`Relecture des numéros : ${readError.message}`);
    if (!saved.order_number || !saved.invoice_number) throw new Error("Numéros de commande incomplets");
    return saved;
  }

  async function sendOnce({ orderId, template, to, data, customerId, logMetadata }) {
    if (await alreadyLogged(orderId, template)) return "already_sent";
    if (!to || (Array.isArray(to) && !to.length)) {
      await insertEmailLog({ orderId, customerId, template, recipient: "", status: "skipped",
        errorMessage: "Adresse email client absente de la session Stripe", metadata: logMetadata });
      return "skipped";
    }
    await EmailService.send({ template, to, data, orderId, customerId, logMetadata });
    return "sent";
  }

  // Traite une session Checkout payée. Chaque étape est rejouable : si l'une échoue, la fonction
  // lève une erreur après avoir tenté les autres, le webhook répond 500 et Stripe relivre
  // l'événement. Les étapes déjà faites (numéros, stock, emails tracés) sont alors ignorées.
  async function processOrderSuccess(eventSession) {
    let session = eventSession;
    if (!session.client_reference_id || !session.metadata?.order_id) {
      session = await stripe.checkout.sessions.retrieve(session.id);
    }
    const orderId = session.client_reference_id || session.metadata?.order_id;
    if (!orderId) {
      console.error(`❌ Session Stripe ${session.id} sans référence de commande — ignorée.`);
      return { status: "ignored" };
    }
    // Un paiement différé (virement, prélèvement…) arrive avec payment_status=unpaid :
    // rien n'est préparé avant checkout.session.async_payment_succeeded.
    if (!PAID_SESSION_STATUSES.has(session.payment_status)) {
      console.log(`ℹ️ Commande ${orderId} : paiement « ${session.payment_status} », en attente de confirmation Stripe.`);
      return { status: "awaiting_payment" };
    }

    const { data: order, error: readError } = await supabase.from("orders")
      .select("id, payment_status, order_number, invoice_number, notes").eq("id", orderId).maybeSingle();
    if (readError) throw new Error(`Erreur lecture commande : ${readError.message}`);
    if (!order) {
      console.error(`❌ Commande introuvable pour Stripe session ${session.id}`);
      return { status: "ignored" };
    }

    const shipping = session.shipping_details || session.collected_information?.shipping_details;
    const shippingFields = shipping ? {
      shipping_name: shipping.name || null,
      shipping_address1: shipping.address?.line1 || null,
      shipping_address2: shipping.address?.line2 || null,
      shipping_postcode: shipping.address?.postal_code || null,
      shipping_city: shipping.address?.city || null,
      shipping_country: shipping.address?.country || null,
    } : {};
    const stripeIds = {
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
      stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
    };

    if (order.payment_status === "paid") {
      // Une livraison concurrente traite peut-être encore cette commande : laisser Stripe réessayer plus tard.
      const paidAt = Date.parse(parseNotes(order.notes).paid_at || "");
      if (Number.isFinite(paidAt) && clock() - paidAt < IN_PROGRESS_MS) {
        throw new Error(`Commande ${orderId} en cours de traitement — nouvelle tentative plus tard`);
      }
    } else {
      const { data: paidOrder, error: updateError } = await supabase.from("orders").update({
        status: "paid",
        payment_status: "paid",
        fulfillment_status: "pending",
        ...stripeIds,
        ...shippingFields,
        notes: JSON.stringify({ customer_email: session.customer_details?.email, paid_at: new Date(clock()).toISOString() }),
      }).eq("id", orderId).neq("payment_status", "paid").select("id").maybeSingle();
      if (updateError) throw new Error(`Erreur Supabase Update : ${updateError.message}`);
      if (!paidOrder) throw new Error(`Commande ${orderId} déjà prise en charge par une autre livraison`);
      console.log(`✅ Commande ${orderId} passée en PAID.`);
    }

    const failures = [];
    const step = async (name, fn, fallback = null) => {
      try { return await fn(); }
      catch (err) {
        console.error(`❌ [CRITIQUE] Commande ${orderId} — ${name} : ${err.message}`);
        failures.push(name);
        return fallback;
      }
    };

    const sessionAmounts = await step("montants et commission", () => recordSessionAmounts(session, orderId),
      { discountCents: 0, promoCode: null, shippingCents: 0 });
    const numbers = await step("numérotation", () => ensureDocumentNumbers(orderId, order));
    const customer = await step("client", async () => {
      const found = await findOrCreateCustomerFromSession(session);
      if (found) {
        const { error } = await supabase.from("orders").update({ customer_id: found.id, stripe_customer_id: stripeIds.stripe_customer_id }).eq("id", orderId);
        if (error) throw new Error(`Erreur liaison client commande : ${error.message}`);
      }
      return found;
    });

    const { data: orderItems, error: itemsError } = await supabase.from("order_items")
      .select("product_id, qty, unit_sale_price_ttc_cents, products(id, name, type)").eq("order_id", orderId);
    if (itemsError) throw new Error(`Erreur lecture articles commande : ${itemsError.message}`);
    const items = orderItems || [];

    // Snapshot product_name sur chaque order_item (protège contre les renommages produits futurs)
    await step("noms des produits", async () => {
      const results = await Promise.all(items.filter((item) => item.products?.name).map((item) =>
        supabase.from("order_items").update({ product_name: item.products.name }).eq("order_id", orderId).eq("product_id", item.product_id)));
      const failed = results.find((r) => r.error);
      if (failed) throw new Error(failed.error.message);
    });

    const hasPhysicalItems = items.some((item) => !isSubscriptionProduct(item.products));
    const hasSubscriptionItems = items.some((item) => isSubscriptionProduct(item.products));

    // decrement_stock_for_order est idempotente (orders.stock_decremented_at).
    if (hasPhysicalItems) {
      await step("stock", async () => {
        const { error } = await supabase.rpc("decrement_stock_for_order", { order_id: orderId });
        if (error) throw new Error(error.message);
      });
    }
    if (hasSubscriptionItems) {
      await step("abonnement", () => persistSubscriptionsForOrder(session, orderId, items, customer));
    }

    // Sans numéro, les emails attendent la prochaine livraison de Stripe plutôt que de partir incomplets.
    if (!numbers) {
      throw new Error(`Commande ${orderId} incomplète : ${failures.join(", ")}`);
    }
    const logMetadata = { source: "stripe_webhook", stripe_session_id: session.id, mode: session.mode };

    if (!hasSubscriptionItems) {
      const { customerEmail, emailData } = buildOrderConfirmationData({
        session, orderId, orderItems: items, customer, orderNumber: numbers.order_number, shippingFields,
        discountCents: sessionAmounts.discountCents, promoCode: sessionAmounts.promoCode, shippingCents: sessionAmounts.shippingCents,
      });
      await step("email de confirmation", () => sendOnce({ orderId, template: "order-confirmation", to: customerEmail,
        data: emailData, customerId: customer?.id ?? null, logMetadata }));
    } else {
      const subStripeId = typeof session.subscription === "string" ? session.subscription : null;
      let renewalTimestamp = null;
      if (subStripeId) {
        try { renewalTimestamp = (await stripe.subscriptions.retrieve(subStripeId)).current_period_end ?? null; }
        catch (e) { console.warn("⚠️ Impossible de récupérer la date de renouvellement Stripe :", e.message); }
      }
      const { customerEmail, emailData } = buildSubscriptionConfirmationData({
        session, orderItems: items, customer, renewalTimestamp, shippingCents: sessionAmounts.shippingCents,
      });
      await step("email d'abonnement", () => sendOnce({ orderId, template: "subscription-confirmation", to: customerEmail,
        data: emailData, customerId: customer?.id ?? null, logMetadata: { ...logMetadata, stripe_subscription_id: subStripeId } }));
    }

    // Email interne « Nouvelle commande » à l'équipe (Fanta) pour préparer le colis
    await step("email interne", () => sendOnce({ orderId, template: "order-notification", to: notificationRecipients,
      data: buildOrderNotificationData({
        session, orderId, orderNumber: numbers.order_number, orderItems: items, shippingFields,
        discountCents: sessionAmounts.discountCents, promoCode: sessionAmounts.promoCode,
        shippingCents: sessionAmounts.shippingCents, isSubscription: hasSubscriptionItems,
      }),
      customerId: customer?.id ?? null, logMetadata }));

    if (failures.length) throw new Error(`Commande ${orderId} incomplète : ${failures.join(", ")}`);
    console.log(`✅ Commande ${orderId} entièrement traitée.`);
    return { status: "completed" };
  }

  // Échec d'un paiement différé : la commande n'a jamais été marquée payée, elle reste en attente.
  async function recordAsyncPaymentFailure(session) {
    const orderId = session.client_reference_id || session.metadata?.order_id || null;
    console.warn(`⚠️ Paiement différé échoué — commande ${orderId || "inconnue"}, session ${session.id}. Aucune préparation.`);
    return { status: "payment_failed" };
  }

  return { processOrderSuccess, recordAsyncPaymentFailure };
}
