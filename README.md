- Migrations locales DB :
  ```bash
  npm run db:migrate
  # ou
  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run db:migrate
  ```
  Applique tous les fichiers server/sql/\*.sql via psql (inclut updated_at sur orders).

# Racines & Rituels – Frontend Supabase REST Auth

## Démarrage rapide (local)

```bash
npm install
npm run dev
```

- Backend : `http://localhost:3000` par défaut. Pour changer le port : `PORT=3001 npm run dev`.
- Frontend : `http://localhost:8000`.
- Si tu utilises un autre port API, définis `window.__ENV__.BACKEND_URL` dans `js/config.js`.
- Vérification rapide : `BACKEND_URL=http://localhost:3001 npm run test:backend-health` ou `curl $BACKEND_URL/health`.

## Configuration frontend (Supabase anon)

1. Copier l'exemple :

```bash
cp js/config.example.js js/config.js
```

2. Éditer `js/config.js` et remplacer `sb_publishable_XXXX` par votre clé **publishable** Supabase locale (jamais `sb_secret_`, jamais `service_role`). Supabase local fournit :

- Publishable (`sb_publishable_...`) pour le frontend (accepté)
- Secret (`sb_secret_...`) pour le backend uniquement (interdit côté navigateur)
- Legacy : une clé anon JWT `eyJ...` reste acceptée si vous l'utilisez.

3. Un seul runtime config frontend doit exister : `js/config.js` (gitignored). Ne pas multiplier les fichiers config.
4. `supabase-public.js` lit `window.__ENV__` défini par `js/config.js`.
5. Important : inclure `<script src="/js/config.js"></script>` **avant** tout `<script type="module">` qui importe `supabase-public.js`.
6. Vérification rapide (le fichier servi ne doit pas contenir le placeholder) :

```bash
curl -s http://localhost:8000/js/config.js | grep SUPABASE_ANON_KEY
```

doit retourner votre clé anon (pas `sb_publishable_XXXX`).

Commandes pratiques pour récupérer et injecter la clé publishable locale :

```bash
npx supabase status | grep Publishable
export SUPABASE_ANON_KEY="sb_publishable_..."
npm run fix:config
```

## Helper REST

- Utiliser `supabaseFetch(path, options)` depuis `js/supabase-public.js` pour tous les appels REST.
- En-têtes envoyés :
  - `apikey: <clé>` (toujours)
  - `Authorization: Bearer <clé>` **uniquement si la clé est un JWT (`eyJ...`)** ; pour une clé publishable `sb_publishable_...`, pas d'Authorization.
  - `Content-Type: application/json` automatiquement si body objet.
- En cas d’erreur HTTP, log structuré (status + body) et lève une erreur.

## Tests Supabase REST

- Pré-requis : Supabase local démarré sur `http://127.0.0.1:54321` et `SUPABASE_ANON_KEY` exportée dans l’env.
- Lancer :
  ```bash
  SUPABASE_ANON_KEY="<votre_anon>" npm run test:supabase-auth
  ```
- Ce test vérifie :
  - sans headers => 401 attendu
  - avec headers anon => 200 et JSON array

## Rappels sécurité

- Ne jamais exposer `sb_secret_` / `service_role` côté client (backend only).
- Pour le front, utiliser `sb_publishable_...` (recommandé) ; une clé anon JWT legacy reste acceptée et, dans ce cas seulement, l'en-tête Authorization sera envoyé.

## Tests E2E (Playwright)

- Pré-requis : front servi sur http://localhost:8000 et Supabase local actif.
- Lancer :
  ```bash
  npm run test:e2e
  ```
- Le test vérifie que la requête `/rest/v1/products` retourne 200 (pas 401), que le produit s’affiche et que le bouton "Ajouter au panier" est cliquable.
