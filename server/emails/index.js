/**
 * Point d'entrée du module email.
 *
 * Exports disponibles :
 *   - EmailService              → service centralisé (send, templates)
 *   - sendTestEmail(to?)        → envoi rapide d'un email de test (compat. route /api/test-email)
 *   - orderConfirmationHtml     → rendu HTML seul (preview, tests)
 *   - subscriptionConfirmationHtml
 */

export { EmailService } from './send.js';
export { orderConfirmationHtml } from './templates/order-confirmation.js';
export { subscriptionConfirmationHtml } from './templates/subscription-confirmation.js';

import { getResendClient } from './resend.js';
import { testEmailHtml } from './templates/test-email.js';

const TEST_RECIPIENT = 'alexandre.boehler@gmail.com';

/**
 * Envoi d'un email de test de configuration.
 * Conservé pour compatibilité avec la route POST /api/test-email.
 */
export async function sendTestEmail(to = TEST_RECIPIENT) {
  if (!process.env.RESEND_FROM) {
    throw new Error('RESEND_FROM manquante dans .env.local');
  }

  const client = getResendClient();

  const { data, error } = await client.emails.send({
    from: process.env.RESEND_FROM,
    to,
    subject: '🌿 Votre configuration email fonctionne !',
    html: testEmailHtml(),
  });

  if (error) {
    throw new Error(`Resend: ${error.message || JSON.stringify(error)}`);
  }

  return data;
}
