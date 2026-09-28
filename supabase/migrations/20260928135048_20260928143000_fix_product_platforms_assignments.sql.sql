-- Drop the broken trigger, add updated_at column, re-create trigger
DROP TRIGGER IF EXISTS trg_product_platforms_updated_at ON public.product_platforms;
ALTER TABLE public.product_platforms ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
CREATE TRIGGER trg_product_platforms_updated_at
  BEFORE UPDATE ON public.product_platforms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Now fix platform assignments
-- Tempo: Uber ONLY
UPDATE product_platforms SET is_active = false
WHERE product_id = '5f35f719-8e04-4b89-bd7e-e0c78dcc6926'
AND platform_id IN (
  'd44a6059-be4f-4b60-a970-2e6c63b92351',
  '2f4b8467-f174-4ac1-8f51-171afb51798d',
  '3f82f3e9-9c20-4522-b9b9-4bc824a8178b',
  '897552db-2cd1-4428-b5fd-aad0e646146c'
);

-- Bike: Uber ONLY
UPDATE product_platforms SET is_active = false
WHERE product_id = 'dbba5ca8-6726-4d76-bb91-db60c69c453b'
AND platform_id IN (
  'd44a6059-be4f-4b60-a970-2e6c63b92351',
  '2f4b8467-f174-4ac1-8f51-171afb51798d',
  '3f82f3e9-9c20-4522-b9b9-4bc824a8178b',
  '897552db-2cd1-4428-b5fd-aad0e646146c'
);

-- Auto: Uber + Rapido only
UPDATE product_platforms SET is_active = false
WHERE product_id = 'e8a89cd5-f4bb-44a5-b886-60e3cd0d4cc9'
AND platform_id IN (
  'd44a6059-be4f-4b60-a970-2e6c63b92351',
  '3f82f3e9-9c20-4522-b9b9-4bc824a8178b',
  '897552db-2cd1-4428-b5fd-aad0e646146c'
);

-- Car: Uber + Rapido + Ola (remove FT variants)
UPDATE product_platforms SET is_active = false
WHERE product_id = 'f53b75f3-f586-4709-a2a2-72df7314981f'
AND platform_id IN (
  '3f82f3e9-9c20-4522-b9b9-4bc824a8178b',
  '897552db-2cd1-4428-b5fd-aad0e646146c'
);
