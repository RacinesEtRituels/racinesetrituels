import { renderLayout } from './layout.js';

/**
 * Email de confirmation de commande.
 *
 * @param {object} data
 * @param {string}   data.customerName    - Prénom ou nom complet du client
 * @param {string}   data.orderNumber     - Numéro de commande (ex: RR-2026-0001)
 * @param {Array<{name:string, quantity:number, price:string}>} data.items - Lignes de commande
 * @param {string}   data.total           - Total formaté (ex: "24,00 €")
 * @param {string}   [data.shippingName]  - Nom du destinataire (optionnel)
 * @param {string}   [data.shippingAddress] - Adresse de livraison formatée (optionnel)
 */
export function orderConfirmationHtml({ customerName, orderNumber, items = [], total, shippingName, shippingAddress }) {
  const siteUrl = process.env.SITE_URL || 'https://racinesetrituels.com';

  const itemRows = items.map((item) => `
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #f0ebe3;font-size:14px;color:#333333;
                font-family:Arial,Helvetica,sans-serif;">
                ${item.name}
              </td>
              <td style="padding:10px 0;border-bottom:1px solid #f0ebe3;font-size:14px;color:#777777;
                text-align:center;font-family:Arial,Helvetica,sans-serif;white-space:nowrap;">
                &times;${item.quantity}
              </td>
              <td style="padding:10px 0;border-bottom:1px solid #f0ebe3;font-size:14px;color:#333333;
                text-align:right;font-family:Arial,Helvetica,sans-serif;white-space:nowrap;">
                ${item.price}
              </td>
            </tr>`).join('');

  const body = `
    <p style="margin:0 0 20px;font-size:20px;font-weight:700;color:#1b110e;line-height:1.3;">
      Merci pour votre commande &#127807;
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#555555;line-height:1.7;">
      Bonjour <strong>${customerName}</strong>,<br>
      votre commande <strong>#${orderNumber}</strong> a bien &eacute;t&eacute; re&ccedil;ue.
      Nous la pr&eacute;parons avec soin.
    </p>

    <!-- Titre section produits -->
    <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:2px;color:#e64c19;
      text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">
      Produits
    </p>

    <!-- Tableau des lignes -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="margin-bottom:24px;">
      ${itemRows || `
            <tr>
              <td style="padding:12px 0;font-size:14px;color:#999999;font-family:Arial,Helvetica,sans-serif;">
                (d&eacute;tail non disponible)
              </td>
            </tr>`}
    </table>

    ${shippingAddress ? `
    <!-- Adresse de livraison -->
    <p style="margin:24px 0 10px;font-size:11px;font-weight:700;letter-spacing:2px;color:#e64c19;
      text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">
      Adresse de livraison
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background:#f9f6f1;border-radius:6px;margin-bottom:24px;">
      <tr>
        <td style="padding:14px 20px;font-size:13px;color:#555555;line-height:1.7;
          font-family:Arial,Helvetica,sans-serif;">
          ${shippingName ? `<strong style="color:#333333;display:block;margin-bottom:2px;">${shippingName}</strong>` : ''}
          ${shippingAddress}
        </td>
      </tr>
    </table>` : ''}

    <!-- Total -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background:#f9f6f1;border-radius:6px;">
      <tr>
        <td style="padding:16px 20px;font-size:15px;font-weight:700;color:#1b110e;
          font-family:Arial,Helvetica,sans-serif;">
          Total
        </td>
        <td style="padding:16px 20px;font-size:18px;font-weight:700;color:#e64c19;
          text-align:right;font-family:Arial,Helvetica,sans-serif;white-space:nowrap;">
          ${total}
        </td>
      </tr>
    </table>
  `;

  return renderLayout({
    title: `Confirmation de commande #${orderNumber} — Racines & Rituels`,
    body,
    ctaText: 'Voir ma commande',
    ctaUrl: `${siteUrl}/profil.html`,
  });
}
