// ============================================================
// PROMPT GEMINI — EXTRACTION + LINKING v2
// ============================================================

export const EXTRACTION_PROMPT_VERSION = '2.0.0';

export type RecentDossierContext = {
  id: string;
  dossier_type: string;
  title: string | null;
  reference: string | null;
  booking_reference: string | null;
  merchant_name: string | null;
  status: string;
  started_at: string | null;
};

// Helper: suggest dossier_type from classification's email_type
function getTypeSuggestion(emailType: string): string {
  const map: Record<string, string> = {
    order_confirmation: 'Ce mail est probablement un "purchase".',
    payment_confirmation: 'Ce mail est probablement un "purchase" ou "subscription".',
    shipping_notification: 'Ce mail est probablement un "purchase".',
    delivery_notification: 'Ce mail est probablement un "purchase".',
    invoice: 'Ce mail peut être un "purchase", "subscription" ou "reservation".',
    return_confirmation: 'Ce mail est probablement un "purchase".',
    cancellation: 'Détermine le type à partir du contexte du mail.',
    booking_confirmation: 'Ce mail est probablement un "trip", "reservation" ou "accommodation".',
    booking_update: 'Ce mail est probablement un "trip", "reservation" ou "accommodation".',
    check_in_open: 'Ce mail est probablement un "trip".',
    boarding_pass: 'Ce mail est probablement un "trip".',
    accommodation_confirmation: 'Ce mail est probablement un "accommodation".',
    host_message: 'Ce mail est probablement un "accommodation".',
    accommodation_update: 'Ce mail est probablement un "accommodation".',
    subscription_confirmation: 'Ce mail est probablement un "subscription".',
    subscription_renewal: 'Ce mail est probablement un "subscription".',
    subscription_cancellation: 'Ce mail est probablement un "subscription".',
  };
  return map[emailType] ?? '';
}

