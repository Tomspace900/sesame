// Edge Function: gmail-webhook
// Receives Google Pub/Sub push notifications when new Gmail messages arrive.
// Decodes the historyId and enqueues new messages for processing.

import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonError, jsonSuccess } from "../_shared/response.ts";
import { handleCors } from "../_shared/cors.ts";
import { decryptToken, encryptToken } from "../_shared/crypto.ts";
import { getHistoryMessages, refreshAccessToken } from "../_shared/gmail.ts";
import { createLogger } from "../_shared/logger.ts";
const logger = createLogger("gmail-webhook");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY")!;
// Simple shared secret: configure your Pub/Sub subscription push URL with ?token=SECRET
const PUBSUB_SECRET = Deno.env.get("PUBSUB_SECRET") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  logger.info(`Received ${req.method} request`);

  // Validate shared secret token
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (PUBSUB_SECRET && token !== PUBSUB_SECRET) {
    return jsonError("Unauthorized", "UNAUTHORIZED", 401);
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", "METHOD_NOT_ALLOWED", 405);
  }

  let body: { message?: { data?: string }; subscription?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", "INVALID_BODY", 400);
  }

  const messageData = body.message?.data;
  if (!messageData) {
    // Pub/Sub ack even if no data — avoid redelivery
    return jsonSuccess({ queued: 0 });
  }

  // Decode base64url Pub/Sub message payload
  let pubsubPayload: { emailAddress?: string; historyId?: string };
  try {
    const decoded = atob(messageData.replace(/-/g, "+").replace(/_/g, "/"));
    pubsubPayload = JSON.parse(decoded);
  } catch {
    logger.error("Failed to decode Pub/Sub message data:", messageData);
    return jsonSuccess({ queued: 0 }); // Ack to avoid infinite retry
  }

  const { emailAddress, historyId: newHistoryId } = pubsubPayload;
  logger.info(
    `Extracted payload - email: ${emailAddress}, historyId: ${newHistoryId}`,
  );
  if (!emailAddress || !newHistoryId) {
    return jsonSuccess({ queued: 0 });
  }

  // Find the mail account for this Gmail address
  const { data: mailAccount, error: accountError } = await supabase
    .from("mail_accounts")
    .select(
      "id, user_id, history_id, access_token_encrypted, refresh_token_encrypted, token_expires_at",
    )
    .eq("email_address", emailAddress)
    .eq("provider", "gmail")
    .maybeSingle();

  if (accountError || !mailAccount) {
    logger.error("mail_account not found for", emailAddress);
    return jsonSuccess({ queued: 0 });
  }

  // Ensure we have a valid access token
  let accessToken: string;
  try {
    const expiresAt = mailAccount.token_expires_at
      ? new Date(mailAccount.token_expires_at)
      : new Date(0);
    const needsRefresh = expiresAt.getTime() - Date.now() < 5 * 60 * 1000;

    if (needsRefresh) {
      const refreshToken = await decryptToken(
        mailAccount.refresh_token_encrypted,
        ENCRYPTION_KEY,
      );
      const refreshed = await refreshAccessToken(
        refreshToken,
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
      );
      accessToken = refreshed.access_token;

      const encryptedNew = await encryptToken(
        refreshed.access_token,
        ENCRYPTION_KEY,
      );
      await supabase
        .from("mail_accounts")
        .update({
          access_token_encrypted: encryptedNew,
          token_expires_at: refreshed.expires_at.toISOString(),
        })
        .eq("id", mailAccount.id);
    } else {
      accessToken = await decryptToken(
        mailAccount.access_token_encrypted,
        ENCRYPTION_KEY,
      );
    }
  } catch (err) {
    logger.error("Token error for", emailAddress, err);
    return jsonError("Token error", "TOKEN_ERROR", 500);
  }

  // Use the stored historyId as startHistoryId for Gmail history.list
  const startHistoryId = mailAccount.history_id ?? newHistoryId;

  let newMessages: Array<{ id: string; threadId: string }> = [];
  try {
    newMessages = await getHistoryMessages(accessToken, startHistoryId);
  } catch (err) {
    logger.error("History fetch error:", err);
    // Still update history_id so we don't re-process old messages next time
  }

  // Update the stored historyId to the latest
  await supabase
    .from("mail_accounts")
    .update({
      history_id: newHistoryId,
      last_sync_at: new Date().toISOString(),
    })
    .eq("id", mailAccount.id);

  if (newMessages.length === 0) {
    return jsonSuccess({ queued: 0 });
  }

  // Insert into processing_queue (UNIQUE constraint handles deduplication)
  const queueItems = newMessages.map((msg) => ({
    user_id: mailAccount.user_id,
    mail_account_id: mailAccount.id,
    provider_message_id: msg.id,
    priority: 10, // New real-time messages get higher priority than backfill
    status: "pending",
  }));

  const { error: queueError } = await supabase
    .from("processing_queue")
    .upsert(queueItems, {
      onConflict: "user_id,mail_account_id,provider_message_id",
      ignoreDuplicates: true,
    });

  if (queueError) {
    logger.error("Queue insert error:", queueError);
  }

  logger.success(
    `Successfully queued ${newMessages.length} messages for ${emailAddress}`,
  );
  return jsonSuccess({ queued: newMessages.length });
});
