// Edge Function: renew-watches (Cron tous les 5 jours)
// Renouvelle les Gmail Pub/Sub watches dont l'expiration approche (< 2 jours).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptToken, encryptToken } from '../_shared/crypto.ts';
import { refreshAccessToken, setupWatch } from '../_shared/gmail.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const GOOGLE_PUBSUB_TOPIC = Deno.env.get('GOOGLE_PUBSUB_TOPIC')!;
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (_req: Request) => {
  // Find Gmail accounts whose watch expires within 2 days
  const expirationThreshold = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

  const { data: accounts, error } = await supabase
    .from('mail_accounts')
    .select('id, access_token_encrypted, refresh_token_encrypted, token_expires_at, watch_expiration')
    .eq('provider', 'gmail')
    .or(`watch_expiration.is.null,watch_expiration.lt.${expirationThreshold}`);

  if (error) {
    console.error('Failed to fetch expiring accounts:', error);
    return new Response('Error', { status: 500 });
  }

  const accounts_list = accounts ?? [];
  console.log(`Found ${accounts_list.length} accounts needing watch renewal`);

  let renewed = 0;
  let failed = 0;

  for (const account of accounts_list) {
    try {
      // Refresh token if needed
      const expiresAt = account.token_expires_at ? new Date(account.token_expires_at) : new Date(0);
      let accessToken: string;

      if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
        const refreshToken = await decryptToken(account.refresh_token_encrypted, ENCRYPTION_KEY);
        const refreshed = await refreshAccessToken(
          refreshToken,
          GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET,
        );
        accessToken = refreshed.access_token;
        const encryptedNew = await encryptToken(refreshed.access_token, ENCRYPTION_KEY);
        await supabase.from('mail_accounts').update({
          access_token_encrypted: encryptedNew,
          token_expires_at: refreshed.expires_at.toISOString(),
        }).eq('id', account.id);
      } else {
        accessToken = await decryptToken(account.access_token_encrypted, ENCRYPTION_KEY);
      }

      // Renew Gmail watch
      const { historyId, expiration } = await setupWatch(accessToken, GOOGLE_PUBSUB_TOPIC);

      await supabase.from('mail_accounts').update({
        watch_expiration: expiration.toISOString(),
        history_id: historyId,
        last_sync_at: new Date().toISOString(),
      }).eq('id', account.id);

      renewed++;
      console.log(`Renewed watch for account ${account.id}, expires ${expiration.toISOString()}`);
    } catch (err) {
      failed++;
      console.error(`Failed to renew watch for account ${account.id}:`, err);
    }
  }

  return new Response(
    JSON.stringify({ renewed, failed, total: accounts_list.length }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
