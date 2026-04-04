-- =============================================================
-- MIGRATION 012 : LINKING V2 — MERCHANT-TEMPORAL FALLBACK
-- =============================================================
-- 1. Étend la contrainte linked_by pour accepter 'merchant_temporal'
-- 2. Ajoute received_at à processing_queue + tri oldest-first dans dequeue
-- 3. Remplace process_email_result avec le Layer 2 merchant-temporal
--
-- Le Layer 2 s'active pour les follow-up events (shipping, invoice, etc.)
-- quand aucun identifiant commun n'est trouvé (Layer 1 vide).
-- Condition : même merchant_id + même dossier_type + ±14 jours de started_at.
-- Les confirmations (order_confirmation, booking_confirmation, etc.) ne passent
-- JAMAIS par le Layer 2 — ils créent toujours un nouveau dossier.

-- ============================================================
-- 1. Contrainte linked_by étendue
-- ============================================================
ALTER TABLE dossier_events DROP CONSTRAINT IF EXISTS dossier_events_linked_by_check;
ALTER TABLE dossier_events ADD CONSTRAINT dossier_events_linked_by_check
  CHECK (linked_by IN ('identifier', 'merge', 'manual', 'merchant_temporal'));

-- ============================================================
-- 2. received_at sur processing_queue (pour backfill oldest-first)
-- ============================================================
ALTER TABLE processing_queue ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

-- Recréer l'index pending avec received_at
DROP INDEX IF EXISTS idx_queue_pending;
CREATE INDEX idx_queue_pending
  ON processing_queue(status, priority DESC, received_at ASC NULLS LAST, created_at ASC)
  WHERE status = 'pending';

-- ============================================================
-- 3. dequeue_next_item : oldest-first (received_at NULLS LAST)
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
   ORDER BY priority DESC, received_at ASC NULLS LAST, created_at ASC
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

GRANT EXECUTE ON FUNCTION dequeue_next_item() TO service_role;

-- ============================================================
-- 4. process_email_result : ajout du Layer 2 merchant-temporal
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
  v_started_at      TIMESTAMPTZ;
BEGIN

  -- ============================================================
  -- Layer 1 : identifier lookup (inchangé)
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

  -- ============================================================
  -- Layer 2 : merchant-temporal fallback (NOUVEAU)
  --
  -- S'active UNIQUEMENT pour les follow-up events — jamais pour
  -- les confirmations qui créent toujours un nouveau dossier.
  -- Conditions : merchant connu + même type + ±14 jours.
  -- ============================================================
  IF v_dossier_id IS NULL
     AND p_merchant_id IS NOT NULL
     AND p_event_type = ANY(ARRAY[
       'shipping_notification', 'delivery_notification', 'invoice',
       'booking_update', 'host_message', 'accommodation_update',
       'return_confirmation', 'cancellation', 'check_in_open',
       'boarding_pass', 'payment_confirmation'
     ])
  THEN
    v_started_at := (p_dossier_fields->>'started_at')::TIMESTAMPTZ;

    IF v_started_at IS NOT NULL THEN
      SELECT id INTO v_dossier_id
      FROM dossiers
      WHERE user_id     = p_user_id
        AND merchant_id  = p_merchant_id
        AND dossier_type = p_dossier_type
        AND started_at   IS NOT NULL
        AND ABS(EXTRACT(EPOCH FROM (started_at - v_started_at))) < 14 * 86400
      ORDER BY ABS(EXTRACT(EPOCH FROM (started_at - v_started_at))) ASC
      LIMIT 1;

      IF v_dossier_id IS NOT NULL THEN
        v_linked_by := 'merchant_temporal';
        RAISE LOG '[process_email_result] Layer 2 match: event=% merchant=% → dossier=%',
          p_event_type, p_merchant_id, v_dossier_id;
      END IF;
    END IF;
  END IF;

  IF v_dossier_id IS NOT NULL THEN
    -- ============================================================
    -- ATTACH — Mettre à jour le dossier existant (Layer 1 ou 2)
    -- ============================================================
    v_is_new := FALSE;
    IF v_linked_by IS NULL THEN
      v_linked_by := 'identifier';
    END IF;

    SELECT status INTO v_current_status
    FROM dossiers
    WHERE id = v_dossier_id;

    -- Résolution du statut (machine d'états, pas de downgrade sauf terminaux)
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

    -- Mise à jour des champs enrichissables (COALESCE = ne pas écraser si déjà rempli)
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
    -- Layer 3 : CREATE — Nouveau dossier (Layer 1 et 2 vides)
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
  -- 5. REGISTER identifiers (ON CONFLICT DO NOTHING = idempotent)
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
  --    Fusionner si d'autres dossiers partagent un identifiant du lot entrant.
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
