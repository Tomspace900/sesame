// ============================================================
// PROMPT GEMINI — CLASSIFICATION v2
// ============================================================

export const CLASSIFICATION_PROMPT_VERSION = '2.0.0';

export function buildClassificationPrompt(params: {
  subject: string;
  sender: string;
  bodyPreview: string;
}): string {
  return `Tu es un classificateur strict de mails transactionnels pour Sésame, un coffre-fort personnel.
Ta tâche : déterminer si ce mail est un mail TRANSACTIONNEL lié à un achat, voyage, hébergement, abonnement ou réservation.

EXPEDITEUR: ${params.sender}
SUJET: ${params.subject}
CONTENU (extrait): ${params.bodyPreview}

---

TRANSACTIONNEL = un mail qui concerne une TRANSACTION RÉELLE avec de l'argent échangé ou un service réservé.
Les seuls types valides sont :

| Type | Quand l'utiliser |
|---|---|
| order_confirmation | Confirmation d'une commande passée (achat en ligne) |
| payment_confirmation | Confirmation de paiement effectué |
| shipping_notification | Colis expédié, en transit, en livraison |
| delivery_notification | Colis livré, disponible en point relais |
| invoice | Facture reçue pour un achat ou service |
| return_confirmation | Retour/remboursement confirmé |
| cancellation | Annulation d'une commande ou réservation |
| booking_confirmation | Réservation confirmée (vol, train, restaurant, activité, location voiture) |
| booking_update | Modification d'une réservation existante |
| check_in_open | Enregistrement en ligne ouvert (vol, train) |
| boarding_pass | Carte d'embarquement reçue |
| host_message | Message d'un hôte (Airbnb, Booking) concernant un séjour réservé |
| accommodation_confirmation | Confirmation de séjour (hôtel, Airbnb) |
| accommodation_update | Modification d'un séjour existant |
| subscription_confirmation | Nouvel abonnement souscrit |
| subscription_renewal | Renouvellement d'abonnement |
| subscription_cancellation | Résiliation d'abonnement |

---

NON TRANSACTIONNEL (is_transactional: false) — ces mails NE SONT PAS des transactions :

| Catégorie | Exemples concrets |
|---|---|
| Sécurité / Compte | "Vérifiez votre carte", "Code de connexion", "Nouveau moyen de paiement ajouté", codes 2FA, mot de passe oublié, "Account activity: New payment method added" |
| Demandes d'avis | "Donnez votre avis", "Partagez votre expérience", "Rate your trip", "How was your stay?", enquêtes de satisfaction |
| Newsletters / Promos | "Profitez de -30%", "Dernière étape pour profiter de...", offres spéciales, onboarding promo, emails marketing |
| Résumés / Stats | "Vos contributions ont été vues X fois", rapports hebdomadaires, récapitulatifs mensuels, bilans d'activité |
| RH / Paie | "Votre bulletin de paie", "Votre fiche de paie est disponible", documents administratifs employeur |
| Dev / Ops | GitHub, Vercel, CI/CD, Jira, Sentry, notifications techniques |
| Emails perso | Messages personnels sans transaction |
| Alertes de compte | "New sign-in", "Suspicious activity", modifications de profil, "Votre modification de route" |

RÈGLE CRITIQUE : en cas de doute, classe comme NON transactionnel (is_transactional: false). Mieux vaut rater un mail transactionnel que créer un faux dossier.

Retourne ce JSON :
{
  "is_transactional": boolean,
  "email_type": string | null,
  "confidence": number,
  "reason": "explication courte en français"
}`;
}

export type ClassificationResult = {
  is_transactional: boolean;
  email_type: string | null;
  confidence: number;
  reason: string;
};
