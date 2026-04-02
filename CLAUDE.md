# CLAUDE.md — Sésame

## Identité du projet

**Sésame** est un coffre-fort intelligent personnel pour centraliser, organiser et surveiller tout ce qui découle d'un achat, d'un abonnement, d'un voyage ou d'un service. Utilisé par un petit groupe familial (~5-10 personnes).

**Ce n'est PAS un SaaS.** Pas de multi-tenancy, pas de billing, pas d'onboarding public.
Objectif : zéro friction, zéro maintenance, zéro coût d'hébergement.

## Documents de référence

Lire ces fichiers **avant** d'implémenter quoi que ce soit :

| Fichier | Contenu |
|---------|---------|
| `DESIGN_SYSTEM.md` | Palette, typographie, composants, hover states, ton UX — **source de vérité UI** |
| `PROJECT_SPEC.md` | Spécification fonctionnelle complète, roadmap V1/V1.1 |
| `UI_FEATURES.md` | Catalogue des écrans et interactions attendus |

## Vocabulaire

| Terme code (DB + TS) | Terme UI |
|----------------------|----------|
| `dossier` | Dossier |
| `dossier_event` | Événement |
| `merchant` | Source / Enseigne |
| `dossier_type` | Type |
| `reference` | Référence |

`dossier_type` : `purchase` · `trip` · `accommodation` · `subscription` · `reservation` · `other`

## Architecture

```
sesame/
├── packages/
│   ├── web/          # React SPA (Vite + React 19 + TypeScript + TailwindCSS v4)
│   └── shared/       # Types, schémas Zod, prompts Gemini
├── supabase/
│   ├── functions/    # Edge Functions Deno (_shared/, process-queue/, gmail-webhook/, …)
│   ├── migrations/
│   └── seed.sql
├── DESIGN_SYSTEM.md
├── PROJECT_SPEC.md
└── UI_FEATURES.md
```

Structure `packages/web/src/` :
```
components/
  dossiers/     # DossierCard, Timeline, DeadlineBar, InfoRow, DossierSections, DossierActions, ManualLinkModal
  layout/       # AppLayout, Header, BottomNav, ProtectedRoute, BackfillBanner
  ui/           # Button, Input, Icon, StatusBadge, SectionTitle, TextLink, …
hooks/          # useAuth
lib/
  format.ts     # formatDate, formatDateLong, formatDateTime, formatAmount — source unique
  supabase.ts
  utils.ts      # cn()
pages/
stores/         # authStore, searchStore (Zustand)
```

## Stack technique

| Couche | Techno | Notes |
|--------|--------|-------|
| DB + Auth | Supabase (free tier) | Postgres, Auth, Storage, Edge Functions |
| Backend | Supabase Edge Functions (Deno) | Serverless, 0 serveur |
| Frontend | React 19 + Vite + TypeScript strict | |
| Styling | TailwindCSS v4 | Tokens dans `index.css` via `@theme {}` — pas de `tailwind.config.ts` |
| Icons | HugeIcons `@hugeicons/core-free-icons` (free tier, stroke-rounded) | |
| State global | Zustand v5 | Auth + search history uniquement |
| Server state | TanStack Query v5 | Cache, invalidation, mutations |
| Formulaires | React Hook Form + Zod | |
| Routing | React Router v7 | |
| Toasts | Sonner | |
| LLM | Gemini Flash | Classification + extraction + linking |
| Mail | Gmail API + Pub/Sub | |
| Hébergement | Vercel (free tier) | |

---

## Conventions TypeScript

