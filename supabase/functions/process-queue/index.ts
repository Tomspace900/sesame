// Edge Function: process-queue (Cron */2 min)
// Dequeues one pending item, fetches the email, classifies and extracts with Gemini,
// then inserts or updates dossiers + dossier_events.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { decryptToken, encryptToken } from "../_shared/crypto.ts";
import { callGemini, extractJson } from "../_shared/gemini.ts";
import { getMessage, refreshAccessToken } from "../_shared/gmail.ts";
import { buildClassificationPrompt } from "../_shared/prompts/classification.ts";
import { buildExtractionPrompt } from "../_shared/prompts/extraction.ts";
import type { RecentDossierContext } from "../_shared/prompts/extraction.ts";

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
  participants: z.array(z.unknown()).default([]).transform(
    (arr: unknown[]) => arr.map((p: unknown) => (typeof p === 'string' ? p : JSON.stringify(p))),
  ),
  action_links: z.array(ActionLinkSchema).default([]),
});

const ExtractionSchema = z.object({
  dossier_type: z.enum([
    "purchase",
    "trip",
    "accommodation",
    "subscription",
    "reservation",
    "other",
  ]).transform((v: string) => v === "other" ? "purchase" : v), // C7: never use "other", fallback to purchase
  event_type: z.string(),
  extracted_data: ExtractedDataSchema,
  human_summary: z.string(),
  extraction_confidence: z.number().min(0).max(1),
  existing_dossier_id: z.string().uuid().nullable().catch(null),
  // Gemini sometimes returns unexpected values like "started_at" — catch and nullify
  linked_by: z.enum(["reference", "fuzzy_match", "llm"]).nullable().catch(null),
  match_confidence: z.number().min(0).max(1).nullable(),
});

