import { supabase } from "@/lib/supabase.ts";
import { useAuthStore } from "@/stores/authStore.ts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { buildGoogleOAuthUrl } from "./ReglagesConnecterGmailPage.utils.ts";

export type OnboardingStep = 1 | 2 | 3;

export type BackfillInfo = {
  processed: number;
  total: number | null;
  isRunning: boolean;
  isDone: boolean;
};

type GmailAccount = {
  id: string;
  backfill_status: string;
  backfill_progress: { processed: number; total: number | null } | null;
};

const SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"] as string;

export function useOnboarding(step: OnboardingStep) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const { data: profile } = useQuery<{ display_name: string } | null>({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data as { display_name: string } | null;
    },
    enabled: !!user,
  });

  const { mutate: saveDisplayName } = useMutation({
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
    },
  });

  const { data: gmailAccount } = useQuery<GmailAccount | null>({
    queryKey: ["mail-account-gmail", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("mail_accounts")
        .select("id, backfill_status, backfill_progress")
        .eq("user_id", user.id)
        .eq("provider", "gmail")
        .maybeSingle();
      if (error) throw error;
      return data as GmailAccount | null;
    },
    enabled: !!user,
    refetchInterval: step >= 2 ? 4000 : false,
  });

  const { data: dossierCount } = useQuery<number>({
    queryKey: ["dossiers-count-onboarding", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { count } = await supabase
        .from("dossiers")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      return count ?? 0;
    },
    enabled: !!user && step === 3,
    refetchInterval: step === 3 ? 5000 : false,
  });

  // Trigger backfill when arriving on step 3 with an idle account
  const { mutate: triggerBackfill, isPending: isStartingBackfill } = useMutation({
    mutationFn: async (accountId: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      const res = await fetch(`${SUPABASE_URL}/functions/v1/start-backfill`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mail_account_id: accountId }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        // ALREADY_RUNNING is not an error — backfill was triggered elsewhere
        if ((body as { code?: string }).code === "ALREADY_RUNNING") return;
        throw new Error(body.error ?? "Impossible de démarrer le backfill");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mail-account-gmail", user?.id] });
    },
    onError: (err) => {
      console.error("start-backfill error:", err);
    },
  });

  useEffect(() => {
    if (
      step === 3 &&
      gmailAccount?.id &&
      gmailAccount.backfill_status === "idle" &&
      !isStartingBackfill
    ) {
      triggerBackfill(gmailAccount.id);
    }
  }, [step, gmailAccount?.id, gmailAccount?.backfill_status, isStartingBackfill, triggerBackfill]);

  const handleConnectGmail = () => {
    if (!user) return;
    window.location.href = buildGoogleOAuthUrl(user.id, "onboarding");
  };

  const rawProgress = gmailAccount?.backfill_progress;
  const backfill: BackfillInfo = {
    processed: rawProgress?.processed ?? 0,
    total: rawProgress?.total ?? null,
    isRunning: gmailAccount?.backfill_status === "running",
    isDone: gmailAccount?.backfill_status === "done",
  };

  // Fallback immediately to email prefix so the input is never empty on mount
  const emailPrefix = user?.email?.split("@")[0] ?? "";
  const displayName = profile?.display_name ?? emailPrefix;

  return {
    user,
    displayName,
    saveDisplayName,
    hasGmail: !!gmailAccount,
    backfill,
    dossierCount: dossierCount ?? 0,
    handleConnectGmail,
  };
}
