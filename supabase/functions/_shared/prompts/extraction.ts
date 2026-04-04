// ============================================================
// PROMPT GEMINI — EXTRACTION v4
// ============================================================
// Suppression du linking Gemini : extraction pure uniquement.
// Le linking est désormais déterministe via la table dossier_identifiers.

export const EXTRACTION_PROMPT_VERSION = "5.0.0";

// Helper: suggest dossier_type from classification's email_type
function getTypeSuggestion(emailType: string): string {
  const map: Record<string, string> = {
    order_confirmation: 'Ce mail est probablement un "purchase".',
    payment_confirmation:
      'Ce mail est probablement un "purchase" ou "subscription".',
    shipping_notification: 'Ce mail est probablement un "purchase".',
    delivery_notification: 'Ce mail est probablement un "purchase".',
    invoice: 'Ce mail peut être un "purchase", "subscription" ou "booking".',
    return_confirmation: 'Ce mail est probablement un "purchase".',
    cancellation: "Détermine le type à partir du contexte du mail.",
    booking_confirmation:
      'Ce mail est probablement un "travel", "booking" ou "accommodation".',
    booking_update:
      'Ce mail est probablement un "travel", "booking" ou "accommodation".',
    check_in_open: 'Ce mail est probablement un "travel".',
    boarding_pass: 'Ce mail est probablement un "travel".',
    accommodation_confirmation: 'Ce mail est probablement un "accommodation".',
    host_message: 'Ce mail est probablement un "accommodation".',
    accommodation_update: 'Ce mail est probablement un "accommodation".',
    subscription_confirmation: 'Ce mail est probablement un "subscription".',
    subscription_renewal: 'Ce mail est probablement un "subscription".',
    subscription_cancellation: 'Ce mail est probablement un "subscription".',
  };
  return map[emailType] ?? "";
}

