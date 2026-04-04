-- =============================================================
-- MIGRATION 011 : LINKING DÉTERMINISTE PAR IDENTIFIANTS
-- =============================================================
-- Remplace le linking Gemini par un système déterministe basé sur
-- une table d'identifiants structurés + RPC transactionnel atomique.
-- Philosophie : simple, générique, robuste. Zéro heuristique.

-- ============================================================
-- 1. Table dossier_identifiers
-- ============================================================

CREATE TABLE dossier_identifiers (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id       UUID        NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES auth.users(id),
  identifier_type  TEXT        NOT NULL,
  -- Valeurs attendues : order_ref, tracking_number, pnr, booking_id,
  --                     confirmation_code, invoice_number, receipt_id, ride_id
  -- Pas de CHECK : Gemini peut introduire de nouveaux types valides.
  identifier_value TEXT        NOT NULL,
  source           TEXT        NOT NULL DEFAULT 'extraction'
                               CHECK (source IN ('extraction', 'regex', 'manual')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, identifier_type, identifier_value)
);

ALTER TABLE dossier_identifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own identifiers"
  ON dossier_identifiers FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_dossier_identifiers_lookup
  ON dossier_identifiers(user_id, identifier_type, identifier_value);
CREATE INDEX idx_dossier_identifiers_dossier
  ON dossier_identifiers(dossier_id);

-- ============================================================
-- 2. RPC process_email_result — TRANSACTIONNEL ATOMIQUE
--
-- Encapsule dans une seule transaction Postgres :
--   1. Lookup dossier existant via identifiants
--   2a. Attach (mise à jour) OU 3. Create (nouveau dossier)
--   4. Insert dossier_event (idempotent via UNIQUE(email_id))
--   5. Register identifiers (ON CONFLICT DO NOTHING)
--   6. Merge on collision (fusionner si deux dossiers partagent un identifiant)
--
-- L'Edge Function ne persiste rien directement — tout passe ici.
-- En cas d'échec → ROLLBACK complet, l'item queue reste pending pour retry.
-- ============================================================

