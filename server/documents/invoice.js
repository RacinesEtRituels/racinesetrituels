const fmt = (cents) => (Number(cents) / 100).toFixed(2).replace('.', ',') + ' €';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Génère une facture HTML imprimable.
 * TVA non applicable — article 293B du CGI (franchise en base).
 *
 * @param {object} opts
 * @param {string}  opts.invoice_number
 * @param {string}  opts.order_number
 * @param {string}  opts.ordered_at         - ISO date
 * @param {object}  opts.customer           - { full_name, email }
 * @param {object}  opts.shipping           - { name, address1, address2, postcode, city, country }
 * @param {Array}   opts.items              - [{ product_name, qty, unit_sale_price_ttc_cents }]
 * @param {number}  opts.total_ttc_cents
 * @param {number}  opts.shipping_cost_cents
 */
export function renderInvoice({
  invoice_number,
  order_number,
  ordered_at,
  customer,
  shipping,
  items = [],
  total_ttc_cents = 0,
  shipping_cost_cents = 0,
}) {
  const invoiceDate = fmtDate(ordered_at);
  const customerName = customer?.full_name || shipping?.name || 'Client';
  const customerEmail = customer?.email || '';

  const addressLines = [];
  if (shipping) {
    if (shipping.name && shipping.name !== customerName) addressLines.push(shipping.name);
    if (shipping.address1) addressLines.push(shipping.address1);
    if (shipping.address2) addressLines.push(shipping.address2);
    const cityLine = [shipping.postcode, shipping.city].filter(Boolean).join(' ');
    if (cityLine) addressLines.push(cityLine);
    addressLines.push(shipping.country || 'France');
  }

  const itemRows = items.map((item) => {
    const qty = Number(item.qty ?? 1);
    const unitCents = Number(item.unit_sale_price_ttc_cents ?? 0);
    return `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #f0ebe3;font-size:13px;">${item.product_name || 'Produit'}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #f0ebe3;font-size:13px;text-align:center;">${qty}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #f0ebe3;font-size:13px;text-align:right;">${fmt(unitCents)}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #f0ebe3;font-size:13px;text-align:right;font-weight:600;">${fmt(qty * unitCents)}</td>
      </tr>`;
  }).join('');

  const shippingRow = shipping_cost_cents > 0 ? `
      <tr>
        <td colspan="3" style="padding:8px 16px;font-size:13px;color:#777;text-align:right;">Frais de port</td>
        <td style="padding:8px 16px;font-size:13px;text-align:right;">${fmt(shipping_cost_cents)}</td>
      </tr>` : '';

  const grandTotal = total_ttc_cents + shipping_cost_cents;
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Facture ${invoice_number || order_number || ''}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333;background:#fff;padding:32px;max-width:800px;margin:0 auto}
.print-btn{text-align:right;margin-bottom:24px}
.print-btn button{background:#e64c19;color:#fff;border:none;padding:8px 20px;border-radius:6px;font-size:13px;cursor:pointer}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:48px}
.brand{font-size:22px;font-weight:700;color:#1b110e;letter-spacing:-0.5px}
.brand-sub{font-size:11px;color:#aaa;margin-top:4px}
.inv-meta{text-align:right}
.inv-number{font-size:20px;font-weight:700;color:#e64c19}
.inv-date{font-size:12px;color:#777;margin-top:4px}
.parties{display:flex;gap:40px;margin-bottom:40px}
.party{flex:1}
.party-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#bbb;margin-bottom:8px}
.party-name{font-size:14px;font-weight:600;color:#1b110e;margin-bottom:4px}
.party-info{font-size:12px;color:#666;line-height:1.8}
table{width:100%;border-collapse:collapse;margin-bottom:0}
thead th{background:#f9f6f1;padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;text-align:left}
thead th:nth-child(2){text-align:center}
thead th:nth-child(3),thead th:nth-child(4){text-align:right}
.table-wrap{border:1px solid #f0ebe3;border-radius:8px;overflow:hidden;margin-bottom:16px}
.total-block{text-align:right;padding:16px 20px;background:#f9f6f1;border-radius:6px;margin-bottom:20px}
.total-label{font-size:12px;color:#aaa;margin-bottom:4px}
.total-amount{font-size:24px;font-weight:700;color:#e64c19}
.tva-note{font-size:11px;color:#bbb;margin-bottom:32px;text-align:right}
.footer{border-top:1px solid #f0ebe3;padding-top:16px;font-size:11px;color:#bbb;text-align:center;margin-top:16px}
@media print{
  .print-btn{display:none}
  body{padding:16px}
  @page{margin:18mm}
}
</style>
</head>
<body>

<div class="print-btn"><button onclick="window.print()">🖨️ Imprimer / Enregistrer PDF</button></div>

<div class="header">
  <div>
    <div class="brand">Racines &amp; Rituels</div>
    <div class="brand-sub">Produits naturels &amp; artisanaux</div>
  </div>
  <div class="inv-meta">
    <div class="inv-number">${invoice_number || '—'}</div>
    ${order_number ? `<div class="inv-date">Commande : ${order_number}</div>` : ''}
    <div class="inv-date">Date : ${invoiceDate}</div>
  </div>
</div>

<div class="parties">
  <div class="party">
    <div class="party-label">Vendeur</div>
    <div class="party-name">Racines &amp; Rituels</div>
    <div class="party-info">contact@racinesetrituels.com</div>
  </div>
  <div class="party">
    <div class="party-label">Client</div>
    <div class="party-name">${customerName}</div>
    <div class="party-info">
      ${customerEmail ? customerEmail + '<br>' : ''}
      ${addressLines.join('<br>')}
    </div>
  </div>
</div>

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Désignation</th>
        <th>Qté</th>
        <th>Prix unitaire</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || '<tr><td colspan="4" style="padding:16px;color:#bbb;text-align:center;font-size:13px;">Aucun article</td></tr>'}
      ${shippingRow}
    </tbody>
  </table>
</div>

<div class="total-block">
  <div class="total-label">Total</div>
  <div class="total-amount">${fmt(grandTotal)}</div>
</div>

<div class="tva-note">TVA non applicable — article 293B du CGI</div>

<div class="footer">
  Racines &amp; Rituels · contact@racinesetrituels.com<br>
  Document généré le ${today}
</div>

</body>
</html>`;
}
