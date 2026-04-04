// Edge Function: check-deadlines
// Appelée par pg_cron tous les jours à 8h UTC (= 9h CET).
// Vérifie les 3 types de deadlines pour tous les utilisateurs ayant
// Telegram activé, et envoie les rappels appropriés.

import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonError, jsonSuccess } from "../_shared/response.ts";
import { sendTelegramMessage } from "../_shared/telegram.ts";
import { createLogger } from "../_shared/logger.ts";
const logger = createLogger("check-deadlines");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- Types ----------------------------------------------------------------

type NotifPrefs = {
  telegram: boolean;
  return_reminder_days: number;
  warranty_reminder_days: number;
  renewal_reminder_days: number;
};

type Profile = {
  id: string;
  display_name: string;
  telegram_chat_id: string | null;
  notification_preferences: NotifPrefs;
};

type DossierRow = {
  id: string;
  user_id: string;
  title: string | null;
  dossier_type: string;
  return_deadline: string | null;
  return_reminder_sent: boolean;
  warranty_deadline: string | null;
  warranty_reminder_sent: boolean;
  next_renewal_at: string | null;
  renewal_reminder_sent: boolean;
  merchants: { canonical_name: string } | null;
};

// ---- Helpers ---------------------------------------------------------------

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function dossierLabel(d: DossierRow): string {
  if (d.merchants?.canonical_name) return d.merchants.canonical_name;
  return d.title ?? "un dossier";
}

function buildReturnMsg(d: DossierRow): string {
  const days = daysUntil(d.return_deadline!);
  const dayStr = days <= 1 ? "demain" : `dans ${days} jours`;
  return (
    `<b>Rappel rétractation</b> — ${dossierLabel(d)}\n\n` +
    `Tu as jusqu'au <b>${
      formatDate(d.return_deadline!)
    }</b> pour retourner cet article (${dayStr}).`
  );
}

function buildWarrantyMsg(d: DossierRow): string {
  const days = daysUntil(d.warranty_deadline!);
  const dayStr = days <= 1 ? "demain" : `dans ${days} jours`;
  return (
    `<b>Rappel garantie</b> — ${dossierLabel(d)}\n\n` +
    `La garantie expire le <b>${
      formatDate(d.warranty_deadline!)
    }</b> (${dayStr}).`
  );
}

function buildRenewalMsg(d: DossierRow): string {
  const days = daysUntil(d.next_renewal_at!);
  const dayStr = days <= 1 ? "demain" : `dans ${days} jours`;
  return (
    `<b>Rappel renouvellement</b> — ${dossierLabel(d)}\n\n` +
    `Renouvellement le <b>${formatDate(d.next_renewal_at!)}</b> (${dayStr}).`
  );
}

// ---- Query helpers ---------------------------------------------------------

const DOSSIER_SELECT = "id, user_id, title, dossier_type, " +
  "return_deadline, return_reminder_sent, " +
  "warranty_deadline, warranty_reminder_sent, " +
  "next_renewal_at, renewal_reminder_sent, " +
  "merchants(canonical_name)";

const EXCLUDED_STATUSES = ["cancelled", "returned"];

async function fetchCandidates(
  deadlineCol: "return_deadline" | "warranty_deadline" | "next_renewal_at",
  sentCol:
    | "return_reminder_sent"
    | "warranty_reminder_sent"
    | "renewal_reminder_sent",
  nowISO: string,
  windowEndISO: string,
): Promise<DossierRow[]> {
  let q = supabase
    .from("dossiers")
    .select(DOSSIER_SELECT)
    .eq(sentCol, false)
    .not(deadlineCol, "is", null)
    .gte(deadlineCol, nowISO)
    .lte(deadlineCol, windowEndISO);

  for (const s of EXCLUDED_STATUSES) {
    q = q.neq("status", s);
  }

  const { data, error } = await q;
  if (error) {
    logger.error(`fetchCandidates(${deadlineCol}) error:`, error);
    return [];
  }
  return (data ?? []) as DossierRow[];
}

