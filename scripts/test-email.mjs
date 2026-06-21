/**
 * Test CLI pour l'envoi d'email via Resend.
 * Usage : npm run test:email
 * Prérequis : RESEND_API_KEY et RESEND_FROM dans .env.local
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Charger .env.local avant d'importer le module email (qui lit process.env)
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const { sendTestEmail } = await import('../server/emails/index.js');

const to = process.argv[2] || 'alexandre.boehler@gmail.com';
console.log(`[test:email] Envoi à ${to}…`);

try {
  const result = await sendTestEmail(to);
  console.log('[test:email] ✅ Email envoyé —', JSON.stringify(result));
  process.exit(0);
} catch (err) {
  console.error('[test:email] ❌', err.message);
  process.exit(1);
}
