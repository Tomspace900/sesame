import { z } from "zod";
import {
  ACTION_LINK_TYPES,
  BACKFILL_STATUSES,
  CLASSIFICATION_TYPES,
  DOSSIER_STATUSES,
  DOSSIER_TYPES,
  EVENT_TYPES,
  LINKED_BY_TYPES,
  MAIL_PROVIDERS,
  MERCHANT_CATEGORIES,
  QUEUE_STATUSES,
  SUBSCRIPTION_PERIODS,
} from "../types/database.ts";

export const DossierTypeSchema = z.enum(DOSSIER_TYPES);
export const DossierStatusSchema = z.enum(DOSSIER_STATUSES);
export const EventTypeSchema = z.enum(EVENT_TYPES);
export const MailProviderSchema = z.enum(MAIL_PROVIDERS);
export const BackfillStatusSchema = z.enum(BACKFILL_STATUSES);
export const ClassificationTypeSchema = z.enum(CLASSIFICATION_TYPES);
export const QueueStatusSchema = z.enum(QUEUE_STATUSES);
export const LinkedByTypeSchema = z.enum(LINKED_BY_TYPES);
export const SubscriptionPeriodSchema = z.enum(SUBSCRIPTION_PERIODS);
export const MerchantCategorySchema = z.enum(MERCHANT_CATEGORIES);
export const ActionLinkTypeSchema = z.enum(ACTION_LINK_TYPES);

export const ActionLinkSchema = z.object({
  type: ActionLinkTypeSchema,
  label: z.string(),
  url: z.string().url(),
});

export const NotificationPreferencesSchema = z.object({
  telegram: z.boolean(),
  calendar: z.boolean(),
  return_reminder_days: z.number().int().min(0),
  warranty_reminder_days: z.number().int().min(0),
  renewal_reminder_days: z.number().int().min(0),
});

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().min(1),
  telegram_chat_id: z.string().nullable(),
  notification_preferences: NotificationPreferencesSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const BackfillProgressSchema = z.object({
  processed: z.number().int().min(0),
  total: z.number().int().min(0).nullable(),
});

export const MailAccountSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  provider: MailProviderSchema,
  email_address: z.string().email(),
  access_token_encrypted: z.string(),
  refresh_token_encrypted: z.string(),
  token_expires_at: z.string().datetime().nullable(),
  last_sync_at: z.string().datetime().nullable(),
  watch_expiration: z.string().datetime().nullable(),
  history_id: z.string().nullable(),
  last_uid_fetched: z.string().nullable(),
  backfill_status: BackfillStatusSchema,
  backfill_progress: BackfillProgressSchema,
  backfill_started_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const AttachmentMetadataSchema = z.object({
  filename: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int().min(0),
  storage_path: z.string().nullable(),
});

export const EmailSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  mail_account_id: z.string().uuid(),
  provider_message_id: z.string(),
  subject: z.string().nullable(),
  sender_address: z.string().email(),
  sender_name: z.string().nullable(),
  received_at: z.string().datetime(),
  text_plain: z.string().nullable(),
  text_html_storage_path: z.string().nullable(),
  has_attachments: z.boolean(),
  attachment_metadata: z.array(AttachmentMetadataSchema),
  classification: ClassificationTypeSchema.nullable(),
  classification_confidence: z.number().min(0).max(1).nullable(),
  processed_at: z.string().datetime().nullable(),
  processing_error: z.string().nullable(),
  raw_classification_response: z.record(z.unknown()).nullable().optional(),
  created_at: z.string().datetime(),
});

export const MerchantSchema = z.object({
  id: z.string().uuid(),
  canonical_name: z.string().min(1),
  known_domains: z.array(z.string()),
  known_sender_patterns: z.array(z.string()),
  logo_url: z.string().url().nullable(),
  default_warranty_months: z.number().int().min(0).nullable(),
  default_return_days: z.number().int().min(0).nullable(),
  category: MerchantCategorySchema.nullable(),
  created_at: z.string().datetime(),
});

export const DossierSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  merchant_id: z.string().uuid().nullable(),

  dossier_type: DossierTypeSchema,

  // Communs
  title: z.string().nullable(),
  description: z.string().nullable(),
  reference: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string().default("EUR"),
  status: DossierStatusSchema,
  image_url: z.string().url().nullable(),
  source_url: z.string().url().nullable(),
  payment_method: z.string().nullable(),

  // Dates clés
  started_at: z.string().datetime().nullable(),
  ended_at: z.string().datetime().nullable(),
  return_deadline: z.string().datetime().nullable(),
  warranty_deadline: z.string().datetime().nullable(),
  next_renewal_at: z.string().datetime().nullable(),

  // Livraison
  tracking_number: z.string().nullable(),
  carrier: z.string().nullable(),
  tracking_url: z.string().url().nullable(),
  pickup_point_name: z.string().nullable(),
  pickup_point_address: z.string().nullable(),
  pickup_code: z.string().nullable(),

  // Transport
  departure_location: z.string().nullable(),
  arrival_location: z.string().nullable(),
  departure_time: z.string().datetime().nullable(),
  arrival_time: z.string().datetime().nullable(),
  flight_or_train_number: z.string().nullable(),
  seat_info: z.string().nullable(),
  booking_reference: z.string().nullable(),

  // Hébergement
  accommodation_address: z.string().nullable(),
  check_in_time: z.string().nullable(),
  check_out_time: z.string().nullable(),
  host_name: z.string().nullable(),
  host_phone: z.string().nullable(),
  number_of_guests: z.number().int().min(1).nullable(),

  // Abonnement
  subscription_name: z.string().nullable(),
  subscription_amount: z.number().nullable(),
  subscription_period: SubscriptionPeriodSchema.nullable(),

  // Multi-personnes
  participants: z.array(z.string()),

  // Liens
  action_links: z.array(ActionLinkSchema),

  // Rappels
  return_reminder_sent: z.boolean(),
  warranty_reminder_sent: z.boolean(),
  renewal_reminder_sent: z.boolean(),
  calendar_event_created: z.boolean(),

  // Enrichissement
  notes: z.string().nullable(),
  tags: z.array(z.string()),

  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const DossierEventSchema = z.object({
  id: z.string().uuid(),
  dossier_id: z.string().uuid().nullable(),
  user_id: z.string().uuid(),
  email_id: z.string().uuid(),
  event_type: EventTypeSchema,
  extracted_data: z.record(z.unknown()),
  extraction_confidence: z.number().min(0).max(1).nullable(),
  human_summary: z.string().nullable(),
  linked_by: LinkedByTypeSchema.nullable(),
  linking_confidence: z.number().min(0).max(1).nullable(),
  raw_gemini_response: z.record(z.unknown()).nullable().optional(),
  created_at: z.string().datetime(),
});

export const ProcessingQueueItemSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  mail_account_id: z.string().uuid(),
  provider_message_id: z.string(),
  priority: z.number().int(),
  status: QueueStatusSchema,
  attempts: z.number().int().min(0),
  last_error: z.string().nullable(),
  locked_until: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  processed_at: z.string().datetime().nullable(),
});
