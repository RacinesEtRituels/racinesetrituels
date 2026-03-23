-- Ajoute la colonne manquante à la table orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- (Optionnel) Ajoute aussi created_at si elle manque, par sécurité
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
