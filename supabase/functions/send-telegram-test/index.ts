// Edge Function: send-telegram-test
// Authentifiée (JWT user). Envoie un message de test sur le Telegram
// lié au profil de l'utilisateur.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleCors } from '../_shared/cors.ts';
import { jsonSuccess, jsonError } from '../_shared/response.ts';
import { sendTelegramMessage } from '../_shared/telegram.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;

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

  // Get the user's telegram_chat_id
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('telegram_chat_id, display_name')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.error('profile fetch error:', profileError);
    return jsonError('Erreur interne', 'DB_ERROR', 500);
  }

  if (!profile?.telegram_chat_id) {
    return jsonError('Aucun compte Telegram lié', 'NOT_LINKED', 400);
  }

  const name = profile.display_name ?? 'toi';

  try {
    await sendTelegramMessage(
      TELEGRAM_BOT_TOKEN,
      profile.telegram_chat_id,
      `Sésame fonctionne ! Les notifications de ${name} arriveront ici.`,
    );
  } catch (err) {
    console.error('sendTelegramMessage error:', err);
    return jsonError(
      'Impossible d\'envoyer le message Telegram. Vérifie que le bot est bien démarré.',
      'TELEGRAM_ERROR',
      500,
    );
  }

  return jsonSuccess({ sent: true });
});
