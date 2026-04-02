import { supabase } from "@/lib/supabase.ts";
import { useAuthStore } from "@/stores/authStore.ts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

export type NotificationPreferences = {
  telegram: boolean;
  calendar: boolean;
  return_reminder_days: number;
  warranty_reminder_days: number;
  renewal_reminder_days: number;
};

export type MailAccount = {
  id: string;
  provider: string;
  email_address: string;
  last_sync_at: string | null;
  backfill_status: string;
  backfill_progress: { processed: number; total: number | null } | null;
};

type FullProfile = {
  display_name: string;
  telegram_chat_id: string | null;
  notification_preferences: NotificationPreferences;
};

export const DEFAULT_PREFS: NotificationPreferences = {
  telegram: true,
  calendar: true,
  return_reminder_days: 3,
  warranty_reminder_days: 30,
  renewal_reminder_days: 5,
};

const SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"] as string;

export function useReglagesProfile() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const { data: profile } = useQuery<FullProfile | null>({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, telegram_chat_id, notification_preferences")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data as FullProfile | null;
    },
    enabled: !!user,
  });

  const { mutate: saveDisplayName, isPending: isSavingName } = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: name.trim() })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      toast.success("Nom sauvegardé");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { mutate: savePrefs, isPending: isSavingPrefs } = useMutation({
    mutationFn: async (prefs: NotificationPreferences) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("profiles")
        .update({ notification_preferences: prefs })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
    onError: (err: Error) => toast.error(`Erreur sauvegarde : ${err.message}`),
  });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePref = <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K]
  ) => {
    // Read latest prefs from cache to avoid stale closure issues across rapid updates
    const current = queryClient.getQueryData<FullProfile | null>(["profile", user?.id]);
    const currentPrefs = current?.notification_preferences ?? DEFAULT_PREFS;
    const updated = { ...currentPrefs, [key]: value };

    // Optimistic update — triggers immediate re-render
    queryClient.setQueryData<FullProfile | null>(["profile", user?.id], (old) => {
      if (!old) return old;
      return { ...old, notification_preferences: updated };
    });

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => savePrefs(updated), 800);
  };

  // Telegram — verify pairing code
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const { mutate: verifyTelegramCode, isPending: isVerifying } = useMutation({
    mutationFn: async (code: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-telegram-pairing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Code invalide");
      }
    },
    onSuccess: () => {
      setVerifyError(null);
      void queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      toast.success("Telegram connecté !");
    },
    onError: (err: Error) => setVerifyError(err.message),
  });

  // Telegram — send test message
  const { mutate: sendTelegramTest, isPending: isSendingTest } = useMutation({
    mutationFn: async (_: undefined) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-telegram-test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Erreur envoi");
      }
    },
    onSuccess: () => toast.success("Message envoyé sur Telegram !"),
    onError: (err: Error) => toast.error(`Erreur : ${err.message}`),
  });

  // Telegram — disconnect
  const { mutate: disconnectTelegram } = useMutation({
    mutationFn: async (_: undefined) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("profiles")
        .update({ telegram_chat_id: null })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      toast.success("Telegram déconnecté");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return {
    user,
    profile,
    isSavingName,
    saveDisplayName,
    isSavingPrefs,
    updatePref,
    verifyTelegramCode,
    isVerifying,
    verifyError,
    sendTelegramTest,
    isSendingTest,
    disconnectTelegram,
  };
}

export function useMailAccounts() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const { data: accounts = [] } = useQuery<MailAccount[]>({
    queryKey: ["mail-accounts", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("mail_accounts")
        .select("id, provider, email_address, last_sync_at, backfill_status, backfill_progress")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as MailAccount[];
    },
    enabled: !!user,
  });

  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const { mutate: disconnectAccount, isPending: isDisconnecting } = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("mail_accounts")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onMutate: (id) => setDisconnectingId(id),
    onSettled: () => setDisconnectingId(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mail-accounts", user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["mail-account-gmail", user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["mail-accounts-count", user?.id] });
      toast.success("Compte déconnecté");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return { accounts, disconnectAccount, isDisconnecting, disconnectingId };
}

export function useStats() {
  const user = useAuthStore((s) => s.user);

  const { data: dossierCount = 0 } = useQuery<number>({
    queryKey: ["stats-dossiers-count", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { count } = await supabase
        .from("dossiers")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      return count ?? 0;
    },
    enabled: !!user,
  });

  const { data: mailsAnalysed = 0 } = useQuery<number>({
    queryKey: ["stats-mails-analysed", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { data } = await supabase
        .from("mail_accounts")
        .select("backfill_progress")
        .eq("user_id", user.id);
      return (data ?? []).reduce((sum, acc) => {
        const p = acc.backfill_progress as { processed: number } | null;
        return sum + (p?.processed ?? 0);
      }, 0);
    },
    enabled: !!user,
  });

  const { data: sourceCount = 0 } = useQuery<number>({
    queryKey: ["stats-source-count", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { data } = await supabase
        .from("dossiers")
        .select("merchant_id")
        .eq("user_id", user.id)
        .not("merchant_id", "is", null);
      const distinct = new Set((data ?? []).map((d) => d.merchant_id as string));
      return distinct.size;
    },
    enabled: !!user,
  });

  const { data: totalValue = 0 } = useQuery<number>({
    queryKey: ["stats-total-value", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { data } = await supabase
        .from("dossiers")
        .select("amount")
        .eq("user_id", user.id)
        .not("amount", "is", null);
      return (data ?? []).reduce((sum, d) => sum + ((d.amount as number) ?? 0), 0);
    },
    enabled: !!user,
  });

  return { dossierCount, mailsAnalysed, sourceCount, totalValue };
}
