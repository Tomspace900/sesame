# UI_FEATURES.md — Sésame : Spécification fonctionnelle des écrans

## Contexte pour le développeur frontend

Sésame est un coffre-fort intelligent personnel. L'interface doit être **mobile-first** (80% de l'usage sur téléphone), épurée, rapide.
Les utilisateurs ne sont PAS tech-savvy (parents, famille). Chaque écran doit être compréhensible sans explication.

**Références obligatoires :**
- `DESIGN_SYSTEM.md` pour les couleurs, typo, tokens, composants, ton de voix
- `CLAUDE.md` pour les conventions de code et la config Tailwind

**Rappels design critiques :**
- Zéro emoji. Uniquement des icônes HugeIcons (stroke-rounded) et des couleurs de statut.
- Palette sable neutre. Les couleurs néon sont réservées aux statuts et actions.
- Neo-brutalisme adouci : bordures visibles, ombres dures. Enfoncement au clic pour les boutons UNIQUEMENT. Les cartes dans un flex/grid utilisent un changement d'ombre subtil (pas de translate).
- Vocabulaire UI : "Dossier" (pas "Achat"), "Source" (pas "Marchand"), "Référence" (pas "N° commande").
- Tutoiement. Ton proactif, chaleureux, concis. Voir DESIGN_SYSTEM.md section 6.
- Contraste : texte toujours `sesame-text` sur fond `sesame-positive`. Jamais de blanc sur vert acide.

**Stack UI :**
- shadcn/ui (personnalisé via Tailwind avec les tokens Sésame)
- Icônes : HugeIcons (`@hugeicons/react-pro`, stroke-rounded, plan gratuit)
- Fonts : Fraunces (titres), Plus Jakarta Sans (body/UI)

---

## Navigation globale

### Layout principal (authentifié)

```
┌─────────────────────────────────┐
│  [Logo Sésame]    [cloche] [Av] │  ← Header fixe
├─────────────────────────────────┤
│                                 │
│         Contenu page            │
│                                 │
├─────────────────────────────────┤
│  [home] [box] [search] [gear]   │  ← Bottom nav (mobile)
│  Accueil Dossiers Recherche Cfg │
└─────────────────────────────────┘
```

**Mobile** : bottom navigation bar fixe, 4 onglets. Style : fond `sesame-surface`, bordure top 1px `sesame-text`.
**Desktop** : sidebar gauche rétractable + header top.

**Header :**
- Logo "Sésame" (image fournie, à placer à gauche)
- Icône HugeIcons `notification-03` avec badge numérique (alertes non lues) — fond badge `sesame-danger`, texte `sesame-surface`
- Avatar initiales (shadcn/ui Avatar) avec dropdown (shadcn/ui DropdownMenu) : nom, "Réglages", "Se déconnecter"

**Icônes bottom nav :**
- Accueil : `home-04`
- Dossiers : `box-01`
- Recherche : `search-01`
- Réglages : `settings-02`
- Onglet actif : icône en `sesame-accent`, label en `sesame-accent`
- Onglets inactifs : icône et label en `sesame-text-muted`

---

## Écran 1 : Connexion / Onboarding

### 1.1 Page de Connexion (`/auth/connexion`)

**Éléments :**
- Logo "Sésame" centré
- Sous-titre en Plus Jakarta Sans muted : "Ton coffre-fort intelligent"
- Champ email (shadcn/ui Input, stylisé : bordure 2px `sesame-text`, radius 8px)
- Bouton primaire : "Recevoir un lien de connexion" (style bouton brutal : fond `sesame-accent`, ombre dure, enfoncement au clic)
- Texte secondaire : "Un lien sera envoyé à ton adresse pour te connecter"

**États :**
- Par défaut : formulaire vide
- Envoi en cours : bouton disabled, icône HugeIcons `loading-03` animée (spin)
- Lien envoyé : message succès fond `sesame-positive` 15% opacité, texte `sesame-text`, icône `checkmark-circle-02` — "C'est envoyé — vérifie ta boîte mail"
- Erreur : message fond `sesame-danger` 15% opacité, texte `sesame-text`

