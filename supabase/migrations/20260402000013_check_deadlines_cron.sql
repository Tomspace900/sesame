-- =============================================================
-- MIGRATION 013 : CHECK-DEADLINES CRON
-- =============================================================
-- Cron quotidien à 8h UTC (= 9h CET / 10h CEST) pour vérifier
-- les deadlines et envoyer les rappels Telegram.
-- =============================================================

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
