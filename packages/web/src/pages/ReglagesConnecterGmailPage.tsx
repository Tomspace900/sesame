import { Button } from "@/components/ui/Button.tsx";
import { Icon } from "@/components/ui/Icon.tsx";
import { Progress } from "@/components/ui/Progress.tsx";
import { SectionTitle } from "@/components/ui/SectionTitle.tsx";
import { supabase } from "@/lib/supabase.ts";
import { useAuthStore } from "@/stores/authStore.ts";
import Alert02Icon from "@hugeicons/core-free-icons/Alert02Icon";
import CheckmarkCircle02Icon from "@hugeicons/core-free-icons/CheckmarkCircle02Icon";
import Loading03Icon from "@hugeicons/core-free-icons/Loading03Icon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { buildGoogleOAuthUrl, type MailAccount } from "./ReglagesConnecterGmailPage.utils.ts";

const GOOGLE_CLIENT_ID = import.meta.env["VITE_GOOGLE_CLIENT_ID"] as string;

export function ReglagesConnecterGmailPage(): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const oauthStatus = searchParams.get("status");
  const oauthError = searchParams.get("error");
  const newAccountId = searchParams.get("account_id");

  const { data: gmailAccount, isLoading } = useQuery<MailAccount | null>({
    queryKey: ["mail-account-gmail", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("mail_accounts")
        .select(
          "id, email_address, last_sync_at, backfill_status, backfill_progress, backfill_started_at, watch_expiration"
        )
        .eq("user_id", user.id)
        .eq("provider", "gmail")
        .maybeSingle();
      if (error) throw error;
      return data as MailAccount | null;
    },
    enabled: !!user,
    refetchInterval: (query) => {
      const data = query.state.data as MailAccount | null;
      return data?.backfill_status === "running" ? 3000 : false;
    },
  });

  useEffect(() => {
    if (oauthStatus === "success" && newAccountId) {
      queryClient.invalidateQueries({ queryKey: ["mail-account-gmail", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["backfill-status", user?.id] });
    }
  }, [oauthStatus, newAccountId, user?.id, queryClient]);

  const { mutate: startBackfill, isPending: isStartingBackfill } = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await supabase.functions.invoke("start-backfill", {
        body: { mail_account_id: accountId },
        ...(session ? { headers: { Authorization: `Bearer ${session.access_token}` } } : {}),
      });
      if (res.error) throw res.error;
      return res.data as { queued: number; total_estimate: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mail-account-gmail", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["backfill-status", user?.id] });
    },
  });

  const handleConnectGmail = () => {
    if (!user) return;
    if (!GOOGLE_CLIENT_ID) {
      console.error("VITE_GOOGLE_CLIENT_ID is not set");
      return;
    }
    window.location.href = buildGoogleOAuthUrl(user.id);
  };

  const backfillProgress = gmailAccount?.backfill_progress;
  const processed = backfillProgress?.processed ?? 0;
  const total = backfillProgress?.total ?? null;
  const backfillPct = total && total > 0 ? Math.round((processed / total) * 100) : 0;
  const isBackfillRunning = gmailAccount?.backfill_status === "running";
  const isBackfillDone = gmailAccount?.backfill_status === "done";

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <button
        onClick={() => navigate("/reglages")}
        className="flex items-center gap-1 text-sesame-text-muted font-body text-sm mb-6 hover:text-sesame-text transition-colors cursor-pointer bg-transparent border-none p-0"
      >
        Réglages
      </button>

      <h1 className="font-heading font-semibold text-2xl text-sesame-text mb-1">Connecter Gmail</h1>
      <p className="text-sesame-text-muted font-body text-sm mb-8">
        Sésame va surveiller ta boîte Gmail et créer des dossiers automatiquement pour chaque mail
        transactionnel.
      </p>

      {oauthStatus === "success" && (
        <div className="flex items-center gap-3 p-4 mb-6 rounded-lg border-2 border-sesame-text bg-sesame-positive/15">
          <Icon icon={CheckmarkCircle02Icon} size={20} color="#2A241F" aria-hidden />
          <p className="font-body text-sm text-sesame-text font-medium">
            Gmail connecté. Sésame est prêt.
          </p>
        </div>
      )}

      {oauthError && (
        <div className="flex items-start gap-3 p-4 mb-6 rounded-lg border-2 border-sesame-text bg-sesame-danger/15">
          <Icon icon={Alert02Icon} size={20} color="#2A241F" aria-hidden />
          <div>
            <p className="font-body text-sm text-sesame-text font-medium">Connexion échouée</p>
            <p className="font-body text-xs text-sesame-text-muted mt-0.5">
              {oauthError === "no_refresh_token"
                ? "Autorise à nouveau l'accès depuis Google pour obtenir un token de rafraîchissement."
                : decodeURIComponent(oauthError)}
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Icon
            icon={Loading03Icon}
            size={32}
            color="#7A7065"
            className="animate-spin"
            aria-label="Chargement"
          />
        </div>
      ) : gmailAccount ? (
        <div className="space-y-6">
          <div className="p-5 rounded-lg border-2 border-sesame-text bg-sesame-surface shadow-brutal">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-sesame-accent/15 border-2 border-sesame-text flex items-center justify-center shrink-0">
                  <span className="font-heading font-bold text-sm text-sesame-text">G</span>
                </div>
                <div>
                  <p className="font-body font-medium text-sm text-sesame-text">
                    {gmailAccount.email_address}
                  </p>
                  {gmailAccount.last_sync_at && (
                    <p className="font-body text-xs text-sesame-text-muted mt-0.5">
                      Dernière synchro{" "}
                      {new Intl.RelativeTimeFormat("fr", { numeric: "auto" }).format(
                        Math.round(
                          (new Date(gmailAccount.last_sync_at).getTime() - Date.now()) / 60000
                        ),
                        "minutes"
                      )}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Icon icon={CheckmarkCircle02Icon} size={16} color="#2A241F" aria-hidden />
                <span className="font-body text-xs text-sesame-text font-medium">Connecté</span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-lg border-2 border-sesame-text bg-sesame-surface shadow-brutal">
            <SectionTitle className="mb-4">Import des anciens mails</SectionTitle>

            {isBackfillRunning && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon
                      icon={Loading03Icon}
                      size={16}
                      color="#FF5C00"
                      className="animate-spin"
                      aria-hidden
                    />
                    <p className="font-body text-sm text-sesame-text">
                      Sésame fouille tes mails...
                    </p>
                  </div>
                  {total !== null && (
                    <span className="font-body text-xs text-sesame-text-muted">
                      {processed}/{total}
                    </span>
                  )}
                </div>
                <Progress value={backfillPct} aria-label="Progression de l'import" />
                <p className="font-body text-xs text-sesame-text-muted">
                  Tes dossiers apparaissent au fur et à mesure
                </p>
              </div>
            )}

            {isBackfillDone && (
              <div className="flex items-center gap-2">
                <Icon icon={CheckmarkCircle02Icon} size={16} color="#2A241F" aria-hidden />
                <p className="font-body text-sm text-sesame-text">
                  Import terminé{total !== null && ` — ${total} mails analysés`}
                </p>
              </div>
            )}

            {!isBackfillRunning && !isBackfillDone && (
              <div className="space-y-4">
                <p className="font-body text-sm text-sesame-text-muted">
                  Lance l'import pour récupérer tes commandes, réservations et abonnements des
                  derniers mois.
                </p>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => startBackfill(gmailAccount.id)}
                  disabled={isStartingBackfill}
                >
                  {isStartingBackfill ? (
                    <>
                      <Icon
                        icon={Loading03Icon}
                        size={16}
                        color="currentColor"
                        className="animate-spin"
                        aria-hidden
                      />
                      Lancement...
                    </>
                  ) : (
                    "Importer les anciens mails"
                  )}
                </Button>
              </div>
            )}
          </div>

          <button
            onClick={handleConnectGmail}
            className="font-body text-sm text-sesame-text-muted underline underline-offset-2 hover:text-sesame-text transition-colors cursor-pointer bg-transparent border-none p-0"
          >
            Reconnecter avec un autre compte
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="p-5 rounded-lg border-2 border-sesame-accent bg-sesame-surface shadow-brutal">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-sesame-accent/15 border-2 border-sesame-text flex items-center justify-center shrink-0">
                <span className="font-heading font-bold text-sm text-sesame-text">G</span>
              </div>
              <div>
                <p className="font-body font-semibold text-sm text-sesame-text">Gmail</p>
                <p className="font-body text-xs text-sesame-text-muted">
                  Via Google OAuth — accès lecture seule
                </p>
              </div>
            </div>
            <Button variant="primary" size="lg" className="w-full" onClick={handleConnectGmail}>
              Connecter Gmail
            </Button>
          </div>

          <div className="space-y-2 px-1">
            {[
              "Sésame ne lit que les mails transactionnels (commandes, billets, factures)",
              "Aucun mail n'est transmis à des tiers",
              "Tu peux déconnecter à tout moment",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2">
                <Icon icon={CheckmarkCircle02Icon} size={14} color="#7A7065" aria-hidden />
                <p className="font-body text-xs text-sesame-text-muted">{item}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
