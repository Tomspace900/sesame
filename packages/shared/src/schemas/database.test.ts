import { describe, expect, it } from "vitest";
import {
  ActionLinkSchema,
  ActionLinkTypeSchema,
  DossierEventSchema,
  DossierSchema,
  DossierStatusSchema,
  DossierTypeSchema,
  EventTypeSchema,
  MailAccountSchema,
  MerchantCategorySchema,
  MerchantSchema,
  ProcessingQueueItemSchema,
  ProfileSchema,
  SubscriptionPeriodSchema,
} from "./database.ts";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";
const VALID_UUID_2 = "223e4567-e89b-12d3-a456-426614174001";
const VALID_DATETIME = "2026-01-15T10:00:00.000Z";

const validDossier = {
  id: VALID_UUID,
  user_id: VALID_UUID_2,
  merchant_id: null,
  dossier_type: "purchase" as const,
  title: null,
  description: null,
  reference: null,
  amount: null,
  currency: "EUR",
  status: "detected" as const,
  image_url: null,
  source_url: null,
  payment_method: null,
  started_at: null,
  ended_at: null,
  return_deadline: null,
  warranty_deadline: null,
  next_renewal_at: null,
  tracking_number: null,
  carrier: null,
  tracking_url: null,
  pickup_point_name: null,
  pickup_point_address: null,
  pickup_code: null,
  departure_location: null,
  arrival_location: null,
  departure_time: null,
  arrival_time: null,
  flight_or_train_number: null,
  seat_info: null,
  booking_reference: null,
  accommodation_address: null,
  check_in_time: null,
  check_out_time: null,
  host_name: null,
  host_phone: null,
  number_of_guests: null,
  subscription_name: null,
  subscription_amount: null,
  subscription_period: null,
  participants: [],
  action_links: [],
  return_reminder_sent: false,
  warranty_reminder_sent: false,
  renewal_reminder_sent: false,
  calendar_event_created: false,
  notes: null,
  tags: [],
  created_at: VALID_DATETIME,
  updated_at: VALID_DATETIME,
};

const validMerchant = {
  id: VALID_UUID,
  canonical_name: "Amazon",
  known_domains: ["amazon.fr", "amazon.com"],
  known_sender_patterns: ["@amazon.fr"],
  logo_url: null,
  default_warranty_months: null,
  default_return_days: null,
  category: null,
  created_at: VALID_DATETIME,
};

const validDossierEvent = {
  id: VALID_UUID,
  dossier_id: null,
  user_id: VALID_UUID_2,
  email_id: VALID_UUID,
  event_type: "order_confirmation" as const,
  extracted_data: { order_id: "CMD-001" },
  extraction_confidence: 0.95,
  human_summary: null,
  linked_by: null,
  linking_confidence: null,
  raw_gemini_response: null,
  created_at: VALID_DATETIME,
};

const validMailAccount = {
  id: VALID_UUID,
  user_id: VALID_UUID_2,
  provider: "gmail" as const,
  email_address: "user@example.com",
  access_token_encrypted: "enc_access_token",
  refresh_token_encrypted: "enc_refresh_token",
  token_expires_at: null,
  last_sync_at: null,
  watch_expiration: null,
  history_id: null,
  last_uid_fetched: null,
  backfill_status: "idle" as const,
  backfill_progress: { processed: 0, total: null },
  backfill_started_at: null,
  created_at: VALID_DATETIME,
  updated_at: VALID_DATETIME,
};

// ─── Enums ────────────────────────────────────────────────────────────────────

