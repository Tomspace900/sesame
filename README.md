# Sésame

Coffre-fort intelligent personnel — centralise et surveille achats, voyages, abonnements et réservations détectés automatiquement depuis ta boîte mail.

**Utilisateurs :** famille (~5-10 personnes). Pas un SaaS.

---

## Stack

| Couche | Techno |
|--------|--------|
| DB + Auth | Supabase (Postgres + RLS) |
| Backend | Supabase Edge Functions (Deno) |
| Frontend | React 19 + Vite + TypeScript + Tailwind v4 |
| UI | shadcn/ui personnalisé + HugeIcons |
| LLM | Gemini Flash (gratuit via AI Studio) |
| Notifications | Telegram Bot |
| Hébergement | Vercel (free tier) |

---

## Lancer en local

### Prérequis

- [pnpm](https://pnpm.io) >= 10
- [Supabase CLI](https://supabase.com/docs/guides/cli) >= 1.115
- [Docker](https://www.docker.com) (pour Supabase local)
- Node.js >= 20

### 1. Cloner et installer

```bash
git clone <repo>
cd sesame
pnpm install
```

### 2. Supabase local

```bash
# Démarrer Supabase (Docker requis)
supabase start

# Les migrations sont appliquées automatiquement
# Les clés s'affichent dans le terminal — noter anon key et service_role key
```

### 3. Variables d'environnement

```bash
# Frontend
cp packages/web/.env.example packages/web/.env.local

# Edge Functions
cp supabase/functions/.env.example supabase/functions/.env
```

Remplir `packages/web/.env.local` :
```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<clé affichée par supabase start>
VITE_GOOGLE_CLIENT_ID=<client_id OAuth Google>
```

Remplir `supabase/functions/.env` (voir `.env.example` pour les détails) :
```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<clé affichée par supabase start>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_PUBSUB_TOPIC=projects/<id>/topics/<topic>
PUBSUB_SECRET=<secret aléatoire>
GEMINI_API_KEY=...
ENCRYPTION_KEY=<openssl rand -hex 32>
APP_URL=http://localhost:5173
OAUTH_REDIRECT_URI=http://localhost:54321/functions/v1/oauth-callback
```

### 4. Lancer les Edge Functions

```bash
supabase functions serve --env-file supabase/functions/.env
```

### 5. Lancer le frontend

```bash
pnpm dev
# → http://localhost:5173
```

### 6. Supabase Studio (optionnel)

```bash
open http://localhost:54323
```

---

## Structure du projet

```
sesame/
├── packages/
│   ├── web/        # React SPA
│   ├── api/        # Supabase Edge Functions (Deno)
│   └── shared/     # Types, schémas Zod, prompts Gemini
├── supabase/
│   ├── config.toml
│   └── migrations/ # 7 migrations SQL
├── scripts/        # Utilitaires dev
└── prompts/        # Prompts Gemini versionnés (symlinks depuis shared)
```

---

## Edge Functions

5 fonctions Deno déployées dans `supabase/functions/` :

### `oauth-callback` — Connexion Gmail
**Déclencheur :** Google redirige le navigateur ici après autorisation OAuth.

1. Échange le `code` Google contre des tokens access + refresh
2. Récupère l'adresse email via l'API Google userinfo
3. Chiffre les tokens en AES-256 (Web Crypto API) avant stockage en DB
4. Lance un **Gmail Watch** (abonnement Pub/Sub pour les nouveaux mails)
5. Redirige vers `/reglages/connecter/gmail?status=success`

### `gmail-webhook` — Réception temps réel
**Déclencheur :** Google Cloud Pub/Sub pousse une notification à chaque nouveau mail.

1. Valide le `?token=PUBSUB_SECRET` pour rejeter les appels non autorisés
2. Décode le payload base64 → `{emailAddress, historyId}`
3. Appelle l'API Gmail History pour récupérer les IDs des nouveaux messages
4. Insère dans `processing_queue` (priorité haute, ignore les doublons)
5. Met à jour le `history_id` en DB pour le prochain webhook

### `process-queue` — Traitement IA
**Déclencheur :** pg_cron toutes les 2 minutes. Traite **1 email par appel**.

1. Dépile atomiquement un item (`SELECT FOR UPDATE SKIP LOCKED`)
2. Rafraîchit le token Gmail si expiré
3. Télécharge l'email complet depuis Gmail API, stocke le HTML dans Supabase Storage
4. **Gemini appel 1 :** classification → transactionnel ou non ?
5. Si non-transactionnel → `status=skipped`, stop
6. **Gemini appel 2 :** extraction des données + linking vers dossier existant
7. Validation Zod (dégradation gracieuse si échec : dossier minimal créé)
8. Crée ou met à jour le dossier + insère un `dossier_event`

### `start-backfill` — Import historique
**Déclencheur :** appelée depuis le frontend (bouton "Importer les anciens mails").

1. Vérifie le JWT utilisateur
2. Construit une requête Gmail `from:amazon.fr OR from:sncf.com OR ...` depuis `merchants.known_sender_patterns`
3. Pagine les résultats (paramètre `limit_messages`, défaut 200)
4. Insère en masse dans `processing_queue` (priorité basse, ignore les doublons)
5. Met `backfill_status = 'running'` sur le compte Gmail

### `renew-watches` — Maintenance Pub/Sub
**Déclencheur :** pg_cron tous les 5 jours à minuit.

Cherche les comptes dont le Gmail Watch expire dans moins de 2 jours (expiration tous les 7 jours), et renouvelle l'abonnement Pub/Sub.

### Flux global

```
Nouveau mail Gmail
      │
      ▼
gmail-webhook ──► processing_queue (priorité 10)
                        │
start-backfill ─────────┤  (priorité 0, mails historiques)
                        │
                        ▼  (pg_cron toutes les 2 min)
                  process-queue
                        │
               ┌────────┴────────┐
               ▼                 ▼
        Gemini classifie      skipped
        (transactionnel ?)
               │ oui
               ▼
        Gemini extrait
        + linking dossier
               │
               ▼
    dossiers + dossier_events
```

---

## Scripts de développement

```bash
# Setup initial (installe, démarre Supabase, copie les .env)
./scripts/setup-local.sh

# Vider les données de test sans toucher aux comptes Gmail connectés
./scripts/reset-data.sh

# Monitoring temps réel de la queue et des dossiers
./scripts/monitor.sh

# Reset complet de la DB (migrations + seed)
./scripts/reset-db.sh
```

---

## Commandes utiles

```bash
# TypeScript
pnpm typecheck

# Frontend dev
pnpm dev

# Supabase
supabase start                                        # Démarrer
supabase stop                                         # Arrêter
supabase db reset                                     # Reset DB + migrations
supabase status                                       # URLs et clés locales
supabase functions serve --env-file supabase/functions/.env  # Edge Functions

# Tests manuels des fonctions
curl http://127.0.0.1:54321/functions/v1/process-queue
curl http://127.0.0.1:54321/functions/v1/renew-watches

# Logs pg_cron
# Dans Supabase Studio → SQL Editor :
# SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

# Générer une ENCRYPTION_KEY
openssl rand -hex 32
```

---

## Roadmap

- **Weekend 1** ✅ Fondations (monorepo, migrations, auth, design system)
- **Weekend 2** ✅ Ingestion Gmail (OAuth, Pub/Sub, process-queue, Gemini, backfill)
- **Weekend 3** — Frontend (dashboard, liste dossiers, détail, linking manuel)
- **Weekend 4** — Notifications (Telegram, Calendar) + deploy Vercel
