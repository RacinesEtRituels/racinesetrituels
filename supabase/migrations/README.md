# supabase/migrations/ — Migrations historiques (projet abandonné)

## Statut : OBSOLÈTE — NE PAS APPLIQUER SUR LE SUPABASE CORE

Ces migrations décrivent le schéma de l'**ancien projet Supabase cloud "Racines&Rituels"**
(Stockholm, `tjapqrfpgwmsavjtgoml`), qui a été abandonné.

Racines & Rituels utilise désormais le **Supabase Core partagé** (Londres,
`fjfutavsdlnernwtdsfu`), dont le schéma est géré par Pilotage360.

---

## ⛔ NE PAS EXÉCUTER SANS AUDIT PRÉALABLE

Ces migrations ne sont **pas compatibles** avec le schéma actuel. Les appliquer via
`supabase db reset` ou `supabase migration up` sur l'instance locale ou cloud provoquerait :

- La création de tables avec le mauvais schéma (`orders` avec `total_cents`, `stripe_session_id`,
  `user_id`, `shipping_address jsonb` au lieu de `total_ttc_cents`, `activity_id`, `channel_id`,
  `shipping_name/address1/city/…`)
- Des colonnes `quantity`/`unit_price_cents` dans `order_items` au lieu de `qty`/`unit_sale_price_ttc_cents`
- Des conflits avec les tables existantes du Core Pilotage360
- Un backend (`server.js`) qui planterait immédiatement à l'insertion

---

## Description de chaque migration

| Fichier | Ce qu'elle fait | Statut |
|---|---|---|
| `0001_bootstrap.sql` | Tables de base : products, customers, orders, order_items, webhook_events, inventory_movements, triggers, seed | ❌ Schéma incompatible avec le Core actuel |
| `20251221_stripe.sql` | Tables Stripe : subscriptions, print_jobs, integration_events | ❌ Schéma différent, tables déjà gérées par le Core |
| `20251222_create_products.sql` | No-op (`SELECT 1`) — migration dépréciée à l'époque | ✅ Inoffensive |
| `20251223_add_user_id.sql` | `ALTER TABLE orders ADD COLUMN user_id` | ❌ La vraie table orders n'a pas cette colonne |
| `20260323_upsert_frontend_products.sql` | UPSERT khamare, hibiscus-blanc, hibiscus-rouge (placeholders Stripe) | ⚠️ Slugs corrects mais colonnes incompatibles (`active` vs `is_active`, manque `activity_id`) |

---

## Supabase Core partagé

Racines & Rituels est intentionnellement couplé au **Supabase Core Pilotage360**.
Il n'y a pas de `config.toml` dans ce dossier car aucun projet Supabase local dédié
n'est initialisé pour Racines & Rituels.

| Paramètre | Valeur |
|---|---|
| URL locale | `http://127.0.0.1:54321` |
| Projet cloud actif | `fjfutavsdlnernwtdsfu` (Racines-Core, Londres) |
| Géré par | `~/Projects/pilotage360/supabase/` |
| Schéma de référence | `20260514033833_remote_schema.sql` (dans pilotage360) |

Le schéma réel des tables qu'utilise `server.js` est fondamentalement différent de ce
que décrivent ces migrations. Voir `server/sql/README.md` pour le détail.

---

## Pourquoi ce dossier existe-t-il encore ?

Ces fichiers représentent une tentative antérieure d'outiller Racines & Rituels avec
son propre projet Supabase. Cette piste a été abandonnée au profit du Supabase Core
partagé. Les fichiers sont conservés comme **référence historique** uniquement.

---

## Prochaine étape recommandée

Si une reproductibilité locale autonome est souhaitée à l'avenir :

1. Décider si Racines & Rituels doit avoir son propre projet Supabase (`supabase init`,
   port dédié ex. 54330) ou continuer à partager le Core Pilotage360
2. Si projet dédié : écrire les migrations **depuis zéro** à partir du schéma réel actuel
   (`~/Projects/pilotage360/supabase/migrations/20260514033833_remote_schema.sql`)
3. Ne jamais appliquer les fichiers de ce dossier tels quels

En attendant cette décision : **conserver ce dossier tel quel, ne rien appliquer**.
