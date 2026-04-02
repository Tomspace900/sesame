import { Icon } from "@/components/ui/Icon.tsx";
import { StatusBadge } from "@/components/ui/StatusBadge.tsx";
import { useDebouncedSearch } from "@/hooks/useDebouncedSearch.ts";
import { formatAmount, formatDate } from "@/lib/format.ts";
import { supabase } from "@/lib/supabase.ts";
import { cn } from "@/lib/utils.ts";
import { useAuthStore } from "@/stores/authStore.ts";
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import Loading03Icon from "@hugeicons/core-free-icons/Loading03Icon";
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon";
import * as Dialog from "@radix-ui/react-dialog";
import type { DossierStatus, DossierType } from "@sesame/shared/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { toast } from "sonner";

type Candidate = {
  id: string;
  title: string | null;
  dossier_type: DossierType;
  status: DossierStatus;
  amount: number | null;
  currency: string | null;
  started_at: string | null;
  merchants: { canonical_name: string } | null;
};

export type ManualLinkModalProps = {
  open: boolean;
  onClose: () => void;
  eventId: string;
  eventSummary: string | null;
  dossierId: string;
};

export function ManualLinkModal({
  open,
  onClose,
  eventId,
  eventSummary,
  dossierId,
}: ManualLinkModalProps): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>(dossierId);

  const { search, debouncedSearch, handleSearchChange } = useDebouncedSearch();

  const { data: candidates = [], isLoading } = useQuery<Candidate[]>({
    queryKey: ["manual-link-candidates", user?.id, dossierId, debouncedSearch],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      let q = supabase
        .from("dossiers")
        .select(
          "id, title, dossier_type, status, amount, currency, started_at, merchants(canonical_name)"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (debouncedSearch.trim()) {
        q = q.or(
          `title.ilike.%${debouncedSearch.trim()}%,reference.ilike.%${debouncedSearch.trim()}%`
        );
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Candidate[];
    },
    enabled: !!user && open,
  });

  const linkMutation = useMutation({
    mutationFn: async () => {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Non authentifié");

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manual-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ event_id: eventId, dossier_id: selectedId }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? "Erreur inconnue");
      return json;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dossier", dossierId] });
      void queryClient.invalidateQueries({ queryKey: ["dossier_events", dossierId] });
      void queryClient.invalidateQueries({ queryKey: ["dossiers"] });
      toast.success("Dossier lié");
      onClose();
    },
    onError: (err) => {
      toast.error(`Impossible de lier : ${(err as Error).message}`);
    },
  });

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-sesame-text/40" />
        <Dialog.Content
          className={cn(
            "fixed z-50 bg-sesame-surface border-2 border-sesame-text rounded-xl shadow-brutal",
            "bottom-0 left-0 right-0 sm:bottom-auto sm:top-1/2 sm:left-1/2",
            "sm:-translate-x-1/2 sm:-translate-y-1/2",
            "w-full sm:max-w-md",
            "max-h-[85vh] flex flex-col"
          )}
        >
          <div className="flex items-center justify-between p-5 border-b border-sesame-surface-muted">
            <Dialog.Title className="font-heading font-bold text-xl text-sesame-text">
              Lier cet email à un dossier
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="cursor-pointer" aria-label="Fermer">
                <Icon icon={Cancel01Icon} size={20} color="#7A7065" aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          {eventSummary && (
            <div className="px-5 pt-4 pb-2">
              <p className="font-body text-sm text-sesame-text-muted italic">{eventSummary}</p>
            </div>
          )}

          <div className="px-5 pb-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <Icon icon={Search01Icon} size={16} color="#7A7065" aria-hidden />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Chercher un autre dossier..."
                className={cn(
                  "w-full pl-9 pr-4 py-2",
                  "bg-sesame-bg border border-sesame-text/30 rounded",
                  "font-body text-sm text-sesame-text placeholder:text-sesame-text-muted",
                  "focus:outline-none focus:border-sesame-accent transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-sesame-accent focus-visible:outline-offset-2"
                )}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-2 min-h-0">
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Icon
                  icon={Loading03Icon}
                  size={24}
                  color="#7A7065"
                  className="animate-spin"
                  aria-label="Chargement"
                />
              </div>
            ) : candidates.length === 0 ? (
              <p className="font-body text-sm text-sesame-text-muted py-4 text-center">
                Aucun dossier trouvé.
              </p>
            ) : (
              candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border-2 cursor-pointer transition-colors",
                    selectedId === c.id
                      ? "border-sesame-accent bg-sesame-accent/5"
                      : "border-sesame-text/20 bg-sesame-surface hover:border-sesame-text/40"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-body font-medium text-sm text-sesame-text truncate">
                        {c.title ?? "(sans titre)"}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {c.merchants?.canonical_name && (
                          <span className="font-body text-xs text-sesame-text-muted">
                            {c.merchants.canonical_name}
                          </span>
                        )}
                        {formatDate(c.started_at) && (
                          <span className="font-body text-xs text-sesame-text-muted">
                            {formatDate(c.started_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {formatAmount(c.amount, c.currency) && (
                        <span className="font-heading font-semibold text-sm text-sesame-text">
                          {formatAmount(c.amount, c.currency)}
                        </span>
                      )}
                      <StatusBadge status={c.status} dossierType={c.dossier_type} />
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="flex gap-3 p-5 border-t border-sesame-surface-muted">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 font-body font-medium text-sm text-sesame-text bg-transparent border-none cursor-pointer rounded hover:bg-sesame-surface-muted transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={() => linkMutation.mutate()}
              disabled={!selectedId || linkMutation.isPending}
              className={cn(
                "flex-1 py-2.5 font-body font-medium text-sm",
                "bg-sesame-accent text-sesame-surface border-2 border-sesame-text rounded shadow-brutal-sm",
                "cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {linkMutation.isPending ? "En cours..." : "Confirmer"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
