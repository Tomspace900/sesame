// Edge Function: oauth-callback
// Called by Google after the user authorizes Gmail access.
// Exchanges the code for tokens, stores them, and sets up Gmail Pub/Sub watch.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { encryptToken } from '../_shared/crypto.ts';
import { setupWatch } from '../_shared/gmail.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const GOOGLE_PUBSUB_TOPIC = Deno.env.get('GOOGLE_PUBSUB_TOPIC')!;
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY')!;
const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173';
// Explicit redirect URI — req.url is an internal Docker hostname inside Edge Runtime,
// so it cannot be derived from the request. Must match exactly what the frontend sends.
const OAUTH_REDIRECT_URI = Deno.env.get('OAUTH_REDIRECT_URI') ?? `${SUPABASE_URL}/functions/v1/oauth-callback`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state'); // user_id or user_id:context
  const error = url.searchParams.get('error');

  // Parse optional context from state (e.g. "user123:onboarding")
  const parsedState = stateParam ?? '';
  const colonIdx = parsedState.indexOf(':');
  const userId = colonIdx >= 0 ? parsedState.slice(0, colonIdx) : parsedState;
  const oauthContext = colonIdx >= 0 ? parsedState.slice(colonIdx + 1) : '';
  const returnPath = oauthContext === 'onboarding' ? '/bienvenue' : '/reglages/connecter/gmail';

  if (error) {
    console.error('OAuth error from Google:', error);
    return Response.redirect(`${APP_URL}${returnPath}?error=${error}`, 302);
  }

  if (!code || !stateParam) {
    return Response.redirect(`${APP_URL}/reglages/connecter/gmail?error=missing_params`, 302);
  }

  const redirectUri = OAUTH_REDIRECT_URI;

  try {
    // 1. Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      throw new Error(`Token exchange failed: ${body}`);
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    if (!tokens.refresh_token) {
      // No refresh token: user already authorized before, prompt=consent was not set
      return Response.redirect(
        `${APP_URL}/reglages/connecter/gmail?error=no_refresh_token`,
        302,
      );
    }

    // 2. Get user's Gmail address from Google userinfo
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userinfoRes.ok) {
      const body = await userinfoRes.text();
      throw new Error(`Failed to fetch Google userinfo: ${userinfoRes.status} ${body}`);
    }

    const userinfo = await userinfoRes.json() as { email: string };
    const emailAddress = userinfo.email;

    // 3. Check email uniqueness across Sésame accounts
    const { data: existingAccount } = await supabase
      .from('mail_accounts')
      .select('user_id')
      .eq('email_address', emailAddress)
      .neq('user_id', userId)
      .maybeSingle();

    if (existingAccount) {
      return Response.redirect(`${APP_URL}${returnPath}?error=email_already_used`, 302);
    }

    // 4. Encrypt tokens before storage
    const accessTokenEncrypted = await encryptToken(tokens.access_token, ENCRYPTION_KEY);
    const refreshTokenEncrypted = await encryptToken(tokens.refresh_token, ENCRYPTION_KEY);
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // 4. Setup Gmail Pub/Sub watch
    const { historyId, expiration } = await setupWatch(tokens.access_token, GOOGLE_PUBSUB_TOPIC);

    // 5. Upsert mail_account record
    const { data: mailAccount, error: dbError } = await supabase
      .from('mail_accounts')
      .upsert(
        {
          user_id: userId,
          provider: 'gmail',
          email_address: emailAddress,
          access_token_encrypted: accessTokenEncrypted,
          refresh_token_encrypted: refreshTokenEncrypted,
          token_expires_at: tokenExpiresAt,
          watch_expiration: expiration.toISOString(),
          history_id: historyId,
          last_sync_at: new Date().toISOString(),
          backfill_status: 'idle',
        },
        { onConflict: 'user_id,provider,email_address' },
      )
      .select('id')
      .single();

    if (dbError) throw new Error(`DB upsert failed: ${dbError.message}`);

    const accountId = mailAccount?.id ?? '';
    return Response.redirect(
      `${APP_URL}${returnPath}?status=success&account_id=${accountId}`,
      302,
    );
  } catch (err) {
    console.error('oauth-callback error:', err);
    const message = err instanceof Error ? err.message : 'unknown_error';
    return Response.redirect(
      `${APP_URL}${returnPath}?error=${encodeURIComponent(message)}`,
      302,
    );
  }
});
