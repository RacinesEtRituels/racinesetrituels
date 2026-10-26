// Accès à la gestion des influenceurs.
//
// La décision appartient à la base partagée : public.can_access_activity(), évaluée
// avec le jeton de l'appelant, applique les mêmes règles que Pilotage360 —
// administrateur ou membre de l'activité, et second facteur (aal2) pour les comptes
// dont le profil l'exige. Lire user_profiles avec la clé serveur contournerait ces règles.

// Vérifie le jeton puis interroge la base sous l'identité de l'appelant.
// Renvoie 'invalid' (session absente ou expirée), true (autorisé) ou false (refusé).
export function supabaseActivityAccess({ createClient, url, anonKey, activityId, getUser }) {
  return async (token) => {
    const { data: userData, error: userError } = await getUser(token);
    if (userError || !userData?.user) return 'invalid';
    if (!anonKey) throw new Error('anon_key_missing');
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await caller.rpc('can_access_activity', { p_activity_id: activityId });
    if (error) throw new Error('access_check_failed');
    return data === true;
  };
}

// Middleware Express. Le mot de passe admin du site reste une voie distincte
// (pages admin-*.html) : il ne passe pas par la MFA de Pilotage360.
export function requireAffiliateManagerWith({ adminSecret, checkAccess }) {
  return async (req, res, next) => {
    if (adminSecret && req.headers['x-admin-secret'] === adminSecret) return next();

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Non autorisé.' });

    try {
      const access = await checkAccess(token);
      if (access === 'invalid') return res.status(401).json({ error: 'Session invalide ou expirée.' });
      if (access !== true) {
        return res.status(403).json({ error: 'Accès refusé. Les comptes protégés doivent valider leur second facteur dans Pilotage360.' });
      }
      next();
    } catch (err) {
      console.error('[affiliates] contrôle d’accès indisponible :', err.message);
      res.status(503).json({ error: 'Vérification des droits indisponible. Réessayez dans un instant.' });
    }
  };
}
