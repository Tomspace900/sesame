const SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"] as string;
const GOOGLE_CLIENT_ID = import.meta.env["VITE_GOOGLE_CLIENT_ID"] as string;
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly email profile";

export type MailAccount = {
  id: string;
  email_address: string;
  last_sync_at: string | null;
  backfill_status: string;
  backfill_progress: { processed: number; total: number | null } | null;
  backfill_started_at: string | null;
  watch_expiration: string | null;
};

export function buildGoogleOAuthUrl(userId: string, context?: string): string {
  const redirectUri = `${SUPABASE_URL}/functions/v1/oauth-callback`;
  const stateValue = context ? `${userId}:${context}` : userId;
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: stateValue,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
