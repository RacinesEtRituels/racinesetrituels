// Avis clients : demande par email après expédition, dépôt via un lien personnel
// (achat vérifié), lecture des avis publiés pour les fiches produit.
// Les avis sont validés dans Pilotage360 (fonction avis_decider) avant publication.

import crypto from "crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { EmailService } from "./emails/send.js";

const PRODUITS = ["khamare", "hibiscus-rouge", "hibiscus-blanc"];
const JOURS_APRES_EXPEDITION = 5;
const FENETRE_ENVOI_JOURS = 30;   // au-delà, la commande est trop ancienne pour demander un avis
const VALIDITE_LIEN_JOURS = 60;
const ENVOIS_PAR_PASSAGE = 20;

const hacher = (jeton) => crypto.createHash("sha256").update(jeton).digest("hex");
const ilYa = (jours) => new Date(Date.now() - jours * 24 * 60 * 60 * 1000).toISOString();
const prenomDe = (nom) => (typeof nom === "string" ? nom.trim().split(/\s+/)[0] : "") || null;

export function createAvisRouter({ supabase, activityId, siteUrl }) {
  const router = Router();
  const depotLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

  // Demande d'avis restante pour un jeton, avec la commande et ses produits.
  async function demandeDuJeton(jeton) {
    if (typeof jeton !== "string" || jeton.length < 20 || jeton.length > 100) return null;
    const { data: demande } = await supabase
      .from("avis_demandes")
      .select("order_id, expire_le, utilise_le")
      .eq("jeton_hash", hacher(jeton))
      .maybeSingle();
    if (!demande || new Date(demande.expire_le) < new Date()) return null;

    const { data: commande } = await supabase
      .from("orders")
      .select("id, shipped_at, order_items(product_name, products(slug, name))")
      .eq("id", demande.order_id)
      .maybeSingle();
    if (!commande) return null;

    const produits = [];
    for (const ligne of commande.order_items ?? []) {
      const slug = ligne.products?.slug;
      if (PRODUITS.includes(slug) && !produits.some((p) => p.slug === slug)) {
        produits.push({ slug, nom: ligne.products?.name || ligne.product_name });
      }
    }
    return { demande, commande, produits };
  }

  // Appelé chaque jour par pg_cron : envoie les demandes d'avis dues.
  router.post("/demandes", async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.get("authorization") !== `Bearer ${secret}`) return res.status(401).json({ error: "Non autorisé" });

    const { data: commandes, error } = await supabase
      .from("orders")
      .select("id, order_number, shipping_name, customer_id, customers(email, full_name), avis_demandes(order_id), order_items(product_name, products(slug, name))")
      .eq("activity_id", activityId)
      .eq("payment_status", "paid")
      .lte("shipped_at", ilYa(JOURS_APRES_EXPEDITION))
      .gte("shipped_at", ilYa(FENETRE_ENVOI_JOURS))
      .order("shipped_at")
      .limit(100);
    if (error) return res.status(500).json({ error: error.message });

    const resultats = [];
    for (const commande of commandes ?? []) {
      if (resultats.length >= ENVOIS_PAR_PASSAGE) break;
      // Déjà demandé (relation 1-1 : PostgREST renvoie un objet, ou un tableau selon la version)
      if (Array.isArray(commande.avis_demandes) ? commande.avis_demandes.length > 0 : commande.avis_demandes) continue;
      const email = commande.customers?.email;
      const produits = [...new Set((commande.order_items ?? [])
        .filter((l) => PRODUITS.includes(l.products?.slug))
        .map((l) => l.products?.name || l.product_name))];
      if (!email || produits.length === 0) continue;

      // La demande est enregistrée avant l'envoi : jamais deux emails pour une même commande.
      const jeton = crypto.randomBytes(24).toString("base64url");
      const { error: insertError } = await supabase.from("avis_demandes").insert({
        order_id: commande.id,
        jeton_hash: hacher(jeton),
        expire_le: new Date(Date.now() + VALIDITE_LIEN_JOURS * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (insertError) { resultats.push({ commande: commande.order_number, erreur: insertError.message }); continue; }

      try {
        await EmailService.send({
          template: "avis-demande",
          to: email,
          data: {
            prenom: prenomDe(commande.customers?.full_name || commande.shipping_name),
            produits,
            lien: `${siteUrl}/avis.html?t=${jeton}`,
          },
          orderId: commande.id,
          customerId: commande.customer_id,
          logMetadata: { source: "avis_demandes" },
        });
        resultats.push({ commande: commande.order_number, envoye: true });
      } catch (err) {
        // Échec d'envoi : on retire la demande pour réessayer au prochain passage.
        await supabase.from("avis_demandes").delete().eq("order_id", commande.id);
        resultats.push({ commande: commande.order_number, erreur: err.message });
      }
    }
    res.json({ envoyes: resultats.filter((r) => r.envoye).length, resultats });
  });

  // Page d'avis : ce que le client peut noter.
  router.get("/commande", depotLimiter, async (req, res) => {
    const trouvee = await demandeDuJeton(req.query.t);
    if (!trouvee) return res.status(404).json({ error: "Ce lien n'est plus valable." });
    if (trouvee.demande.utilise_le) return res.status(409).json({ error: "Merci, votre avis a déjà été enregistré." });
    res.json({ produits: trouvee.produits });
  });

  // Dépôt des avis (une seule fois par lien).
  router.post("/commande", depotLimiter, async (req, res) => {
    const { t, auteur, avis } = req.body || {};
    const trouvee = await demandeDuJeton(t);
    if (!trouvee) return res.status(404).json({ error: "Ce lien n'est plus valable." });
    if (trouvee.demande.utilise_le) return res.status(409).json({ error: "Merci, votre avis a déjà été enregistré." });

    const nom = typeof auteur === "string" ? auteur.trim().slice(0, 40) : "";
    if (!nom) return res.status(400).json({ error: "Indiquez le nom à afficher (par exemple votre prénom)." });
    const slugs = trouvee.produits.map((p) => p.slug);
    const lignes = (Array.isArray(avis) ? avis : [])
      .filter((a) => slugs.includes(a?.produit) && Number.isInteger(a?.note) && a.note >= 1 && a.note <= 5)
      .map((a) => ({
        activity_id: activityId,
        order_id: trouvee.commande.id,
        produit_slug: a.produit,
        note: a.note,
        texte: typeof a.texte === "string" && a.texte.trim() ? a.texte.trim().slice(0, 1000) : null,
        auteur: nom,
        date_experience: (trouvee.commande.shipped_at || new Date().toISOString()).slice(0, 10),
      }));
    if (lignes.length === 0) return res.status(400).json({ error: "Donnez une note à au moins un produit." });

    // Le lien est marqué utilisé d'abord : un double clic n'enregistre pas deux fois.
    const { data: marque } = await supabase
      .from("avis_demandes")
      .update({ utilise_le: new Date().toISOString() })
      .eq("order_id", trouvee.commande.id)
      .is("utilise_le", null)
      .select("order_id");
    if (!marque || marque.length === 0) return res.status(409).json({ error: "Merci, votre avis a déjà été enregistré." });

    const { error } = await supabase.from("avis_clients").insert(lignes);
    if (error) {
      await supabase.from("avis_demandes").update({ utilise_le: null }).eq("order_id", trouvee.commande.id);
      return res.status(500).json({ error: "Enregistrement impossible, réessayez dans un instant." });
    }
    res.status(201).json({ ok: true });
  });

  // Avis publiés d'un produit, pour sa fiche.
  router.get("/", async (req, res) => {
    const produit = req.query.produit;
    if (!PRODUITS.includes(produit)) return res.status(400).json({ error: "Produit inconnu" });
    const { data, error } = await supabase
      .from("avis_clients")
      .select("note, texte, auteur, date_experience, decide_le, reponse")
      .eq("produit_slug", produit)
      .eq("statut", "publie")
      .order("decide_le", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    const avis = data ?? [];
    const moyenne = avis.length ? Math.round((avis.reduce((t, a) => t + a.note, 0) / avis.length) * 10) / 10 : null;
    res.set("Cache-Control", "public, max-age=300");
    res.json({ nombre: avis.length, moyenne, avis: avis.slice(0, 30) });
  });

  return router;
}