- **Strict mode** activé : `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.
- Pas de `any`. Pas d'`enum` → utiliser `as const`.
- `type` (pas `interface`) pour tous les types objets — cohérence codebase.
- Types partagés → `packages/shared/src/`. Types locaux à un composant → dans le fichier.
- **`noUncheckedIndexedAccess`** : `arr[0]` retourne `T | undefined`. Toujours garder : `const item = arr[0]; if (!item) return;`
- **`exactOptionalPropertyTypes`** : `prop?: string` ≠ `prop?: string | undefined`. Pour spread conditionnel : `{...(val ? { prop: val } : {})}`.
- **`verbatimModuleSyntax`** : toujours inline les imports de types : `import { Foo, type Bar } from '...'` — jamais deux `import` séparés depuis le même module.
- Pas de barrel files. Imports explicites uniquement.
- **Formatting** : toujours importer depuis `src/lib/format.ts`. Fonctions disponibles : `formatDate`, `formatDateLong`, `formatDateTime`, `formatAmount`, `formatShortDate`, `formatMonthYear`, `formatRelativeTime`. Ne pas redéfinir ces fonctions localement — même pour un format "légèrement différent", ajouter la variante dans `format.ts`.
- **Pattern guard dans les queryFn** — toujours `throw`, jamais `return null` :
  ```ts
  queryFn: async () => {
    if (!user) throw new Error('Not authenticated'); // ← pas "return null"
    // user.id est sûr ici
  },
  enabled: !!user,
  ```

## Conventions React

### Composants — lisibilité et découpage

- Composants fonctionnels, un par fichier, PascalCase.
- **Jamais de composant défini à l'intérieur d'un autre composant** — provoque un remount à chaque render parent.
- **Règle des 150 lignes** : un composant qui dépasse ~150 lignes de JSX est un signal de découpage. Extraire dans un fichier séparé.
- **Règle des 2 occurrences** : dès qu'un pattern JSX se répète à l'identique ou presque dans 2 endroits, en faire un composant. Pas d'attendre 3 fois.
- **Séparer rendu et logique** : un composant ne doit contenir que du JSX et des appels de hooks. Toute logique non-triviale (calculs, transformations, effets secondaires) sort dans un hook ou une fonction utilitaire.

### Organisation des fichiers

Pour une page ou un composant complexe, découper en fichiers colocalisés :

```
pages/
  DossiersPage.tsx          # Composant pur — JSX uniquement
  DossiersPage.hooks.ts     # useFilters(), useGroupedDossiers() — logique extraite
  DossiersPage.utils.ts     # groupByMonth(), formatMonthHeader() — fonctions pures
```

Règles :
- **`.hooks.ts`** : hooks custom extraits du composant. Un hook = une responsabilité (ex : `useFilters`, `useDebounce`, `usePagination`).
- **`.utils.ts`** : fonctions pures sans état React. Testables unitairement, zéro import React.
- **`.types.ts`** : types locaux à la feature si plus de 3-4 types ou si partagés entre les fichiers `.tsx`, `.hooks.ts`, `.utils.ts`.
- Un composant qui a besoin d'un `.hooks.ts` ET d'un `.utils.ts` est probablement un répertoire (`DossiersPage/index.tsx`).

### Autres règles React

- Pas de `useEffect` pour fetcher des données → TanStack Query.
- `useMemo` / `useCallback` uniquement si : (1) calcul coûteux prouvé, ou (2) enfant wrappé dans `memo()`. Ne pas en mettre par défaut.
- **État local d'abord.** Remonter l'état uniquement quand ≥ 2 composants en ont besoin. Zustand en dernier recours pour état vraiment global.
- UX Writing : tout texte visible suit le ton Sésame — tutoiement, proactif, sans emoji (voir `DESIGN_SYSTEM.md` §6).
- Formulaires : React Hook Form + `zodResolver`. Pas de validation custom dans les composants.

## TanStack Query

- **Query keys structurées** : `['dossiers', 'list', userId, ...filters]`. Inclure `userId` pour isoler les caches par utilisateur.
- **Le cache Query est la source de vérité** pour les données serveur. Ne pas dupliquer dans Zustand.
- Après une mutation, invalider les queries concernées via `queryClient.invalidateQueries()`.
- `enabled: !!user` pour toutes les queries qui requièrent une session — et ajouter le guard en tête de `queryFn`.
- `staleTime: 5min` configuré globalement dans `App.tsx`. Ajuster par query si nécessaire.
- Typer explicitement `useQuery<ReturnType>` — ne pas laisser TypeScript inférer `unknown`.
- **Mutations Supabase** : toujours `if (!user) throw new Error('Not authenticated')` en tête de `mutationFn`, ET `.eq('user_id', user.id)` sur tout UPDATE/DELETE. La RLS est un filet de sécurité, pas le seul garde-fou.
- **Params URL comme filtres** : valider contre une whitelist avant usage — un `as FilterStatus` sans validation bypasse TypeScript silencieusement. Exemple : `DOSSIER_STATUSES.includes(raw) ? raw : 'all'`.

## Zustand

- Stores à **responsabilité unique** : `useAuthStore` (session/user), `useSearchStore` (historique).
- **Selectors** : toujours retourner des primitives ou des références stables. `(s) => s.user.id` ✓ — `(s) => ({ id: s.user.id })` ✗ (nouvel objet à chaque render).
- Ne jamais consommer `useAuthStore()` entier dans un composant — sélectionner uniquement ce dont il a besoin.

## Design System

Voir `DESIGN_SYSTEM.md` pour la référence complète. Règles critiques :

1. **Zéro emoji.** HugeIcons stroke-rounded uniquement (`@hugeicons/core-free-icons`).
2. **Hover = ombre plus épaisse.** `.btn-brutal` et `.card-brutal` passent à `6px 6px` au hover. Jamais de bordure orange au hover.
3. **Border-radius** : modales = `rounded-xl` (16px) · cartes/sections = `rounded-lg` (12px) · boutons/inputs = `rounded` (8px) · pills = `rounded-pill`.
4. **Composants partagés** dans `components/ui/` : `Button`, `SectionTitle`, `TextLink`, `StatusBadge`, `Icon`. Les utiliser — ne pas réinventer.
5. **TailwindCSS v4** : tokens dans `src/index.css` via `@theme {}`. Classes disponibles : `sesame-bg`, `sesame-surface`, `sesame-surface-muted`, `sesame-text`, `sesame-text-muted`, `sesame-accent`, `sesame-danger`, `sesame-positive`, `sesame-transit`.
6. **Zéro couleur hex hors de `@theme {}`**. Dans les composants (prop `color` d'`Icon`, styles inline, classes Tailwind) : toujours `var(--color-sesame-*)` ou `text-sesame-*`/`bg-sesame-*`/`border-sesame-*`. Les seuls `#XXXXXX` autorisés sont dans le bloc `@theme {}` de `index.css`.