**Pas de formulaire d'inscription.** Magic link crée le compte automatiquement. Emails autorisés whitelistés côté Supabase.

### 1.2 Onboarding (`/bienvenue`)

Flow en 3 étapes. Stepper horizontal : 3 cercles reliés par une ligne (cercle actif rempli `sesame-accent`, passés remplis `sesame-positive`, à venir en `sesame-surface-muted`).

**Étape 1 — Bienvenue**
- Titre Fraunces : "Bienvenue, {prénom}"
- Paragraphe : "Sésame va scanner tes mails pour retrouver tes commandes, suivre tes colis et surveiller tes garanties."
- Icône HugeIcons `magic-wand-01` grande (48px), en `sesame-accent`
- Bouton primaire : "C'est parti"

**Étape 2 — Connexion mail**
- Titre : "Connecte ta boîte mail"
- 3 cartes empilées (shadcn/ui Card, style brutal : bordure 2px, ombre, pas de translate au clic) :
  - Logo provider (image) + nom + flèche `arrow-right-01`
  - Gmail en première position (bordure `sesame-accent`)
  - Yahoo en deuxième
  - Outlook : carte grisée (fond `sesame-surface-muted`), label "Bientôt disponible"
- Après OAuth réussi : la carte affiche l'email connecté + icône `checkmark-circle-02` en `sesame-positive` (en fond badge, texte `sesame-text`)
- Lien discret : "Ajouter un autre compte"
- Bouton "Continuer" (actif si >= 1 compte, disabled sinon)

**Étape 3 — Import en cours**
- Titre : "Sésame fouille tes mails..."
- Barre de progression (shadcn/ui Progress, fond `sesame-surface-muted`, remplissage `sesame-accent`, bordure 2px, radius 8px)
- Compteurs animés : "{X} mails analysés" et "{Y} dossiers retrouvés" — nombres en Fraunces, texte en Plus Jakarta
- Bouton : "Explorer mon coffre-fort" (actif immédiatement)
- Texte muted : "L'import continue en arrière-plan, tes dossiers apparaissent au fur et à mesure"

---

## Écran 2 : Accueil / Dashboard (`/`)

### Layout

```
┌─────────────────────────────────┐
│ Bonjour, Thomas                 │  ← Fraunces semi-bold
├─────────────────────────────────┤
│ ALERTES (si > 0)                │
│ ┌─────────────────────────────┐ │
│ │ [alert-02] Dernier appel :  │ │
│ │ 2j pour renvoyer (Fnac)     │ │  ← Bordure gauche danger
│ ├─────────────────────────────┤ │
│ │ [alert-02] Ta garantie TV   │ │
│ │ expire le mois prochain     │ │  ← Bordure gauche accent
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ EN COURS                        │
│ ┌─────────────────────────────┐ │
│ │ [DossierCard] Aspirateur    │ │
│ │  Amazon · En route · 89,99 €│ │
│ ├─────────────────────────────┤ │
│ │ [DossierCard] Casque JBL    │ │
│ │  Fnac · Commandé · 149 €    │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ DERNIERS DOSSIERS               │
│ ┌─────────────────────────────┐ │
│ │ [DossierCard compact] ...   │ │
│ └─────────────────────────────┘ │
│        Voir tous les dossiers → │
└─────────────────────────────────┘
```

### Composants

**Bandeau d'alertes :**
- Visible uniquement si alertes actives
- Chaque alerte = shadcn/ui Card avec bordure gauche 4px colorée :
  - `sesame-danger` si urgent (< 3 jours)
  - `sesame-accent` si attention (< 30 jours)
- Icône `alert-02` à gauche, couleur de la bordure
- Texte en ton Sésame (proactif, tutoiement) : "Dernier appel : 2 jours pour renvoyer ton article Fnac"
- Cliquable → page détail
- Bouton ghost `cancel-01` pour masquer

