import { getResendClient } from './resend.js';
import { insertEmailLog } from './log.js';
import { orderConfirmationHtml } from './templates/order-confirmation.js';
import { subscriptionConfirmationHtml } from './templates/subscription-confirmation.js';
import { testEmailHtml } from './templates/test-email.js';

/**
 * Registre des templates disponibles.
 * Chaque entrée expose :
 *   - subject(data) → string   : calcule le sujet à partir des données
 *   - html(data)    → string   : génère le HTML final
 */
const TEMPLATES = {
  'order-confirmation': {
    subject: (d) => `✅ Commande #${d.orderNumber} confirmée — Racines & Rituels`,
    html: orderConfirmationHtml,
  },
  'subscription-confirmation': {
    subject: () => '🌿 Bienvenue dans le Cercle Bien-être — Racines & Rituels',
    html: subscriptionConfirmationHtml,
  },
  'test': {
    subject: () => '🌿 Votre configuration email fonctionne !',
    html: testEmailHtml,
  },
};

/**
 * Service email centralisé.
 *
 * Usage :
 *   await EmailService.send({
 *     template : 'order-confirmation',
 *     to       : 'client@example.com',
 *     data     : { customerName, orderNumber, items, total }
 *   });
 *
 * Plus besoin de manipuler resend.emails.send() directement.
 */
export const EmailService = {
  /**
   * @param {object} opts
   * @param {string}       opts.template      - Clé du template (voir TEMPLATES ci-dessus)
   * @param {string|string[]} opts.to         - Destinataire(s)
   * @param {object}       [opts.data]        - Données injectées dans le template
   * @param {string|null}  [opts.orderId]     - UUID commande Supabase (pour email_logs)
   * @param {string|null}  [opts.customerId]  - UUID client Supabase (pour email_logs)
   * @param {object}       [opts.logMetadata] - Données contextuelles libres (pour email_logs)
   * @returns {Promise<{id: string}>} Résultat Resend
   */
  async send({ template, to, data = {}, orderId, customerId, logMetadata }) {
    // Vérification du template en premier (fail-fast, sans appel réseau)
    const tpl = TEMPLATES[template];
    if (!tpl) {
      const available = Object.keys(TEMPLATES).join(', ');
      throw new Error(`Template email inconnu : "${template}". Disponibles : ${available}`);
    }

    if (!process.env.RESEND_FROM) {
      throw new Error('RESEND_FROM manquante dans .env.local');
    }

    const client = getResendClient(); // lève une erreur si RESEND_API_KEY absente

    // Tentative d'envoi — le résultat ou l'erreur est capturé pour le log
    let result = null;
    let sendError = null;

    try {
      const { data: res, error } = await client.emails.send({
        from: process.env.RESEND_FROM,
        to,
        subject: tpl.subject(data),
        html: tpl.html(data),
      });
      if (error) throw new Error(`Resend: ${error.message || JSON.stringify(error)}`);
      result = res;
    } catch (err) {
      sendError = err;
    }

    // Traçabilité Supabase — jamais bloquante (insertEmailLog ne lève jamais)
    await insertEmailLog({
      orderId:           orderId ?? null,
      customerId:        customerId ?? null,
      template,
      recipient:         Array.isArray(to) ? to[0] : to,
      providerMessageId: result?.id ?? null,
      status:            sendError ? 'error' : 'sent',
      errorMessage:      sendError ? sendError.message.slice(0, 500) : null,
      metadata:          { ...(logMetadata ?? {}), to },
    });

    // Rethrow après le log pour que l'appelant gère l'erreur normalement
    if (sendError) throw sendError;
    return result;
  },

  /** Liste les templates disponibles (utile pour debug / admin). */
  templates() {
    return Object.keys(TEMPLATES);
  },
};