export function buildExtractionPrompt(params: {
  emailBody: string;
  subject: string;
  sender: string;
  receivedAt: string;
  emailType: string;
  recentDossiers: RecentDossierContext[];
}): string {
  const dossiersJson = params.recentDossiers.length > 0
    ? JSON.stringify(params.recentDossiers, null, 2)
    : '(aucun dossier récent)';

  const typeSuggestion = getTypeSuggestion(params.emailType);

  return `Tu es l'assistant d'extraction de données de Sésame, un coffre-fort personnel intelligent.
Analyse ce mail transactionnel et extrais les informations structurées.

---
EXPEDITEUR: ${params.sender}
SUJET: ${params.subject}
RECU LE: ${params.receivedAt}
TYPE CLASSIFIE: ${params.emailType}
CORPS DU MAIL:
${params.emailBody.slice(0, 8000)}
---

## ÉTAPE 1 : EXTRACTION

Détermine le dossier_type parmi : purchase, trip, accommodation, subscription, reservation.
NE JAMAIS utiliser "other" — si tu hésites, choisis le type le plus proche.
${typeSuggestion}

Règles de typage :
- Location de voiture = "reservation" (pas "purchase")
- Restaurant, activité sportive, cours = "reservation"
- Vol, train longue distance = "trip"
- Hôtel, Airbnb, gîte = "accommodation"
- Forfait téléphone, streaming, SaaS = "subscription"

Détermine l'event_type parmi :
order_confirmation, payment_confirmation, shipping_notification, delivery_notification,
invoice, return_confirmation, cancellation, booking_confirmation, booking_update,
check_in_open, boarding_pass, accommodation_confirmation, host_message,
accommodation_update, subscription_confirmation, subscription_renewal, subscription_cancellation

### RÈGLES POUR LE TITRE (champ "title") — TRÈS IMPORTANT :
Le titre apparaît sur les cartes dans l'interface. Ce n'est PAS le sujet du mail.

| Type | Format du titre | Exemple bon | Exemple mauvais |
|---|---|---|---|
| purchase | Nom du PRODUIT acheté | "MacBook Pro 13 pouces" | "Votre commande Fnac n°..." |
| trip | "Vol/Train DEPART → ARRIVEE" | "Vol Paris → Budapest" | "Billet pour votre voyage du..." |
| accommodation | Nom du logement ou "Séjour à VILLE" | "Airbnb Barcelone" | "Your reservation at..." |
| subscription | Nom du service | "Bouygues B&YOU" | "Votre forfait expire dans..." |
| reservation | Nom du lieu | "La Taverna dei Monti" | "Votre réservation le..." |

Si le mail ne contient pas assez d'info pour un bon titre (ex: mail de shipping générique), mets un titre court avec le marchand : "Colis Fnac", "Commande Amazon".
Longueur max : 60 caractères.

### CHAMPS À EXTRAIRE selon le dossier_type :

Pour **purchase**, extracted_data doit contenir :
- merchant_name: string | null
- title: string | null (NOM DU PRODUIT)
- description: string | null
- reference: string | null (numéro de commande)
- amount: number | null
- currency: string (défaut "EUR")
- payment_method: string | null
- started_at: string | null (date de commande, ISO 8601)
- tracking_number: string | null
- carrier: string | null
- tracking_url: string | null
- pickup_point_name: string | null
- pickup_point_address: string | null
- pickup_code: string | null
- action_links: [{type, label, url}] (types: "tracking", "return_form", "invoice")

Pour **trip**, extracted_data doit contenir :
- merchant_name: string | null (compagnie : Air France, SNCF, easyJet)
- title: string | null (format "Vol/Train DEPART → ARRIVEE")
- booking_reference: string | null (code de réservation, ex: XLMSHR)
- departure_location: string | null (ville ou aéroport)
- arrival_location: string | null (ville ou aéroport)
- departure_time: string | null (ISO 8601)
- arrival_time: string | null (ISO 8601)
- flight_or_train_number: string | null (ex: AF1694, EJU4958)
- seat_info: string | null
- carrier: string | null
- amount: number | null
- currency: string (défaut "EUR")
- participants: string[] (prénoms des passagers)
- action_links: [{type, label, url}] (types: "check_in", "manage_booking")

Pour **accommodation**, extracted_data doit contenir :
- merchant_name: string | null (plateforme : Airbnb, Booking.com)
- title: string | null (nom du logement OU "Séjour à VILLE")
- booking_reference: string | null
- accommodation_address: string | null
- started_at: string | null (JOUR d'arrivée, ISO 8601)
- ended_at: string | null (JOUR de départ, ISO 8601)
- check_in_time: string | null (HEURE d'arrivée, format "HH:MM" ex: "15:00". PAS ISO 8601. null si inconnue.)
- check_out_time: string | null (HEURE de départ, format "HH:MM" ex: "11:00". PAS ISO 8601. null si inconnue.)
- host_name: string | null
- host_phone: string | null
- number_of_guests: number | null
- amount: number | null
- currency: string (défaut "EUR")
- action_links: [{type, label, url}] (types: "manage_booking", "contact_host")

Pour **subscription**, extracted_data doit contenir :
- merchant_name: string | null
- title: string | null
- subscription_name: string | null (nom du service : "Bouygues B&YOU", "Google One")
- subscription_amount: number | null
- subscription_period: "monthly" | "yearly" | "weekly" | "other" | null
- next_renewal_at: string | null (ISO 8601)
- amount: number | null
- currency: string (défaut "EUR")
- started_at: string | null (date de début, ISO 8601)
- action_links: [{type, label, url}] (types: "manage_booking", "cancel")

Pour **reservation**, extracted_data doit contenir :
- merchant_name: string | null
- title: string | null (nom du lieu)
- booking_reference: string | null
- started_at: string | null (date et heure de la réservation, ISO 8601)
- accommodation_address: string | null (adresse du lieu)
- number_of_guests: number | null
- amount: number | null
- currency: string (défaut "EUR")
- participants: string[]
- action_links: [{type, label, url}] (types: "manage_booking", "cancel")

### RÈGLES STRICTES :
- action_links : inclure UNIQUEMENT si l'URL est présente et complète dans le mail. Si pas d'URL → ne pas inclure l'action_link.
- check_in_time / check_out_time : format "HH:MM" (ex: "15:00"), JAMAIS en ISO 8601. Si l'heure est inconnue, mettre null.
- Toutes les autres dates : format ISO 8601 complet (ex: "2026-03-15T14:30:00Z").
- participants : tableau de strings simples ["Alice", "Bob"]. Jamais d'objets.
- Si une information n'est pas dans le mail, mettre null. Ne pas inventer.

### human_summary :
Écris un résumé en français avec ces règles STRICTES :
- TUTOIEMENT obligatoire : "Ton", "Ta", "Tes" — JAMAIS "Votre", "Vous"
- Ton proactif : dis ce que ça implique pour l'utilisateur
- Pas d'emoji
- 1-2 phrases max, concis
- En français même si le mail est en anglais

Exemples par event_type :
- order_confirmation → "Ton achat chez Fnac a été confirmé : MacBook Pro 13 — 1 051,68 €."
- shipping_notification → "Ton colis Fnac est en route."
- delivery_notification → "C'est arrivé : ton MacBook Pro a été livré."
- booking_confirmation → "Ton vol AF1694 Paris → Budapest du 28 novembre est réservé."
- check_in_open → "L'enregistrement pour ton vol vers Budapest est ouvert."
- accommodation_confirmation → "Ta réservation Airbnb à Barcelone est confirmée. Check-in le 20 avril."
- subscription_renewal → "Ton abonnement Bouygues B&YOU a été renouvelé."
- invoice → "Ta facture Grain de Sail est disponible."

---

## ÉTAPE 2 : LINKING

Compare ce mail avec les dossiers existants de l'utilisateur.

DOSSIERS RÉCENTS :
${dossiersJson}

RÈGLES DE LINKING (par ordre de priorité) :

1. **Match par référence** (linked_by: "reference", match_confidence: 1.0) :
   Le mail contient la MÊME référence (reference ou booking_reference) qu'un dossier existant.
   C'est le match le plus fiable. Exemples :
   - Mail de shipping avec réf "9CB6OPJ77FG4C" → dossier avec reference "9CB6OPJ77FG4C"
   - Mail de check-in avec réf "XLMSHR" → dossier avec booking_reference "XLMSHR"

2. **Match par marchand + contexte** (linked_by: "fuzzy_match", match_confidence: 0.7-0.9) :
   Même marchand/expéditeur ET le mail est clairement un suivi (shipping, delivery, update, invoice).
   Le mail doit être un EVENT DE SUIVI, pas une nouvelle commande.

3. **Match sémantique** (linked_by: "llm", match_confidence: 0.6-0.8) :
   Lien inféré par le contexte (dates proches, même destination, etc.)

Si AUCUN match >= 0.6 : existing_dossier_id = null, linked_by = null, match_confidence = null.

ATTENTION : ne jamais lier un mail à un dossier de type différent (ex: un shipping de commande à un dossier trip).

---

Retourne UNIQUEMENT ce JSON (sans markdown, sans commentaire) :
{
  "dossier_type": string,
  "event_type": string,
  "extracted_data": { ... les champs selon le dossier_type ci-dessus ... },
  "human_summary": string,
  "extraction_confidence": number (0 à 1),
  "existing_dossier_id": string | null,
  "linked_by": "reference" | "fuzzy_match" | "llm" | null,
  "match_confidence": number | null
}`;
}

export type ExtractionResult = {
  dossier_type: string;
  event_type: string;
  extracted_data: Record<string, unknown>;
  human_summary: string;
  extraction_confidence: number;
  existing_dossier_id: string | null;
  linked_by: 'reference' | 'fuzzy_match' | 'llm' | null;
  match_confidence: number | null;
};