## Supabase Edge Functions

- 1 fichier par fonction, Deno, client Supabase natif.
- **Imports Deno** : toujours `npm:` (ex : `npm:@supabase/supabase-js@2`). Jamais `jsr:` — risque de conflit de version au runtime.
- **Idempotence obligatoire.** Les fonctions peuvent être appelées plusieurs fois.
- Pas de `try/catch` silencieux — logger ou re-throw avec contexte.
- RLS activé sur **toutes** les tables. Les mutations doivent être isolées par `user_id` au niveau DB, pas seulement côté client.
- Utiliser `createClient(URL, SERVICE_ROLE_KEY)` uniquement pour les opérations admin (bypass RLS intentionnel). Sinon utiliser le client avec le JWT de la requête.
- Réponses HTTP : `{ success: true, data: T }` ou `{ success: false, error: string, code: string }`.

## SQL

- Migrations ascendantes uniquement. snake_case, tables au pluriel.
- UUID v4, `created_at TIMESTAMPTZ DEFAULT now()`, RLS partout.
- Colonnes calculées dans les migrations Postgres, pas en JS.

## ESLint

Config dans `packages/web/eslint.config.js` — `tseslint.configs.strict` + règles custom.
Lancer `npm run lint` avant de proposer un PR. Zéro erreur, zéro warning attendu.
Règles clés : `no-explicit-any` (error), `consistent-type-imports` (error), `no-unused-vars` (error, `_` prefix ignoré), `react-hooks/exhaustive-deps` (error).

## Ce qu'on ne fait PAS

- Pas de multi-tenancy, billing, onboarding public.
- Pas d'extension Chrome, PWA, mode hors-ligne en V1.
- Pas de tests E2E ni tests Edge Functions en V1 (Vitest pour logique pure `packages/shared` uniquement).
- Pas d'i18n — tout en français.
- Pas de CSS custom ni CSS-in-JS — Tailwind uniquement.
- Pas de rules engine custom — le LLM fait le matching et la classification.
- Pas de Redux, Context API pour l'état global — Zustand uniquement.
- Pas de barrel files (`index.ts` réexportant tout un dossier).
