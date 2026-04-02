-- =============================================================
-- MIGRATION 004 : MERCHANTS (Sources)
-- =============================================================

CREATE TABLE merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL UNIQUE,
  known_domains TEXT[] DEFAULT '{}',
  known_sender_patterns TEXT[] DEFAULT '{}',
  logo_url TEXT,
  default_warranty_months INT,
  default_return_days INT,
  category TEXT CHECK (
    category IN (
      'ecommerce', 'travel', 'accommodation', 'subscription',
      'restaurant', 'transport', 'culture', 'sport', 'other'
    )
  ),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pas de RLS sur merchants : table publique en lecture, écriture service_role uniquement
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants are readable by authenticated users"
  ON merchants FOR SELECT
  USING (auth.role() = 'authenticated');

-- =============================================================
-- SEED MERCHANTS
-- =============================================================

INSERT INTO merchants (canonical_name, known_domains, known_sender_patterns, default_return_days, default_warranty_months, category) VALUES
  ('Amazon',           ARRAY['amazon.fr','amazon.com'],               ARRAY['@amazon.fr','@amazon.com'],                                        30, 24, 'ecommerce'),
  ('Fnac',             ARRAY['fnac.com'],                             ARRAY['@fnac.com','@info.fnac.com'],                                       14, 24, 'ecommerce'),
  ('Cdiscount',        ARRAY['cdiscount.com'],                        ARRAY['@cdiscount.com'],                                                   14, 24, 'ecommerce'),
  ('Darty',            ARRAY['darty.com'],                            ARRAY['@darty.com'],                                                       14, 24, 'ecommerce'),
  ('Boulanger',        ARRAY['boulanger.com'],                        ARRAY['@boulanger.com'],                                                   14, 24, 'ecommerce'),
  ('IKEA',             ARRAY['ikea.com','ikea.fr'],                   ARRAY['@ikea.com','@ikea.fr'],                                             14, 24, 'ecommerce'),
  ('Decathlon',        ARRAY['decathlon.fr'],                         ARRAY['@decathlon.fr'],                                                    30, 24, 'ecommerce'),
  ('Leroy Merlin',     ARRAY['leroymerlin.fr'],                       ARRAY['@leroymerlin.fr'],                                                  14, 24, 'ecommerce'),
  ('Vinted',           ARRAY['vinted.fr'],                            ARRAY['@vinted.fr'],                                                       14,  0, 'ecommerce'),
  ('Kapten & Son',     ARRAY['kapten-son.com'],                       ARRAY['@kapten-son.com'],                                                  14, 24, 'ecommerce'),
  ('Grain de Sail',    ARRAY['graindesail.com'],                      ARRAY['@graindesail.com'],                                                 14,  0, 'ecommerce'),
  ('SNCF Connect',     ARRAY['sncf-connect.com'],                     ARRAY['@sncf-connect.com','@mail.sncf-connect.com'],                        0,  0, 'transport'),
  ('OUIGO',            ARRAY['ouigo.com'],                            ARRAY['@ouigo.com'],                                                        0,  0, 'transport'),
  ('Air France',       ARRAY['airfrance.fr'],                         ARRAY['@airfrance.fr','@mail.airfrance.com','@ticket-airfrance.com'],        0,  0, 'travel'),
  ('easyJet',          ARRAY['easyjet.com'],                          ARRAY['@easyjet.com'],                                                      0,  0, 'travel'),
  ('Eurostar',         ARRAY['eurostar.com'],                         ARRAY['@eurostar.com'],                                                     0,  0, 'transport'),
  ('British Airways',  ARRAY['britishairways.com'],                   ARRAY['@email.ba.com'],                                                     0,  0, 'travel'),
  ('Vietnam Airlines', ARRAY['vietnamairlines.com'],                  ARRAY['@vietnamairlines.com'],                                              0,  0, 'travel'),
  ('Bolt',             ARRAY['bolt.eu'],                              ARRAY['@bolt.eu'],                                                          0,  0, 'transport'),
  ('Airbnb',           ARRAY['airbnb.com','airbnb.fr'],               ARRAY['@airbnb.com','@guest.airbnb.com'],                                   0,  0, 'accommodation'),
  ('Booking.com',      ARRAY['booking.com'],                          ARRAY['@booking.com'],                                                      0,  0, 'accommodation'),
  ('Bouygues Telecom', ARRAY['bouyguestelecom.fr'],                   ARRAY['@bouyguestelecom.fr'],                                               0,  0, 'subscription'),
  ('Google One',       ARRAY['one.google.com'],                       ARRAY['@google.com'],                                                       0,  0, 'subscription'),
  ('TheFork',          ARRAY['thefork.com','thefork.fr'],             ARRAY['@thefork.com','@thefork.fr'],                                        0,  0, 'restaurant'),
  ('UCPA',             ARRAY['ucpa.com'],                             ARRAY['@ucpa.com'],                                                         0,  0, 'sport'),
  ('Chronopost',       ARRAY['chronopost.fr'],                        ARRAY['@chronopost.fr'],                                                    0,  0, 'transport'),
  ('Colissimo',        ARRAY['colissimo.fr','laposte.fr'],            ARRAY['@colissimo.fr','@laposte.info'],                                     0,  0, 'transport'),
  ('GLS France',       ARRAY['gls-group.eu'],                         ARRAY['@gls-france.com'],                                                   0,  0, 'transport'),
  ('Chronofresh',      ARRAY['chronofresh.fr'],                       ARRAY['@chronofresh.fr'],                                                   0,  0, 'transport')
ON CONFLICT (canonical_name) DO NOTHING;
