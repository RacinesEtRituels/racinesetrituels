function fmtDate(iso) {
  if (!iso) return new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Génère un bon de préparation HTML imprimable — usage interne uniquement.
 * NE PAS joindre au colis client.
 *
 * @param {object} opts
 * @param {string}  opts.order_number
 * @param {string}  opts.ordered_at
 * @param {object}  opts.customer  - { full_name, email }
 * @param {object}  opts.shipping  - { name, address1, address2, postcode, city, country }
 * @param {Array}   opts.items     - [{ product_name, qty, product_sku }]
 * @param {string}  opts.notes
 */
export function renderPreparationSlip({
  order_number,
  ordered_at,
  customer,
  shipping,
  items = [],
  notes,
}) {
  const date = fmtDate(ordered_at);
  const customerName = customer?.full_name || shipping?.name || '—';

  const addressLines = [];
  if (shipping) {
    addressLines.push(`<strong>${shipping.name || customerName}</strong>`);
    if (shipping.address1) addressLines.push(shipping.address1);
    if (shipping.address2) addressLines.push(shipping.address2);
    const cityLine = [shipping.postcode, shipping.city].filter(Boolean).join(' ');
    if (cityLine) addressLines.push(cityLine);
    addressLines.push(shipping.country || 'France');
  } else {
    addressLines.push(`<strong>${customerName}</strong>`);
    if (customer?.email) addressLines.push(customer.email);
  }

  const itemRows = items.map((item) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #e8dfd3;vertical-align:middle;">
        <span style="display:inline-flex;align-items:center;gap:10px;">
          <input type="checkbox" style="width:18px;height:18px;flex-shrink:0;accent-color:#e64c19;">
          <span style="font-size:14px;font-weight:600;">${item.product_name || 'Produit'}</span>
        </span>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #e8dfd3;text-align:center;font-size:16px;font-weight:700;color:#e64c19;">
        × ${item.qty ?? 1}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #e8dfd3;font-size:11px;color:#bbb;font-family:monospace;">
        ${item.product_sku || '—'}
      </td>
    </tr>`).join('');

  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bon de préparation ${order_number || ''}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1b110e;background:#fff;padding:24px;max-width:800px;margin:0 auto}
.print-btn{text-align:right;margin-bottom:20px}
.print-btn button{background:#1b110e;color:#fff;border:none;padding:8px 20px;border-radius:6px;font-size:13px;cursor:pointer}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #e64c19;padding-bottom:16px;margin-bottom:24px}
.title{font-size:20px;font-weight:700}
.title-sub{font-size:11px;color:#e64c19;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px}
.order-number{font-size:22px;font-weight:700;color:#e64c19}
.section-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#bbb;margin:20px 0 8px}
.address-box{background:#faf7f3;border:1px solid #e8dfd3;border-radius:6px;padding:14px 18px;font-size:13px;line-height:1.9;margin-bottom:4px}
table{width:100%;border-collapse:collapse}
thead th{background:#f0ebe3;padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;text-align:left}
.notes-box{margin-top:24px;background:#fff8f0;border:1px dashed #f0c080;border-radius:6px;padding:14px 18px}
.notes-label{font-size:11px;font-weight:700;color:#e64c19;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.sign-block{display:flex;justify-content:space-between;margin-top:36px;gap:24px}
.sign-box{border-top:1px dashed #ccc;flex:1;padding-top:8px;font-size:11px;color:#bbb;text-align:center}
.confidential{font-size:10px;color:#ccc;text-align:center;margin-top:28px;border-top:1px solid #f0ebe3;padding-top:12px}
@media print{
  .print-btn{display:none}
  body{padding:12px}
  @page{margin:15mm}
}
</style>
</head>
<body>

<div class="print-btn"><button onclick="window.print()">🖨️ Imprimer le bon</button></div>

<div class="header">
  <div>
    <div class="title">Bon de préparation</div>
    <div class="title-sub">Racines &amp; Rituels — Usage interne</div>
  </div>
  <div style="text-align:right">
    <div class="order-number">${order_number || '—'}</div>
    <div style="font-size:12px;color:#777;margin-top:4px">Commandé le : ${date}</div>
  </div>
</div>

<div class="section-label">Adresse de livraison</div>
<div class="address-box">${addressLines.join('<br>')}</div>

<div class="section-label">Articles à préparer — ${items.length} référence${items.length !== 1 ? 's' : ''}</div>
<table>
  <thead>
    <tr>
      <th>✓ &nbsp;Produit</th>
      <th style="text-align:center;width:80px">Qté</th>
      <th style="width:120px">Réf.</th>
    </tr>
  </thead>
  <tbody>
    ${itemRows || '<tr><td colspan="3" style="padding:16px;color:#bbb;text-align:center">Aucun article</td></tr>'}
  </tbody>
</table>

${notes ? `
<div class="notes-box">
  <div class="notes-label">Notes</div>
  <div style="font-size:13px;line-height:1.7;color:#555">${notes}</div>
</div>` : ''}

<div class="sign-block">
  <div class="sign-box">Préparé par</div>
  <div class="sign-box">Vérifié par</div>
  <div class="sign-box">Expédié le</div>
</div>

<div class="confidential">
  ⚠️ DOCUMENT INTERNE — Ne pas joindre au colis client<br>
  Généré le ${today}
</div>

</body>
</html>`;
}
