// Edge Function: process-queue (Cron */2 min)
// Dequeues one pending item, fetches the email, classifies and extracts with Gemini,
// then delegates ALL persistence to the process_email_result RPC (atomic transaction).

// deno-lint-ignore no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2";
// deno-lint-ignore no-import-prefix
import { z } from "npm:zod@3";
import { decryptToken, encryptToken } from "../_shared/crypto.ts";
import { callGemini, callGeminiWithParts, type GeminiPart, extractJson, GEMINI_MODELS } from "../_shared/gemini.ts";
import { getMessage, fetchAttachment, type AttachmentMeta, refreshAccessToken } from "../_shared/gmail.ts";
import { createLogger } from "../_shared/logger.ts";
import { buildClassificationPrompt } from "../_shared/prompts/classification.ts";
import { buildExtractionPrompt } from "../_shared/prompts/extraction.ts";
const logger = createLogger("process-queue");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Zod schemas for Gemini response validation
// ---------------------------------------------------------------------------

const ClassificationSchema = z.object({
  is_transactional: z.boolean(),
  email_type: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const ActionLinkSchema = z.object({
  type: z.string(),
  label: z.string().optional(),
  url: z.string().nullable().optional(),
});

const ExtractedDataSchema = z.object({
  merchant_name: z.string().nullish(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  reference: z.string().nullish(),
  amount: z.number().nullish(),
  currency: z.string().nullish(),
  payment_method: z.string().nullish(),
  started_at: z.string().nullish(),
  ended_at: z.string().nullish(),
  return_deadline: z.string().nullish(),
  warranty_deadline: z.string().nullish(),
  next_renewal_at: z.string().nullish(),
  tracking_number: z.string().nullish(),
  carrier: z.string().nullish(),
  tracking_url: z.string().nullish(),
  pickup_point_name: z.string().nullish(),
  pickup_point_address: z.string().nullish(),
  pickup_code: z.string().nullish(),
  departure_location: z.string().nullish(),
  arrival_location: z.string().nullish(),
  departure_time: z.string().nullish(),
  arrival_time: z.string().nullish(),
  flight_or_train_number: z.string().nullish(),
  seat_info: z.string().nullish(),
  booking_reference: z.string().nullish(),
  accommodation_address: z.string().nullish(),
  check_in_time: z.string().nullish(),
  check_out_time: z.string().nullish(),
  host_name: z.string().nullish(),
  host_phone: z.string().nullish(),
  number_of_guests: z.number().int().nullish(),
  subscription_name: z.string().nullish(),
  subscription_amount: z.number().nullish(),
  subscription_period: z.enum(["monthly", "yearly", "weekly", "other"]).nullish(),
  // Gemini sometimes returns objects instead of strings — coerce to strings
  participants: z
    .array(z.unknown())
    .default([])
    .transform((arr: unknown[]) =>
      arr.map((p: unknown) => (typeof p === "string" ? p : JSON.stringify(p)))
    ),
  action_links: z.array(ActionLinkSchema).default([]),
});

const IdentifierSchema = z.object({
  type: z.string(),
  value: z.string(),
});

const ExtractionSchema = z.object({
  dossier_type: z
    .enum(["purchase", "travel", "accommodation", "subscription", "booking", "other"])
    .transform((v: string) => (v === "other" ? "purchase" : v)), // never use "other", fallback to purchase
  event_type: z.string(),
  extracted_data: ExtractedDataSchema,
  identifiers: z.array(IdentifierSchema).default([]),
  human_summary: z.string(),
  extraction_confidence: z.number().min(0).max(1),
});

type ExtractionResult = z.infer<typeof ExtractionSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Gemini sometimes embeds raw control characters in JSON strings (from HTML email bodies).
// Strip them before JSON.parse to avoid "Bad control character" errors.
function sanitizeJson(raw: string): string {
  // Replace control characters except tab, newline, carriage return
  // deno-lint-ignore no-control-regex
  return raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

// Returns a valid ISO string or null. Used for dates (started_at, ended_at, etc.)
// NOT for check_in_time/check_out_time which use "HH:MM" format.
function toISO(val: string | null | undefined): string | null {
  if (!val) return null;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

// Validates "HH:MM" time format for check_in_time / check_out_time.
// Returns null if invalid or "00:00" (midnight = likely missing data).
function validateTimeFormat(val: string | null | undefined): string | null {
  if (!val) return null;
  const match = val.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1]);
  const m = parseInt(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  // "00:00" is suspicious — likely absence of info, not actual midnight check-in
  if (h === 0 && m === 0) return null;
  return `${h.toString().padStart(2, "0")}:${match[2]}`;
}

// Increment backfill_progress.processed and set status='done' when queue is empty.
// Only runs when backfill_status='running' to avoid touching real-time items.
async function updateBackfillProgress(mailAccountId: string): Promise<void> {
  const { data: acct } = await supabase
    .from("mail_accounts")
    .select("backfill_status, backfill_progress")
    .eq("id", mailAccountId)
    .single();

  if (acct?.backfill_status !== "running") return;

  const prog = acct.backfill_progress as {
    processed: number;
    total: number | null;
  } | null;
  const newProcessed = (prog?.processed ?? 0) + 1;

  const { count: remaining } = await supabase
    .from("processing_queue")
    .select("id", { count: "exact", head: true })
    .eq("mail_account_id", mailAccountId)
    .eq("status", "pending");

  await supabase
    .from("mail_accounts")
    .update({
      backfill_progress: {
        processed: newProcessed,
        total: prog?.total ?? null,
      },
      backfill_status: (remaining ?? 1) === 0 ? "done" : "running",
    })
    .eq("id", mailAccountId);
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function eventTypeToStatus(eventType: string): string {
  const map: Record<string, string> = {
    order_confirmation: "confirmed",
    payment_confirmation: "confirmed",
    booking_confirmation: "confirmed",
    accommodation_confirmation: "confirmed",
    subscription_confirmation: "confirmed",
    subscription_renewal: "confirmed",
    shipping_notification: "in_progress",
    check_in_open: "in_progress",
    boarding_pass: "in_progress",
    delivery_notification: "completed",
    cancellation: "cancelled",
    return_confirmation: "returned",
    subscription_cancellation: "cancelled",
  };
  return map[eventType] ?? "detected";
}

function calculateDeadlines(
  dossierType: string,
  extracted: z.infer<typeof ExtractedDataSchema>,
  merchant: {
    default_return_days: number | null;
    default_warranty_months: number | null;
  } | null,
  startedAt: string | null | undefined
): Partial<{
  return_deadline: string;
  warranty_deadline: string;
  next_renewal_at: string;
}> {
  const deadlines: Record<string, string> = {};
  const base = startedAt ? new Date(startedAt) : null;

  if (extracted.return_deadline) {
    deadlines.return_deadline = extracted.return_deadline;
  } else if (dossierType === "purchase" && base) {
    const days = merchant?.default_return_days ?? 14;
    if (days > 0) {
      const d = new Date(base);
      d.setDate(d.getDate() + days);
      deadlines.return_deadline = d.toISOString();
    }
  }

  if (extracted.warranty_deadline) {
    deadlines.warranty_deadline = extracted.warranty_deadline;
  } else if (dossierType === "purchase" && base) {
    const months = merchant?.default_warranty_months ?? 24;
    if (months > 0) {
      const d = new Date(base);
      d.setMonth(d.getMonth() + months);
      deadlines.warranty_deadline = d.toISOString();
    }
  }

  if (extracted.next_renewal_at) {
    deadlines.next_renewal_at = extracted.next_renewal_at;
  }

  return deadlines;
}

// ---------------------------------------------------------------------------
// Regex identifier extraction — filet de sécurité complémentaire à Gemini
// Pré-extrait les identifiants évidents depuis le sujet.
// Source = 'regex' dans dossier_identifiers.
// ---------------------------------------------------------------------------

// Mots communs à exclure des PNR regex
const COMMON_WORDS = new Set([
  "HELLO",
  "TOTAL",
  "MERCI",
  "VOTRE",
  "SUITE",
  "EMAIL",
  "ORDER",
  "PARIS",
  "PRICE",
  "COLIS",
  "TRACK",
  "CLICK",
  "REPLY",
  "VENIR",
  "GRAND",
  "OFFRE",
  "COMME",
  "MONDE",
  "NOTRE",
  "ENTRE",
  "FRANCE",
  "THOMAS",
  "MAISON",
  "OBJET",
  "TITRE",
  "LIGNE",
  "CARTE",
  "COMPTE",
  "RETOUR",
  "SUIVI",
  "ENVOI",
  "RECU",
  "POINT",
  "RELAIS",
  "ADRESSE",
  "COMMANDE",
  "LIVRAISON",
  "CHECK",
  "TRAIN",
  "AVION",
  "HOTEL",
  "BILLET",
  "VOYAGE",
  "DEPART",
  "ARRIVEE",
  "GRATUIT",
  "ALLER",
  "HTTPS",
  "DATES",
  "TEXTE",
  "PROMO",
]);

function extractIdentifiersFromSubject(
  subject: string
): Array<{ type: string; value: string; source: "regex" }> {
  const results: Array<{ type: string; value: string; source: "regex" }> = [];
  const seen = new Set<string>();

  function add(type: string, value: string) {
    const key = `${type}:${value}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ type, value, source: "regex" });
    }
  }

  // Amazon order numbers: 123-1234567-1234567
  for (const m of subject.matchAll(/\b(\d{3}-\d{7}-\d{7})\b/g)) {
    if (m[1]) add("order_ref", m[1]);
  }

  // PNR-style codes in subject: 5-7 uppercase letters (filtered against common words)
  for (const m of subject.matchAll(/\b([A-Z]{5,7})\b/g)) {
    const v = m[1];
    if (v && !COMMON_WORDS.has(v)) add("pnr", v);
  }

  // Alphanumeric refs with hyphens (must contain at least one digit AND one letter): ksfr-1005-5977219
  for (const m of subject.matchAll(/\b([A-Z0-9]{3,10}(?:-[A-Z0-9]{3,10}){1,4})\b/gi)) {
    const v = m[1]?.toUpperCase();
    if (
      v &&
      /[A-Z]/.test(v) &&
      /[0-9]/.test(v) && // mix letters + digits
      v.length >= 8 &&
      v.length <= 30 &&
      !COMMON_WORDS.has(v)
    ) {
      add("order_ref", m[1] ?? ""); // keep original casing
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main processing logic
// ---------------------------------------------------------------------------

async function processNextItem(): Promise<void> {
  // Atomic dequeue via RPC
  const { data: queueItem, error: dequeueError } = (await supabase.rpc("dequeue_next_item")) as {
    data: {
      id: string;
      user_id: string;
      mail_account_id: string;
      provider_message_id: string;
      attempts: number;
    } | null;
    error: unknown;
  };

  if (dequeueError) {
    throw new Error(`Dequeue error: ${JSON.stringify(dequeueError)}`);
  }
  // RETURNS processing_queue (composite) → null queue becomes {id: null, ...} not null
  if (!queueItem?.id) {
    logger.info("Queue is empty, nothing to process");
    return;
  }

  logger.info(`Processing queue item ${queueItem.id}, attempt ${queueItem.attempts}`);

  try {
    await processItem(queueItem);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`Processing failed for item ${queueItem.id}:`, errMsg);

    if (queueItem.attempts >= 3) {
      await supabase
        .from("processing_queue")
        .update({
          status: "error",
          last_error: errMsg,
          processed_at: new Date().toISOString(),
        })
        .eq("id", queueItem.id);
    } else {
      // Exponential backoff: release lock after 1s, 2s, 4s
      const backoffSec = Math.pow(2, queueItem.attempts - 1);
      await supabase
        .from("processing_queue")
        .update({
          status: "pending",
          locked_until: new Date(Date.now() + backoffSec * 1000).toISOString(),
          last_error: errMsg,
        })
        .eq("id", queueItem.id);
    }
  }
}

async function processItem(queueItem: {
  id: string;
  user_id: string;
  mail_account_id: string;
  provider_message_id: string;
  attempts: number;
}): Promise<void> {
  // 1. Get mail account and ensure valid token
  logger.info(`Fetching mail account for item ${queueItem.id}`);
  logger.debug(`Lookup in mail_accounts table for id=${queueItem.mail_account_id}...`);
  const { data: mailAccount, error: accountError } = await supabase
    .from("mail_accounts")
    .select("id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("id", queueItem.mail_account_id)
    .single();

  if (accountError || !mailAccount) throw new Error("mail_account not found");

  const expiresAt = mailAccount.token_expires_at
    ? new Date(mailAccount.token_expires_at)
    : new Date(0);
  
  logger.debug(`Token expires at ${expiresAt.toISOString()} (Current: ${new Date().toISOString()})`);
  let accessToken: string;

  if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    logger.debug(`Token expired or expiring soon, refreshing access token...`);
    const refreshToken = await decryptToken(mailAccount.refresh_token_encrypted, ENCRYPTION_KEY);
    const refreshed = await refreshAccessToken(
      refreshToken,
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET
    );
    accessToken = refreshed.access_token;
    const encryptedNew = await encryptToken(refreshed.access_token, ENCRYPTION_KEY);
    await supabase
      .from("mail_accounts")
      .update({
        access_token_encrypted: encryptedNew,
        token_expires_at: refreshed.expires_at.toISOString(),
      })
      .eq("id", mailAccount.id);
    logger.debug(`Token refreshed and saved. New expiry: ${refreshed.expires_at.toISOString()}`);
  } else {
    logger.debug(`Token is still valid, decrypting existing token...`);
    accessToken = await decryptToken(mailAccount.access_token_encrypted, ENCRYPTION_KEY);
  }

  // 2. Fetch full email from Gmail
  logger.info(`Fetching email ${queueItem.provider_message_id} from Gmail...`);
  const rawEmail = await getMessage(accessToken, queueItem.provider_message_id);
  logger.info(`Received email: ${rawEmail.subject}`);

  // 3. Insert/upsert email record (idempotent)
  const { data: emailRecord, error: emailError } = await supabase
    .from("emails")
    .upsert(
      {
        user_id: queueItem.user_id,
        mail_account_id: queueItem.mail_account_id,
        provider_message_id: queueItem.provider_message_id,
        subject: rawEmail.subject,
        sender_address: rawEmail.sender,
        sender_name: rawEmail.senderName,
        received_at: rawEmail.receivedAt.toISOString(),
        text_plain: rawEmail.textPlain,
        has_attachments: rawEmail.hasAttachments,
        classification: "unprocessed",
      },
      { onConflict: "user_id,mail_account_id,provider_message_id" }
    )
    .select("id")
    .single();

  logger.debug(`Email upsert result: emailId=${emailRecord?.id ?? 'none'}, error=${emailError ? emailError.message : 'none'}`);

  if (emailError || !emailRecord) {
    throw new Error(`Email upsert failed: ${JSON.stringify(emailError)}`);
  }
  const emailId = emailRecord.id as string;

  // 4. Store HTML in Supabase Storage
  if (rawEmail.textHtml) {
    const htmlPath = `${queueItem.user_id}/${emailId}.html`;
    const { error: storageError } = await supabase.storage
      .from("email-html")
      .upload(htmlPath, rawEmail.textHtml, {
        contentType: "text/html; charset=utf-8",
        upsert: true,
      });

    logger.debug(`HTML upload to Storage at ${htmlPath}: error=${storageError ? storageError.message : 'none'}`);
    if (!storageError) {
      await supabase.from("emails").update({ text_html_storage_path: htmlPath }).eq("id", emailId);
    }
  }

  // 5. Build email body for Gemini (prefer plain text, fallback to html-to-text)
  const emailBody = rawEmail.textPlain ?? (rawEmail.textHtml ? htmlToText(rawEmail.textHtml) : "");
  logger.debug(`Extracted email body length: ${emailBody.length} characters`);
  const bodyPreview = emailBody.slice(0, 3000);

  // 6. Regex identifier extraction — filet de sécurité complémentaire
  const regexIdentifiers = extractIdentifiersFromSubject(rawEmail.subject ?? "");
  if (regexIdentifiers.length > 0) {
    logger.debug(`Regex identifiers found in subject: ${JSON.stringify(regexIdentifiers)}`);
  }

  // 7. Classification
  logger.ai(`Asking Gemini to classify email...`);
  const classificationPrompt = buildClassificationPrompt({
    subject: rawEmail.subject,
    sender: rawEmail.sender,
    bodyPreview,
  });

  let classificationRaw: string;
  try {
    classificationRaw = await callGemini(GEMINI_API_KEY, classificationPrompt, GEMINI_MODELS.classification);
  } catch (err) {
    throw new Error(`Gemini classification failed: ${err}`);
  }

  const classificationJson = JSON.parse(sanitizeJson(extractJson(classificationRaw)));
  const classificationParsed = ClassificationSchema.safeParse(classificationJson);

  if (!classificationParsed.success) {
    throw new Error(`Classification validation failed: ${classificationParsed.error.message}`);
  }

  const classification = classificationParsed.data;
  logger.ai(
    `Classification: transactional=${classification.is_transactional}, type=${classification.email_type}, confidence=${classification.confidence}`
  );
  logger.debug(`Gemini classification reason: ${classification.reason}`);

  // 8. Update email classification + store raw response
  await supabase
    .from("emails")
    .update({
      classification: classification.is_transactional ? "transactional" : "not_transactional",
      classification_confidence: classification.confidence,
      raw_classification_response: classificationJson,
    })
    .eq("id", emailId);
  logger.debug(`Saved classification result to db for email ${emailId}`);

  // 9. If not transactional, skip
  if (!classification.is_transactional) {
    await supabase
      .from("processing_queue")
      .update({
        status: "skipped",
        processed_at: new Date().toISOString(),
      })
      .eq("id", queueItem.id);
    await updateBackfillProgress(queueItem.mail_account_id);
    logger.info(`Skipped non-transactional email ${emailId}`);
    return;
  }

  // 10. Fetch processable attachments (only for transactional emails, before extraction)
  const PROCESSABLE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  const MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024; // 2MB

  type FetchedAttachment = { filename: string; mimeType: string; base64: string };
  const fetchedAttachments: FetchedAttachment[] = [];

  if (rawEmail.attachments.length > 0) {
    const processable = rawEmail.attachments
      .filter((att: AttachmentMeta) => {
        const nameLower = att.filename.toLowerCase();
        return (
          PROCESSABLE_MIME_TYPES.includes(att.mimeType) &&
          att.size <= MAX_ATTACHMENT_SIZE &&
          !nameLower.includes("logo") &&
          !nameLower.includes("signature") &&
          !nameLower.includes("banner")
        );
      })
      .slice(0, 3); // max 3 pièces jointes
      
    logger.debug(`Found ${processable.length} processable attachments out of ${rawEmail.attachments.length} total`);

    for (const att of processable) {
      try {
        const base64 = await fetchAttachment(accessToken, queueItem.provider_message_id, att.attachmentId);
        fetchedAttachments.push({ filename: att.filename, mimeType: att.mimeType, base64 });
        logger.info(`Fetched attachment: ${att.filename} (${att.mimeType}, ${att.size} bytes)`);
      } catch (err) {
        logger.warn(`Failed to fetch attachment ${att.filename}:`, err);
      }
    }
  }

  // 11. Extraction — extraction pure, sans contexte de dossiers
  const extractionPrompt = buildExtractionPrompt({
    emailBody,
    subject: rawEmail.subject,
    sender: rawEmail.sender,
    receivedAt: rawEmail.receivedAt.toISOString(),
    emailType: classification.email_type ?? "other",
    hasAttachments: fetchedAttachments.length > 0,
  });

  // Construire les parts multimodales : texte + pièces jointes si présentes
  const extractionParts: GeminiPart[] = [{ text: extractionPrompt }];
  for (const att of fetchedAttachments) {
    extractionParts.push({ text: `\n--- PIÈCE JOINTE : ${att.filename} ---\n` });
    extractionParts.push({ inlineData: { mimeType: att.mimeType, data: att.base64 } });
  }

  logger.ai(`Sending extraction prompt to Gemini (${fetchedAttachments.length} attachment(s))...`);

  let extraction: ExtractionResult | null = null;
  let rawExtractionResponse: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      raw = await callGeminiWithParts(GEMINI_API_KEY, extractionParts, GEMINI_MODELS.extraction);
    } catch {
      continue;
    }

    const parsedJson = JSON.parse(sanitizeJson(extractJson(raw)));
    rawExtractionResponse = parsedJson;
    const parsed = ExtractionSchema.safeParse(parsedJson);

    if (parsed.success) {
      extraction = parsed.data;
      logger.ai(
        `Extraction OK (attempt ${
          attempt + 1
        }), type=${extraction.dossier_type}, identifiers=${extraction.identifiers.length}`
      );
      logger.debug(`Extracted raw JSON: ${JSON.stringify(extraction)}`);
      break;
    }

    logger.warn(`Extraction attempt ${attempt + 1} failed:`, parsed.error.message);
  }

  // 12. Combiner les identifiants : Gemini (source=extraction) + regex (source=regex)
  //     Dédupliquer par (type, value) — Gemini a priorité si doublon.
  const allIdentifiers: Array<{ type: string; value: string; source: string }> = [];
  const identifiersSeen = new Set<string>();

  if (extraction) {
    for (const id of extraction.identifiers) {
      if (id.type && id.value) {
        const key = `${id.type}:${id.value}`;
        identifiersSeen.add(key);
        allIdentifiers.push({
          type: id.type,
          value: id.value,
          source: "extraction",
        });
      }
    }
  }

  for (const id of regexIdentifiers) {
    const key = `${id.type}:${id.value}`;
    if (!identifiersSeen.has(key)) {
      identifiersSeen.add(key);
      allIdentifiers.push(id);
    }
  }

  // 13. Résolution merchant POST-extraction
  //     a. Par nom extrait par Gemini (prioritaire — évite Google Reserve → Google Cloud)
  //     b. Fallback par sender email pattern
  //     c. Auto-create si toujours null et qu'on a un nom

  type MerchantRow = {
    id: string;
    default_return_days: number | null;
    default_warranty_months: number | null;
  };

  let merchantId: string | null = null;
  let merchantDefaults: {
    default_return_days: number | null;
    default_warranty_months: number | null;
  } | null = null;

  if (extraction) {
    const merchantName = (extraction.extracted_data.merchant_name as string | null | undefined) ?? null;

    // a. Lookup par nom canonique (case-insensitive)
    if (merchantName) {
      const { data: byName } = await supabase
        .from("merchants")
        .select("id, default_return_days, default_warranty_months")
        .ilike("canonical_name", merchantName)
        .maybeSingle();

      if (byName) {
        merchantId = (byName as MerchantRow).id;
        merchantDefaults = byName as MerchantRow;
      }
    }

    // b. Fallback par sender email pattern
    if (!merchantId) {
      const { data: bySender } = (await supabase.rpc("find_merchant_by_sender", {
        sender_email: rawEmail.sender,
      })) as { data: MerchantRow[] | null; error: unknown };

      const foundBySender = bySender?.[0] ?? null;
      if (foundBySender) {
        merchantId = foundBySender.id;
        merchantDefaults = foundBySender;
      }
    }

    // c. Auto-create merchant depuis le nom extrait par Gemini
    if (!merchantId && merchantName) {
      const categoryFromType: Record<string, string> = {
        purchase: "ecommerce",
        travel: "travel",
        accommodation: "accommodation",
        subscription: "subscription",
        booking: "other",
      };
      const inferredCategory = categoryFromType[extraction.dossier_type] ?? "other";

      const { data: created, error: createError } = await supabase
        .from("merchants")
        .insert({
          canonical_name: merchantName,
          known_sender_patterns: rawEmail.sender ? [rawEmail.sender] : [],
          category: inferredCategory,
        })
        .select("id, default_return_days, default_warranty_months")
        .single();

      if (created && !createError) {
        merchantId = (created as MerchantRow).id;
        merchantDefaults = created as MerchantRow;
        logger.info(`Auto-created merchant "${merchantName}" (${inferredCategory})`);
      } else {
        // Conflit de contrainte unique (création concurrente) → fetch l'existant
        const { data: existing } = await supabase
          .from("merchants")
          .select("id, default_return_days, default_warranty_months")
          .ilike("canonical_name", merchantName)
          .maybeSingle();

        if (existing) {
          merchantId = (existing as MerchantRow).id;
          merchantDefaults = existing as MerchantRow;
        }
      }
    }
  }

  // 14. Graceful degradation: si l'extraction a échoué, créer un dossier minimal via RPC
  if (!extraction) {
    logger.warn(`Extraction failed for email ${emailId}, creating minimal fallback dossier`);

    const { error: rpcError } = await supabase.rpc("process_email_result", {
      p_user_id: queueItem.user_id,
      p_email_id: emailId,
      p_dossier_type: "purchase",
      p_merchant_id: merchantId,
      p_new_status: "detected",
      p_dossier_fields: {
        title: rawEmail.subject || "(sans sujet)",
        currency: "EUR",
        started_at: rawEmail.receivedAt.toISOString(),
        participants: [],
        action_links: [],
      },
      p_event_type: "other",
      p_extracted_data: {},
      p_extraction_confidence: 0,
      p_human_summary: `Mail de ${rawEmail.sender} — extraction automatique échouée.`,
      p_raw_gemini_response: rawExtractionResponse ?? null,
      p_identifiers: allIdentifiers,
    });

    if (rpcError) {
      throw new Error(`Fallback RPC failed: ${JSON.stringify(rpcError)}`);
    }

    await supabase
      .from("processing_queue")
      .update({
        status: "done",
        processed_at: new Date().toISOString(),
      })
      .eq("id", queueItem.id);
    await updateBackfillProgress(queueItem.mail_account_id);

    logger.info(`Fallback dossier created for email ${emailId}`);
    return;
  }

  const { extracted_data: ex } = extraction;

  // 15. Calculate deadlines
  const deadlines = calculateDeadlines(
    extraction.dossier_type,
    ex,
    merchantDefaults,
    ex.started_at
  );

  const newStatus = eventTypeToStatus(extraction.event_type);

  // 16. Construire le payload dossier_fields pour le RPC
  const dossierFields: Record<string, unknown> = {
    title: ex.title ?? null,
    description: ex.description ?? null,
    reference: ex.reference ?? null,
    amount: ex.amount ?? null,
    currency: ex.currency ?? "EUR",
    payment_method: ex.payment_method ?? null,
    started_at: toISO(ex.started_at) ?? rawEmail.receivedAt.toISOString(),
    ended_at: toISO(ex.ended_at) ?? null,
    tracking_number: ex.tracking_number ?? null,
    carrier: ex.carrier ?? null,
    tracking_url: ex.tracking_url ?? null,
    pickup_point_name: ex.pickup_point_name ?? null,
    pickup_point_address: ex.pickup_point_address ?? null,
    pickup_code: ex.pickup_code ?? null,
    departure_location: ex.departure_location ?? null,
    arrival_location: ex.arrival_location ?? null,
    departure_time: toISO(ex.departure_time) ?? null,
    arrival_time: toISO(ex.arrival_time) ?? null,
    flight_or_train_number: ex.flight_or_train_number ?? null,
    seat_info: ex.seat_info ?? null,
    booking_reference: ex.booking_reference ?? null,
    accommodation_address: ex.accommodation_address ?? null,
    check_in_time: validateTimeFormat(ex.check_in_time) ?? null,
    check_out_time: validateTimeFormat(ex.check_out_time) ?? null,
    host_name: ex.host_name ?? null,
    host_phone: ex.host_phone ?? null,
    number_of_guests: ex.number_of_guests ?? null,
    subscription_name: ex.subscription_name ?? null,
    subscription_amount: ex.subscription_amount ?? null,
    subscription_period: ex.subscription_period ?? null,
    participants: ex.participants ?? [],
    action_links: ex.action_links ?? [],
    ...deadlines,
  };

  // 17. Appel RPC atomique — toute la persistance dans une seule transaction Postgres
  logger.info(`Calling process_email_result RPC with ${allIdentifiers.length} identifiers...`);

  const { data: rpcRows, error: rpcError } = (await supabase.rpc("process_email_result", {
    p_user_id: queueItem.user_id,
    p_email_id: emailId,
    p_dossier_type: extraction.dossier_type,
    p_merchant_id: merchantId,
    p_new_status: newStatus,
    p_dossier_fields: dossierFields,
    p_event_type: extraction.event_type,
    p_extracted_data: ex,
    p_extraction_confidence: extraction.extraction_confidence,
    p_human_summary: extraction.human_summary,
    p_raw_gemini_response: rawExtractionResponse,
    p_identifiers: allIdentifiers,
  })) as {
    data: Array<{
      out_dossier_id: string;
      out_is_new: boolean;
      out_was_merged: boolean;
    }> | null;
    error: unknown;
  };

  if (rpcError || !rpcRows?.[0]) {
    throw new Error(`process_email_result RPC failed: ${JSON.stringify(rpcError)}`);
  }

  const { out_dossier_id: dossierId, out_is_new: isNew, out_was_merged: wasMerged } = rpcRows[0];

  // 18. Update email as processed
  await supabase
    .from("emails")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", emailId);

  // 19. Mark queue item as done
  await supabase
    .from("processing_queue")
    .update({
      status: "done",
      processed_at: new Date().toISOString(),
    })
    .eq("id", queueItem.id);
  await updateBackfillProgress(queueItem.mail_account_id);

  const linkStatus = isNew
    ? "new dossier"
    : wasMerged
    ? "linked (merged)"
    : "linked (identifier or merchant_temporal)";
  logger.success(`Successfully processed email ${emailId} → dossier ${dossierId} (${linkStatus})`);
}

// ---------------------------------------------------------------------------
// Cron entry point
// ---------------------------------------------------------------------------

Deno.serve(async (_req: Request) => {
  try {
    await processNextItem();
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    logger.error("process-queue fatal error:", err);
    return new Response("Error", { status: 500 });
  }
});
