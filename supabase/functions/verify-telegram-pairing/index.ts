// Edge Function: verify-telegram-pairing
// Authentifiée (JWT user). Reçoit { code } depuis le frontend,
// vérifie le code dans telegram_pairing_codes, lie le chat_id au profil.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { jsonSuccess, jsonError } from '../_shared/response.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 'METHOD_NOT_ALLOWED', 405);
  }

  // Verify user JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);

  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser(
    authHeader.replace('Bearer ', ''),
  );
  if (authError || !user) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);

  let body: { code?: string };
  try {
    body = (await req.json()) as { code?: string };
  } catch {
    return jsonError('Invalid JSON body', 'INVALID_BODY', 400);
  }

  const code = body.code?.trim();
  if (!code) return jsonError('code requis', 'MISSING_CODE', 400);

  // Look up the code
  const { data: pairing, error: lookupError } = await supabase
    .from('telegram_pairing_codes')
    .select('telegram_chat_id, expires_at')
    .eq('code', code)
    .maybeSingle();

  if (lookupError) {
    console.error('pairing lookup error:', lookupError);
    return jsonError('Erreur interne', 'DB_ERROR', 500);
  }

  if (!pairing) {
    return jsonError('Code invalide ou inexistant', 'INVALID_CODE', 400);
  }

  if (new Date(pairing.expires_at) < new Date()) {
    // Clean up expired code
    await supabase.from('telegram_pairing_codes').delete().eq('code', code);
    return jsonError('Code expiré — envoie /start à nouveau dans Telegram', 'CODE_EXPIRED', 400);
  }

  // Check this chat_id is not already linked to another account
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('telegram_chat_id', pairing.telegram_chat_id)
    .neq('id', user.id)
    .maybeSingle();

  if (existingProfile) {
    await supabase.from('telegram_pairing_codes').delete().eq('code', code);
    return jsonError(
      'Ce compte Telegram est déjà lié à un autre compte Sésame',
      'ALREADY_LINKED',
      409,
    );
  }

  // Link the chat_id to the user's profile
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ telegram_chat_id: pairing.telegram_chat_id })
    .eq('id', user.id);

  if (updateError) {
    console.error('profile update error:', updateError);
    return jsonError('Erreur lors de la liaison', 'DB_ERROR', 500);
  }

  // Delete the used code
  await supabase.from('telegram_pairing_codes').delete().eq('code', code);

  return jsonSuccess({ linked: true });
});
