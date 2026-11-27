// Google Merchant Center : disponibilité réelle dans les pages produits, flux produits
// et données pour l'encart « Avis clients Google » de la page de confirmation.
import { readFile } from 'fs/promises';
import { escapeHtml } from './html-escape.js';

const SITE = 'https://www.racinesetrituels.com';

// Identifiants stables : ne jamais les changer, Merchant Center s'en sert pour suivre chaque produit.
export const PRODUITS_GOOGLE = [
  {
    slug: 'hibiscus-rouge',
    sku: 'RR-HIBISCUS-ROUGE-100G',
    titre: "Fleurs d'hibiscus rouge séchées (bissap) – sachet 100 g",
    description: "Fleurs entières d'hibiscus rouge (Hibiscus sabdariffa), le bissap d'Afrique de l'Ouest, choisies au Sénégal et emballées à la main en France. Infusion acidulée d'un rouge profond, sans caféine, à boire glacée ou chaude. Bissap glacé traditionnel : 50 g de fleurs pour 1,5 L d'eau. Sachet de 100 g.",
    images: ['hibiscus-rouge-sachet.jpg', 'hibiscus-rouge-cuillere.jpg'],
    type: "Infusions > Fleurs d'hibiscus",
  },
  {
    slug: 'hibiscus-blanc',
    sku: 'RR-HIBISCUS-BLANC-100G',
    titre: "Fleurs d'hibiscus blanc séchées – sachet 100 g",
    description: "Fleurs d'hibiscus blanc séchées, choisies au Sénégal et emballées à la main en France. Infusion plus douce et florale que le bissap rouge, sans caféine, chaude ou glacée. Sachet de 100 g.",
    images: ['hibiscus-blanc-sachet.jpg', 'hibiscus-blanc-infusion.jpg'],
    type: "Infusions > Fleurs d'hibiscus",
  },
  {
    slug: 'khamare',
    sku: 'RR-KHAMARE-100G',
    titre: 'Khamaré, racine de vétiver séchée – sachet 100 g',
    description: "Khamaré, la racine de vétiver utilisée en Afrique de l'Ouest pour parfumer l'eau à froid. Notes boisées et fraîches ; les mêmes racines servent plusieurs jours. Choisi au Sénégal et emballé à la main en France. Sachet de 100 g.",
    images: ['khamare-sachet.jpg', 'khamare-cuillere.jpg'],
    type: 'Infusions > Racines',
  },
];

const EN_STOCK = 'https://schema.org/InStock';
const EPUISE = 'https://schema.org/OutOfStock';

/** Disponible seulement si le produit est actif et qu'il en reste au moins un. */
export const estDisponible = (p) => !!p && p.is_active === true && Number(p.stock) > 0;

/** Remplace la disponibilité écrite dans les données structurées de la page. */
export function appliquerDisponibilite(html, disponible) {
  return html.replace(/"availability"\s*:\s*"https:\/\/schema\.org\/(?:InStock|OutOfStock)"/g,
    `"availability": "${disponible ? EN_STOCK : EPUISE}"`);
}

const euros = (cents) => (cents / 100).toFixed(2).replace('.', ',') + ' €';

/**
 * Remplace le prix écrit dans la page (données structurées, prix affiché, prix au kg)
 * par celui de la base, pour que Google voie le même prix dans la page et dans le flux.
 */
export function appliquerPrix(html, cents) {
  if (!Number.isInteger(cents) || cents <= 0) return html;
  return html
    .replace(/"price"\s*:\s*"\d+(?:\.\d+)?"/g, `"price": "${(cents / 100).toFixed(2)}"`)
    .replace(/(id="productPrice"[^>]*>)[^<]*(<)/, `$1${euros(cents)}$2`)
    .replace(/(id="productUnitPrice"[^>]*>)[^<]*(<)/, `$1soit ${euros(cents * 10)} le kg$2`);
}

/** Page produit avec prix et disponibilité de la base. */
export function appliquerProduit(html, base) {
  const avecDispo = appliquerDisponibilite(html, estDisponible(base));
  return base ? appliquerPrix(avecDispo, base.price_cents) : avecDispo;
}

/**
 * Lit prix et stock en base. Garde le résultat quelques instants pour ne pas
 * interroger la base à chaque visite. En cas d'erreur, renvoie null.
 */
export function creerLecteurProduits(supabase, { activityId, dureeMs = 60_000, maintenant = () => Date.now() } = {}) {
  if (!activityId) throw new Error('creerLecteurProduits : activityId manquant');
  let cache = null;
  return async function lireProduits() {
    if (cache && maintenant() - cache.le < dureeMs) return cache.produits;
    const { data, error } = await supabase.from('products')
      .select('slug, price_cents, stock, is_active')
      .eq('activity_id', activityId)
      .in('slug', PRODUITS_GOOGLE.map(p => p.slug));
    if (error || !Array.isArray(data)) {
      console.error('[merchant] lecture des produits :', error?.message || 'réponse vide');
      // Panne passagère : on garde la dernière lecture réussie plutôt que de tout annoncer en stock.
      return cache ? cache.produits : null;
    }
    const produits = new Map(data.map(p => [p.slug, p]));
    cache = { le: maintenant(), produits };
    return produits;
  };
}

