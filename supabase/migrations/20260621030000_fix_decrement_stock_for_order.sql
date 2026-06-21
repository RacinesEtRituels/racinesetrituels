-- =================================================================
-- Migration : fix_decrement_stock_for_order
-- Timestamp : 20260621030000
-- Cible     : public.orders (colonne), public.decrement_stock_for_order (fonction)
--
-- PROBLÈMES CORRIGÉS :
--   1. La fonction décrémentait le stock de TOUS les produits y compris
--      les abonnements (type='subscription'). Filtre ajouté : type='unit'.
--   2. L'idempotence reposait sur le champ orders.notes (JSON texte libre),
--      fragile si notes est écrasé. Remplacé par une colonne dédiée.
--   3. La fonction référençait inventory_movements (table absente).
--      La nouvelle version n'a aucune dépendance externe aux inventaires.
--
-- IMPACT PILOTAGE360 :
--   - Ajout de la colonne stock_decremented_at (nullable, pas de default) :
--     migration additive, aucune contrainte imposée, lecture Pilotage360
--     non affectée (nouvelle colonne = NULL pour toutes les lignes).
--   - DROP + re-CREATE de decrement_stock_for_order : le return type
--     change de TABLE(product_id, change) à void. Le backend R&R ne lit
--     pas le résultat. Aucun autre code Pilotage360 ne doit appeler cette
--     fonction — à vérifier avant application.
--   - Le trigger trg_stock_on_order_item (fn_stock_move_on_order_item)
--     n'est PAS modifié : il continue à tracer chaque order_item dans
--     inventory_moves à la création de commande.
--
-- IDEMPOTENCE :
--   - ALTER TABLE ... ADD COLUMN IF NOT EXISTS : no-op si colonne existe
--   - DROP FUNCTION IF EXISTS : no-op si fonction absente
--   - CREATE FUNCTION : remplace toujours (pas de IF NOT EXISTS sur FUNCTION)
--   - GRANT : no-op si déjà accordé
--
-- À APPLIQUER : Supabase Dashboard SQL Editor sur fjfutavsdlnernwtdsfu
--               ou pipeline pilotage360/supabase/migrations/.
-- NE PAS EXÉCUTER via supabase migration up (pipeline R&R invalide).
-- =================================================================

-- ---------------------------------------------------------------
-- Étape 1 : colonne d'idempotence sur orders
-- ---------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stock_decremented_at timestamptz;

COMMENT ON COLUMN public.orders.stock_decremented_at IS
  'Horodatage de la décrémentation stock par decrement_stock_for_order. NULL = pas encore décrémenté.';

-- ---------------------------------------------------------------
-- Étape 2 : suppression de l'ancienne fonction
-- (le return type change, CREATE OR REPLACE est impossible)
-- ---------------------------------------------------------------
DROP FUNCTION IF EXISTS public.decrement_stock_for_order(uuid);

-- ---------------------------------------------------------------
-- Étape 3 : nouvelle fonction corrigée
-- ---------------------------------------------------------------
CREATE FUNCTION public.decrement_stock_for_order(order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_payment_status        text;
  v_stock_decremented_at  timestamptz;
  v_product_id            uuid;
  v_item_qty              integer;
BEGIN
  -- Verrouille la commande pour éviter les décrements concurrents
  SELECT payment_status, stock_decremented_at
  INTO   v_payment_status, v_stock_decremented_at
  FROM   public.orders o
  WHERE  o.id = decrement_stock_for_order.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande % introuvable', decrement_stock_for_order.order_id;
  END IF;

  -- Sécurité : ne décrémente que les commandes payées
  IF v_payment_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Commande % non payée (statut : %)',
      decrement_stock_for_order.order_id, v_payment_status;
  END IF;

  -- Idempotence : déjà décrémenté → sortie silencieuse
  IF v_stock_decremented_at IS NOT NULL THEN
    RETURN;
  END IF;

  -- Décrémente uniquement les produits physiques (type = 'unit')
  -- Les abonnements (type = 'subscription') sont ignorés
  FOR v_product_id, v_item_qty IN
    SELECT oi.product_id, SUM(oi.qty)::integer
    FROM   public.order_items oi
    JOIN   public.products    p  ON p.id = oi.product_id
    WHERE  oi.order_id = decrement_stock_for_order.order_id
      AND  p.type = 'unit'
    GROUP  BY oi.product_id
  LOOP
    IF v_item_qty IS NULL OR v_item_qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour le produit % (commande %)',
        v_product_id, decrement_stock_for_order.order_id;
    END IF;

    UPDATE public.products
    SET    stock      = stock - v_item_qty,
           updated_at = now()
    WHERE  id         = v_product_id
      AND  stock IS NOT NULL
      AND  stock >= v_item_qty;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stock insuffisant pour le produit % (commande %)',
        v_product_id, decrement_stock_for_order.order_id;
    END IF;
  END LOOP;

  -- Marque la commande comme décrémentée (idempotence future)
  UPDATE public.orders
  SET    stock_decremented_at = now()
  WHERE  id = decrement_stock_for_order.order_id;
END;
$$;

-- ---------------------------------------------------------------
-- Étape 4 : grants (service_role requis pour supabase.rpc())
-- ---------------------------------------------------------------
REVOKE ALL ON FUNCTION public.decrement_stock_for_order(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.decrement_stock_for_order(uuid) TO service_role;
