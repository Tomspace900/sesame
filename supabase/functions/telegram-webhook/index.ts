// Edge Function: telegram-webhook
// Reçoit les updates du Bot Telegram via webhook HTTPS.
// Gère la commande /start : génère un code de couplage, le stocke en DB
// et le renvoie à l'utilisateur Telegram.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendTelegramMessage } from '../_shared/telegram.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type TelegramMessage = {
  message_id: number;
  from?: { id: number; first_name?: string; username?: string };
  chat: { id: number; type: string };
  text?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

function generateCode(): string {
  const buf = new Uint8Array(3);
  crypto.getRandomValues(buf);
  const n = ((buf[0]! << 16) | (buf[1]! << 8) | buf[2]!) % 1_000_000;
  return n.toString().padStart(6, '0');
}

Deno.serve(async (req: Request) => {
  // Telegram envoie toujours POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Vérification du secret webhook (optionnel mais recommandé)
  if (TELEGRAM_WEBHOOK_SECRET) {
    const secret = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (secret !== TELEGRAM_WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    // Malformed body — ACK quand même pour éviter que Telegram retente
    return new Response('OK', { status: 200 });
  }

  const message = update.message;
  if (!message?.text) {
    return new Response('OK', { status: 200 });
  }

  const chatId = message.chat.id.toString();
  const text = message.text.trim();

  // Seule commande supportée : /start
  if (text !== '/start' && !text.startsWith('/start ')) {
    await sendTelegramMessage(
      TELEGRAM_BOT_TOKEN,
      chatId,
      'Envoie /start pour obtenir ton code de connexion Sésame.',
    );
    return new Response('OK', { status: 200 });
  }

  // Génère un code, supprime l'ancien code pour ce chat s'il existe,
  // insère le nouveau
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  try {
    // Supprime tout code existant pour ce chat (idempotence)
    await supabase
      .from('telegram_pairing_codes')
      .delete()
      .eq('telegram_chat_id', chatId);

    const { error } = await supabase
      .from('telegram_pairing_codes')
      .insert({ code, telegram_chat_id: chatId, expires_at: expiresAt });

    if (error) {
      console.error('insert pairing code error:', error);
      await sendTelegramMessage(
        TELEGRAM_BOT_TOKEN,
        chatId,
        'Une erreur est survenue. Réessaie dans quelques instants.',
      );
      return new Response('OK', { status: 200 });
    }
  } catch (err) {
    console.error('pairing code generation error:', err);
    return new Response('OK', { status: 200 });
  }

  const firstName = message.from?.first_name ?? '';
  const greeting = firstName ? `Bonjour ${firstName} !` : 'Bonjour !';

  await sendTelegramMessage(
    TELEGRAM_BOT_TOKEN,
    chatId,
    `${greeting}\n\nTon code de connexion Sésame :\n\n<code>${code}</code>\n\nSaisis-le dans l'application. Il expire dans 15 minutes.`,
  );

  return new Response('OK', { status: 200 });
});
