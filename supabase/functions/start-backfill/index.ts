// Edge Function: start-backfill (HTTP — appelée depuis le front)
// Lance le backfill Gmail pour un mail_account donné.
// Récupère les messages des expéditeurs connus et les enqueue.

import { createClient } from "npm:@supabase/supabase-js@2";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonSuccess } from "../_shared/response.ts";
import { decryptToken, encryptToken } from "../_shared/crypto.ts";
import { listMessages, refreshAccessToken } from "../_shared/gmail.ts";
import { createLogger } from "../_shared/logger.ts";
const logger = createLogger("start-backfill");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  logger.info(`Received request`);

  // Verify user JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
  if (authError || !user) return jsonError("Unauthorized", "UNAUTHORIZED", 401);

  if (req.method !== "POST") {
    return jsonError("Method not allowed", "METHOD_NOT_ALLOWED", 405);
  }

  let body: { mail_account_id?: string; limit_messages?: number };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", "INVALID_BODY", 400);
  }

  const { mail_account_id, limit_messages } = body;
  logger.info(
    `Starting backfill for mail_account_id: ${mail_account_id}, limit: ${limit_messages}`,
  );
  if (!mail_account_id) {
    return jsonError("mail_account_id required", "MISSING_PARAM", 400);
  }

  // Get mail account (verify it belongs to the authenticated user)
  const { data: mailAccount, error: accountError } = await supabase
    .from("mail_accounts")
    .select(
      "id, user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, backfill_status",
    )
    .eq("id", mail_account_id)
    .eq("user_id", user.id)
    .single();

  if (accountError || !mailAccount) {
    return jsonError("mail_account not found", "NOT_FOUND", 404);
  }

  if (mailAccount.backfill_status === "running") {
    return jsonError("Backfill already running", "ALREADY_RUNNING", 409);
  }

  // Refresh token if needed
  const expiresAt = mailAccount.token_expires_at
    ? new Date(mailAccount.token_expires_at)
    : new Date(0);
  let accessToken: string;

  if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
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
    await supabase.from("mail_accounts").update({
      access_token_encrypted: encryptedNew,
      token_expires_at: refreshed.expires_at.toISOString(),
    }).eq("id", mailAccount.id);
  } else {
    accessToken = await decryptToken(
      mailAccount.access_token_encrypted,
      ENCRYPTION_KEY,
    );
  }

  // Get all known sender patterns from merchants
  const { data: merchants } = await supabase
    .from("merchants")
    .select("known_sender_patterns");

  const allPatterns = (merchants ?? []).flatMap(
    (m: { known_sender_patterns: string[] }) => m.known_sender_patterns,
  );

  if (allPatterns.length === 0) {
    return jsonError("No known sender patterns configured", "NO_PATTERNS", 400);
  }

  // Build Gmail query (max ~2000 chars to avoid query limits)
  const fromClauses: string[] = [];
  let queryLength = 0;
  for (const pattern of allPatterns) {
    const clause = `from:${pattern}`;
    if (queryLength + clause.length + 4 > 1800) break;
    fromClauses.push(clause);
    queryLength += clause.length + 4;
  }

  const gmailQuery = fromClauses.join(" OR ");

  // Mark backfill as running
  await supabase.from("mail_accounts").update({
    backfill_status: "running",
    backfill_started_at: new Date().toISOString(),
    backfill_progress: { processed: 0, total: null },
  }).eq("id", mailAccount.id);

  // Enqueue messages in background (respond immediately, continue async)
  // Note: Supabase Edge Functions do not support background tasks officially,
  // so we process the first page synchronously and return an estimate.
  let totalQueued = 0;
  let nextPageToken: string | undefined;
  let totalEstimate: number | undefined;
  const PAGE_SIZE = 50;
  const maxMessages = limit_messages ?? 200;
  const MAX_PAGES = Math.ceil(maxMessages / PAGE_SIZE);

  for (let page = 0; page < MAX_PAGES; page++) {
    const remaining = maxMessages - totalQueued;
    if (remaining <= 0) break;

    let result: {
      messages: Array<{ id: string }>;
      nextPageToken?: string;
      resultSizeEstimate?: number;
    };
    try {
      result = await listMessages(
        accessToken,
        gmailQuery,
        nextPageToken,
        Math.min(PAGE_SIZE, remaining),
      );
    } catch (err) {
      logger.error("listMessages error:", err);
      break;
    }

    if (page === 0) totalEstimate = result.resultSizeEstimate;

    if (result.messages.length === 0) break;

    const queueItems = result.messages.slice(0, remaining).map((msg) => ({
      user_id: user.id,
      mail_account_id: mailAccount.id,
      provider_message_id: msg.id,
      priority: 0, // Backfill = low priority
      status: "pending",
    }));

    const { error: queueError } = await supabase
      .from("processing_queue")
      .upsert(queueItems, {
        onConflict: "user_id,mail_account_id,provider_message_id",
        ignoreDuplicates: true,
      });

    if (queueError) {
      logger.error("Queue upsert error:", queueError);
    } else {
      totalQueued += result.messages.length;
    }

    nextPageToken = result.nextPageToken;
    if (!nextPageToken) break;
  }

  // Update progress
  await supabase.from("mail_accounts").update({
    backfill_status: totalQueued > 0 ? "running" : "done",
    backfill_progress: { processed: 0, total: totalQueued },
  }).eq("id", mailAccount.id);

  logger.success(
    `Successfully enqueued ${totalQueued} messages (estimate ${totalEstimate})`,
  );
  return jsonSuccess({
    queued: totalQueued,
    total_estimate: totalEstimate ?? totalQueued,
  });
});