**Section "En cours" :**
- Titre de section en Plus Jakarta medium, `sesame-text-muted`, uppercase, letter-spacing 0.05em, taille 12px
- Dossiers statut `confirmed` ou `in_progress`, triés par date desc
- Max 5, lien "Voir tout" si plus

**Section "Derniers dossiers" :**
- 5 derniers, variante compacte
- Lien "Voir tous les dossiers" → `/dossiers`

**Bandeau backfill (conditionnel) :**
- Barre fine 3px collée sous le header, fond `sesame-accent`, animation shimmer gauche-droite
- Texte discret au tap : "Sésame fouille tes mails... {X}/{Y} traités"
- Fade-out à la fin

**État vide :**
- Icône `box-01` grande (48px), en `sesame-text-muted`
- Titre Fraunces : "Ton coffre est vide"
- Texte : "Connecte ta boîte mail pour réveiller Sésame."
- Bouton primaire "Connecter ma boîte mail" si aucun mail_account
- Barre de progression si backfill en cours

---

## Écran 3 : Liste des dossiers (`/dossiers`)

### Layout

```
┌─────────────────────────────────┐
│ [search-01  Rechercher...     ] │  ← Sticky
│ [filter-01 Filtres v]           │
├─────────────────────────────────┤
│ Mars 2026                       │  ← Séparateur mois
│ ┌─────────────────────────────┐ │
│ │ Aspirateur Dyson V15        │ │
│ │ Amazon · Livré · 489,99 €  │ │
│ ├─────────────────────────────┤ │
│ │ Casque JBL Tune 770        │ │
│ │ Fnac · En route · 79,99 €  │ │
│ └─────────────────────────────┘ │
│ Février 2026                    │
│ ...                             │
│       [Charger plus]            │
└─────────────────────────────────┘
```

### Fonctionnalités

**Barre de recherche :**
- Sticky en haut
- shadcn/ui Input avec icône `search-01` à gauche, bordure 2px `sesame-text`, fond `sesame-surface`
- Full-text sur : product_name, merchant, order_reference, notes, tags
- Debounce 300ms, résultats live
- Icône `cancel-01` pour effacer (visible seulement si rempli)
- Placeholder : "Rechercher un dossier..."

**Panneau de filtres (shadcn/ui Collapsible) :**
- Toggle via bouton ghost icône `filter-01` + "Filtres"
- Filtres :
  - **Type** : shadcn/ui Checkbox group (Achats, Voyages, Hébergements, Abonnements, Réservations) — mappe vers `dossier_type`
  - **Statut** : shadcn/ui Checkbox group (Commandé, En route, Livré, Retourné, Annulé)
  - **Source** : shadcn/ui Combobox avec les enseignes du user
  - **Période** : sélecteur rapide (Ce mois, 3 mois, Cette année, Tout) + shadcn/ui DatePicker
  - **Montant** : shadcn/ui Slider min-max
- Bouton ghost "Réinitialiser"
- Filtres actifs = shadcn/ui Badge (variante outline) supprimables avec `cancel-01`

**Liste :**
- Groupement par mois/année (header sticky, Plus Jakarta medium, `sesame-text-muted`)
- Scroll infini (batch 20)
- DossierCard standard
- Tap → `/dossiers/:id`

**Tri :** date desc par défaut. Option montant asc/desc dans les filtres.

**États vides :**
- Recherche sans résultat : icône `search-01` en muted + "Aucun dossier trouvé. Essaie avec un nom de marchand ou de produit."
- Aucun dossier : même empty state que le dashboard

---

## Écran 4 : Détail d'un dossier (`/dossiers/:id`)

### Layout

