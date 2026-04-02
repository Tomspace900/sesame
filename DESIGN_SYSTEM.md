# DESIGN_SYSTEM.md — Sésame

## 1. Principes

- **Agnosticisme du contenu :** Le design ne présume pas du type de contenu. On parle de "Dossier" et de "Source". Un dossier peut être un produit physique, un service, un voyage, un abonnement.
- **Zéro Emoji :** L'interface s'appuie uniquement sur la typographie, les couleurs et les icônes HugeIcons (stroke-rounded).
- **Contraste et Focale :** Interface majoritairement neutre (sable/marron/blanc). Les couleurs néon sont strictement réservées aux éléments nécessitant une attention immédiate.

## 2. Typographie

- **Titres : `Fraunces`** (fallback : `Cormorant Garamond`, serif). Semi-Bold (600) ou Bold (700).
- **Corps/UI : `Plus Jakarta Sans`** (fallback : `Outfit`, sans-serif). Regular (400) texte, Medium (500) boutons et labels.

## 3. Palette de couleurs

### Fonds
| Token               | Hex       | Usage                                          |
|---------------------|-----------|-------------------------------------------------|
| `sesame-bg`          | `#F7F4EB` | Fond de l'app                                  |
| `sesame-surface`     | `#FCFAF5` | Cartes, modales, éléments détachés du fond     |
| `sesame-surface-muted` | `#EBE5D9` | Champs désactivés, zones secondaires         |

### Texte
| Token               | Hex       | Usage                                          |
|---------------------|-----------|-------------------------------------------------|
| `sesame-text`        | `#2A241F` | Texte principal                                |
| `sesame-text-muted`  | `#7A7065` | Sous-titres, dates, texte descriptif           |

### Accents et Statuts
| Token               | Hex       | Usage                                          |
|---------------------|-----------|-------------------------------------------------|
| `sesame-accent`      | `#FF5C00` | Action principale, focus, accent IA            |
| `sesame-positive`    | `#CCFF00` | Actif, garanti, livré, en cours de validité    |
| `sesame-danger`      | `#FF0055` | Urgent, expiration imminente                   |
| `sesame-transit`     | `#00E5FF` | En cours, en transit, traitement IA            |

### Règles de contraste (WCAG AA)

Combinaisons validées :
- `sesame-text` sur `sesame-bg` — OK (~14:1)
- `sesame-text` sur `sesame-surface` — OK (~15:1)
- `sesame-text-muted` sur `sesame-bg` — OK (~5:1)
- `sesame-text` sur `sesame-positive` — OK (~11:1)
- `sesame-surface` sur `sesame-accent` — OK (~4.6:1)
- `sesame-surface` sur `sesame-danger` — OK (~5.5:1)

Combinaisons **interdites** :
- Blanc ou `sesame-surface` sur `sesame-positive` — ÉCHEC AA
- `sesame-text-muted` sur `sesame-surface-muted` — ÉCHEC AA pour les petits textes
- `sesame-transit` comme couleur de texte sur fond clair — ÉCHEC AA

### Application des couleurs de statut en badges
- **Variante discrète :** fond couleur statut à 15% opacité + texte `sesame-text`
- **Variante urgente :** fond rempli avec la couleur, texte `sesame-text`

## 4. Tokens d'interface

Style : **neo-brutalisme adouci**. Bordures visibles, ombres franches, angles légèrement arrondis.

### Bordures
- Défaut : `1px`, éléments interactifs : `2px`. Couleur : `#2A241F`.

### Border radius
| Élément              | Valeur   |
|----------------------|----------|
| Badges, checkboxes   | `4px`    |
| Boutons, inputs      | `8px`    |
| Cartes               | `12px` ou `16px` |
| Tags / pills         | `9999px` |

### Ombres
- Dure : `box-shadow: 4px 4px 0px #2A241F`
- Petite : `box-shadow: 2px 2px 0px #2A241F`

### Interaction au clic

**Boutons :** effet d'enfoncement complet.
```css
.btn-brutal {
  box-shadow: 4px 4px 0px #2A241F;
  transition: all 0.1s ease;
}
.btn-brutal:active {
  box-shadow: none;
  transform: translate(4px, 4px);
}
```

**Cartes dans un layout flex/grid :** PAS de translate (layout shift sur mobile).
```css
.card-brutal {
  box-shadow: 4px 4px 0px #2A241F;
  transition: box-shadow 0.1s ease;
}
.card-brutal:hover {
  box-shadow: 6px 6px 0px #2A241F;
}
.card-brutal:active {
  box-shadow: 2px 2px 0px #2A241F;
}
```

### Espacements
- Échelle 4/8px : `4px`, `8px`, `16px`, `24px`, `32px`. Padding cartes : `16px` ou `24px`.

## 5. Composants

### Boutons
- **Primaire :** fond `sesame-accent`, texte `sesame-surface`, bordure 2px `sesame-text`, ombre dure, enfoncement
- **Secondaire :** fond `sesame-surface`, texte `sesame-text`, bordure 2px `sesame-text`, ombre dure, enfoncement
- **Destructif :** fond `sesame-danger`, texte `sesame-surface`, bordure 2px `sesame-text`, ombre dure, enfoncement
- **Ghost :** fond transparent, texte `sesame-text`, pas de bordure. Hover : fond `sesame-surface-muted`