const prix = (cents) => `${(cents / 100).toFixed(2)} EUR`;

/** Flux produits Google (RSS 2.0), relu chaque jour par Merchant Center. */
export function fluxGoogle(produits) {
  const items = PRODUITS_GOOGLE.flatMap((p) => {
    const base = produits.get(p.slug);
    if (!base || !Number.isInteger(base.price_cents)) return [];
    const [image, ...autres] = p.images.map(i => `${SITE}/public/images/${i}`);
    return [`    <item>
      <g:id>${p.sku}</g:id>
      <g:title>${escapeHtml(p.titre)}</g:title>
      <g:description>${escapeHtml(p.description)}</g:description>
      <g:link>${SITE}/${p.slug}.html</g:link>
      <g:image_link>${image}</g:image_link>
${autres.map(a => `      <g:additional_image_link>${a}</g:additional_image_link>`).join('\n')}
      <g:availability>${estDisponible(base) ? 'in_stock' : 'out_of_stock'}</g:availability>
      <g:price>${prix(base.price_cents)}</g:price>
      <g:brand>Racines &amp; Rituels</g:brand>
      <g:condition>new</g:condition>
      <g:identifier_exists>no</g:identifier_exists>
      <g:product_type>${escapeHtml(p.type)}</g:product_type>
      <g:unit_pricing_measure>100g</g:unit_pricing_measure>
      <g:unit_pricing_base_measure>1kg</g:unit_pricing_base_measure>
    </item>`];
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Racines &amp; Rituels</title>
    <link>${SITE}</link>
    <description>Plantes à infuser du Sénégal</description>
${items.join('\n')}
  </channel>
</rss>
`;
}

/** Date de livraison estimée (AAAA-MM-JJ) : préparation + Colissimo, en jours ouvrés. */
export function dateLivraisonEstimee(pays, depuis = new Date()) {
  let jours = String(pays || '').toUpperCase() === 'FR' ? 5 : 8;
  const d = new Date(Date.UTC(depuis.getUTCFullYear(), depuis.getUTCMonth(), depuis.getUTCDate()));
  while (jours > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const j = d.getUTCDay();
    if (j !== 0 && j !== 6) jours--;
  }
  return d.toISOString().slice(0, 10);
}

/** Pages produits servies avec le prix et la disponibilité réels. */
export function routesProduits(app, { lireProduits, dossierPages, enProd }) {
  const fichiers = new Map();
  const lireFichier = async (slug) => {
    if (!fichiers.has(slug)) fichiers.set(slug, await readFile(`${dossierPages}/${slug}.html`, 'utf8'));
    return fichiers.get(slug);
  };

  for (const { slug } of PRODUITS_GOOGLE) {
    app.get(`/${slug}.html`, async (req, res, next) => {
      try {
        const html = await lireFichier(slug);
        const produits = await lireProduits();
        // Base injoignable : page d'origine, sans la garder longtemps en cache.
        const corps = produits ? appliquerProduit(html, produits.get(slug)) : html;
        if (enProd) {
          res.setHeader('Cache-Control', produits
            ? 'public, max-age=0, s-maxage=300, stale-while-revalidate=600'
            : 'public, max-age=0, s-maxage=60');
        }
        res.type('html').send(corps);
      } catch (err) { next(err); }
    });
  }

  app.get('/merchant-feed.xml', async (req, res, next) => {
    try {
      const produits = await lireProduits();
      if (!produits) return res.status(503).type('text/plain').send('Flux indisponible, réessayer plus tard.');
      if (enProd) res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
      res.type('application/xml').send(fluxGoogle(produits));
    } catch (err) { next(err); }
  });
}

/**
 * Données de l'encart « Avis clients Google », données seulement à l'acheteur
 * (qui détient l'identifiant de paiement Stripe) et seulement après paiement.
 */
export function routeAvisGoogle(app, { stripe, merchantId }) {
  app.get('/public/avis-google', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const sessionId = String(req.query.session_id || '');
    if (!merchantId) return res.json({ actif: false });
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return res.status(400).json({ actif: false, error: 'invalid_session_id' });
    try {
      const s = await stripe.checkout.sessions.retrieve(sessionId);
      const email = s.customer_details?.email;
      const livraison = s.shipping_details || s.collected_information?.shipping_details;
      const pays = String(livraison?.address?.country || s.customer_details?.address?.country || 'FR').toUpperCase();
      if (s.payment_status !== 'paid') return res.json({ actif: false, attente: true });
      if (!email || !s.client_reference_id) return res.json({ actif: false });
      res.json({
        actif: true,
        merchant_id: Number(merchantId),
        order_id: s.client_reference_id,
        email,
        delivery_country: pays,
        // Calculée depuis la date de la commande : une visite tardive de la page ne la décale pas.
        estimated_delivery_date: dateLivraisonEstimee(pays, new Date((s.created || Date.now() / 1000) * 1000)),
      });
    } catch (err) {
      console.error('[avis-google] :', err.message);
      res.status(400).json({ actif: false });
    }
  });
}