```
┌─────────────────────────────────┐
│ [arrow-left] Retour   [more-h] │
├─────────────────────────────────┤
│ ┌───┐                          │
│ │img│  Aspirateur Dyson V15     │  ← Fraunces bold
│ └───┘  Amazon                   │  ← Plus Jakarta, muted
│        489,99 €                 │  ← Fraunces semi-bold
│        [StatusBadge: Livré]     │
├─────────────────────────────────┤
│ INFORMATIONS                    │
│ Référence      408-1234567      │  ← Copiable
│ Commandé le    15 mars 2026     │
│ Livré le       19 mars 2026     │
│ Transporteur   Chronopost       │
│ Suivi          XX123...   [lnk] │  ← Lien externe
├─────────────────────────────────┤
│ ÉCHÉANCES                       │
│ ┌─────────────────────────────┐ │
│ │ Rétractation                │ │
│ │ ████████░░░░░  dans 3 jours │ │  ← DeadlineBar danger
│ │ "Dernier appel pour un      │ │
│ │  retour : 29 mars 2026"     │ │
│ ├─────────────────────────────┤ │
│ │ Garantie                    │ │
│ │ ░░░░░░░░░░░░░  2 ans       │ │  ← DeadlineBar positive
│ │ "Tu es tranquille jusqu'en  │ │
│ │  mars 2028."                │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ HISTORIQUE                      │
│ ┌─────────────────────────────┐ │
│ │ ● 19/03 C'est arrivé       │ │
│ │ │                           │ │
│ │ ● 17/03 En route           │ │
│ │ │                           │ │
│ │ ● 15/03 Commande confirmée │ │
│ │ │                           │ │
│ │ ○ 15/03 Paiement reçu      │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ NOTES                           │
│ [Zone de texte éditable]        │
│ Tags : [électro] [maison] [+]  │
├─────────────────────────────────┤
│ ÉVÉNEMENTS NON LIÉS             │  ← Conditionnel
│ "Un mail pourrait correspondre  │
│  à ce dossier"                  │
│ [Voir et lier]                  │
└─────────────────────────────────┘
```

### Composants détaillés

**En-tête produit :**
- Image 64x64 (ou icône HugeIcons contextuelle : `box-01` produit, `plane-01` voyage, `wifi-01` abonnement)
- Titre en Fraunces bold
- Source en Plus Jakarta muted, cliquable → filtre la liste
- Montant en Fraunces semi-bold
- StatusBadge

**Section Informations :**
- Grille clé/valeur, Plus Jakarta Sans
- Labels `sesame-text-muted`, valeurs `sesame-text`
- Référence : icône `copy-01` au tap → toast "Référence copiée"
- Suivi : icône `link-external-01`, ouvre le tracking
- Lignes avec données manquantes masquées

**Section Échéances :**
- DeadlineBar pour chaque deadline
- Barre : fond `sesame-surface-muted`, remplissage coloré selon urgence
  - `sesame-positive` si > 60% du temps restant
  - `sesame-accent` si 15-60%
  - `sesame-danger` si < 15%
  - Gris `sesame-surface-muted` si expiré
- Texte descriptif en ton Sésame sous chaque barre :
  - Rétractation active : "Dernier appel pour un retour : {date}" (si < 3j) ou "Tu peux encore renvoyer cet article jusqu'au {date}"
  - Garantie active : "Tu es tranquille jusqu'en {mois année}."
  - Expiré : "Expiré depuis le {date}" en `sesame-text-muted`
  - Non calculable : "Pas assez de données pour le moment" en `sesame-text-muted`

**Section Historique (Timeline) :**
- Ligne verticale 2px `sesame-surface-muted`
- Points : 12px, bordure 2px `sesame-text`
  - Plein (fond `sesame-text`) pour majeurs
  - Vide (fond `sesame-surface`) pour secondaires
- Icône dans le point pour les majeurs :
  - `shopping-cart-01` → commande
  - `truck-delivery` → expédition
  - `package-check` → livraison
  - `invoice-01` → facture
  - `money-send-01` → paiement
