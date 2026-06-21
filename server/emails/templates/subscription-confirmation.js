import { renderLayout } from './layout.js';

/**
 * Email de confirmation d'abonnement.
 *
 * @param {object} data
 * @param {string} data.customerName  - Prénom ou nom complet
 * @param {string} data.planName      - Nom de la formule (ex: "Box Bien-être Mensuel")
 * @param {string} data.amount        - Montant formaté (ex: "7,00 € / mois")
 * @param {string} data.renewalDate   - Prochaine échéance formatée (ex: "21/07/2026")
 */
export function subscriptionConfirmationHtml({ customerName, planName, amount, renewalDate }) {
  const siteUrl = process.env.SITE_URL || 'https://racinesetrituels.com';

  const body = `
    <p style="margin:0 0 20px;font-size:20px;font-weight:700;color:#1b110e;line-height:1.3;">
      Bienvenue dans le Cercle Bien-&ecirc;tre &#127807;
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#555555;line-height:1.7;">
      Bonjour <strong>${customerName}</strong>,<br>
      votre abonnement est actif. Merci de rejoindre notre cercle de bien-&ecirc;tre.
    </p>

    <!-- Récapitulatif abonnement -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background:#f9f6f1;border-radius:6px;margin-bottom:28px;">
      <tr><td style="padding:24px 28px;">

        <!-- Formule -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="margin-bottom:14px;">
          <tr>
            <td style="width:160px;font-size:11px;font-weight:700;letter-spacing:2px;color:#999999;
              text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;vertical-align:top;
              padding-top:2px;">
              Formule
            </td>
            <td style="font-size:15px;font-weight:700;color:#1b110e;
              font-family:Arial,Helvetica,sans-serif;">
              ${planName}
            </td>
          </tr>
        </table>

        <!-- Montant -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="margin-bottom:14px;">
          <tr>
            <td style="width:160px;font-size:11px;font-weight:700;letter-spacing:2px;color:#999999;
              text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;vertical-align:top;
              padding-top:2px;">
              Montant
            </td>
            <td style="font-size:15px;font-weight:700;color:#e64c19;
              font-family:Arial,Helvetica,sans-serif;">
              ${amount}
            </td>
          </tr>
        </table>

        <!-- Prochaine échéance -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="width:160px;font-size:11px;font-weight:700;letter-spacing:2px;color:#999999;
              text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;vertical-align:top;
              padding-top:2px;">
              Prochaine &eacute;ch&eacute;ance
            </td>
            <td style="font-size:15px;color:#1b110e;
              font-family:Arial,Helvetica,sans-serif;">
              ${renewalDate}
            </td>
          </tr>
        </table>

      </td></tr>
    </table>

    <p style="margin:0;font-size:14px;color:#666666;line-height:1.7;
      font-family:Arial,Helvetica,sans-serif;">
      Chaque mois, d&eacute;couvrez une s&eacute;lection de plantes africaines et de rituels
      bien-&ecirc;tre choisis avec soin pour vous.
    </p>
  `;

  return renderLayout({
    title: 'Bienvenue dans le Cercle Bien-être — Racines & Rituels',
    body,
    ctaText: 'Acc&eacute;der &agrave; mon espace',
    ctaUrl: `${siteUrl}/profil.html`,
  });
}
