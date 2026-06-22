# Changelog — Racines & Rituels

## v1.0.0 — 2026-06-22

Première version de production consolidée. Cette version couvre l'ensemble du flux commande de bout en bout, l'outillage IA support client, et l'intégration Pilotage360.

---

### Module Commandes

**Numérotation séquentielle automatique**
- `order_number` au format `RR-YYYY-NNNN` généré atomiquement au webhook Stripe
- `invoice_number` au format `FAC-YYYY-NNNNN` généré simultanément
- Compteur PostgreSQL via `next_document_number` (RPC, `ON CONFLICT DO UPDATE`) — sans race condition

**Snapshot produit**
- `order_items.product_name` capturé au moment du paiement
- Protège l'historique contre les renommages futurs de produits

**Email de confirmation**
- Bloc adresse de livraison ajouté au template `order-confirmation`
- Champs : nom destinataire, adresse complète, code postal, ville, pays

---

### Facturation client (`invoice.js`)

- Document HTML autonome, print-ready, sans dépendance backend pour l'impression
- Contient : numéro FAC, référence RR, date, adresse de livraison, tableau des articles, total
- Mention légale obligatoire : **TVA non applicable — article 293B du CGI**
- Route backend : `GET /admin/orders/:id/invoice` (protégée par `X-Admin-Secret`)

---

### Bon de préparation interne (`preparation-slip.js`)

- Document HTML interne, **non destiné au client**
- Contient : numéro RR, adresse de livraison, cases à cocher par article, quantités, 3 zones de signature
- Mention de bas de page : `DOCUMENT INTERNE — Ne pas joindre au colis client`
- Route backend : `GET /admin/orders/:id/preparation` (protégée par `X-Admin-Secret`)

---

### Workflow fulfillment

- Statuts : `pending` → `prepared` → `shipped` → `delivered` (annulation possible : `cancelled`)
- RPC `pilotage_update_order_fulfillment` — accessible depuis Pilotage360 via clé anon (SECURITY DEFINER)
- **Fix** : contrainte `orders_fulfillment_status_check` étendue pour inclure `prepared`
  (migration `20260622190000_add_prepared_to_fulfillment_status`)

---

### Agent SAV IA

- Lecture des emails entrants via Make (Gmail → webhook)
- Classification IA : type de demande, sentiment, urgence, réponse suggérée
- Stockage dans `ai_agent_runs` avec `input_summary`, `output_summary`, `error_message`, `related_email_id`
- Dashboard Pilotage360 : badges de surveillance SAV (emails traités, taux d'erreur, file d'attente)

---

### Dashboard IA (Pilotage360)

- Hook `useDashboard` : KPIs en temps réel depuis Supabase (revenus, commandes, abonnements, SAV)
- `KpiCard` amélioré : support couleur, tendances, sous-titres dynamiques
- `DashboardPage` restructurée : section SAV IA intégrée

---

### Optimisation Make (−96 %)

- Consolidation des scénarios Make : de ~25 opérations/exécution à 1
- Scénario Support Agent v1.0 : parsing Gmail → appel Claude → stockage Supabase → log
- Spécification complète dans `docs/03_MAKE_SUPPORT_AGENT.md`

---

### Sécurité & RLS

- Toutes les routes admin protégées par `requireAdmin` (`X-Admin-Secret`)
- RPCs Pilotage360 en SECURITY DEFINER — pas d'accès direct aux tables depuis l'extérieur
- Idempotence webhook : garde `.neq("payment_status", "paid")` — un seul traitement par commande

---

### Migrations appliquées en production

| Fichier | Contenu |
|---|---|
| `20260621000000_email_logs` | Table de logs emails |
| `20260621010000_fix_dangerous_anon_policies` | Durcissement RLS |
| `20260621020000_add_missing_orders_indexes` | Index performances |
| `20260621030000_fix_decrement_stock_for_order` | Correction décrémentation stock |
| `20260622180000_order_numbers_and_documents` | `order_sequences`, colonnes `order_number`, `invoice_number`, `product_name` |
| `20260622180100_pilotage_order_detail_rpc` | RPCs lecture commandes Pilotage360 |
| `20260622180200_pilotage_update_order_fulfillment` | RPC mise à jour fulfillment |
| `20260622190000_add_prepared_to_fulfillment_status` | Fix contrainte CHECK `prepared` |

---

### Commits inclus dans cette version

**racinesetrituels**
- `6194b66` fix: add prepared fulfillment status to orders constraint
- `6aeb132` feat(orders): add invoice, preparation slip and sequential numbering
- `bdd371c` chore(supabase): harden RLS and prepare production migrations
- `9681869` feat(security): add helmet, rate limiting, CORS hardening and robots.txt

**pilotage360**
- `81f37cb` fix: add prepared fulfillment status to orders constraint
- `d4290ce` feat(orders): add Racines order documents and fulfillment workflow
- `1ecc50d` feat(sav): add Agent SAV v1.0 — inbox IA badges and health monitoring
- `bd70e26` docs(agent): add Make scenario spec for Support Agent v0.1
- `ab1fb6f` feat(agent): add error_message + related_email_id to ai_agent_runs
- `7eb9232` docs: add JARVIS OS foundational docs and first agent spec