- Texte en ton Sésame : "C'est arrivé" au lieu de "Livraison confirmée", "En route" au lieu de "Colis expédié"
- Date en `sesame-text-muted`
- Tap → expand : données extraites + lien "Voir le mail"
- Si `extraction_confidence < 0.7` : icône `alert-02` en `sesame-accent` + "Sésame n'est pas sûr de cette extraction"

**Section Notes :**
- shadcn/ui Textarea, bordure 2px, auto-save debounce 1s
- Tags : shadcn/ui Badge outline, bouton [+] input inline, Enter pour valider

**Section "Événements non liés" (conditionnelle) :**
- Visible si dossier_events orphelins matchent potentiellement
- Texte : "Un mail pourrait correspondre à ce dossier"
- Carte par candidat avec résumé + confiance
- Bouton "Lier à ce dossier" (primaire) + "Ignorer" (ghost)

**Menu Actions (icône `more-horizontal-circle-01`) :**
- shadcn/ui DropdownMenu :
  - "Modifier les informations" (`edit-02`)
  - "Ajouter au calendrier" (`calendar-add-01`)
  - "Marquer comme retourné" (`undo`)
  - "Marquer comme annulé" (`cancel-circle`)
  - Séparateur
  - "Supprimer ce dossier" (`delete-02`, texte `sesame-danger`)

### Layout adaptatif selon `dossier_type`

La page détail adapte ses sections visibles selon le type de dossier. Les sections communes (en-tête, notes, tags, timeline, événements non liés) sont toujours présentes. Les sections spécifiques apparaissent conditionnellement :

**purchase (Achat) :**
- Section INFORMATIONS : référence, dates commande/livraison, transporteur, suivi
- Section RETRAIT (si pickup_code ou pickup_point renseigné) : nom du point, adresse, code retrait en gros + copiable
- Section ÉCHÉANCES : barre rétractation + barre garantie

**trip (Voyage) :**
- Section TRAJET : départ → arrivée avec heures, numéro de vol/train, siège/voiture, référence booking
- Section PARTICIPANTS : liste des passagers
- Section LIENS : bouton "Enregistrement en ligne" si action_link type check_in disponible
- Section ÉCHÉANCES : barre compte à rebours avant départ

**accommodation (Hébergement) :**
- Section SÉJOUR : dates check-in/check-out, adresse complète (lien Google Maps), nombre de convives
- Section HÔTE : nom + téléphone (cliquable) + dernier message si host_message dans les events
- Section ÉCHÉANCES : barre annulation gratuite (si return_deadline renseigné)

**subscription (Abonnement) :**
- Section ABONNEMENT : nom, montant, période (mensuel/annuel), date prochain renouvellement
- Section ÉCHÉANCES : barre renouvellement
- Pas de section tracking/livraison

**reservation (Réservation ponctuelle) :**
- Section RÉSERVATION : lieu, date/heure, nombre de personnes
- Layout simplifié, peu de sections

### StatusBadge — Vocabulaire par type

| Statut code    | purchase     | trip         | accommodation | subscription |
|----------------|-------------|--------------|---------------|--------------|
| `detected`     | Détecté     | Détecté      | Détecté       | Détecté      |
| `confirmed`    | Commandé    | Réservé      | Réservé       | Actif        |
| `in_progress`  | En route    | Check-in     | En cours      | —            |
| `completed`    | Livré       | Terminé      | Terminé       | —            |
| `cancelled`    | Annulé      | Annulé       | Annulé        | Annulé       |
| `returned`     | Retourné    | —            | —             | —            |

Les couleurs du StatusBadge restent les mêmes quel que soit le type (voir section Composants réutilisables).

---

## Écran 5 : Recherche (`/recherche`)

Dédié mobile. Sur desktop, la search bar de `/dossiers` suffit.

- shadcn/ui Input, autofocus à l'ouverture
- Avant saisie : 5 dernières recherches (Zustand store, PAS localStorage)
- Pendant saisie : résultats live, debounce 300ms
- Highlight du terme en gras (font-weight 600)
- Tap → `/dossiers/:id`
- Placeholder : "Que cherches-tu ?"

