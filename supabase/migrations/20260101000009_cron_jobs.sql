-- Migration 009: Cron jobs via pg_cron + pg_net
--
-- pg_cron + pg_net appellent les Edge Functions depuis la DB.
--
-- LOCAL (macOS Docker Desktop) : les functions sont accessibles depuis le
--   container PostgreSQL via host.docker.internal:54321
--   → URL = http://host.docker.internal:54321/functions/v1
--
-- PRODUCTION (Supabase Cloud) : après le premier deploy, exécute une seule fois :
--   UPDATE cron.job
--     SET command = replace(command, 'host.docker.internal:54321', '<ref>.supabase.co')
--   WHERE jobname LIKE 'sesame-%';
--   (ou mets à jour manuellement dans le Dashboard → Database → Cron Jobs)

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- JOB 1 — process-queue (*/2 min)
-- Dépile un item de la queue, classe + extrait avec Gemini
-- ============================================================

SELECT cron.schedule(
  'sesame-process-queue',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url        := 'http://host.docker.internal:54321/functions/v1/process-queue',
    headers    := '{"Content-Type": "application/json"}'::jsonb,
    body       := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $cron$
);

-- ============================================================
-- JOB 2 — renew-watches (tous les 5 jours à minuit)
-- Renouvelle les Gmail Pub/Sub watches avant expiration
-- ============================================================

SELECT cron.schedule(
  'sesame-renew-watches',
  '0 0 */5 * *',
  $cron$
  SELECT net.http_post(
    url        := 'http://host.docker.internal:54321/functions/v1/renew-watches',
    headers    := '{"Content-Type": "application/json"}'::jsonb,
    body       := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);

-- ============================================================
-- JOB 3 — check-deadlines (tous les jours à 8h UTC = 9h CET)
-- Vérifie les deadlines et envoie les rappels Telegram
-- ============================================================

SELECT cron.schedule(
  'sesame-check-deadlines',
  '0 8 * * *',
  $cron$
  SELECT net.http_post(
    url        := 'http://host.docker.internal:54321/functions/v1/check-deadlines',
    headers    := '{"Content-Type": "application/json"}'::jsonb,
    body       := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $cron$
);

-- Vérification : SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
