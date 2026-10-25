import { renderLayout } from './layout.js';

const echapper = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Demande d'avis, envoyée une seule fois quelques jours après l'expédition.
 *
 * @param {object} data
 * @param {string}   [data.prenom]   - Prénom du client
 * @param {string[]} data.produits   - Noms des produits commandés
 * @param {string}   data.lien       - Lien personnel vers la page d'avis
 */
export function avisDemandeHtml({ prenom, produits = [], lien }) {
  const liste = produits.map((p) => `<li style="margin:0 0 6px;">${echapper(p)}</li>`).join('');
  const body = `
    <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#1b110e;">
      Bonjour${prenom ? ' ' + echapper(prenom) : ''},
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#555555;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">
      Votre colis vous est parvenu il y a quelques jours&nbsp;: qu&rsquo;avez-vous pens&eacute; de&nbsp;:
    </p>
    <ul style="margin:0 0 16px;padding-left:20px;font-size:15px;color:#333333;font-family:Arial,Helvetica,sans-serif;">
      ${liste}
    </ul>
    <p style="margin:0 0 8px;font-size:15px;color:#555555;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">
      Votre avis aide d&rsquo;autres personnes &agrave; d&eacute;couvrir ces plantes, et nous aide &agrave; nous am&eacute;liorer.
      Bon ou moins bon, il sera publi&eacute; tel quel. Cela prend une minute.
    </p>
  `;
  return renderLayout({
    title: 'Votre avis sur votre commande — Racines & Rituels',
    body,
    ctaText: 'Donner mon avis',
    ctaUrl: lien,
  });
}
