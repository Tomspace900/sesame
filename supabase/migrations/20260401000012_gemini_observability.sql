-- =============================================================
-- MIGRATION 012 : OBSERVABILITÉ GEMINI + QUEUE CHRONOLOGIQUE
-- =============================================================

-- ============================================================
-- 1. Réponse brute Gemini sur dossier_events
--    Permet de debugger les extractions incorrectes.
-- ============================================================

ALTER TABLE dossier_events ADD COLUMN IF NOT EXISTS raw_gemini_response JSONB;

-- ============================================================
-- 2. Réponse brute de classification sur emails
--    Permet de debugger les faux positifs / faux négatifs.
-- ============================================================

ALTER TABLE emails ADD COLUMN IF NOT EXISTS raw_classification_response JSONB;