---

## Écran 6 : Réglages (`/reglages`)

### Sections

**Mon compte :**
- Nom affiché (shadcn/ui Input inline editable) + email (read-only, muted)

**Boîtes mail connectées :**
- Chaque compte : logo provider + email + "Dernier sync : il y a X min"
- Si backfill en cours : shadcn/ui Progress + "{X}/{Y} mails analysés"
- Boutons ghost : "Synchroniser" (icône `refresh-01`) + "Déconnecter"
- Bouton "Ajouter un compte" → même sélecteur provider que l'onboarding

**Telegram :**
- Non connecté :
  1. "Ouvre Telegram et cherche @NomDuBot"
  2. "Envoie /start au bot"
  3. "Colle le code reçu ci-dessous"
  - Champ + bouton "Vérifier"
  - OU bouton "Ouvrir dans Telegram" (deep link)
- Connecté : username + bouton "Tester" + bouton "Déconnecter"

**Notifications :**
- shadcn/ui Switch pour chaque canal (Telegram, Google Calendar)
- shadcn/ui Input type number pour les jours de rappel (défaut : 3 rétractation, 30 garantie)
- Auto-save

**Statistiques :**
- Compteurs en Fraunces semi-bold : total dossiers, mails analysés, sources, valeur totale
- Fond `sesame-surface`, bordure 2px, radius 12px (carte stats)

**Se déconnecter :** bouton ghost en bas de page.

---

## Composants réutilisables

### DossierCard

**Variante standard :**
- shadcn/ui Card, fond `sesame-surface`, bordure 2px `sesame-text`, radius 12px, ombre `shadow-brutal`
- Hover : bordure `sesame-accent`
- Active : ombre réduite à `shadow-brutal-sm` (PAS de translate)
- Image 48x48 ou icône HugeIcons par `dossier_type` si pas d'image :
  - purchase : `box-01`
  - trip : `plane-01` (avion) ou `truck-delivery` (train/transport)
  - accommodation : `home-04`
  - subscription : `wifi-01`
  - reservation : `calendar-add-01`
- Titre Plus Jakarta medium
- Source + StatusBadge + montant + date

**Variante compacte :**
- 1 ligne, pas d'image, pas d'ombre, pas de carte
- Fond transparent, bordure-bottom 1px `sesame-surface-muted`
- Titre · Source · Montant · Pastille statut

### StatusBadge

| Statut code    | Fond (15% opacité)              | Texte               | Icône HugeIcons        | Label par défaut |
|----------------|----------------------------------|----------------------|------------------------|------------------|
| detected       | `sesame-surface-muted`           | `sesame-text-muted`  | `help-circle`          | Détecté          |
| confirmed      | `sesame-transit` 15%             | `sesame-text`        | `shopping-cart-01`     | Confirmé         |
| in_progress    | `sesame-accent` 15%              | `sesame-text`        | `truck-delivery`       | En cours         |
| completed      | `sesame-positive` 15%            | `sesame-text`        | `package-check`        | Terminé          |
| returned       | `sesame-transit` 15%             | `sesame-text`        | `undo`                 | Retourné         |
| cancelled      | `sesame-surface-muted`           | `sesame-text-muted`  | `cancel-circle`        | Annulé           |