### Badges de statut
- Pilule (radius `9999px`), icône HugeIcons 16px à gauche
- Texte toujours `sesame-text` quand le fond est une couleur vive

### Cartes "Dossier"
1. En-tête : icône HugeIcons + badge statut
2. Corps : titre Fraunces + sous-titre Plus Jakarta Sans
3. Pied : infos quantitatives ou temporelles
4. Interaction : hover = bordure accent, active = ombre réduite (pas de translate)

### Inputs
- Fond `sesame-surface`, bordure 2px `sesame-text`, radius 8px
- Focus : bordure `sesame-accent`, outline 2px offset 2px

### Toggles / Switch
- Inactif : fond `sesame-surface-muted`. Actif : fond `sesame-accent`.

---

## 6. Ton de voix et UX Writing

L'application est un assistant personnel, pas un logiciel de comptabilité. Le texte est direct, rassurant et proactif. Pas d'emoji — l'émotion et l'urgence passent par le vocabulaire, la ponctuation et le design.

### Principes directeurs

- **Proactif, pas passif :** L'app explique ce que l'information implique pour l'utilisateur.
- **Tutoiement et chaleur :** "Ton billet", "Ta garantie". Amical mais concis.
- **Clarté absolue :** Pas de jargon logistique ni juridique.
- **L'emphase par le design :** Couleur du texte (accent, danger) ou icône pour donner le ton.

### Exemples

**Notifications de suivi :**
| Générique                                    | Sésame                                                     |
|----------------------------------------------|------------------------------------------------------------|
| Statut de la commande : expédié.             | Ton colis Fnac est en route.                               |
| Check-in ouvert pour le vol AF1234.          | L'enregistrement pour ton vol vers Madrid est ouvert.       |

**Alertes d'action :**
| Générique                                    | Sésame                                                     |
|----------------------------------------------|------------------------------------------------------------|
| Délai de retour : expiration dans 48h.       | Dernier appel : il te reste 48h pour renvoyer cet article et te faire rembourser. |
| Renouvellement de l'abonnement le 12/05.     | Ton abonnement Netflix se renouvelle dans 3 jours.         |

**Réassurance :**
| Générique                                    | Sésame                                                     |
|----------------------------------------------|------------------------------------------------------------|
| Garantie légale valide jusqu'au 12/04/2026.  | Sous garantie jusqu'en avril 2026. Tu es tranquille.       |
| Pièce jointe sauvegardée.                    | Facture et documents mis en lieu sûr.                      |

### États vides

| Écran                  | Texte                                                                    |
|------------------------|--------------------------------------------------------------------------|
| Accueil vide           | "Ton coffre est vide. Connecte ta boîte mail pour réveiller Sésame."    |
| Recherche sans résultat| "Aucun dossier trouvé. Essaie avec un nom de marchand ou de produit."   |
| Timeline vide          | "Aucun mail lié à ce dossier pour le moment."                           |
| Pas de compte mail     | "Connecte ta boîte mail pour commencer à tout archiver."               |
| Backfill en cours      | "Sésame fouille tes mails... Tes dossiers apparaissent au fur et à mesure." |

### Notifications Telegram

```
Nouveau dossier :
"Ton achat chez Fnac a été détecté : Casque JBL Tune 770 — 79,99 €"

Expédition :
"Ton colis Fnac est en route. Suivi : [lien]"

Livraison :
"C'est arrivé : ton Casque JBL a été livré. Sous garantie jusqu'en mars 2028."

Rétractation imminente :
"Dernier appel : il te reste 3 jours pour renvoyer ton article Fnac et te faire rembourser."

Garantie imminente :
"Ta garantie pour le Casque JBL expire le mois prochain. Pense à vérifier que tout fonctionne."
```

---

## 7. Icônes — Référence HugeIcons (stroke-rounded)

Package : `@hugeicons/react-pro` (plan gratuit).

| Usage                  | Icône HugeIcons          |
|------------------------|--------------------------|
| Accueil                | `home-04`                |
| Dossiers               | `box-01`                 |
| Recherche              | `search-01`              |
| Réglages               | `settings-02`            |
| Notification           | `notification-03`        |
| Commande               | `shopping-cart-01`       |
| Expédition             | `truck-delivery`         |
| Livraison              | `package-check`          |
| Facture                | `invoice-01`             |
| Paiement               | `money-send-01`          |
| Alerte                 | `alert-02`               |
| Succès                 | `checkmark-circle-02`    |
| Info                   | `information-circle`     |
| Copier                 | `copy-01`                |
| Lien externe           | `link-external-01`       |
| Modifier               | `edit-02`                |
| Supprimer              | `delete-02`              |
| Annuler                | `cancel-circle`          |
| Retour (undo)          | `undo`                   |
| Fermer                 | `cancel-01`              |
| Flèche droite          | `arrow-right-01`         |
| Flèche gauche          | `arrow-left-01`          |
| Rafraîchir             | `refresh-01`             |
| Calendrier             | `calendar-add-01`        |
| Filtrer                | `filter-01`              |
| Plus d'options         | `more-horizontal-circle-01` |
| Aide                   | `help-circle`            |
| Voyage                 | `plane-01`               |
| Abonnement             | `wifi-01`                |
| Chargement             | `loading-03`             |
| Magie IA               | `magic-wand-01`          |
