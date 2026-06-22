-- Fix: ajoute 'prepared' aux valeurs autorisées pour fulfillment_status
-- Le statut 'prepared' est utilisé par le Module Commandes (Pilotage360)
-- Le flux est : pending → prepared → shipped → delivered
ALTER TABLE orders
  DROP CONSTRAINT orders_fulfillment_status_check,
  ADD CONSTRAINT orders_fulfillment_status_check
    CHECK (fulfillment_status = ANY (ARRAY[
      'pending', 'prepared', 'processing', 'shipped', 'delivered', 'cancelled'
    ]));