**Le label affiché change selon le `dossier_type`** (voir le tableau StatusBadge par type dans l'écran 4). Exemples : `confirmed` affiche "Commandé" pour un achat, "Réservé" pour un voyage, "Actif" pour un abonnement.

Note : le texte est **toujours** `sesame-text` ou `sesame-text-muted` dans les badges. On n'utilise jamais les couleurs néon comme couleur de texte (échec contraste AA). La couleur de fond à faible opacité donne l'information visuelle.

Format pilule : radius `pill`, padding 4px 12px, icône 14px à gauche du texte.

### DeadlineBar

- Conteneur : fond `sesame-surface-muted`, hauteur 8px, radius 4px, bordure 1px `sesame-surface-muted`
- Remplissage : couleur selon urgence (positive / accent / danger)
- Au-dessus : label Plus Jakarta medium + date
- En-dessous : texte descriptif en ton Sésame (voir section Échéances de l'écran 4)

### BackfillBanner

- Barre 3px sous le header
- Fond `sesame-accent`
- Animation : shimmer gauche-droite (CSS gradient animé)
- Fade-out à la complétion (opacity transition 500ms)

### Timeline

- Ligne verticale 2px `sesame-surface-muted`
- Points 12px, bordure 2px `sesame-text`, fond plein ou vide
- Icône dans le point pour les majeurs (voir table icônes écran 4)
- Date `sesame-text-muted`, type `sesame-text`
- Expandable au tap (shadcn/ui Collapsible)

---

## Modales et dialogues

Utiliser shadcn/ui Dialog et AlertDialog. Personnalisation : fond `sesame-surface`, bordure 2px `sesame-text`, ombre `shadow-brutal`, radius 16px.

### ManualLinkModal (shadcn/ui Dialog)

- Titre Fraunces : "Lier cet email à un dossier"
- Résumé du mail
- shadcn/ui RadioGroup : dossiers candidats avec titre + source + date + montant + confiance
- shadcn/ui Input pour rechercher un autre dossier
- Boutons : "Annuler" (ghost) + "Confirmer" (primaire)

### DeleteConfirmDialog (shadcn/ui AlertDialog)

- Titre : "Supprimer ce dossier ?"
- Texte : "Cette action est irréversible. Les emails associés seront conservés."
- Boutons : "Annuler" (ghost) + "Supprimer" (destructif)

### DisconnectMailDialog (shadcn/ui AlertDialog)

- Titre : "Déconnecter {email} ?"
- Texte : "Les dossiers déjà importés seront conservés."
- Boutons : "Annuler" (ghost) + "Déconnecter" (secondaire)

---

## Toasts

shadcn/ui Toast (Sonner). Position : bas de l'écran.
Style : fond `sesame-surface`, bordure 2px `sesame-text`, ombre `shadow-brutal-sm`, radius 8px.

- Succès : bordure gauche 4px `sesame-positive`, icône `checkmark-circle-02`, texte `sesame-text`
- Erreur : bordure gauche 4px `sesame-danger`, icône `alert-02`, persistent (dismiss manuel)
- Info : bordure gauche 4px `sesame-transit`, icône `information-circle`, auto-dismiss 3s

Texte des toasts en ton Sésame :
- "Référence copiée" (pas "Copié dans le presse-papier")
- "Dossier lié" (pas "Événement associé au dossier avec succès")
- "Impossible de se connecter. Réessaie dans un instant."

---

## États de chargement

Skeleton (shadcn/ui Skeleton) pour chaque section :
- Fond `sesame-surface-muted` avec animation pulse
- Forme identique au composant cible
- 3-5 skeletons pour les listes
- Pas de spinner pleine page (sauf premier chargement global)

---

## Responsive

| Breakpoint | Layout                                                        |
|------------|---------------------------------------------------------------|
| < 640px    | Mobile : bottom nav, stack vertical, DossierCard pleine largeur |
| 640-1024px | Tablet : bottom nav, grille 2 colonnes pour les cartes       |
| > 1024px   | Desktop : sidebar gauche, grille 2-3 colonnes                |

---

## Accessibilité (V1 minimum)

- Tous les éléments interactifs focusables au clavier
- StatusBadge : `aria-label` descriptif ("Statut : livré"), pas juste la couleur
- Icônes décoratives : `aria-hidden="true"`
- Contraste AA vérifié sur toutes les combinaisons (voir DESIGN_SYSTEM.md section 3)
- Toasts : `role="status"` (succès/info) ou `role="alert"` (erreur)
- Focus visible : outline 2px `sesame-accent` offset 2px (géré par shadcn/ui, vérifier la couleur)
