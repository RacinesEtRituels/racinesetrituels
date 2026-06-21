/**
 * Helpers de formatage des données email pour les templates order-confirmation
 * et subscription-confirmation.
 * Isolés ici pour être testables sans dépendance à Stripe ou Supabase.
 */

const fmt = (cents) => (Number(cents) / 100).toFixed(2).replace('.', ',') + ' €';

/**
 * Construit l'objet data attendu par EmailService.send({ template: 'order-confirmation', ... })
 * à partir des données brutes issues du webhook et de Supabase.
 *
 * @param {object} opts
 * @param {object}  opts.session     - Session Stripe (checkout.session.completed)
 * @param {string}  opts.orderId     - UUID Supabase de la commande
 * @param {Array}   opts.orderItems  - Lignes order_items avec produits imbriqués
 * @param {object|null} opts.customer - Objet customer Supabase (peut être null)
 * @returns {{ customerEmail: string|null, emailData: object }}
 */
export function buildOrderConfirmationData({ session, orderId, orderItems, customer }) {
  const customerEmail = session?.customer_details?.email ?? null;

  // Priorité : nom Stripe > full_name Supabase > fallback générique
  const customerName =
    session?.customer_details?.name ||
    customer?.full_name ||
    'Client';

  const safeItems = Array.isArray(orderItems) ? orderItems : [];

  const items = safeItems.map((i) => ({
    name: i.products?.name || 'Produit',
    quantity: Number(i.qty ?? 1),
    price: fmt(i.unit_sale_price_ttc_cents ?? 0),
  }));

  const totalCents = safeItems.reduce(
    (sum, i) => sum + Number(i.unit_sale_price_ttc_cents ?? 0) * Number(i.qty ?? 0),
    0
  );

  return {
    customerEmail,
    emailData: {
      customerName,
      orderNumber: orderId,
      items,
      total: fmt(totalCents),
    },
  };
}

/**
 * Construit l'objet data attendu par EmailService.send({ template: 'subscription-confirmation', ... })
 * à partir des données brutes issues du webhook et de Supabase.
 *
 * @param {object} opts
 * @param {object}  opts.session              - Session Stripe (checkout.session.completed)
 * @param {Array}   opts.orderItems           - Lignes order_items avec produits imbriqués
 * @param {object|null} opts.customer         - Objet customer Supabase (peut être null)
 * @param {number|null} opts.renewalTimestamp - Unix timestamp (Stripe current_period_end), optionnel
 * @returns {{ customerEmail: string|null, emailData: object }}
 */
export function buildSubscriptionConfirmationData({ session, orderItems, customer, renewalTimestamp = null }) {
  const customerEmail = session?.customer_details?.email ?? null;

  const customerName =
    session?.customer_details?.name ||
    customer?.full_name ||
    'Client';

  const safeItems = Array.isArray(orderItems) ? orderItems : [];
  const subItem = safeItems.find((i) => i.products?.type === 'subscription');

  const planName = subItem?.products?.name || 'Abonnement Racines & Rituels';

  // Détermine le cycle de facturation à partir du nom du produit (cohérent avec subscriptionBillingCycle)
  const isAnnual = /annuel|annual|year/i.test(planName);
  const freqLabel = isAnnual ? 'an' : 'mois';

  const priceCents = Number(subItem?.unit_sale_price_ttc_cents ?? 0);
  const amount = `${(priceCents / 100).toFixed(2).replace('.', ',')} € / ${freqLabel}`;

  // Formate la date de renouvellement en français, ou '—' si indisponible
  let renewalDate = '—';
  if (renewalTimestamp) {
    renewalDate = new Date(renewalTimestamp * 1000).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  return {
    customerEmail,
    emailData: {
      customerName,
      planName,
      amount,
      renewalDate,
    },
  };
}
