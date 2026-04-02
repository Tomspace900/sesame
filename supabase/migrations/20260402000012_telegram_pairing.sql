-- =============================================================
-- MIGRATION 012 : TELEGRAM PAIRING CODES
-- =============================================================
-- Table temporaire pour stocker les codes de couplage Telegram.
-- Flow : /start dans le bot → code généré → user le saisit dans l'app
-- → verify-telegram-pairing lie le chat_id au profil → code supprimé.
-- =============================================================

CREATE TABLE telegram_pairing_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE,
  telegram_chat_id TEXT NOT NULL UNIQUE, -- un seul code en attente par chat
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- RLS activé : aucune politique user (accès service_role uniquement via Edge Functions)
ALTER TABLE telegram_pairing_codes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Nettoyage automatique des codes expirés toutes les 15 min
-- ============================================================

SELECT cron.schedule(
  'sesame-cleanup-telegram-codes',
  '*/15 * * * *',
  $$DELETE FROM telegram_pairing_codes WHERE expires_at < now()$$
);

-- ============================================================
-- NOTE : setup du webhook Telegram (une seule fois par deploy)
--
-- Après deploy des Edge Functions, enregistre le webhook :
--
-- curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
--   -H "Content-Type: application/json" \
--   -d '{
--     "url": "https://<ref>.supabase.co/functions/v1/telegram-webhook",
--     "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
--   }'
--
-- Variables à ajouter dans Supabase Dashboard → Settings → Edge Functions :
--   TELEGRAM_BOT_TOKEN   = 123456:ABC-DEF...
--   TELEGRAM_WEBHOOK_SECRET = (random string, doit correspondre au secret_token ci-dessus)
-- ============================================================
