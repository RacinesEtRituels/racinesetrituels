// avis-produit.js — affiche les avis publiés sur une fiche produit
// et ajoute la note moyenne aux données structurées Product (étoiles dans Google).
// Usage : <section id="avis-clients" data-produit="khamare"></section>

const zone = document.getElementById('avis-clients');

function etoiles(note) {
  const pleines = Math.round(note);
  return '★'.repeat(pleines) + '☆'.repeat(5 - pleines);
}

function dateFr(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function ajouterAuxDonneesStructurees(data) {
  const script = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .find((s) => { try { return JSON.parse(s.textContent)['@type'] === 'Product'; } catch { return false; } });
  if (!script) return;
  const produit = JSON.parse(script.textContent);
  produit.aggregateRating = { '@type': 'AggregateRating', ratingValue: data.moyenne, reviewCount: data.nombre, bestRating: 5, worstRating: 1 };
  produit.review = data.avis.slice(0, 5).map((a) => ({
    '@type': 'Review',
    author: { '@type': 'Person', name: a.auteur },
    datePublished: (a.decide_le || '').slice(0, 10),
    reviewRating: { '@type': 'Rating', ratingValue: a.note, bestRating: 5 },
    ...(a.texte ? { reviewBody: a.texte } : {}),
  }));
  script.textContent = JSON.stringify(produit);
}

async function afficher() {
  if (!zone) return;
  let data;
  try {
    const rep = await fetch(`/api/avis?produit=${encodeURIComponent(zone.dataset.produit)}`);
    if (!rep.ok) return;
    data = await rep.json();
  } catch { return; }
  if (!data.nombre) return; // pas d'avis : rien n'est affiché

  zone.hidden = false;
  zone.innerHTML = `
    <h2 class="text-lg font-bold mb-1">Avis clients</h2>
    <p class="text-sm mb-4"><span class="text-primary text-lg" aria-hidden="true"></span>
      <strong class="moyenne"></strong> · <span class="nombre"></span></p>
    <ul class="space-y-4 liste"></ul>
    <p class="mt-4 text-xs text-gray-500 dark:text-gray-400">
      Avis déposés uniquement par des clients ayant commandé ce produit, via un lien personnel envoyé après l'expédition.
      Tous les avis sont publiés, positifs comme négatifs, sauf propos injurieux, hors sujet ou contenant des données personnelles ou des promesses de santé.
      Aucune contrepartie n'est offerte. Les avis sont classés du plus récent au plus ancien.
      <a href="/cgv.html#avis" class="underline">En savoir plus</a>
    </p>`;
  zone.querySelector('[aria-hidden]').textContent = etoiles(data.moyenne) + ' ';
  zone.querySelector('.moyenne').textContent = `${String(data.moyenne).replace('.', ',')} sur 5`;
  zone.querySelector('.nombre').textContent = `${data.nombre} avis`;

  const liste = zone.querySelector('.liste');
  for (const a of data.avis) {
    const li = document.createElement('li');
    li.className = 'border-b border-gray-200 dark:border-white/10 pb-4';
    li.innerHTML = `
      <p class="text-primary" aria-label="${a.note} sur 5">${etoiles(a.note)}</p>
      <p class="text-sm mt-1 texte"></p>
      <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
        <strong class="auteur"></strong> · Achat vérifié · avis publié le ${dateFr(a.decide_le)} (commande expédiée le ${dateFr(a.date_experience)})
      </p>`;
    li.querySelector('.texte').textContent = a.texte || '';
    if (!a.texte) li.querySelector('.texte').remove();
    li.querySelector('.auteur').textContent = a.auteur;
    if (a.reponse) {
      const rep = document.createElement('p');
      rep.className = 'text-sm mt-2 pl-3 border-l-2 border-primary';
      rep.textContent = `Réponse de Racines & Rituels : ${a.reponse}`;
      li.appendChild(rep);
    }
    liste.appendChild(li);
  }
  ajouterAuxDonneesStructurees(data);
}

afficher();
