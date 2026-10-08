import { renderLayout } from './layout.js';

/**
 * Email interne « Nouvelle commande » — envoyé à l'équipe (commandes@racinesetrituels.com)
 * à chaque commande payée, avec tout ce qu'il faut pour préparer le colis.
 *
 * @param {object} data
 * @param {string}   data.orderNumber      - Numéro de commande (ex: RR-2026-0001)
 * @param {string}   data.kind             - "Commande" ou "Abonnement"
 * @param {Array<{name:string, quantity:number, price:string}>} data.items
 * @param {string}   data.customerName
 * @param {string}   [data.customerEmail]
 * @param {string}   [data.shippingName]
 * @param {string[]} [data.shippingLines]  - Adresse de livraison, une ligne par élément
 * @param {string}   [data.discount]       - Réduction formatée (ex: "- 0,60 €")
 * @param {string}   [data.promoCode]      - Code promo / influenceur utilisé
 * @param {string}   data.shippingCost     - Frais de livraison formatés ou "Offerte"
 * @param {string}   data.total            - Total payé formaté
 * @param {string}   data.dashboardUrl     - Lien vers les commandes dans Pilotage360
 */
export function orderNotificationHtml({
  orderNumber, kind = 'Commande', items = [], customerName, customerEmail,
  shippingName, shippingLines = [], discount, promoCode, shippingCost, total, dashboardUrl,
}) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cell = 'padding:8px 0;border-bottom:1px solid #f0ebe3;font-size:14px;font-family:Arial,Helvetica,sans-serif;';
  const label = 'margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:2px;color:#e64c19;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;';
  const line = (text, value, bold = false) => `
      <tr>
        <td style="padding:4px 0;font-size:14px;color:#555555;font-family:Arial,Helvetica,sans-serif;${bold ? 'font-weight:700;color:#1b110e;' : ''}">${text}</td>
        <td style="padding:4px 0;font-size:14px;text-align:right;white-space:nowrap;font-family:Arial,Helvetica,sans-serif;${bold ? 'font-weight:700;color:#e64c19;' : 'color:#555555;'}">${value}</td>
      </tr>`;

  const itemRows = items.map((item) => `
      <tr>
        <td style="${cell}color:#333333;"><strong style="color:#e64c19;font-size:16px;">${item.quantity} &times;</strong> ${esc(item.name)}</td>
        <td style="${cell}color:#333333;text-align:right;white-space:nowrap;">${item.price}</td>
      </tr>`).join('');

  const body = `
    <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1b110e;line-height:1.3;">
      &#128722; Nouvelle ${kind === 'Abonnement' ? 'souscription' : 'commande'} &agrave; pr&eacute;parer
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#555555;line-height:1.6;">
      ${kind} <strong>#${esc(orderNumber)}</strong> &mdash; pay&eacute;e, ${esc(total)}.
    </p>

    <p style="${label}">&Agrave; mettre dans le colis</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      ${itemRows || `<tr><td style="${cell}color:#999999;">(d&eacute;tail non disponible)</td></tr>`}
    </table>

    <p style="${label}">Exp&eacute;dier &agrave;</p>
    <p style="margin:0 0 24px;padding:14px 18px;background:#f9f6f1;border-radius:6px;font-size:14px;color:#333333;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">
      ${shippingName ? `<strong>${esc(shippingName)}</strong><br>` : ''}
      ${shippingLines.length ? shippingLines.map(esc).join('<br>') : 'Adresse non renseign&eacute;e'}
    </p>

    <p style="${label}">Client</p>
    <p style="margin:0 0 24px;font-size:14px;color:#333333;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">
      ${esc(customerName)}${customerEmail ? `<br><a href="mailto:${esc(customerEmail)}" style="color:#e64c19;">${esc(customerEmail)}</a>` : ''}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background:#f9f6f1;border-radius:6px;padding:12px 20px;">
      ${discount ? line(`R&eacute;duction${promoCode ? ` (code <strong>${esc(promoCode)}</strong>)` : ''}`, discount) : ''}
      ${line('Livraison', esc(shippingCost))}
      ${line('Total pay&eacute;', esc(total), true)}
    </table>
  `;

  return renderLayout({
    title: `Nouvelle commande #${orderNumber} — Racines & Rituels`,
    body,
    ctaText: 'Ouvrir dans Pilotage360',
    ctaUrl: dashboardUrl,
  });
}