// ---- Main ------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  logger.info(`Starting daily check...`);
  if (req.method !== "POST") {
    return jsonError("Method not allowed", "METHOD_NOT_ALLOWED", 405);
  }

  const now = new Date();
  const nowISO = now.toISOString();
  // 60-day window covers all possible user thresholds (max warranty = 30 days by default, generous margin)
  const windowEndISO = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
    .toISOString();

  // Fetch all 3 deadline lists in parallel
  const [returnCandidates, warrantyCandidates, renewalCandidates] =
    await Promise.all([
      fetchCandidates(
        "return_deadline",
        "return_reminder_sent",
        nowISO,
        windowEndISO,
      ),
      fetchCandidates(
        "warranty_deadline",
        "warranty_reminder_sent",
        nowISO,
        windowEndISO,
      ),
      fetchCandidates(
        "next_renewal_at",
        "renewal_reminder_sent",
        nowISO,
        windowEndISO,
      ),
    ]);

  const allCandidates = [
    ...returnCandidates,
    ...warrantyCandidates,
    ...renewalCandidates,
  ];
  logger.info(
    `Found ${allCandidates.length} candidate dossiers across all deadline types`,
  );

  if (allCandidates.length === 0) {
    return jsonSuccess({ sent: 0, checked: 0 });
  }

  // Batch-fetch profiles for all involved users
  const userIds = [...new Set(allCandidates.map((c) => c.user_id))];
  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, telegram_chat_id, notification_preferences")
    .in("id", userIds);

  if (profileError) {
    logger.error("profiles query error:", profileError);
    return jsonError("DB error", "DB_ERROR", 500);
  }

  const profileMap = new Map<string, Profile>(
    (profileRows ?? []).map((p) => [p.id, p as Profile]),
  );

  let sent = 0;

  // Process each deadline type separately (distinct thresholds + flag names)
  type DeadlineTask = {
    candidates: DossierRow[];
    deadlineKey: "return_deadline" | "warranty_deadline" | "next_renewal_at";
    sentKey:
      | "return_reminder_sent"
      | "warranty_reminder_sent"
      | "renewal_reminder_sent";
    thresholdKey: keyof NotifPrefs;
    defaultDays: number;
    buildMsg: (d: DossierRow) => string;
  };

  const tasks: DeadlineTask[] = [
    {
      candidates: returnCandidates,
      deadlineKey: "return_deadline",
      sentKey: "return_reminder_sent",
      thresholdKey: "return_reminder_days",
      defaultDays: 3,
      buildMsg: buildReturnMsg,
    },
    {
      candidates: warrantyCandidates,
      deadlineKey: "warranty_deadline",
      sentKey: "warranty_reminder_sent",
      thresholdKey: "warranty_reminder_days",
      defaultDays: 30,
      buildMsg: buildWarrantyMsg,
    },
    {
      candidates: renewalCandidates,
      deadlineKey: "next_renewal_at",
      sentKey: "renewal_reminder_sent",
      thresholdKey: "renewal_reminder_days",
      defaultDays: 5,
      buildMsg: buildRenewalMsg,
    },
  ];

  for (const task of tasks) {
    for (const dossier of task.candidates) {
      const profile = profileMap.get(dossier.user_id);
      if (!profile?.telegram_chat_id) continue;

      const prefs = profile.notification_preferences;
      if (prefs?.telegram === false) continue;

      const deadlineVal = dossier[task.deadlineKey];
      if (!deadlineVal) continue;

      const thresholdDays =
        (prefs?.[task.thresholdKey] as number | undefined) ?? task.defaultDays;

      if (daysUntil(deadlineVal) > thresholdDays) continue;

      // Mark sent BEFORE sending — prevents double-send if cron overlaps
      const { error: markError } = await supabase
        .from("dossiers")
        .update({ [task.sentKey]: true })
        .eq("id", dossier.id);

      if (markError) {
        logger.error(
          `mark ${task.sentKey} error (dossier ${dossier.id}):`,
          markError,
        );
        continue;
      }

      try {
        await sendTelegramMessage(
          TELEGRAM_BOT_TOKEN,
          profile.telegram_chat_id,
          task.buildMsg(dossier),
        );
        sent++;
      } catch (err) {
        logger.error(
          `Telegram send failed (${task.deadlineKey}, dossier ${dossier.id}):`,
          err,
        );
        // Reminder flagged as sent even if Telegram failed — avoids spam on next run.
        // The deadline trigger in migration 011 will reset the flag if the deadline changes.
      }
    }
  }

  logger.success(
    `Completed. Sent ${sent} messages out of ${allCandidates.length} candidates.`,
  );
  return jsonSuccess({ sent, checked: allCandidates.length });
});