type ExtractionResult = z.infer<typeof ExtractionSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Gemini sometimes embeds raw control characters in JSON strings (from HTML email bodies).
// Strip them before JSON.parse to avoid "Bad control character" errors.
function sanitizeJson(raw: string): string {
  // Replace control characters except tab, newline, carriage return
  return raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
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
  // Accept "HH:MM" or "H:MM"
  const match = val.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1]);
  const m = parseInt(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  // "00:00" is suspicious — likely absence of info, not actual midnight check-in
  if (h === 0 && m === 0) return null;
  return `${h.toString().padStart(2, '0')}:${match[2]}`;
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

  const prog = acct.backfill_progress as { processed: number; total: number | null } | null;
  const newProcessed = (prog?.processed ?? 0) + 1;

  const { count: remaining } = await supabase
    .from("processing_queue")
    .select("id", { count: "exact", head: true })
    .eq("mail_account_id", mailAccountId)
    .eq("status", "pending");

  await supabase
    .from("mail_accounts")
    .update({
      backfill_progress: { processed: newProcessed, total: prog?.total ?? null },
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
  merchant: { default_return_days: number | null; default_warranty_months: number | null } | null,
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
// C1: Pre-linking by reference — SQL lookup before Gemini
// ---------------------------------------------------------------------------

// Common words that should not be treated as reference codes
const COMMON_WORDS = new Set([
  'HELLO', 'TOTAL', 'MERCI', 'VOTRE', 'SUITE', 'EMAIL', 'ORDER', 'PARIS',
  'PRICE', 'COLIS', 'TRACK', 'CLICK', 'REPLY', 'VENIR', 'GRAND', 'OFFRE',
  'COMME', 'MONDE', 'NOTRE', 'ENTRE', 'FRANCE', 'THOMAS', 'MAISON', 'OBJET',
  'TITRE', 'LIGNE', 'CARTE', 'COMPTE', 'RETOUR', 'SUIVI', 'ENVOI', 'RECU',
  'POINT', 'RELAIS', 'ADRESSE', 'COMMANDE', 'LIVRAISON', 'CHECK', 'TRAIN',
  'AVION', 'HOTEL', 'BILLET', 'VOYAGE', 'DEPART', 'ARRIVEE', 'GRATUIT',
  'ALLER', 'HTTPS', 'DATES', 'TEXTE', 'PROMO',
]);

// Extract potential reference/booking codes from subject + body preview
function extractReferenceCandidates(subject: string, bodyPreview: string): string[] {
  const candidates = new Set<string>();
  const text = `${subject} ${bodyPreview}`;

  // Patterns for order references, booking codes, etc.
  const patterns = [
    // Explicit reference markers: "n°XXXXX", "ref XXXXX", "#XXXXX", "réf. XXXXX", "commande XXXXX"
    /(?:n[°o]|ref\.?|réf\.?|#|commande|order|booking|réservation|confirmation)\s*[:.]?\s*([A-Z0-9]{5,20})/gi,
    // Alphanumeric codes (must mix letters and digits): 9CB6OPJ77FG4C, AF1694
    /\b([A-Z0-9]{6,20})\b/g,
    // PNR-style codes (5-6 uppercase letters with consonant clusters): XLMSHR, KBKKHJF
    /\b([A-Z]{5,7})\b/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const ref = match[1].trim();
      // Filter out noise
      if (
        ref.length >= 5 &&
        ref.length <= 20 &&
        !/^[0-9]{1,5}$/.test(ref) &&
        !COMMON_WORDS.has(ref.toUpperCase())
      ) {
        candidates.add(ref);
      }
    }
  }

  return [...candidates];
}

// Try to find an existing dossier matching one of the reference candidates
async function preLinkByReference(
  userId: string,
  subject: string,
  bodyPreview: string
): Promise<{ dossierId: string; reference: string } | null> {
  const candidates = extractReferenceCandidates(subject, bodyPreview);
  if (candidates.length === 0) return null;

  for (const ref of candidates) {
    const { data } = await supabase
      .from("dossiers")
      .select("id")
      .eq("user_id", userId)
      .or(`reference.eq.${ref},booking_reference.eq.${ref}`)
      .limit(1)
      .maybeSingle();

    if (data) {
      return { dossierId: data.id as string, reference: ref };
    }
  }

  return null;
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

  if (dequeueError) throw new Error(`Dequeue error: ${JSON.stringify(dequeueError)}`);
  // RETURNS processing_queue (composite) → null queue becomes {id: null, ...} not null
  if (!queueItem?.id) {
    console.log("Queue is empty, nothing to process");
    return;
  }

  console.log(`Processing queue item ${queueItem.id}, attempt ${queueItem.attempts}`);

  try {
    await processItem(queueItem);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`Processing failed for item ${queueItem.id}:`, errMsg);

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
  const { data: mailAccount, error: accountError } = await supabase
    .from("mail_accounts")
    .select("id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("id", queueItem.mail_account_id)
    .single();

  if (accountError || !mailAccount) throw new Error("mail_account not found");

  const expiresAt = mailAccount.token_expires_at
    ? new Date(mailAccount.token_expires_at)
    : new Date(0);
  let accessToken: string;

  if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
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
  } else {
    accessToken = await decryptToken(mailAccount.access_token_encrypted, ENCRYPTION_KEY);
  }

  // 2. Fetch full email from Gmail
  const rawEmail = await getMessage(accessToken, queueItem.provider_message_id);

  // 3. Insert/upsert email record
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

  if (emailError || !emailRecord)
    throw new Error(`Email upsert failed: ${JSON.stringify(emailError)}`);
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

    if (!storageError) {
      await supabase.from("emails").update({ text_html_storage_path: htmlPath }).eq("id", emailId);
    }
  }

  // 5. Build email body for Gemini (prefer plain text, fallback to html-to-text)
  const emailBody = rawEmail.textPlain ?? (rawEmail.textHtml ? htmlToText(rawEmail.textHtml) : "");
  // C8: increased from 500 to 1500 chars for better classification
  const bodyPreview = emailBody.slice(0, 1500);

  // 6. Classification
  const classificationPrompt = buildClassificationPrompt({
    subject: rawEmail.subject,
    sender: rawEmail.sender,
    bodyPreview,
  });

  let classificationRaw: string;
  try {
    classificationRaw = await callGemini(GEMINI_API_KEY, classificationPrompt);
  } catch (err) {
    throw new Error(`Gemini classification failed: ${err}`);
  }

  const classificationJson = JSON.parse(sanitizeJson(extractJson(classificationRaw)));
  const classificationParsed = ClassificationSchema.safeParse(classificationJson);

  if (!classificationParsed.success) {
    throw new Error(`Classification validation failed: ${classificationParsed.error.message}`);
  }

  const classification = classificationParsed.data;

  // 7. Update email classification + store raw response (C5: observability)
  await supabase
    .from("emails")
    .update({
      classification: classification.is_transactional ? "transactional" : "not_transactional",
      classification_confidence: classification.confidence,
      raw_classification_response: classificationJson,
    })
    .eq("id", emailId);

  // 8. If not transactional, skip
  if (!classification.is_transactional) {
    await supabase
      .from("processing_queue")
      .update({
        status: "skipped",
        processed_at: new Date().toISOString(),
      })
      .eq("id", queueItem.id);
    await updateBackfillProgress(queueItem.mail_account_id);
    console.log(`Skipped non-transactional email ${emailId}`);
    return;
  }

  // 8.5 C1: Pre-link by reference — SQL lookup before Gemini
  const preLink = await preLinkByReference(
    queueItem.user_id,
    rawEmail.subject,
    emailBody.slice(0, 2000)
  );

  // 9. Find merchant early (needed for C2: merchant-specific dossier lookup)
  let merchantId: string | null = null;
  let merchantDefaults: {
    default_return_days: number | null;
    default_warranty_months: number | null;
  } | null = null;

  // find_merchant_by_sender returns RETURNS TABLE → Supabase gives back an array
  const { data: merchantRows } = (await supabase.rpc("find_merchant_by_sender", {
    sender_email: rawEmail.sender,
  })) as {
    data: Array<{
      id: string;
      default_return_days: number | null;
      default_warranty_months: number | null;
    }> | null;
    error: unknown;
  };

  const foundMerchant = merchantRows?.[0] ?? null;
  if (foundMerchant) {
    merchantId = foundMerchant.id;
    merchantDefaults = foundMerchant;
  }

  // 10. C2: Get 30 recent active dossiers + merchant-specific dossiers for linking context
  const { data: recentDossiers } = await supabase
    .from("dossiers")
    .select(`
      id, dossier_type, title, reference, booking_reference, status, started_at,
      merchants(canonical_name)
    `)
    .eq("user_id", queueItem.user_id)
    .not("status", "in", '("cancelled","returned")')
    .order("started_at", { ascending: false })
    .limit(30);

  // C2: Also fetch merchant-specific dossiers (may include older ones not in top 30)
  let merchantDossiers: typeof recentDossiers = [];
  if (merchantId) {
    const { data } = await supabase
      .from("dossiers")
      .select(`
        id, dossier_type, title, reference, booking_reference, status, started_at,
        merchants(canonical_name)
      `)
      .eq("user_id", queueItem.user_id)
      .eq("merchant_id", merchantId)
      .not("status", "in", '("cancelled","returned")')
      .order("started_at", { ascending: false })
      .limit(10);
    merchantDossiers = data ?? [];
  }

  // Deduplicate and combine
  const seenIds = new Set<string>();
  const allDossiers = [...(recentDossiers ?? []), ...(merchantDossiers ?? [])].filter(
    (d: Record<string, unknown>) => {
      const id = d.id as string;
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    }
  );

  // Build dossier context for Gemini
  const dossierContext: RecentDossierContext[] = allDossiers.map((d: Record<string, unknown>) => ({
    id: d.id as string,
    dossier_type: d.dossier_type as string,
    title: d.title as string | null,
    reference: d.reference as string | null,
    booking_reference: d.booking_reference as string | null,
    merchant_name:
      (d.merchants as { canonical_name?: string } | null)?.canonical_name ?? null,
    status: d.status as string,
    started_at: d.started_at as string | null,
  }));

  // C1: If pre-link found a matching dossier, ensure it's in the context (first position)
  if (preLink) {
    const alreadyInContext = dossierContext.find((d) => d.id === preLink.dossierId);
    if (!alreadyInContext) {
      const { data: preLinkDossier } = await supabase
        .from("dossiers")
        .select(
          "id, dossier_type, title, reference, booking_reference, status, started_at, merchants(canonical_name)"
        )
        .eq("id", preLink.dossierId)
        .single();

      if (preLinkDossier) {
        const d = preLinkDossier as Record<string, unknown>;
        dossierContext.unshift({
          id: d.id as string,
          dossier_type: d.dossier_type as string,
          title: d.title as string | null,
          reference: d.reference as string | null,
          booking_reference: d.booking_reference as string | null,
          merchant_name:
            (d.merchants as { canonical_name?: string } | null)?.canonical_name ?? null,
          status: d.status as string,
          started_at: d.started_at as string | null,
        });
      }
    }
  }

  // Limit context to avoid token explosion
  const limitedContext = dossierContext.slice(0, 40);

  // 11. Extraction + linking — C7: pass emailType from classification
  const extractionPrompt = buildExtractionPrompt({
    emailBody,
    subject: rawEmail.subject,
    sender: rawEmail.sender,
    receivedAt: rawEmail.receivedAt.toISOString(),
    emailType: classification.email_type ?? "other",
    recentDossiers: limitedContext,
  });

  let extraction: ExtractionResult | null = null;
  let rawExtractionResponse: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      raw = await callGemini(GEMINI_API_KEY, extractionPrompt);
    } catch {
      continue;
    }

    const parsedJson = JSON.parse(sanitizeJson(extractJson(raw)));
    rawExtractionResponse = parsedJson; // C5: store raw response
    const parsed = ExtractionSchema.safeParse(parsedJson);

    if (parsed.success) {
      extraction = parsed.data;
      break;
    }

    console.warn(`Extraction attempt ${attempt + 1} validation failed:`, parsed.error.message);
  }

  // Graceful degradation: if extraction fails, create a minimal dossier rather than losing the email
  if (!extraction) {
    console.warn(`Extraction failed for email ${emailId}, creating minimal fallback dossier`);

    const { data: fallback, error: fallbackError } = await supabase
      .from("dossiers")
      .insert({
        user_id: queueItem.user_id,
        dossier_type: "purchase", // Better fallback than "other"
        title: rawEmail.subject || "(sans sujet)",
        status: "detected",
        started_at: rawEmail.receivedAt.toISOString(),
        action_links: [],
        participants: [],
      })
      .select("id")
      .single();

    if (fallbackError || !fallback) throw new Error(`Fallback dossier insert failed: ${JSON.stringify(fallbackError)}`);

    await supabase.from("dossier_events").upsert(
      {
        dossier_id: fallback.id,
        user_id: queueItem.user_id,
        email_id: emailId,
        event_type: "other",
        extracted_data: {},
        extraction_confidence: 0,
        human_summary: `Mail de ${rawEmail.sender} — extraction automatique échouée.`,
        linked_by: null,
        linking_confidence: null,
        raw_gemini_response: rawExtractionResponse,
      },
      { onConflict: "email_id", ignoreDuplicates: true },
    );

    await supabase.from("processing_queue").update({
      status: "done",
      processed_at: new Date().toISOString(),
    }).eq("id", queueItem.id);
    await updateBackfillProgress(queueItem.mail_account_id);

    console.log(`Fallback dossier ${fallback.id} created for email ${emailId}`);
    return;
  }

  const { extracted_data: ex } = extraction;

  // 12. Complete merchant lookup if not found by sender
  if (!merchantId && ex.merchant_name) {
    const { data: byName } = await supabase
      .from("merchants")
      .select("id, default_return_days, default_warranty_months")
      .ilike("canonical_name", ex.merchant_name)
      .maybeSingle();

    if (byName) {
      merchantId = byName.id as string;
      merchantDefaults = byName as typeof merchantDefaults;
    }
  }

  // 13. Calculate deadlines
  const deadlines = calculateDeadlines(
    extraction.dossier_type,
    ex,
    merchantDefaults,
    ex.started_at
  );

  const newStatus = eventTypeToStatus(extraction.event_type);

  // 14. Link to existing dossier or create new one
  let dossierId: string;
  let finalLinkedBy = extraction.linked_by;
  let finalMatchConfidence = extraction.match_confidence;

  const shouldLink =
    extraction.existing_dossier_id &&
    extraction.match_confidence !== null &&
    extraction.match_confidence >= 0.6;

  // C1: If Gemini didn't link but pre-link found a match, use the pre-link result
  const usePreLink = !shouldLink && preLink;

  // Build update payload for linking to existing dossier (avoids duplication)
  function buildLinkUpdatePayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (ex.tracking_number) payload.tracking_number = ex.tracking_number;
    if (ex.tracking_url) payload.tracking_url = ex.tracking_url;
    if (ex.carrier) payload.carrier = ex.carrier;
    const depTime = toISO(ex.departure_time);
    const arrTime = toISO(ex.arrival_time);
    if (depTime) payload.departure_time = depTime;
    if (arrTime) payload.arrival_time = arrTime;
    // C3: check_in/check_out use validateTimeFormat, NOT toISO
    const checkin = validateTimeFormat(ex.check_in_time);
    const checkout = validateTimeFormat(ex.check_out_time);
    if (checkin) payload.check_in_time = checkin;
    if (checkout) payload.check_out_time = checkout;
    if (deadlines.return_deadline) payload.return_deadline = deadlines.return_deadline;
    if (deadlines.warranty_deadline) payload.warranty_deadline = deadlines.warranty_deadline;
    if (deadlines.next_renewal_at) payload.next_renewal_at = deadlines.next_renewal_at;
    return payload;
  }

  if (shouldLink && extraction.existing_dossier_id) {
    dossierId = extraction.existing_dossier_id;
    await supabase.from("dossiers").update(buildLinkUpdatePayload()).eq("id", dossierId);
  } else if (usePreLink) {
    // C1: Pre-link matched by SQL reference lookup
    dossierId = preLink.dossierId;
    finalLinkedBy = "reference";
    finalMatchConfidence = 1.0;
    console.log(`Pre-linked email ${emailId} to dossier ${dossierId} by reference ${preLink.reference}`);
    await supabase.from("dossiers").update(buildLinkUpdatePayload()).eq("id", dossierId);
  } else {
    // Create new dossier
    const newDossier: Record<string, unknown> = {
      user_id: queueItem.user_id,
      merchant_id: merchantId,
      dossier_type: extraction.dossier_type,
      title: ex.title,
      description: ex.description,
      reference: ex.reference,
      amount: ex.amount,
      currency: ex.currency ?? "EUR",
      status: newStatus,
      payment_method: ex.payment_method,
      started_at: toISO(ex.started_at) ?? rawEmail.receivedAt.toISOString(),
      ended_at: toISO(ex.ended_at),
      tracking_number: ex.tracking_number,
      carrier: ex.carrier,
      tracking_url: ex.tracking_url,
      pickup_point_name: ex.pickup_point_name,
      pickup_point_address: ex.pickup_point_address,
      pickup_code: ex.pickup_code,
      departure_location: ex.departure_location,
      arrival_location: ex.arrival_location,
      departure_time: toISO(ex.departure_time),
      arrival_time: toISO(ex.arrival_time),
      flight_or_train_number: ex.flight_or_train_number,
      seat_info: ex.seat_info,
      booking_reference: ex.booking_reference,
      accommodation_address: ex.accommodation_address,
      // C3: check_in/check_out use validateTimeFormat, NOT toISO
      check_in_time: validateTimeFormat(ex.check_in_time),
      check_out_time: validateTimeFormat(ex.check_out_time),
      host_name: ex.host_name,
      host_phone: ex.host_phone,
      number_of_guests: ex.number_of_guests,
      subscription_name: ex.subscription_name,
      subscription_amount: ex.subscription_amount,
      subscription_period: ex.subscription_period,
      participants: ex.participants ?? [],
      action_links: ex.action_links ?? [],
      ...deadlines,
    };

    // Remove null values to let DB defaults apply
    for (const key of Object.keys(newDossier)) {
      if (newDossier[key] === null || newDossier[key] === undefined) {
        delete newDossier[key];
      }
    }

    const { data: created, error: createError } = await supabase
      .from("dossiers")
      .insert(newDossier)
      .select("id")
      .single();

    if (createError || !created)
      throw new Error(`Dossier insert failed: ${JSON.stringify(createError)}`);
    dossierId = created.id as string;
  }

  // 15. Upsert dossier_event — idempotent via UNIQUE(email_id)
  const isLinked = shouldLink || usePreLink;
  const { error: eventError } = await supabase.from("dossier_events").upsert(
    {
      dossier_id: dossierId,
      user_id: queueItem.user_id,
      email_id: emailId,
      event_type: extraction.event_type,
      extracted_data: ex,
      extraction_confidence: extraction.extraction_confidence,
      human_summary: extraction.human_summary,
      linked_by: isLinked ? (finalLinkedBy ?? "llm") : null,
      linking_confidence: isLinked ? finalMatchConfidence : null,
      raw_gemini_response: rawExtractionResponse,
    },
    { onConflict: "email_id", ignoreDuplicates: true },
  );

  if (eventError) throw new Error(`Event upsert failed: ${JSON.stringify(eventError)}`);

  // 16. Update email as processed
  await supabase
    .from("emails")
    .update({
      processed_at: new Date().toISOString(),
    })
    .eq("id", emailId);

  // 17. Mark queue item as done
  await supabase
    .from("processing_queue")
    .update({
      status: "done",
      processed_at: new Date().toISOString(),
    })
    .eq("id", queueItem.id);
  await updateBackfillProgress(queueItem.mail_account_id);

  console.log(`Successfully processed email ${emailId} → dossier ${dossierId}${isLinked ? ` (linked by ${finalLinkedBy})` : ' (new)'}`);
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
    console.error("process-queue fatal error:", err);
    return new Response("Error", { status: 500 });
  }
});
