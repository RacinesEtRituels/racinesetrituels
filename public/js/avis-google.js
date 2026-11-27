// Encart « Avis clients Google » sur la page de confirmation de commande.
// Rien n'est envoyé à Google tant que le client n'a pas cliqué sur le bouton :
// le script de Google n'est chargé qu'à ce moment-là.
(function () {
  'use strict';
  var sessionId = new URLSearchParams(window.location.search).get('session_id');
  if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return;

  var backend = '';
  try { backend = new URL((window.__ENV__ && window.__ENV__.BACKEND_URL) || window.location.origin).origin; }
  catch (e) { backend = window.location.origin; }

  function afficher(donnees) {
    var carte = document.querySelector('main .card');
    if (!carte) return;
    var bloc = document.createElement('section');
    bloc.id = 'avis-google';
    bloc.style.marginTop = '20px';
    var texte = document.createElement('p');
    texte.className = 'muted';
    texte.textContent = 'Votre avis aide une petite boutique à se faire connaître. Google peut vous envoyer un court questionnaire après la livraison. En cliquant, votre adresse email et le numéro de commande sont transmis à Google pour cet envoi.';
    var bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'secondary';
    bouton.textContent = 'Recevoir le questionnaire d’avis Google';
    bouton.addEventListener('click', function () {
      bouton.disabled = true;
      window.rrRenderAvisGoogle = function () {
        window.gapi.load('surveyoptin', function () {
          window.gapi.surveyoptin.render({
            merchant_id: donnees.merchant_id,
            order_id: donnees.order_id,
            email: donnees.email,
            delivery_country: donnees.delivery_country,
            estimated_delivery_date: donnees.estimated_delivery_date,
          });
        });
      };
      var s = document.createElement('script');
      s.src = 'https://apis.google.com/js/platform.js?onload=rrRenderAvisGoogle';
      s.async = true;
      s.onerror = function () { bouton.disabled = false; };
      document.head.appendChild(s);
    });
    bloc.appendChild(texte);
    bloc.appendChild(bouton);
    carte.appendChild(bloc);
  }

  var affiche = false;
  function charger() {
    if (affiche) return;
    fetch(backend + '/public/avis-google?session_id=' + encodeURIComponent(sessionId), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (affiche || !d) return;
        if (d.actif === true) { affiche = true; afficher(d); }
      })
      .catch(function () {});
  }
  // Paiement encore en validation au chargement : on réessaie quand success.js le confirme.
  window.addEventListener('rr-order-paid', function () { if (!affiche) charger(); });
  charger();
})();