export function buildExtractionPrompt(params: {
  emailBody: string;
  subject: string;
  sender: string;
  receivedAt: string;
  emailType: string;
  hasAttachments?: boolean;
}): string {
  const typeSuggestion = getTypeSuggestion(params.emailType);
  // Gemini Flash a 1M tokens de contexte — on ne tronque qu'à 30 000 chars pour les mails exceptionnellement longs
  const body = params.emailBody.slice(0, 30000);

  return `Tu es l'assistant d'extraction de données de Sésame, un coffre-fort personnel intelligent.
Analyse ce mail transactionnel et extrais les informations structurées.

---
EXPEDITEUR: ${params.sender}
SUJET: ${params.subject}
RECU LE: ${params.receivedAt}
TYPE CLASSIFIE: ${params.emailType}
CORPS DU MAIL:
${body}
---

## EXTRACTION

### CHOIX DU dossier_type

Détermine le dossier_type parmi : purchase, travel, accommodation, subscription, booking.
NE JAMAIS utiliser "other" — si tu hésites, choisis le type le plus proche.
${typeSuggestion}

Règles de typage (STRICTES) :
- **purchase** : achat d'un produit physique expédié (Amazon, Fnac, Boulanger, Vinted...) — avec tracking, garantie, délai de retour
- **travel** : déplacement avec billet nominatif longue distance (vol, train intercités, Eurostar, bus longue distance) — avec horaires, siège, ref booking. ⚠️ PAS les VTC ni taxis.
- **accommodation** : hébergement (Airbnb, Booking, hôtel, gîte) — avec check-in/check-out, adresse, hôte
- **subscription** : abonnement récurrent (téléphone, streaming, SaaS, cloud) — avec montant et période
- **booking** : TOUT service ponctuel avec réservation qui ne rentre pas dans les catégories ci-dessus :
  - VTC / taxi (Bolt, Uber, Heetch...) — reçu de course avec départ/arrivée
  - Restaurant (TheFork, OpenTable, directement)
  - Activité, cours (cours de cuisine, yoga, sport, karting, musée...)
  - Location de voiture
  - Spectacle, concert, événement
  - Ticket de transport simple (métro, bus local)

Détermine l'event_type parmi :
order_confirmation, payment_confirmation, shipping_notification, delivery_notification,
invoice, return_confirmation, cancellation, booking_confirmation, booking_update,
check_in_open, boarding_pass, accommodation_confirmation, host_message,
accommodation_update, subscription_confirmation, subscription_renewal, subscription_cancellation

---

### RÈGLES POUR LE TITRE (champ "title") — CRITIQUE

Le titre est affiché sur les cartes dans l'interface. Il doit être SYNTHÉTIQUE, IDENTIFIABLE et HUMAIN.
Il n'est PAS le sujet du mail. Il ne contient PAS le numéro de commande.

#### Formats OBLIGATOIRES par type :

| Type | Format | Exemples BONS ✅ | Exemples INTERDITS ❌ |
|---|---|---|---|
| purchase | Nom court du produit (1-5 mots) | "Blender Philips Série 3000", "Table de balcon KESSER", "Pack café Grain de Sail" | "Colis Amazon", "Votre commande", "Expédié : blender...", "Commande Fnac n°..." |
| travel | "{Transporteur} {Origine} → {Destination}" | "easyJet Rome → Paris", "SNCF Paris → Bruxelles", "Air France Paris → Budapest" | "Votre billet", "Vol du 28 novembre", "Train JSPDW8" |
| accommodation | "{Provider} {Ville}" | "Airbnb Gand", "Airbnb Bruxelles", "Booking Beaune", "Hôtel Alessandro Budapest" | "COSY KAMER DICHTBIJ STATION", "Your reservation", "Séjour du 8 au 9 novembre" |
| subscription | Nom du service tel qu'il est connu | "Amazon Prime", "Bouygues B&YOU", "Google One", "Netflix" | "Votre forfait expire...", "Abonnement mensuel" |
| booking | Nom du lieu ou service | "Bolt Paris → Clamart", "La Taverna dei Monti", "Cours de cuisine Ferrandi", "Karting de Paris" | "Votre réservation", "Booking confirmation", "Receipt" |

#### Règles complémentaires :
- Longueur max : 60 caractères.
- Pour **purchase** : extraire le NOM DU PRODUIT du corps du mail (pas du sujet). Si plusieurs produits, prendre le premier + " et X articles".
- Pour **accommodation** : toujours au format "{Provider} {Ville}". Extraire la ville depuis l'adresse si disponible. Ne JAMAIS utiliser le nom brut de l'annonce (souvent en langue étrangère).
- Pour **travel** : utiliser le nom commercial du transporteur (pas le code IATA).
- Titre JAMAIS null pour purchase, travel, accommodation — générer même avec peu d'info.

---

### CHAMPS À EXTRAIRE selon le dossier_type :

Pour **purchase**, extracted_data doit contenir :
- merchant_name: string | null
- title: string | null (NOM DU PRODUIT — voir règles ci-dessus)
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

Pour **travel**, extracted_data doit contenir :
- merchant_name: string | null (compagnie : Air France, SNCF, easyJet...)
- title: string | null (format "{Transporteur} {Origine} → {Destination}")
- booking_reference: string | null (code PNR/réservation, ex: XLMSHR)
- departure_location: string | null (ville ou aéroport — forme courte : "Paris CDG", "Rome Fiumicino")
- arrival_location: string | null (ville ou aéroport — forme courte)
- departure_time: string | null (⚠️ HEURE DE DÉPART de CE trajet uniquement — PAS la date de retour. ISO 8601)
- arrival_time: string | null (⚠️ HEURE D'ARRIVÉE de CE trajet uniquement — PAS la date de retour. ISO 8601)
- flight_or_train_number: string | null (ex: AF1694, EJU4958, 6234)
- seat_info: string | null
- carrier: string | null
- amount: number | null
- currency: string (défaut "EUR")
- participants: string[] (prénoms des passagers)
- action_links: [{type, label, url}] (types: "check_in", "manage_booking")

⚠️ RÈGLE CRITIQUE TRAVEL : departure_time et arrival_time concernent UNIQUEMENT le trajet décrit dans ce mail.
Si le mail mentionne un vol aller ET un vol retour, n'extraire QUE les dates du vol aller (ou le vol principal du mail).
Ne JAMAIS mettre la date de retour dans arrival_time.

Pour **accommodation**, extracted_data doit contenir :
- merchant_name: string | null (plateforme : Airbnb, Booking.com)
- title: string | null (format "{Provider} {Ville}" — ex: "Airbnb Gand", "Booking Beaune")
- booking_reference: string | null
- accommodation_address: string | null (adresse complète)
- started_at: string | null (DATE d'arrivée, ISO 8601 — juste la date, heure 00:00:00Z si inconnue)
- ended_at: string | null (DATE de départ, ISO 8601)
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
- title: string | null (nom du service — ex: "Amazon Prime", "Bouygues B&YOU")
- subscription_name: string | null (même que title)
- subscription_amount: number | null
- subscription_period: "monthly" | "yearly" | "weekly" | "other" | null
- next_renewal_at: string | null (ISO 8601)
- amount: number | null
- currency: string (défaut "EUR")
- started_at: string | null (date de début, ISO 8601)
- action_links: [{type, label, url}] (types: "manage_booking", "cancel")

Pour **booking**, extracted_data doit contenir :
- merchant_name: string | null (nom de l'établissement ou du service)
- title: string | null (nom du lieu ou service — ex: "La Taverna dei Monti", "Bolt Paris → Clamart")
- booking_reference: string | null
- started_at: string | null (date ET heure de la réservation, ISO 8601)
- accommodation_address: string | null (adresse du lieu)
- number_of_guests: number | null
- amount: number | null
- currency: string (défaut "EUR")
- participants: string[]
- departure_location: string | null (pour VTC/taxi uniquement : lieu de prise en charge)
- arrival_location: string | null (pour VTC/taxi uniquement : destination)
- action_links: [{type, label, url}] (types: "manage_booking", "cancel")

${params.hasAttachments ? `### PIÈCES JOINTES

Des pièces jointes sont incluses dans ce mail. Analyse-les pour en extraire les identifiants et données structurées AU MÊME TITRE que le corps du mail.

Les factures et confirmations en pièce jointe contiennent souvent :
- Le numéro de commande original (order_ref) qui peut ne pas apparaître dans le body
- Le numéro de facture (invoice_number)
- Le montant exact
- Les détails produit

Un identifiant trouvé dans une pièce jointe a la MÊME valeur qu'un identifiant trouvé dans le body. Extrais-les tous dans le tableau "identifiers".

---

` : ""}### RÈGLES STRICTES :
- action_links : inclure UNIQUEMENT si l'URL est présente et complète dans le mail. Si pas d'URL → ne pas inclure.
- check_in_time / check_out_time : format "HH:MM" (ex: "15:00"), JAMAIS en ISO 8601.
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
- booking_confirmation (travel) → "Ton vol easyJet Rome → Paris du 27 mars est réservé. Départ à 09h20."
- booking_confirmation (booking/VTC) → "Ta course Bolt de Paris à Clamart du 22 novembre est confirmée — 10 €."
- check_in_open → "L'enregistrement pour ton vol vers Budapest est ouvert."
- accommodation_confirmation → "Ta réservation Airbnb à Gand est confirmée. Check-in le 8 novembre à 14h."
- subscription_renewal → "Ton abonnement Bouygues B&YOU a été renouvelé."
- invoice → "Ta facture Grain de Sail est disponible."
- cancellation → "Ta réservation Airbnb à Bruxelles a été annulée. Remboursement de 163,71 € en cours."

---

### IDENTIFIANTS À EXTRAIRE (CRITIQUE)

Extrais TOUS les codes, références et identifiants trouvés dans le mail.
Ce sont les clés qui permettent de relier les mails entre eux automatiquement.

| identifier_type    | Quand l'utiliser                                         | Exemples |
|---|---|---|
| order_ref          | Numéro de commande marchand                              | "403-2833463-9128327", "F905LQ80393", "ksfr-1005-5977219" |
| tracking_number    | Numéro de suivi colis (tout transporteur)                | "00K6Y20G", "6A15546300134", "CB123456789FR" |
| pnr                | Code de réservation transport (vol, train)               | "XLMSHR", "FXGMFZ", "4WK3Y7" |
| booking_id         | Référence de réservation (hébergement, restaurant, activité) | "HMBWBMSM4Z", "6532339077", "RES-987654" |
| confirmation_code  | Code de confirmation de paiement ou transaction          | "TXN-12345" |
| invoice_number     | Numéro de facture                                        | "F905LQ80393", "FAC-2025-001" |
| ride_id            | Identifiant de course VTC/taxi                           | "ride_abc123" |

Règles STRICTES :
- Extraire TOUS les identifiants présents, même si le type est incertain. Un identifiant en trop qui ne matche rien est inoffensif. Un identifiant raté = un linking perdu.
- Un même mail peut contenir plusieurs types différents (ex: shipping Amazon → order_ref + tracking_number).
- Si un code apparaît dans le sujet ET dans le corps, ne le lister qu'une fois.
- Ne PAS inclure les montants, dates, noms de personne ou adresses.
- Les valeurs doivent être les chaînes EXACTES telles qu'elles apparaissent dans le mail (pas de normalisation).

---

Retourne UNIQUEMENT ce JSON (sans markdown, sans commentaire) :
{
  "dossier_type": string,
  "event_type": string,
  "extracted_data": { ... les champs selon le dossier_type ci-dessus ... },
  "identifiers": [
    { "type": "order_ref", "value": "403-2833463-9128327" },
    { "type": "tracking_number", "value": "00K6Y20G" }
  ],
  "human_summary": string,
  "extraction_confidence": number (0 à 1)
}`;
}

export type ExtractionResult = {
  dossier_type: string;
  event_type: string;
  extracted_data: Record<string, unknown>;
  identifiers: Array<{ type: string; value: string }>;
  human_summary: string;
  extraction_confidence: number;
};
