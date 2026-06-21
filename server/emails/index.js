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

import { EmailService } from './send.js';

const TEST_RECIPIENT = 'alexandre.boehler@gmail.com';

/**
 * Envoi d'un email de test de configuration.
 * Conservé pour compatibilité avec la route POST /api/test-email.
 * Passe par EmailService.send() pour que l'envoi soit tracé dans email_logs.
 */
export async function sendTestEmail(to = TEST_RECIPIENT) {
  return EmailService.send({
    template: 'test',
    to,
    logMetadata: { source: 'admin_test' },
  });
}