CREATE OR REPLACE FUNCTION process_email_result(
  p_user_id               UUID,
  p_email_id              UUID,
  p_dossier_type          TEXT,
  p_merchant_id           UUID,
  p_new_status            TEXT,
  p_dossier_fields        JSONB,   -- tous les champs dossier (title, dates, tracking, etc.)
  p_event_type            TEXT,
  p_extracted_data        JSONB,
  p_extraction_confidence NUMERIC,
  p_human_summary         TEXT,
  p_raw_gemini_response   JSONB,
  p_identifiers           JSONB    -- [{"type": "order_ref", "value": "...", "source": "extraction"}]
)
RETURNS TABLE(out_dossier_id UUID, out_is_new BOOLEAN, out_was_merged BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
  v_dossier_id      UUID;
  v_is_new          BOOLEAN := FALSE;
  v_was_merged      BOOLEAN := FALSE;
  v_current_status  TEXT;
  v_resolved_status TEXT;
  v_linked_by       TEXT;
  v_other_id        UUID;
  v_itype           TEXT;
  v_ivalue          TEXT;
  v_isource         TEXT;
BEGIN

  -- ============================================================
  -- 1. LOOKUP — Trouver un dossier existant via les identifiants
  -- ============================================================
  IF jsonb_array_length(COALESCE(p_identifiers, '[]'::JSONB)) > 0 THEN
    SELECT DISTINCT di.dossier_id INTO v_dossier_id
    FROM dossier_identifiers di
    WHERE di.user_id = p_user_id
      AND (di.identifier_type, di.identifier_value) IN (
        SELECT elem->>'type', elem->>'value'
        FROM jsonb_array_elements(p_identifiers) AS elem
        WHERE (elem->>'type')  IS NOT NULL
          AND (elem->>'value') IS NOT NULL
          AND (elem->>'value') <> ''
      )
    ORDER BY di.dossier_id  -- déterministe si plusieurs matches
    LIMIT 1;
  END IF;

  IF v_dossier_id IS NOT NULL THEN
    -- ============================================================
    -- 2a. ATTACH — Mettre à jour le dossier existant
    -- ============================================================
    v_is_new    := FALSE;
    v_linked_by := 'identifier';

    SELECT status INTO v_current_status
    FROM dossiers
    WHERE id = v_dossier_id;

    -- Résolution du statut (miroir de resolveStatus TypeScript) :
    --   - Terminaux (cancelled, returned) : toujours appliqués
    --   - Depuis un terminal : rien ne l'écrase
    --   - Sinon : seulement upgrader
    v_resolved_status := CASE
      WHEN p_new_status IN ('cancelled', 'returned') THEN p_new_status
      WHEN v_current_status IN ('cancelled', 'returned') THEN v_current_status
      WHEN (CASE p_new_status
              WHEN 'completed'   THEN 3
              WHEN 'in_progress' THEN 2
              WHEN 'confirmed'   THEN 1
              WHEN 'detected'    THEN 0
              ELSE 0 END)
           >=
           (CASE v_current_status
              WHEN 'completed'   THEN 3
              WHEN 'in_progress' THEN 2
              WHEN 'confirmed'   THEN 1
              WHEN 'detected'    THEN 0
              ELSE 0 END)
        THEN p_new_status
      ELSE v_current_status
    END;

    -- Mise à jour des champs enrichissables (COALESCE = overwrite si nouvelle valeur non-null)
    UPDATE dossiers SET
      status               = v_resolved_status,
      updated_at           = NOW(),
      tracking_number      = COALESCE((p_dossier_fields->>'tracking_number')::TEXT,    tracking_number),
      tracking_url         = COALESCE((p_dossier_fields->>'tracking_url')::TEXT,       tracking_url),
      carrier              = COALESCE((p_dossier_fields->>'carrier')::TEXT,            carrier),
      departure_time       = COALESCE((p_dossier_fields->>'departure_time')::TIMESTAMPTZ, departure_time),
      arrival_time         = COALESCE((p_dossier_fields->>'arrival_time')::TIMESTAMPTZ,   arrival_time),
      check_in_time        = COALESCE((p_dossier_fields->>'check_in_time')::TEXT,      check_in_time),
      check_out_time       = COALESCE((p_dossier_fields->>'check_out_time')::TEXT,     check_out_time),
      return_deadline      = COALESCE((p_dossier_fields->>'return_deadline')::TIMESTAMPTZ,   return_deadline),
      warranty_deadline    = COALESCE((p_dossier_fields->>'warranty_deadline')::TIMESTAMPTZ, warranty_deadline),
      next_renewal_at      = COALESCE((p_dossier_fields->>'next_renewal_at')::TIMESTAMPTZ,   next_renewal_at),
      pickup_code          = COALESCE((p_dossier_fields->>'pickup_code')::TEXT,        pickup_code),
      pickup_point_name    = COALESCE((p_dossier_fields->>'pickup_point_name')::TEXT,  pickup_point_name),
      pickup_point_address = COALESCE((p_dossier_fields->>'pickup_point_address')::TEXT, pickup_point_address),
      seat_info            = COALESCE((p_dossier_fields->>'seat_info')::TEXT,          seat_info)
    WHERE id = v_dossier_id;

  ELSE
    -- ============================================================
    -- 3. CREATE — Nouveau dossier
    -- ============================================================
    v_is_new    := TRUE;
    v_linked_by := NULL;

    INSERT INTO dossiers (
      user_id, merchant_id, dossier_type, status,
      title, description, reference, amount, currency, payment_method,
      started_at, ended_at, return_deadline, warranty_deadline, next_renewal_at,
      tracking_number, carrier, tracking_url,
      pickup_point_name, pickup_point_address, pickup_code,
      departure_location, arrival_location, departure_time, arrival_time,
      flight_or_train_number, seat_info, booking_reference,
      accommodation_address, check_in_time, check_out_time,
      host_name, host_phone, number_of_guests,
      subscription_name, subscription_amount, subscription_period,
      participants, action_links
    )
    VALUES (
      p_user_id,
      p_merchant_id,
      p_dossier_type,
      p_new_status,
      (p_dossier_fields->>'title')::TEXT,
      (p_dossier_fields->>'description')::TEXT,
      (p_dossier_fields->>'reference')::TEXT,
      (p_dossier_fields->>'amount')::NUMERIC,
      COALESCE((p_dossier_fields->>'currency')::TEXT, 'EUR'),
      (p_dossier_fields->>'payment_method')::TEXT,
      (p_dossier_fields->>'started_at')::TIMESTAMPTZ,
      (p_dossier_fields->>'ended_at')::TIMESTAMPTZ,
      (p_dossier_fields->>'return_deadline')::TIMESTAMPTZ,
      (p_dossier_fields->>'warranty_deadline')::TIMESTAMPTZ,
      (p_dossier_fields->>'next_renewal_at')::TIMESTAMPTZ,
      (p_dossier_fields->>'tracking_number')::TEXT,
      (p_dossier_fields->>'carrier')::TEXT,
      (p_dossier_fields->>'tracking_url')::TEXT,
      (p_dossier_fields->>'pickup_point_name')::TEXT,
      (p_dossier_fields->>'pickup_point_address')::TEXT,
      (p_dossier_fields->>'pickup_code')::TEXT,
      (p_dossier_fields->>'departure_location')::TEXT,
      (p_dossier_fields->>'arrival_location')::TEXT,
      (p_dossier_fields->>'departure_time')::TIMESTAMPTZ,
      (p_dossier_fields->>'arrival_time')::TIMESTAMPTZ,
      (p_dossier_fields->>'flight_or_train_number')::TEXT,
      (p_dossier_fields->>'seat_info')::TEXT,
      (p_dossier_fields->>'booking_reference')::TEXT,
      (p_dossier_fields->>'accommodation_address')::TEXT,
      (p_dossier_fields->>'check_in_time')::TEXT,
      (p_dossier_fields->>'check_out_time')::TEXT,
      (p_dossier_fields->>'host_name')::TEXT,
      (p_dossier_fields->>'host_phone')::TEXT,
      (p_dossier_fields->>'number_of_guests')::INT,
      (p_dossier_fields->>'subscription_name')::TEXT,
      (p_dossier_fields->>'subscription_amount')::NUMERIC,
      (p_dossier_fields->>'subscription_period')::TEXT,
      -- participants : JSONB array → TEXT[]
      ARRAY(SELECT jsonb_array_elements_text(
        COALESCE(p_dossier_fields->'participants', '[]'::JSONB)
      )),
      COALESCE(p_dossier_fields->'action_links', '[]'::JSONB)
    )
    RETURNING id INTO v_dossier_id;
  END IF;

  -- ============================================================
  -- 4. INSERT dossier_event — idempotent via UNIQUE(email_id)
  -- ============================================================
  INSERT INTO dossier_events (
    dossier_id, user_id, email_id, event_type,
    extracted_data, extraction_confidence, human_summary,
    linked_by, linking_confidence, raw_gemini_response
  )
  VALUES (
    v_dossier_id,
    p_user_id,
    p_email_id,
    p_event_type,
    p_extracted_data,
    p_extraction_confidence,
    p_human_summary,
    v_linked_by,
    CASE WHEN v_linked_by IS NOT NULL THEN 1.0 ELSE NULL END,
    p_raw_gemini_response
  )
  ON CONFLICT (email_id) DO NOTHING;

  -- ============================================================
  -- 5. REGISTER identifiers
  --    ON CONFLICT DO NOTHING = inoffensif si déjà sur ce dossier.
  --    Si collision avec un AUTRE dossier → géré par le merge (étape 6).
  -- ============================================================
  FOR v_itype, v_ivalue, v_isource IN
    SELECT
      elem->>'type',
      elem->>'value',
      COALESCE(elem->>'source', 'extraction')
    FROM jsonb_array_elements(COALESCE(p_identifiers, '[]'::JSONB)) AS elem
    WHERE (elem->>'type')  IS NOT NULL
      AND (elem->>'value') IS NOT NULL
      AND (elem->>'value') <> ''
  LOOP
    INSERT INTO dossier_identifiers (dossier_id, user_id, identifier_type, identifier_value, source)
    VALUES (v_dossier_id, p_user_id, v_itype, v_ivalue, v_isource)
    ON CONFLICT (user_id, identifier_type, identifier_value) DO NOTHING;
  END LOOP;

  -- Champs de commodité : peupler reference / booking_reference si encore null
  UPDATE dossiers SET
    reference = COALESCE(
      reference,
      (SELECT elem->>'value'
       FROM jsonb_array_elements(COALESCE(p_identifiers, '[]'::JSONB)) AS elem
       WHERE elem->>'type' = 'order_ref'
         AND (elem->>'value') IS NOT NULL
       LIMIT 1)
    ),
    booking_reference = COALESCE(
      booking_reference,
      (SELECT elem->>'value'
       FROM jsonb_array_elements(COALESCE(p_identifiers, '[]'::JSONB)) AS elem
       WHERE elem->>'type' IN ('pnr', 'booking_id')
         AND (elem->>'value') IS NOT NULL
       LIMIT 1)
    )
  WHERE id = v_dossier_id;

  -- ============================================================
  -- 6. MERGE ON COLLISION
  --    Trouver les autres dossiers qui partagent un identifiant du lot entrant.
  --    Cas typique : carrier (tracking) arrivé avant la commande (order_ref).
  -- ============================================================
  FOR v_other_id IN
    SELECT DISTINCT di.dossier_id
    FROM dossier_identifiers di
    WHERE di.user_id = p_user_id
      AND di.dossier_id <> v_dossier_id
      AND (di.identifier_type, di.identifier_value) IN (
        SELECT elem->>'type', elem->>'value'
        FROM jsonb_array_elements(COALESCE(p_identifiers, '[]'::JSONB)) AS elem
        WHERE (elem->>'type')  IS NOT NULL
          AND (elem->>'value') IS NOT NULL
          AND (elem->>'value') <> ''
      )
  LOOP
    v_was_merged := TRUE;
    RAISE LOG '[process_email_result] Merging dossier % into %', v_other_id, v_dossier_id;

    -- Déplacer les events sans collision email_id
    UPDATE dossier_events
    SET dossier_id = v_dossier_id,
        linked_by  = 'merge'
    WHERE dossier_id = v_other_id
      AND NOT EXISTS (
        SELECT 1 FROM dossier_events de2
        WHERE de2.dossier_id = v_dossier_id
          AND de2.email_id   = dossier_events.email_id
      );

    -- Supprimer les events résiduels en double
    DELETE FROM dossier_events WHERE dossier_id = v_other_id;

    -- Déplacer les identifiants sans collision
    UPDATE dossier_identifiers
    SET dossier_id = v_dossier_id
    WHERE dossier_id = v_other_id
      AND NOT EXISTS (
        SELECT 1 FROM dossier_identifiers di2
        WHERE di2.user_id          = p_user_id
          AND di2.dossier_id       = v_dossier_id
          AND di2.identifier_type  = dossier_identifiers.identifier_type
          AND di2.identifier_value = dossier_identifiers.identifier_value
      );

    -- Supprimer les identifiants résiduels
    DELETE FROM dossier_identifiers WHERE dossier_id = v_other_id;

    -- Supprimer l'autre dossier
    DELETE FROM dossiers WHERE id = v_other_id;
  END LOOP;

  RETURN QUERY SELECT v_dossier_id, v_is_new, v_was_merged;
END;
$$;

GRANT EXECUTE ON FUNCTION process_email_result(UUID, UUID, TEXT, UUID, TEXT, JSONB, TEXT, JSONB, NUMERIC, TEXT, JSONB, JSONB) TO service_role;
