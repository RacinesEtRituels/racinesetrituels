# server/sql/ — Patches SQL historiques

## Statut : ARCHIVÉ — NE PAS EXÉCUTER SANS AUDIT

Ces fichiers sont des **patches manuels** appliqués autrefois via le SQL Editor du dashboard
Supabase sur l'ancien projet cloud "Racines&Rituels" (Stockholm, `tjapqrfpgwmsavjtgoml`).

Ce projet est **abandonné**. Racines & Rituels utilise désormais le **Supabase Core partagé**
(Londres, `fjfutavsdlnernwtdsfu`), dont le schéma est radicalement différent.

---

## ⛔ NE PAS EXÉCUTER SANS AUDIT PRÉALABLE

Ces fichiers **ne sont pas compatibles** avec le schéma actuel du Supabase Core. Les appliquer
sur l'instance locale ou cloud provoquerait :

- des conflits de colonnes (`total_cents` vs `total_ttc_cents`, `active` vs `is_active`, etc.)
- des tables créées sans le préfixe `public.` (risque de search_path)
- des colonnes ajoutées qui n'existent pas dans le schéma cible (`stripe_session_id`,
  `amount_total`, `receipt_email_sent_at`, `user_id`…)
- des doublons avec les tables Pilotage360 (`subscriptions`, `inventory_movements`, `print_jobs`)

---

## Description de chaque fichier

| Fichier | Ce qu'il faisait | Compatible Core actuel ? |
|---|---|---|
| `001_stripe_supabase.sql` | CREATE TABLE customers, subscriptions, webhook_events + ALTER TABLE orders | ❌ Schéma incompatible |
| `002_orders_stripe_hardening.sql` | ADD COLUMN stripe_payment_intent_id + index unique | ❌ Colonne absente du Core |
| `003_orders_updated_at.sql` | ADD COLUMN updated_at + trigger | ❌ updated_at déjà présent dans le Core |
| `004_orders_receipt_email.sql` | ADD COLUMN amount_total, receipt_email_*, last_error_* | ❌ Colonnes absentes du Core |
| `005_orders_customer_email_amount_currency.sql` | Doublon de 004 + UPDATE backfill | ❌ Doublon inutile |
| `006_customer_auth_trigger.sql` | TRIGGER auth.users → public.customers (création profil) | ⚠️ Voir ci-dessous |

---

## Seul fichier potentiellement réutilisable : `006_customer_auth_trigger.sql`

`006_customer_auth_trigger.sql` crée un trigger Supabase Auth qui insère automatiquement
un profil dans `public.customers` lors de chaque inscription utilisateur.

**Avant toute application sur le Supabase Core :**

1. Vérifier que la table `public.customers` du Core a bien les colonnes `id`, `email`, `name`
   dans la structure attendue par le trigger.
2. Vérifier qu'aucun trigger équivalent (`on_auth_user_created`) n'existe déjà sur le Core.
3. Adapter les noms de champs (`prenom` → `first_name` selon la config Auth Pilotage360).
4. Tester sur l'instance locale avant toute application cloud.

---

## Supabase Core partagé

Racines & Rituels est intentionnellement couplé au **Supabase Core Pilotage360**.

| Paramètre | Valeur |
|---|---|
| URL locale | `http://127.0.0.1:54321` |
| Projet cloud | `fjfutavsdlnernwtdsfu` (Racines-Core, Londres) |
| Port Postgres local | `54322` |
| Géré par | `~/Projects/pilotage360/supabase/` |

Le schéma réel des tables utilisées par le backend est défini dans :
```
~/Projects/pilotage360/supabase/migrations/20260514033833_remote_schema.sql
```

Tables utilisées par `server.js` :
- `public.orders` — avec `activity_id`, `channel_id`, `total_ttc_cents`, `payment_status`, etc.
- `public.order_items` — avec `qty`, `unit_sale_price_ttc_cents`
- `public.products` — avec `is_active`, `slug`, `stripe_price_id`
- `public.customers`
- `public.activities` / `public.channels` (FK NOT NULL sur orders)

---

## Prochaine étape recommandée

Si une reproductibilité locale autonome est un jour souhaitée pour Racines & Rituels :

1. Créer un projet Supabase dédié (`supabase init` avec un port libre, ex. 54330)
2. Écrire des migrations **depuis zéro** basées sur le schéma réel du Core actuel
3. Vérifier la compatibilité de `006_customer_auth_trigger.sql` sur ce nouveau projet
4. Ne jamais appliquer les fichiers de ce dossier tels quels

Pour l'heure : ce dossier est conservé comme **archive historique** uniquement.