describe("DossierTypeSchema", () => {
  it("accepte toutes les valeurs valides", () => {
    const valeurs = ["purchase", "travel", "accommodation", "subscription", "booking", "other"];
    for (const v of valeurs) {
      expect(DossierTypeSchema.safeParse(v).success).toBe(true);
    }
  });

  it("rejette les anciens types trip et reservation", () => {
    expect(DossierTypeSchema.safeParse("trip").success).toBe(false);
    expect(DossierTypeSchema.safeParse("reservation").success).toBe(false);
  });

  it("rejette une valeur inconnue", () => {
    expect(DossierTypeSchema.safeParse("invoice").success).toBe(false);
  });

  it("rejette undefined", () => {
    expect(DossierTypeSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("DossierStatusSchema", () => {
  it("accepte toutes les valeurs valides", () => {
    const valeurs = ["detected", "confirmed", "in_progress", "completed", "cancelled", "returned"];
    for (const v of valeurs) {
      expect(DossierStatusSchema.safeParse(v).success).toBe(true);
    }
  });

  it("rejette une valeur inconnue", () => {
    expect(DossierStatusSchema.safeParse("pending").success).toBe(false);
  });
});

describe("EventTypeSchema", () => {
  it("accepte order_confirmation", () => {
    expect(EventTypeSchema.safeParse("order_confirmation").success).toBe(true);
  });

  it("accepte other", () => {
    expect(EventTypeSchema.safeParse("other").success).toBe(true);
  });

  it("rejette une valeur inconnue", () => {
    expect(EventTypeSchema.safeParse("unknown_event").success).toBe(false);
  });
});

describe("SubscriptionPeriodSchema", () => {
  it("accepte monthly, yearly, weekly, other", () => {
    for (const v of ["monthly", "yearly", "weekly", "other"]) {
      expect(SubscriptionPeriodSchema.safeParse(v).success).toBe(true);
    }
  });

  it("rejette quarterly", () => {
    expect(SubscriptionPeriodSchema.safeParse("quarterly").success).toBe(false);
  });
});

describe("MerchantCategorySchema", () => {
  it("accepte ecommerce", () => {
    expect(MerchantCategorySchema.safeParse("ecommerce").success).toBe(true);
  });

  it("rejette une valeur inconnue", () => {
    expect(MerchantCategorySchema.safeParse("luxury").success).toBe(false);
  });
});

describe("ActionLinkTypeSchema", () => {
  it("accepte check_in", () => {
    expect(ActionLinkTypeSchema.safeParse("check_in").success).toBe(true);
  });

  it("rejette une valeur inconnue", () => {
    expect(ActionLinkTypeSchema.safeParse("download").success).toBe(false);
  });
});

// ─── ActionLinkSchema ─────────────────────────────────────────────────────────

describe("ActionLinkSchema", () => {
  it("accepte un lien valide", () => {
    const result = ActionLinkSchema.safeParse({
      type: "check_in",
      label: "Effectuer le check-in",
      url: "https://airfrance.fr/checkin",
    });
    expect(result.success).toBe(true);
  });

  it("rejette une URL invalide", () => {
    const result = ActionLinkSchema.safeParse({
      type: "check_in",
      label: "Check-in",
      url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejette un type inconnu", () => {
    const result = ActionLinkSchema.safeParse({
      type: "unknown",
      label: "Lien",
      url: "https://example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejette un label manquant", () => {
    const result = ActionLinkSchema.safeParse({
      type: "check_in",
      url: "https://example.com",
    });
    expect(result.success).toBe(false);
  });
});

// ─── MerchantSchema ───────────────────────────────────────────────────────────

describe("MerchantSchema", () => {
  it("accepte un marchand valide (minimal)", () => {
    expect(MerchantSchema.safeParse(validMerchant).success).toBe(true);
  });

  it("accepte un marchand avec toutes les propriétés renseignées", () => {
    const full = {
      ...validMerchant,
      logo_url: "https://logo.amazon.fr/logo.png",
      default_warranty_months: 24,
      default_return_days: 30,
      category: "ecommerce",
    };
    expect(MerchantSchema.safeParse(full).success).toBe(true);
  });

  it("rejette un logo_url invalide", () => {
    const result = MerchantSchema.safeParse({ ...validMerchant, logo_url: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rejette un canonical_name vide", () => {
    const result = MerchantSchema.safeParse({ ...validMerchant, canonical_name: "" });
    expect(result.success).toBe(false);
  });

  it("rejette une catégorie inconnue", () => {
    const result = MerchantSchema.safeParse({ ...validMerchant, category: "luxury" });
    expect(result.success).toBe(false);
  });

  it("rejette default_warranty_months négatif", () => {
    const result = MerchantSchema.safeParse({ ...validMerchant, default_warranty_months: -1 });
    expect(result.success).toBe(false);
  });

  it("rejette un id qui n'est pas un UUID", () => {
    const result = MerchantSchema.safeParse({ ...validMerchant, id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});

// ─── DossierSchema ────────────────────────────────────────────────────────────

describe("DossierSchema", () => {
  it("accepte un dossier valide minimal", () => {
    expect(DossierSchema.safeParse(validDossier).success).toBe(true);
  });

  it("accepte un dossier avec des dates ISO valides", () => {
    const result = DossierSchema.safeParse({
      ...validDossier,
      started_at: "2026-01-10T00:00:00.000Z",
      return_deadline: "2026-02-10T00:00:00.000Z",
      warranty_deadline: "2028-01-10T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepte un dossier abonnement avec subscription_period", () => {
    const result = DossierSchema.safeParse({
      ...validDossier,
      dossier_type: "subscription",
      subscription_period: "monthly",
      subscription_amount: 9.99,
    });
    expect(result.success).toBe(true);
  });

  it("accepte des action_links valides", () => {
    const result = DossierSchema.safeParse({
      ...validDossier,
      action_links: [
        { type: "tracking", label: "Suivre ma commande", url: "https://track.example.com" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejette un dossier_type inconnu", () => {
    const result = DossierSchema.safeParse({ ...validDossier, dossier_type: "invoice" });
    expect(result.success).toBe(false);
  });

  it("rejette un status inconnu", () => {
    const result = DossierSchema.safeParse({ ...validDossier, status: "archived" });
    expect(result.success).toBe(false);
  });

  it("rejette un id qui n'est pas un UUID", () => {
    const result = DossierSchema.safeParse({ ...validDossier, id: "bad-id" });
    expect(result.success).toBe(false);
  });

  it("rejette une image_url invalide", () => {
    const result = DossierSchema.safeParse({ ...validDossier, image_url: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rejette un number_of_guests inférieur à 1", () => {
    const result = DossierSchema.safeParse({ ...validDossier, number_of_guests: 0 });
    expect(result.success).toBe(false);
  });

  it("rejette une subscription_period inconnue", () => {
    const result = DossierSchema.safeParse({ ...validDossier, subscription_period: "quarterly" });
    expect(result.success).toBe(false);
  });

  it("rejette si created_at manque", () => {
    const { created_at: _, ...withoutCreatedAt } = validDossier;
    const result = DossierSchema.safeParse(withoutCreatedAt);
    expect(result.success).toBe(false);
  });

  it("rejette une datetime malformée", () => {
    const result = DossierSchema.safeParse({ ...validDossier, started_at: "2026-01-15" });
    expect(result.success).toBe(false);
  });
});

// ─── DossierEventSchema ───────────────────────────────────────────────────────

describe("DossierEventSchema", () => {
  it("accepte un événement valide", () => {
    expect(DossierEventSchema.safeParse(validDossierEvent).success).toBe(true);
  });

  it("accepte un événement avec raw_gemini_response renseigné", () => {
    const result = DossierEventSchema.safeParse({
      ...validDossierEvent,
      raw_gemini_response: { model: "gemini-flash", tokens: 120 },
    });
    expect(result.success).toBe(true);
  });

  it("accepte extraction_confidence null", () => {
    const result = DossierEventSchema.safeParse({
      ...validDossierEvent,
      extraction_confidence: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejette extraction_confidence hors de [0, 1]", () => {
    expect(
      DossierEventSchema.safeParse({ ...validDossierEvent, extraction_confidence: 1.5 }).success
    ).toBe(false);
    expect(
      DossierEventSchema.safeParse({ ...validDossierEvent, extraction_confidence: -0.1 }).success
    ).toBe(false);
  });

  it("rejette un event_type inconnu", () => {
    const result = DossierEventSchema.safeParse({ ...validDossierEvent, event_type: "unknown" });
    expect(result.success).toBe(false);
  });

  it("rejette un email_id qui n'est pas un UUID", () => {
    const result = DossierEventSchema.safeParse({ ...validDossierEvent, email_id: "not-uuid" });
    expect(result.success).toBe(false);
  });
});

// ─── MailAccountSchema ────────────────────────────────────────────────────────

describe("MailAccountSchema", () => {
  it("accepte un compte mail valide", () => {
    expect(MailAccountSchema.safeParse(validMailAccount).success).toBe(true);
  });

  it("accepte backfill_progress avec total renseigné", () => {
    const result = MailAccountSchema.safeParse({
      ...validMailAccount,
      backfill_status: "running",
      backfill_progress: { processed: 150, total: 400 },
    });
    expect(result.success).toBe(true);
  });

  it("rejette une adresse email invalide", () => {
    const result = MailAccountSchema.safeParse({
      ...validMailAccount,
      email_address: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejette un provider inconnu", () => {
    const result = MailAccountSchema.safeParse({ ...validMailAccount, provider: "icloud" });
    expect(result.success).toBe(false);
  });

  it("rejette un backfill_status inconnu", () => {
    const result = MailAccountSchema.safeParse({ ...validMailAccount, backfill_status: "queued" });
    expect(result.success).toBe(false);
  });

  it("rejette backfill_progress.processed négatif", () => {
    const result = MailAccountSchema.safeParse({
      ...validMailAccount,
      backfill_progress: { processed: -1, total: null },
    });
    expect(result.success).toBe(false);
  });
});

// ─── ProcessingQueueItemSchema ────────────────────────────────────────────────

describe("ProcessingQueueItemSchema", () => {
  it("accepte un item valide", () => {
    const item = {
      id: VALID_UUID,
      user_id: VALID_UUID_2,
      mail_account_id: VALID_UUID,
      provider_message_id: "msg-001",
      priority: 1,
      status: "pending" as const,
      attempts: 0,
      last_error: null,
      locked_until: null,
      created_at: VALID_DATETIME,
      processed_at: null,
    };
    expect(ProcessingQueueItemSchema.safeParse(item).success).toBe(true);
  });

  it("rejette attempts négatif", () => {
    const result = ProcessingQueueItemSchema.safeParse({
      id: VALID_UUID,
      user_id: VALID_UUID_2,
      mail_account_id: VALID_UUID,
      provider_message_id: "msg-001",
      priority: 1,
      status: "pending",
      attempts: -1,
      last_error: null,
      locked_until: null,
      created_at: VALID_DATETIME,
      processed_at: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejette un status inconnu", () => {
    const result = ProcessingQueueItemSchema.safeParse({
      id: VALID_UUID,
      user_id: VALID_UUID_2,
      mail_account_id: VALID_UUID,
      provider_message_id: "msg-001",
      priority: 1,
      status: "failed",
      attempts: 0,
      last_error: null,
      locked_until: null,
      created_at: VALID_DATETIME,
      processed_at: null,
    });
    expect(result.success).toBe(false);
  });
});

// ─── ProfileSchema ────────────────────────────────────────────────────────────

describe("ProfileSchema", () => {
  it("accepte un profil valide", () => {
    const profile = {
      id: VALID_UUID,
      display_name: "Thomas",
      telegram_chat_id: null,
      notification_preferences: {
        telegram: true,
        calendar: false,
        return_reminder_days: 7,
        warranty_reminder_days: 30,
        renewal_reminder_days: 14,
      },
      created_at: VALID_DATETIME,
      updated_at: VALID_DATETIME,
    };
    expect(ProfileSchema.safeParse(profile).success).toBe(true);
  });

  it("rejette un display_name vide", () => {
    const result = ProfileSchema.safeParse({
      id: VALID_UUID,
      display_name: "",
      telegram_chat_id: null,
      notification_preferences: {
        telegram: true,
        calendar: false,
        return_reminder_days: 7,
        warranty_reminder_days: 30,
        renewal_reminder_days: 14,
      },
      created_at: VALID_DATETIME,
      updated_at: VALID_DATETIME,
    });
    expect(result.success).toBe(false);
  });

  it("rejette return_reminder_days négatif", () => {
    const result = ProfileSchema.safeParse({
      id: VALID_UUID,
      display_name: "Thomas",
      telegram_chat_id: null,
      notification_preferences: {
        telegram: true,
        calendar: false,
        return_reminder_days: -1,
        warranty_reminder_days: 30,
        renewal_reminder_days: 14,
      },
      created_at: VALID_DATETIME,
      updated_at: VALID_DATETIME,
    });
    expect(result.success).toBe(false);
  });
});
