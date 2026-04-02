import { Icon, type IconSvgElement } from "@/components/ui/Icon.tsx";
import { StatusBadge } from "@/components/ui/StatusBadge.tsx";
import { formatAmount, formatDate } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import Airplane01Icon from "@hugeicons/core-free-icons/Airplane01Icon";
import CalendarAdd01Icon from "@hugeicons/core-free-icons/CalendarAdd01Icon";
import DeliveryBox01Icon from "@hugeicons/core-free-icons/DeliveryBox01Icon";
import Home04Icon from "@hugeicons/core-free-icons/Home04Icon";
import Wifi01Icon from "@hugeicons/core-free-icons/Wifi01Icon";
import type { DossierStatus, DossierType } from "@sesame/shared/types";
import React from "react";
import { useNavigate } from "react-router-dom";

export type DossierCardData = {
  id: string;
  dossier_type: DossierType;
  title: string | null;
  status: DossierStatus;
  amount: number | null;
  currency: string | null;
  started_at: string | null;
  merchants: { canonical_name: string } | null;
};

const TYPE_ICONS: Record<DossierType, IconSvgElement> = {
  purchase: DeliveryBox01Icon,
  travel: Airplane01Icon,
  accommodation: Home04Icon,
  subscription: Wifi01Icon,
  booking: CalendarAdd01Icon,
  other: DeliveryBox01Icon,
};

export type DossierCardProps = {
  dossier: DossierCardData;
  variant?: "standard" | "compact";
  onClick?: () => void;
  className?: string;
};

export function DossierCard({
  dossier,
  variant = "standard",
  onClick,
  className,
}: DossierCardProps): React.JSX.Element {
  const navigate = useNavigate();
  const handleClick = onClick ?? (() => navigate(`/dossiers/${dossier.id}`));
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  const typeIcon = TYPE_ICONS[dossier.dossier_type] ?? DeliveryBox01Icon;
  const merchant = dossier.merchants?.canonical_name;
  const formattedAmount = formatAmount(dossier.amount, dossier.currency);
  const formattedDate = formatDate(dossier.started_at);

  if (variant === "compact") {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex items-center gap-2 py-3 px-1 cursor-pointer",
          "border-b border-sesame-surface-muted",
          "transition-colors hover:bg-sesame-surface-muted/40",
          "focus-visible:outline-2 focus-visible:outline-sesame-accent focus-visible:outline-offset-2",
          className
        )}
      >
        {/* Titre — truncate, prend tout l'espace */}
        <p className="font-body font-medium text-sm text-sesame-text truncate flex-1 min-w-0">
          {dossier.title ?? "(sans titre)"}
        </p>
        {/* Source — masqué sur mobile si peu de place */}
        {merchant && (
          <span className="font-body text-xs text-sesame-text-muted shrink-0 hidden sm:inline truncate max-w-[80px]">
            {merchant}
          </span>
        )}
        {/* Montant */}
        {formattedAmount && (
          <span className="font-heading font-semibold text-sm text-sesame-text shrink-0">
            {formattedAmount}
          </span>
        )}
        {/* Statut */}
        <StatusBadge
          status={dossier.status}
          dossierType={dossier.dossier_type}
          className="shrink-0"
        />
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "card-brutal",
        "bg-sesame-surface border-2 border-sesame-text rounded-lg p-4 cursor-pointer",
        "focus-visible:outline-2 focus-visible:outline-sesame-accent focus-visible:outline-offset-2",
        className
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icône de type */}
        <div className="shrink-0 w-11 h-11 rounded bg-sesame-surface-muted border border-sesame-text/20 flex items-center justify-center">
          <Icon icon={typeIcon} size={22} color="#2A241F" strokeWidth={1.5} aria-hidden />
        </div>

        {/* Contenu principal */}
        <div className="min-w-0 flex-1">
          {merchant && (
            <p className="font-body text-xs text-sesame-text-muted mb-0.5 truncate">{merchant}</p>
          )}
          <p className="font-body font-medium text-sm text-sesame-text leading-snug truncate">
            {dossier.title ?? "(sans titre)"}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <StatusBadge status={dossier.status} dossierType={dossier.dossier_type} />
            {formattedDate && (
              <span className="font-body text-xs text-sesame-text-muted">{formattedDate}</span>
            )}
          </div>
        </div>

        {/* Montant */}
        {formattedAmount && (
          <div className="shrink-0">
            <span className="font-heading font-semibold text-base text-sesame-text">
              {formattedAmount}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
