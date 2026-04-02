-- Migration 008: Backend helpers for Edge Functions
-- - dequeue_next_item(): atomic processing queue dequeue
-- - find_merchant_by_sender(): lookup merchant by email sender pattern
-- - Storage bucket: email-html

-- ============================================================
-- ATOMIC DEQUEUE FUNCTION
-- Used by process-queue Edge Function (cron */2 min)
-- SELECT FOR UPDATE SKIP LOCKED ensures safe concurrent execution
-- ============================================================

CREATE OR REPLACE FUNCTION dequeue_next_item()
RETURNS processing_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item processing_queue;
BEGIN
  SELECT *
    INTO item
    FROM processing_queue
   WHERE status = 'pending'
     AND (locked_until IS NULL OR locked_until < now())
   ORDER BY priority DESC, created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF item.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE processing_queue
     SET status       = 'processing',
         locked_until = now() + INTERVAL '5 minutes',
         attempts     = attempts + 1
   WHERE id = item.id
  RETURNING * INTO item;

  RETURN item;
END;
$$;

-- Allow service-role (used by Edge Functions) to call this function
GRANT EXECUTE ON FUNCTION dequeue_next_item() TO service_role;

-- ============================================================
-- MERCHANT LOOKUP BY SENDER EMAIL
-- Checks if the sender email matches any known_sender_patterns
-- e.g. sender 'shipping@amazon.fr' matches pattern '@amazon.fr'
-- ============================================================

CREATE OR REPLACE FUNCTION find_merchant_by_sender(sender_email TEXT)
RETURNS TABLE (
  id UUID,
  canonical_name TEXT,
  default_return_days INT,
  default_warranty_months INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT m.id, m.canonical_name, m.default_return_days, m.default_warranty_months
    FROM merchants m
   WHERE EXISTS (
     SELECT 1
       FROM unnest(m.known_sender_patterns) p
      WHERE sender_email ILIKE '%' || p || '%'
   )
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION find_merchant_by_sender(TEXT) TO service_role;

-- ============================================================
-- STORAGE BUCKET: email-html
-- Stores raw HTML of transactional emails for audit/re-processing
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-html',
  'email-html',
  false,
  10485760, -- 10 MB per file
  ARRAY['text/html']
)
ON CONFLICT (id) DO NOTHING;

-- Users can only read their own stored HTML files
-- Path pattern: {user_id}/{email_id}.html
CREATE POLICY "Users can read own email HTML"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'email-html'
    AND auth.uid()::text = split_part(name, '/', 1)
  );

-- Service role (Edge Functions) can write HTML files
CREATE POLICY "Service role can write email HTML"
  ON storage.objects
  FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'email-html');

CREATE POLICY "Service role can update email HTML"
  ON storage.objects
  FOR UPDATE
  TO service_role
  USING (bucket_id = 'email-html');
