import { ActionsMenu, DeleteDialog } from "@/components/dossiers/DossierActions.tsx";
import {
  AccommodationSections,
  CommonInfoSection,
  PurchaseSections,
  ReservationSections,
  SubscriptionSections,
  TripSections,
  type DossierDetail,
} from "@/components/dossiers/DossierSections.tsx";
import { Timeline, type TimelineEvent } from "@/components/dossiers/Timeline.tsx";
import { Icon, type IconSvgElement } from "@/components/ui/Icon.tsx";
import { SectionTitle } from "@/components/ui/SectionTitle.tsx";
import { StatusBadge } from "@/components/ui/StatusBadge.tsx";
import { formatAmount } from "@/lib/format.ts";
import { supabase } from "@/lib/supabase.ts";
import { useAuthStore } from "@/stores/authStore.ts";
import Airplane01Icon from "@hugeicons/core-free-icons/Airplane01Icon";
import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import CalendarAdd01Icon from "@hugeicons/core-free-icons/CalendarAdd01Icon";
import DeliveryBox01Icon from "@hugeicons/core-free-icons/DeliveryBox01Icon";
import Home04Icon from "@hugeicons/core-free-icons/Home04Icon";
import Loading03Icon from "@hugeicons/core-free-icons/Loading03Icon";
import Wifi01Icon from "@hugeicons/core-free-icons/Wifi01Icon";
import type { DossierStatus } from "@sesame/shared/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

const TYPE_ICONS: Record<DossierDetail["dossier_type"], IconSvgElement> = {
  purchase: DeliveryBox01Icon,
  travel: Airplane01Icon,
  accommodation: Home04Icon,
  subscription: Wifi01Icon,
  booking: CalendarAdd01Icon,
  other: DeliveryBox01Icon,
};

export function DossierDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: dossier, isLoading } = useQuery<DossierDetail>({
    queryKey: ["dossier", id],
    queryFn: async () => {
      if (!id) throw new Error("Missing id");
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("dossiers")
        .select("*, merchants(canonical_name)")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      return data as DossierDetail;
    },
    enabled: !!id && !!user,
  });

  const { data: events = [] } = useQuery<TimelineEvent[]>({
    queryKey: ["dossier_events", id],
    queryFn: async () => {
      if (!id) throw new Error("Missing id");
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("dossier_events")
        .select(
          "id, event_type, human_summary, extracted_data, extraction_confidence, created_at, email_id"
        )
        .eq("dossier_id", id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TimelineEvent[];
    },
    enabled: !!id && !!user,
  });

  const updateStatus = useMutation({
    mutationFn: async (status: DossierStatus) => {
      if (!id) throw new Error("Missing id");
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("dossiers")
        .update({ status })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dossier", id] });
      void queryClient.invalidateQueries({ queryKey: ["dossiers"] });
    },
  });

  const deleteDossier = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing id");
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("dossiers")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dossiers"] });
      navigate("/dossiers");
      toast.success("Dossier supprimé");
    },
    onError: () => toast.error("Impossible de supprimer ce dossier"),
  });

  if (isLoading || !dossier) {
    return (
      <div className="flex justify-center items-center py-24">
        <Icon
          icon={Loading03Icon}
          size={32}
          color="#7A7065"
          className="animate-spin"
          aria-label="Chargement"
        />
      </div>
    );
  }

  const typeIcon = TYPE_ICONS[dossier.dossier_type] ?? DeliveryBox01Icon;
  const merchant = dossier.merchants?.canonical_name;
  const formattedAmount = formatAmount(dossier.amount, dossier.currency);

  return (
    <>
      <div className="max-w-2xl mx-auto pb-16">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 sticky top-0 z-10 bg-sesame-bg border-b border-sesame-surface-muted">
          <button
            onClick={() => navigate(-1)}
            className="btn-brutal w-10 h-10 flex items-center justify-center rounded border-2 border-sesame-text bg-sesame-surface cursor-pointer"
            aria-label="Retour"
          >
            <Icon icon={ArrowLeft01Icon} size={20} color="#2A241F" aria-hidden />
          </button>
          <ActionsMenu
            onDelete={() => setDeleteOpen(true)}
            onMarkReturned={() => updateStatus.mutate("returned")}
            onMarkCancelled={() => updateStatus.mutate("cancelled")}
          />
        </div>

        {/* En-tête produit */}
        <div className="px-4 pt-5 pb-4 border-b border-sesame-surface-muted">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-16 h-16 rounded-lg bg-sesame-surface-muted border border-sesame-text/20 flex items-center justify-center">
              {dossier.image_url ? (
                <img
                  src={dossier.image_url}
                  alt=""
                  className="w-full h-full object-cover rounded-lg"
                />
              ) : (
                <Icon icon={typeIcon} size={28} color="#2A241F" strokeWidth={1.5} aria-hidden />
              )}
            </div>
            <div className="flex-1 min-w-0">
              {merchant && (
                <p className="font-body text-sm text-sesame-text-muted mb-0.5">{merchant}</p>
              )}
              <h1 className="font-heading font-bold text-xl text-sesame-text leading-tight">
                {dossier.title ?? "(sans titre)"}
              </h1>
              {formattedAmount && (
                <p className="font-heading font-semibold text-lg text-sesame-text mt-1">
                  {formattedAmount}
                </p>
              )}
              <div className="mt-2">
                <StatusBadge status={dossier.status} dossierType={dossier.dossier_type} />
              </div>
            </div>
          </div>
        </div>

        {/* Sections */}
        <div className="px-4 space-y-8 pt-6">
          <CommonInfoSection dossier={dossier} />

          {dossier.dossier_type === "purchase" && <PurchaseSections dossier={dossier} />}
          {dossier.dossier_type === "travel" && <TripSections dossier={dossier} />}
          {dossier.dossier_type === "accommodation" && <AccommodationSections dossier={dossier} />}
          {dossier.dossier_type === "subscription" && <SubscriptionSections dossier={dossier} />}
          {dossier.dossier_type === "booking" && <ReservationSections dossier={dossier} />}

          <section>
            <SectionTitle>Historique</SectionTitle>
            <Timeline events={events} />
          </section>
        </div>
      </div>

      <DeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          deleteDossier.mutate();
        }}
      />
    </>
  );
}
