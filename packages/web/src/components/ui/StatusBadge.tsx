import { Icon, type IconSvgElement } from "@/components/ui/Icon.tsx";
import { cn } from "@/lib/utils.ts";
import CancelCircleIcon from "@hugeicons/core-free-icons/CancelCircleIcon";
import HelpCircleIcon from "@hugeicons/core-free-icons/HelpCircleIcon";
import PackageDelivered01Icon from "@hugeicons/core-free-icons/PackageDelivered01Icon";
import ShoppingCart01Icon from "@hugeicons/core-free-icons/ShoppingCart01Icon";
import TruckDeliveryIcon from "@hugeicons/core-free-icons/TruckDeliveryIcon";
import UndoIcon from "@hugeicons/core-free-icons/UndoIcon";
import type { DossierStatus, DossierType } from "@sesame/shared/types";
import React from "react";

type StatusConfig = {
  bgClass: string;
  textClass: string;
  icon: IconSvgElement;
  iconColor: string;
  defaultLabel: string;
};

const STATUS_CONFIGS: Record<DossierStatus, StatusConfig> = {
  detected: {
    bgClass: "bg-sesame-surface-muted",
    textClass: "text-sesame-text-muted",
    icon: HelpCircleIcon,
    iconColor: "#7A7065",
    defaultLabel: "Détecté",
  },
  confirmed: {
    bgClass: "bg-sesame-transit/15",
    textClass: "text-sesame-text",
    icon: ShoppingCart01Icon,
    iconColor: "#2A241F",
    defaultLabel: "Confirmé",
  },
  in_progress: {
    bgClass: "bg-sesame-accent/15",
    textClass: "text-sesame-text",
    icon: TruckDeliveryIcon,
    iconColor: "#2A241F",
    defaultLabel: "En cours",
  },
  completed: {
    bgClass: "bg-sesame-positive/15",
    textClass: "text-sesame-text",
    icon: PackageDelivered01Icon,
    iconColor: "#2A241F",
    defaultLabel: "Terminé",
  },
  returned: {
    bgClass: "bg-sesame-transit/15",
    textClass: "text-sesame-text",
    icon: UndoIcon,
    iconColor: "#2A241F",
    defaultLabel: "Retourné",
  },
  cancelled: {
    bgClass: "bg-sesame-surface-muted",
    textClass: "text-sesame-text-muted",
    icon: CancelCircleIcon,
    iconColor: "#7A7065",
    defaultLabel: "Annulé",
  },
};

// Labels adaptatifs par dossier_type
const TYPE_LABELS: Partial<Record<DossierType, Partial<Record<DossierStatus, string>>>> = {
  purchase: {
    confirmed: "Commandé",
    in_progress: "En route",
    completed: "Livré",
  },
  travel: {
    confirmed: "Réservé",
    in_progress: "Check-in",
    completed: "Terminé",
  },
  accommodation: {
    confirmed: "Réservé",
    in_progress: "En cours",
    completed: "Terminé",
  },
  subscription: {
    confirmed: "Actif",
  },
  booking: {
    confirmed: "Réservé",
    completed: "Terminé",
  },
};

export type StatusBadgeProps = {
  status: DossierStatus;
  dossierType?: DossierType;
  className?: string;
};

export function StatusBadge({
  status,
  dossierType,
  className,
}: StatusBadgeProps): React.JSX.Element {
  const config = STATUS_CONFIGS[status] ?? STATUS_CONFIGS.detected;
  const label = (dossierType && TYPE_LABELS[dossierType]?.[status]) ?? config.defaultLabel;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-3 py-1 rounded-pill font-body text-xs font-medium select-none",
        config.bgClass,
        config.textClass,
        className
      )}
      aria-label={`Statut : ${label}`}
    >
      <Icon icon={config.icon} size={14} color={config.iconColor} aria-hidden />
      {label}
    </span>
  );
}
