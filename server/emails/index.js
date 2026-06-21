import { getResendClient } from './resend.js';
import { testEmailHtml } from './templates/test-email.js';

const TEST_RECIPIENT = 'alexandre.boehler@gmail.com';

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
