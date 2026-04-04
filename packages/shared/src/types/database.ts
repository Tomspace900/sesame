// ============================================================
// CONSTANTES (as const, pas d'enum)
// ============================================================

export const DOSSIER_TYPES = [
  "purchase",
  "travel",
  "accommodation",
  "subscription",
  "booking",
  "other",
] as const;
export type DossierType = (typeof DOSSIER_TYPES)[number];

export const DOSSIER_STATUSES = [
  "detected",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "returned",
] as const;
export type DossierStatus = (typeof DOSSIER_STATUSES)[number];

export const EVENT_TYPES = [
  "order_confirmation",
  "payment_confirmation",
  "shipping_notification",
  "delivery_notification",
  "invoice",
  "return_confirmation",
  "cancellation",
  "booking_confirmation",
  "booking_update",
  "check_in_open",
  "boarding_pass",
  "accommodation_confirmation",
  "host_message",
  "accommodation_update",
  "subscription_confirmation",
  "subscription_renewal",
  "subscription_cancellation",
  "other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const MAIL_PROVIDERS = ["gmail", "yahoo", "outlook"] as const;
export type MailProvider = (typeof MAIL_PROVIDERS)[number];

export const BACKFILL_STATUSES = ["idle", "running", "paused", "done", "error"] as const;
export type BackfillStatus = (typeof BACKFILL_STATUSES)[number];

export const CLASSIFICATION_TYPES = ["transactional", "not_transactional", "unprocessed"] as const;
export type ClassificationType = (typeof CLASSIFICATION_TYPES)[number];

export const QUEUE_STATUSES = ["pending", "processing", "done", "error", "skipped"] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const LINKED_BY_TYPES = [
  "identifier",  // match par dossier_identifiers (linking déterministe)
  "merge",       // fusionné via mergeOnCollision
  "manual",      // lien manuel par l'utilisateur
] as const;
export type LinkedByType = (typeof LINKED_BY_TYPES)[number];

export const SUBSCRIPTION_PERIODS = ["monthly", "yearly", "weekly", "other"] as const;
export type SubscriptionPeriod = (typeof SUBSCRIPTION_PERIODS)[number];

export const MERCHANT_CATEGORIES = [
  "ecommerce",
  "travel",
  "accommodation",
  "subscription",
  "restaurant",
  "transport",
  "culture",
  "sport",
  "other",
] as const;
export type MerchantCategory = (typeof MERCHANT_CATEGORIES)[number];

// ============================================================
// ACTION LINKS
// ============================================================

export const ACTION_LINK_TYPES = [
  "check_in",
  "return_form",
  "manage_booking",
  "invoice",
  "tracking",
  "contact_host",
  "cancel",
] as const;
export type ActionLinkType = (typeof ACTION_LINK_TYPES)[number];

export type ActionLink = {
  type: ActionLinkType;
  label: string;
  url: string;
};

// ============================================================
// TABLE TYPES
// ============================================================

export type Profile = {
  id: string;
  display_name: string;
  telegram_chat_id: string | null;
  notification_preferences: NotificationPreferences;
  created_at: string;
  updated_at: string;
};

export type NotificationPreferences = {
  telegram: boolean;
  calendar: boolean;
  return_reminder_days: number;
  warranty_reminder_days: number;
  renewal_reminder_days: number;
};

export type MailAccount = {
  id: string;
  user_id: string;
  provider: MailProvider;
  email_address: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string | null;
  last_sync_at: string | null;
  watch_expiration: string | null;
  history_id: string | null;
  last_uid_fetched: string | null;
  backfill_status: BackfillStatus;
  backfill_progress: BackfillProgress;
  backfill_started_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BackfillProgress = {
  processed: number;
  total: number | null;
};

export type Email = {
  id: string;
  user_id: string;
  mail_account_id: string;
  provider_message_id: string;
  subject: string | null;
  sender_address: string;
  sender_name: string | null;
  received_at: string;
  text_plain: string | null;
  text_html_storage_path: string | null;
  has_attachments: boolean;
  attachment_metadata: AttachmentMetadata[];
  classification: ClassificationType | null;
  classification_confidence: number | null;
  processed_at: string | null;
  processing_error: string | null;
  raw_classification_response: Record<string, unknown> | null;
  created_at: string;
};

export type AttachmentMetadata = {
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string | null;
};

export type Merchant = {
  id: string;
  canonical_name: string;
  known_domains: string[];
  known_sender_patterns: string[];
  logo_url: string | null;
  default_warranty_months: number | null;
  default_return_days: number | null;
  category: MerchantCategory | null;
  created_at: string;
};

export type Dossier = {
  id: string;
  user_id: string;
  merchant_id: string | null;

  dossier_type: DossierType;

  // Communs
  title: string | null;
  description: string | null;
  reference: string | null;
  amount: number | null;
  currency: string;
  status: DossierStatus;
  image_url: string | null;
  source_url: string | null;
  payment_method: string | null;

  // Dates clés
  started_at: string | null;
  ended_at: string | null;
  return_deadline: string | null;
  warranty_deadline: string | null;
  next_renewal_at: string | null;

  // Livraison / Tracking (achats)
  tracking_number: string | null;
  carrier: string | null;
  tracking_url: string | null;
  pickup_point_name: string | null;
  pickup_point_address: string | null;
  pickup_code: string | null;

  // Transport (voyages)
  departure_location: string | null;
  arrival_location: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  flight_or_train_number: string | null;
  seat_info: string | null;
  booking_reference: string | null;

  // Hébergement
  accommodation_address: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  host_name: string | null;
  host_phone: string | null;
  number_of_guests: number | null;

  // Abonnement
  subscription_name: string | null;
  subscription_amount: number | null;
  subscription_period: SubscriptionPeriod | null;

  // Multi-personnes
  participants: string[];

  // Liens d'action
  action_links: ActionLink[];

  // Rappels
  return_reminder_sent: boolean;
  warranty_reminder_sent: boolean;
  renewal_reminder_sent: boolean;
  calendar_event_created: boolean;

  // Enrichissement
  notes: string | null;
  tags: string[];

  created_at: string;
  updated_at: string;
};

export type DossierEvent = {
  id: string;
  dossier_id: string | null;
  user_id: string;
  email_id: string;
  event_type: EventType;
  extracted_data: Record<string, unknown>;
  extraction_confidence: number | null;
  human_summary: string | null;
  linked_by: LinkedByType | null;
  linking_confidence: number | null;
  raw_gemini_response: Record<string, unknown> | null;
  created_at: string;
};

export type ProcessingQueueItem = {
  id: string;
  user_id: string;
  mail_account_id: string;
  provider_message_id: string;
  priority: number;
  status: QueueStatus;
  attempts: number;
  last_error: string | null;
  locked_until: string | null;
  created_at: string;
  processed_at: string | null;
};

// ============================================================
// STATUS BADGE CONFIG
// ============================================================

export type StatusBadgeConfig = {
  label: string;
  colorVar: string;
  iconName: string;
};

export const STATUS_BADGE_CONFIGS: Record<DossierStatus, Record<DossierType, StatusBadgeConfig>> = {
  detected: {
    purchase: { label: "Détecté", colorVar: "sesame-surface-muted", iconName: "help-circle" },
    travel: { label: "Détecté", colorVar: "sesame-surface-muted", iconName: "help-circle" },
    accommodation: { label: "Détecté", colorVar: "sesame-surface-muted", iconName: "help-circle" },
    subscription: { label: "Détecté", colorVar: "sesame-surface-muted", iconName: "help-circle" },
    booking: { label: "Détecté", colorVar: "sesame-surface-muted", iconName: "help-circle" },
    other: { label: "Détecté", colorVar: "sesame-surface-muted", iconName: "help-circle" },
  },
  confirmed: {
    purchase: { label: "Commandé", colorVar: "sesame-transit", iconName: "shopping-cart-01" },
    travel: { label: "Réservé", colorVar: "sesame-transit", iconName: "plane-01" },
    accommodation: { label: "Réservé", colorVar: "sesame-transit", iconName: "home-04" },
    subscription: { label: "Actif", colorVar: "sesame-transit", iconName: "wifi-01" },
    booking: { label: "Réservé", colorVar: "sesame-transit", iconName: "calendar-add-01" },
    other: { label: "Confirmé", colorVar: "sesame-transit", iconName: "checkmark-circle-02" },
  },
  in_progress: {
    purchase: { label: "En route", colorVar: "sesame-accent", iconName: "truck-delivery" },
    travel: { label: "Check-in", colorVar: "sesame-accent", iconName: "plane-01" },
    accommodation: { label: "En cours", colorVar: "sesame-accent", iconName: "home-04" },
    subscription: { label: "En cours", colorVar: "sesame-accent", iconName: "wifi-01" },
    booking: { label: "En cours", colorVar: "sesame-accent", iconName: "calendar-add-01" },
    other: { label: "En cours", colorVar: "sesame-accent", iconName: "loading-03" },
  },
  completed: {
    purchase: { label: "Livré", colorVar: "sesame-positive", iconName: "package-check" },
    travel: { label: "Terminé", colorVar: "sesame-positive", iconName: "checkmark-circle-02" },
    accommodation: {
      label: "Terminé",
      colorVar: "sesame-positive",
      iconName: "checkmark-circle-02",
    },
    subscription: {
      label: "Terminé",
      colorVar: "sesame-positive",
      iconName: "checkmark-circle-02",
    },
    booking: { label: "Terminé", colorVar: "sesame-positive", iconName: "checkmark-circle-02" },
    other: { label: "Terminé", colorVar: "sesame-positive", iconName: "checkmark-circle-02" },
  },
  cancelled: {
    purchase: { label: "Annulé", colorVar: "sesame-surface-muted", iconName: "cancel-circle" },
    travel: { label: "Annulé", colorVar: "sesame-surface-muted", iconName: "cancel-circle" },
    accommodation: { label: "Annulé", colorVar: "sesame-surface-muted", iconName: "cancel-circle" },
    subscription: { label: "Annulé", colorVar: "sesame-surface-muted", iconName: "cancel-circle" },
    booking: { label: "Annulé", colorVar: "sesame-surface-muted", iconName: "cancel-circle" },
    other: { label: "Annulé", colorVar: "sesame-surface-muted", iconName: "cancel-circle" },
  },
  returned: {
    purchase: { label: "Retourné", colorVar: "sesame-transit", iconName: "undo" },
    travel: { label: "Retourné", colorVar: "sesame-transit", iconName: "undo" },
    accommodation: { label: "Retourné", colorVar: "sesame-transit", iconName: "undo" },
    subscription: { label: "Retourné", colorVar: "sesame-transit", iconName: "undo" },
    booking: { label: "Retourné", colorVar: "sesame-transit", iconName: "undo" },
    other: { label: "Retourné", colorVar: "sesame-transit", iconName: "undo" },
  },
};
