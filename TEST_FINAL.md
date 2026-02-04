# 🧪 PROCÉDURE DE TEST - Racines & Rituels

## ✅ Vérification préalable

```bash
bash scripts/verify-setup.sh
```

**Attendu:** Tous les checks ✅

- Scripts présents et exécutables
- package.json configuré
- Dépendances installées (concurrently, http-server)
- Docker CLI + Supabase CLI + Stripe CLI (optionnel)
- Configuration backend (.env)

---

## 🚀 Test 1: Démarrage complet

```bash
npm run dev
```

**Attendu:**

1. ✅ Ports 3000 et 8000 libérés
2. ✅ Docker vérifié
3. ✅ Supabase démarré
4. ✅ Backend opérationnel (PID affiché)
5. ✅ Frontend opérationnel (PID affiché)
6. ✅ Stripe CLI actif OU warning si absent
7. ✅ Résumé affiché avec URLs

---

## 🧪 Test 2: Endpoints (nouveau terminal)

### 2.1 Health check

```bash
curl http://localhost:3000/health
```

**Attendu:** `{"ok": true, ...}`

### 2.2 Frontend

```bash
curl -I http://localhost:8000/ | head -n 1
```

**Attendu:** `HTTP/1.1 200 OK`

### 2.3 Checkout automatisé (RECOMMANDÉ)

```bash
npm run test:checkout
```

**Attendu:**

- ✅ Backend opérationnel
- ✅ Produit trouvé (ID, nom, prix)
- ✅ Checkout session créée
- ✅ Code HTTP 200
- ✅ URL Stripe affichée

**⚠️ N'utilise JAMAIS de product_id hardcodé!** Ce test récupère automatiquement un produit réel.

---

## 🛑 Test 3: Arrêt propre

Dans le terminal `npm run dev`:

```
Ctrl+C
```

**Attendu:**

- Message "Arrêt des services..."
- Backend tué
- Frontend tué
- Stripe CLI tué (si présent)
- "Services arrêtés" affiché
- Retour au prompt

---

## 🔁 Test 4: Idempotence

```bash
npm run dev
```

**Attendu:**

- ✅ Ports libérés sans erreur
- ✅ Docker OK
- ✅ Supabase réutilisé (message "déjà démarré")
- ✅ Backend redémarre
- ✅ Frontend redémarre
- ✅ Résumé affiché

**Pas d'erreur, pas de reset DB involontaire**

---

## 📝 Test 5: Logs

```bash
# Terminal 1
npm run dev

# Terminal 2
tail -f logs/backend.log   # Logs Express
tail -f logs/frontend.log  # Logs http-server
tail -f logs/stripe.log    # Logs Stripe CLI (si présent)
```

**Attendu:** Logs en temps réel, pas d'erreur critique

---

## ❌ Test 6: Gestion d'erreurs

### 6.1 Docker non démarré

1. Arrête Docker Desktop
2. Lance `npm run dev`
3. **Attendu:** Message clair "Docker n'est pas démarré", exit 1

### 6.2 Port déjà occupé

1. Lance manuellement: `node server/server.js`
2. Lance `npm run dev`
3. **Attendu:** Port 3000 libéré automatiquement, backend redémarre

---

## 🎉 Résultat attendu

Si **TOUS les tests passent**:
✅ **Workflow ultra-stable et professionnel validé**

Si un test échoue:
❌ Consulte [QUICKSTART.md](QUICKSTART.md) section Troubleshooting

## ✅ Si tous les tests passent:

**Le workflow est 100% opérationnel!**

## 🆘 Si un test échoue:

Consulte [SETUP.md](SETUP.md) section Troubleshooting
