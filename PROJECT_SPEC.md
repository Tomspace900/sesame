# PROJECT_SPEC.md — Sésame

## Vue d'ensemble

**Sésame** — coffre-fort intelligent personnel pour un petit groupe familial (~5-10 users).
Ingestion automatique des mails transactionnels, extraction par LLM, dashboard consultable, notifications intelligentes.

**Périmètre couvert :**
- Achats e-commerce (Amazon, Fnac, Boulanger...)
- Voyages et transport (Air France, SNCF, easyJet, Eurostar...)
- Hébergements (Airbnb, Booking.com, hôtels)
- Abonnements (Bouygues, Google One, Vélib', SaaS...)
- Réservations locales (restaurants, sports, culture)

Voir `DESIGN_SYSTEM.md` pour l'identité visuelle, `UI_FEATURES.md` pour les écrans, `CLAUDE.md` pour les conventions.

---

## 1. Schéma de base de données

La table centrale est `dossiers`. Chaque dossier a un `dossier_type` discriminant. Les champs spécifiques au type sont en colonnes nullable directes (pas de JSONB) pour permettre les requêtes SQL et les index.

```sql
-- =============================================================
-- PROFILES
-- =============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  telegram_chat_id TEXT,
  notification_preferences JSONB DEFAULT '{
    "telegram": true, "calendar": true,
    "return_reminder_days": 3, "warranty_reminder_days": 30,
    "renewal_reminder_days": 5
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own profile" ON profiles FOR ALL USING (auth.uid() = id);

-- =============================================================
-- MAIL ACCOUNTS
-- =============================================================
CREATE TABLE mail_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'yahoo', 'outlook')),
  email_address TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  watch_expiration TIMESTAMPTZ,
  history_id TEXT,
  last_uid_fetched TEXT,
  backfill_status TEXT DEFAULT 'idle' CHECK (backfill_status IN ('idle', 'running', 'paused', 'done', 'error')),
  backfill_progress JSONB DEFAULT '{"processed": 0, "total": null}'::jsonb,
  backfill_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider, email_address)
);
ALTER TABLE mail_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own mail accounts" ON mail_accounts FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_mail_accounts_user ON mail_accounts(user_id);

-- =============================================================
-- EMAILS
-- =============================================================
CREATE TABLE emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mail_account_id UUID NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
  provider_message_id TEXT NOT NULL,
  subject TEXT,
  sender_address TEXT NOT NULL,
  sender_name TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  text_plain TEXT,
  text_html_storage_path TEXT,
  has_attachments BOOLEAN DEFAULT false,
  attachment_metadata JSONB DEFAULT '[]'::jsonb,
  classification TEXT CHECK (classification IN ('transactional', 'not_transactional', 'unprocessed')),
  classification_confidence REAL,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, mail_account_id, provider_message_id)
);
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own emails" ON emails FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_emails_user_received ON emails(user_id, received_at DESC);
CREATE INDEX idx_emails_sender ON emails(sender_address);
CREATE INDEX idx_emails_classification ON emails(user_id, classification) WHERE classification = 'transactional';

-- =============================================================
-- MERCHANTS (= "Sources" dans l'UI)
-- =============================================================
CREATE TABLE merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL UNIQUE,
  known_domains TEXT[] DEFAULT '{}',
  known_sender_patterns TEXT[] DEFAULT '{}',
  logo_url TEXT,
  default_warranty_months INT,
  default_return_days INT,
  category TEXT CHECK (category IN ('ecommerce','travel','accommodation','subscription','restaurant','transport','culture','sport','other')),
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO merchants (canonical_name, known_domains, known_sender_patterns, default_return_days, default_warranty_months, category) VALUES
  ('Amazon', ARRAY['amazon.fr','amazon.com'], ARRAY['@amazon.fr','@amazon.com'], 30, 24, 'ecommerce'),
  ('Fnac', ARRAY['fnac.com'], ARRAY['@fnac.com','@info.fnac.com'], 14, 24, 'ecommerce'),
  ('Cdiscount', ARRAY['cdiscount.com'], ARRAY['@cdiscount.com'], 14, 24, 'ecommerce'),
  ('Darty', ARRAY['darty.com'], ARRAY['@darty.com'], 14, 24, 'ecommerce'),
  ('Boulanger', ARRAY['boulanger.com'], ARRAY['@boulanger.com'], 14, 24, 'ecommerce'),
  ('IKEA', ARRAY['ikea.com','ikea.fr'], ARRAY['@ikea.com','@ikea.fr'], 14, 24, 'ecommerce'),
  ('Decathlon', ARRAY['decathlon.fr'], ARRAY['@decathlon.fr'], 30, 24, 'ecommerce'),
  ('Leroy Merlin', ARRAY['leroymerlin.fr'], ARRAY['@leroymerlin.fr'], 14, 24, 'ecommerce'),
  ('Vinted', ARRAY['vinted.fr'], ARRAY['@vinted.fr'], 14, 0, 'ecommerce'),
  ('Kapten & Son', ARRAY['kapten-son.com'], ARRAY['@kapten-son.com'], 14, 24, 'ecommerce'),
  ('Grain de Sail', ARRAY['graindesail.com'], ARRAY['@graindesail.com'], 14, 0, 'ecommerce'),
  ('SNCF Connect', ARRAY['sncf-connect.com'], ARRAY['@sncf-connect.com','@mail.sncf-connect.com'], 0, 0, 'transport'),
  ('OUIGO', ARRAY['ouigo.com'], ARRAY['@ouigo.com'], 0, 0, 'transport'),
  ('Air France', ARRAY['airfrance.fr'], ARRAY['@airfrance.fr','@mail.airfrance.com','@ticket-airfrance.com'], 0, 0, 'travel'),
  ('easyJet', ARRAY['easyjet.com'], ARRAY['@easyjet.com'], 0, 0, 'travel'),
  ('Eurostar', ARRAY['eurostar.com'], ARRAY['@eurostar.com'], 0, 0, 'transport'),
  ('British Airways', ARRAY['britishairways.com'], ARRAY['@email.ba.com'], 0, 0, 'travel'),
  ('Vietnam Airlines', ARRAY['vietnamairlines.com'], ARRAY['@vietnamairlines.com'], 0, 0, 'travel'),
  ('Bolt', ARRAY['bolt.eu'], ARRAY['@bolt.eu'], 0, 0, 'transport'),
  ('Airbnb', ARRAY['airbnb.com','airbnb.fr'], ARRAY['@airbnb.com','@guest.airbnb.com'], 0, 0, 'accommodation'),
  ('Booking.com', ARRAY['booking.com'], ARRAY['@booking.com'], 0, 0, 'accommodation'),
  ('Bouygues Telecom', ARRAY['bouyguestelecom.fr'], ARRAY['@bouyguestelecom.fr'], 0, 0, 'subscription'),
  ('Google One', ARRAY['one.google.com'], ARRAY['@google.com'], 0, 0, 'subscription'),
  ('TheFork', ARRAY['thefork.com','thefork.fr'], ARRAY['@thefork.com','@thefork.fr'], 0, 0, 'restaurant'),
  ('UCPA', ARRAY['ucpa.com'], ARRAY['@ucpa.com'], 0, 0, 'sport'),
  ('Chronopost', ARRAY['chronopost.fr'], ARRAY['@chronopost.fr'], 0, 0, 'transport'),
  ('Colissimo', ARRAY['colissimo.fr','laposte.fr'], ARRAY['@colissimo.fr','@laposte.info'], 0, 0, 'transport'),
  ('GLS France', ARRAY['gls-group.eu'], ARRAY['@gls-france.com'], 0, 0, 'transport'),
  ('Chronofresh', ARRAY['chronofresh.fr'], ARRAY['@chronofresh.fr'], 0, 0, 'transport')
ON CONFLICT (canonical_name) DO NOTHING;

-- =============================================================
-- DOSSIERS (entité centrale)
-- =============================================================
CREATE TABLE dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  merchant_id UUID REFERENCES merchants(id),

  dossier_type TEXT NOT NULL DEFAULT 'purchase' CHECK (dossier_type IN (
    'purchase', 'trip', 'accommodation', 'subscription', 'reservation', 'other'
  )),

  -- Communs
  title TEXT,
  description TEXT,
  reference TEXT,
  amount NUMERIC(10,2),
  currency TEXT DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'detected' CHECK (status IN (
    'detected', 'confirmed', 'in_progress', 'completed', 'cancelled', 'returned'
  )),
  image_url TEXT,
  source_url TEXT,
  payment_method TEXT,

  -- Dates clés universelles
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  return_deadline TIMESTAMPTZ,
  warranty_deadline TIMESTAMPTZ,
  next_renewal_at TIMESTAMPTZ,

  -- Livraison / Tracking (achats)
  tracking_number TEXT,
  carrier TEXT,
  tracking_url TEXT,
  pickup_point_name TEXT,
  pickup_point_address TEXT,
  pickup_code TEXT,

  -- Transport (voyages)
  departure_location TEXT,
  arrival_location TEXT,
  departure_time TIMESTAMPTZ,
  arrival_time TIMESTAMPTZ,
  flight_or_train_number TEXT,
  seat_info TEXT,
  booking_reference TEXT,

  -- Hébergement
  accommodation_address TEXT,
  check_in_time TEXT,
  check_out_time TEXT,
  host_name TEXT,
  host_phone TEXT,
  number_of_guests INT,

  -- Abonnement
  subscription_name TEXT,
  subscription_amount NUMERIC(10,2),
  subscription_period TEXT CHECK (subscription_period IN ('monthly', 'yearly', 'weekly', 'other') OR subscription_period IS NULL),

  -- Multi-personnes
  participants TEXT[] DEFAULT '{}',

  -- Liens d'action utiles
  action_links JSONB DEFAULT '[]'::jsonb,

  -- Rappels
  return_reminder_sent BOOLEAN DEFAULT false,
  warranty_reminder_sent BOOLEAN DEFAULT false,
  renewal_reminder_sent BOOLEAN DEFAULT false,
  calendar_event_created BOOLEAN DEFAULT false,

  -- Enrichissement manuel
  notes TEXT,
  tags TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE dossiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own dossiers" ON dossiers FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_dossiers_user_type ON dossiers(user_id, dossier_type);
CREATE INDEX idx_dossiers_user_status ON dossiers(user_id, status);
CREATE INDEX idx_dossiers_reference ON dossiers(user_id, reference) WHERE reference IS NOT NULL;
CREATE INDEX idx_dossiers_booking_ref ON dossiers(user_id, booking_reference) WHERE booking_reference IS NOT NULL;
CREATE INDEX idx_dossiers_merchant_date ON dossiers(user_id, merchant_id, started_at DESC);
CREATE INDEX idx_dossiers_return ON dossiers(return_deadline) WHERE return_reminder_sent = false;
CREATE INDEX idx_dossiers_warranty ON dossiers(warranty_deadline) WHERE warranty_reminder_sent = false;
CREATE INDEX idx_dossiers_renewal ON dossiers(next_renewal_at) WHERE renewal_reminder_sent = false;
CREATE INDEX idx_dossiers_departure ON dossiers(departure_time) WHERE departure_time IS NOT NULL;

ALTER TABLE dossiers ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('french', coalesce(notes, '')), 'C') ||
    setweight(to_tsvector('french', coalesce(reference, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(booking_reference, '')), 'A')
  ) STORED;
CREATE INDEX idx_dossiers_fts ON dossiers USING gin(fts);

-- =============================================================
-- DOSSIER EVENTS
-- =============================================================
CREATE TABLE dossier_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id UUID REFERENCES dossiers(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'order_confirmation', 'payment_confirmation', 'shipping_notification',
    'delivery_notification', 'invoice', 'return_confirmation', 'cancellation',
    'booking_confirmation', 'booking_update', 'check_in_open', 'boarding_pass',
    'accommodation_confirmation', 'host_message', 'accommodation_update',
    'subscription_confirmation', 'subscription_renewal', 'subscription_cancellation',
    'other'
  )),
  extracted_data JSONB NOT NULL,
  extraction_confidence REAL,
  human_summary TEXT,
  linked_by TEXT CHECK (linked_by IN ('reference', 'fuzzy_match', 'manual', 'llm')),
  linking_confidence REAL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE dossier_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own events" ON dossier_events FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_events_dossier ON dossier_events(dossier_id);
CREATE INDEX idx_events_email ON dossier_events(email_id);

-- =============================================================
-- PROCESSING QUEUE
-- =============================================================
CREATE TABLE processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  mail_account_id UUID NOT NULL REFERENCES mail_accounts(id),
  provider_message_id TEXT NOT NULL,
  priority INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error', 'skipped')),
  attempts INT DEFAULT 0,
  last_error TEXT,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE(user_id, mail_account_id, provider_message_id)
);
CREATE INDEX idx_queue_pending ON processing_queue(status, priority DESC, created_at ASC) WHERE status = 'pending';
```

---

## 2. Prompts Gemini (v2.0.0)

Les prompts sont dans `packages/shared/src/prompts/` (source) et copiés dans `supabase/functions/_shared/prompts/` (utilisés par les Edge Functions). **Toujours modifier les deux en même temps.**

### Classification
- Preview de **1500 caractères** (augmenté de 500).
- Exemples concrets de rejets (2FA, alertes sécurité, bulletins de paie, demandes d'avis, stats).
- Règle : en cas de doute → `not_transactional`.
- Types transactionnels reconnus : `order_confirmation`, `payment_confirmation`, `shipping_notification`, `delivery_notification`, `invoice`, `return_confirmation`, `cancellation`, `booking_confirmation`, `booking_update`, `check_in_open`, `boarding_pass`, `host_message`, `accommodation_confirmation`, `accommodation_update`, `subscription_confirmation`, `subscription_renewal`, `subscription_cancellation`.

### Extraction + Linking
- **Champs filtrés par type** — seuls les champs pertinents au `dossier_type` sont demandés (plus de JSON skeleton avec 30+ champs null).
- **Type suggestion** : le `email_type` de la classification est transmis au prompt d'extraction pour guider le typage.
- **Titre** : instructions explicites avec exemples ✅/❌ par type (nom du produit pour purchase, "Vol X → Y" pour trip, etc.).
- **check_in_time / check_out_time** : format "HH:MM", pas ISO 8601.
- **human_summary** : tutoiement obligatoire, exemples par event_type.
- **Linking** : hiérarchie reference > fuzzy_match > llm. `dossier_type: "other"` est interdit, transformé en `purchase` par le Zod schema.

### Observabilité (migration 012)
- `dossier_events.raw_gemini_response` (JSONB) : réponse brute Gemini d'extraction.
- `emails.raw_classification_response` (JSONB) : réponse brute Gemini de classification.

---

## 3. Edge Functions

| Fonction                 | Trigger                        | Rôle                                                    |
|--------------------------|--------------------------------|---------------------------------------------------------|
| `oauth-callback`         | HTTP (redirect OAuth)          | Reçoit le code OAuth, échange tokens, crée mail_account |
| `gmail-webhook`          | HTTP (Pub/Sub push)            | Reçoit notification Gmail, enqueue les nouveaux mails   |
| `process-queue`          | Cron (*/2 min)                 | Dépile la queue, fetch mail, classify, extract, insert  |
| `start-backfill`         | HTTP (depuis le front)         | Lance le backfill d'un mail_account                     |
| `renew-watches`          | Cron (tous les 5j)             | Renouvelle les watches Gmail Pub/Sub                    |
| `check-deadlines`        | Cron (tous les jours 9h)       | Vérifie toutes les deadlines, envoie Telegram           |
| `telegram-webhook`       | HTTP (Telegram Bot webhook)    | Reçoit les commandes du bot Telegram                    |
| `manual-link`            | HTTP (depuis le front)         | Lie manuellement un event à un dossier                  |
| `search-dossiers`        | HTTP (depuis le front)         | Recherche full-text via le tsvector                     |

---

## 4. Pipeline de traitement (process-queue)

1. Dépile 1 item (status=pending, ORDER BY priority DESC, created_at ASC). Verrouille (locked_until = now + 5min).
2. Fetch le mail complet via Gmail API. Stocke text_plain, HTML dans Storage, metadata PJ.
3. CLASSIFICATION (Gemini : sender + subject + **1500 premiers chars**). not_transactional → skip.
4. **PRE-LINKING SQL** : extrait les codes de référence du sujet/corps et cherche un dossier existant par `reference` ou `booking_reference` exact.
5. NETTOYAGE : text_plain si dispo, sinon html-to-text, normalisation UTF-8.
6. EXTRACTION + LINKING (Gemini complet : mail nettoyé + **30 dossiers récents + dossiers du même marchand** + `email_type` de la classification). Validation Zod. Retry 1x si échec JSON.
7. LINKING FINAL : si Gemini a trouvé un match ≥ 0.6 → utilise le lien Gemini. Sinon, si le pre-linking SQL a trouvé → utilise le pre-link (`linked_by: "reference"`, `match_confidence: 1.0`).
8. INSERT/UPDATE : dossier existant → update (tracking, status, deadlines). Nouveau → insert. `check_in_time`/`check_out_time` validés par `validateTimeFormat()` (format "HH:MM").
9. POST-PROCESSING : Telegram (human_summary).
10. Marque done/error avec retry exponentiel (max 3).

---

## 5. Providers mail

### Gmail (API REST + Pub/Sub) — V1

- OAuth2 via Google Cloud Console, scope `gmail.readonly`
- Watch Pub/Sub : POST `gmail/v1/users/me/watch`, push endpoint = Edge Function `gmail-webhook`
- Webhook : decode historyId, GET `history.list`, enqueue les nouveaux messages (priority = 10)
- Backfill : GET `messages.list` avec filtre expéditeurs connus, pagination nextPageToken, enqueue (priority = 0)
- Watch renewal : cron tous les 5 jours via `renew-watches`

### Yahoo (IMAP + OAuth2) — V1.1

- OAuth2 via Yahoo Developer, scope `mail-r`
- IMAP `imap.mail.yahoo.com:993` TLS, auth XOAUTH2 via imapflow
- Polling cron */5 min (pas de push chez Yahoo)
- Backfill : SEARCH SINCE 5 ans, batch 50, filtre sender_patterns

### Outlook (Microsoft Graph) — futur

---

## 6. Frontend — Routes

| Route                         | Page                              |
|-------------------------------|-----------------------------------|
| `/`                           | Dashboard (alertes + en cours)    |
| `/dossiers`                   | Liste complète filtrable          |
| `/dossiers/:id`               | Détail adaptatif selon dossier_type |
| `/recherche`                  | Recherche dédiée (mobile)        |
| `/reglages`                   | Comptes mail, Telegram, préfs    |
| `/reglages/connecter/:provider` | Flow OAuth mail                |
| `/auth/connexion`             | Login (magic link)               |
| `/bienvenue`                  | Onboarding première connexion    |

La page détail adapte son layout selon le `dossier_type` : tracking/retrait pour les achats, départ/arrivée pour les voyages, hôte/adresse pour les hébergements, renouvellement pour les abos.

Le StatusBadge adapte son label : Commandé/En route/Livré (achats), Réservé/Check-in/Terminé (voyages), Actif/Annulé (abos).

---

## 7. Telegram Bot

Commandes : `/start`, `/recent`, `/search <terme>`, `/garantie <terme>`, `/status`, `/voyages`, `/abos`.

Notifications push en ton Sésame :
- Achat détecté : "Ton achat chez {source} a été détecté : {titre} — {montant}"
- Colis en route : "Ton colis {source} est en route. Suivi : {url}"
- Point retrait : "Ton colis t'attend chez {pickup_point}. Code : {pickup_code}"
- Vol/train : "L'enregistrement pour ton vol {flight_number} vers {destination} est ouvert."
- Hébergement : "Ta réservation {title} commence demain. Adresse : {address}"
- Rétractation : "Dernier appel : il te reste {N} jours pour renvoyer {titre}."
- Garantie : "Ta garantie pour {titre} expire le mois prochain."
- Abonnement : "Ton abonnement {subscription_name} se renouvelle dans {N} jours ({amount})."

---

## 8. Roadmap

### V1.0 (4 weekends)

**Weekend 1 : Fondations**
- [ ] Init monorepo pnpm (packages/web, api, shared)
- [ ] Setup Supabase local
- [ ] Toutes les migrations SQL + seed merchants
- [ ] Auth Supabase (magic link + trigger profil)
- [ ] Scaffold frontend + design system Sésame (tailwind config, fonts, shadcn/ui customisé)
- [ ] Layout principal : header + bottom nav mobile

**Weekend 2 : Ingestion mails**
- [ ] OAuth Gmail (Google Cloud Console, Edge Function callback)
- [ ] Gmail Pub/Sub watch + webhook Edge Function
- [ ] Processing queue + process-queue Edge Function
- [ ] Prompts Gemini : classification + extraction
- [ ] Validation Zod des réponses
- [ ] Insert dossiers + dossier_events

**Weekend 3 : Frontend + Linking**
- [ ] Dashboard avec alertes multi-types
- [ ] Liste dossiers (recherche + filtres par type/statut/source)
- [ ] Page détail adaptative selon dossier_type
- [ ] Linking par reference/booking_reference
- [ ] Linking fuzzy via Gemini
- [ ] Link manuel

**Weekend 4 : Notifications + Polish**
- [ ] Bot Telegram (webhook, commandes)
- [ ] Notifications push multi-types
- [ ] Check-deadlines cron multi-types
- [ ] ~~Google Calendar~~ — abandonné
- [ ] Backfill + progression
- [ ] Onboarding (flow première connexion)
- [ ] Deploy Vercel

### V1.1
- [ ] Yahoo IMAP + OAuth2
- [ ] Extraction pièces jointes (PDF factures, billets)
- [ ] Outlook (Microsoft Graph)
- [ ] Stats dépenses par mois/source/type
- [ ] Export CSV

---

## 9. Variables d'environnement

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_PUBSUB_TOPIC=
GEMINI_API_KEY=
TELEGRAM_BOT_TOKEN=
APP_URL=https://sesame.tondomaine.com
ENCRYPTION_KEY=
```

---

## 10. Décisions d'architecture immuables

1. **Supabase, pas Firebase** — données relationnelles, RLS natif, Postgres.
2. **Edge Functions Deno** — serverless, 0 maintenance.
3. **Gmail en V1, Yahoo en V1.1** — Gmail API + Pub/Sub est plus robuste que le polling IMAP.
4. **Queue Postgres** — le volume ne justifie pas un broker.
5. **Gemini Flash** — gratuit et suffisant.
6. **Telegram, pas WhatsApp** — gratuit, API ouverte.
7. **Pas d'extension Chrome.**
8. **Pas de tests E2E en V1.**
9. **Interface en français, tutoiement.**
10. **Abstraction mail légère dès V1** — facilite l'ajout de Yahoo/Outlook.
11. **shadcn/ui + Tailwind custom** — tokens Sésame.
12. **HugeIcons stroke-rounded (plan gratuit)** — zéro emoji.
13. **Vocabulaire UI agnostique** — "Dossier", "Source", "Référence".
14. **Ton Sésame** — proactif, tutoiement, chaleureux, pas de jargon.
15. **Modèle "dossier" multi-type** — purchase, trip, accommodation, subscription, reservation.
16. **Champs spécifiques en colonnes** — pas de JSONB type_data, pour SQL et index.
17. **Full-text search Postgres** — tsvector généré, pas de moteur externe.
18. **`human_summary` stocké** — généré par Gemini à l'extraction, stocké dans chaque event.
