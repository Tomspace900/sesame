import { DossierCard } from "@/components/dossiers/DossierCard.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Icon } from "@/components/ui/Icon.tsx";
import { SectionTitle } from "@/components/ui/SectionTitle.tsx";
import { TextLink } from "@/components/ui/TextLink.tsx";
import { cn } from "@/lib/utils.ts";
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import DeliveryBox01Icon from "@hugeicons/core-free-icons/DeliveryBox01Icon";
import FilterHorizontalIcon from "@hugeicons/core-free-icons/FilterHorizontalIcon";
import Loading03Icon from "@hugeicons/core-free-icons/Loading03Icon";
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon";
import React from "react";
import { useNavigate } from "react-router-dom";
import { useDossierList, type FilterStatus, type FilterType } from "./DossiersPage.hooks.ts";

const TYPE_FILTER_LABELS: { value: FilterType; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "purchase", label: "Achats" },
  { value: "travel", label: "Voyages" },
  { value: "accommodation", label: "Hébergements" },
  { value: "subscription", label: "Abonnements" },
  { value: "booking", label: "Réservations" },
  { value: "other", label: "Autres" },
];

const STATUS_FILTER_LABELS: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "Tous statuts" },
  { value: "detected", label: "Détecté" },
  { value: "confirmed", label: "Confirmé" },
  { value: "in_progress", label: "En cours" },
  { value: "completed", label: "Terminé" },
  { value: "cancelled", label: "Annulé" },
  { value: "returned", label: "Retourné" },
];

export function DossiersPage(): React.JSX.Element {
  const navigate = useNavigate();
  const {
    search,
    handleSearchChange,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    showFilters,
    setShowFilters,
    setPage,
    clearAllFilters,
    hasActiveFilters,
    data,
    isLoading,
    isFetching,
    groups,
  } = useDossierList();

  return (
    <div className="max-w-2xl mx-auto">
      {/* Barre sticky */}
      <div className="sticky top-0 z-10 bg-sesame-bg pt-4 pb-3 px-4 space-y-2 border-b border-sesame-surface-muted">
        {/* Search input */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon icon={Search01Icon} size={18} color="#7A7065" aria-hidden />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Rechercher un dossier..."
            className={cn(
              "w-full pl-10 pr-10 py-2.5",
              "bg-sesame-surface border-2 border-sesame-text rounded",
              "font-body text-sm text-sesame-text placeholder:text-sesame-text-muted",
              "focus:outline-none focus:border-sesame-accent",
              "focus-visible:outline-2 focus-visible:outline-sesame-accent focus-visible:outline-offset-2",
              "transition-colors"
            )}
          />
          {search && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
              aria-label="Effacer la recherche"
            >
              <Icon icon={Cancel01Icon} size={16} color="#7A7065" aria-hidden />
            </button>
          )}
        </div>

        {/* Filtres toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-body text-xs font-medium",
              "border border-sesame-text/30 transition-colors cursor-pointer",
              showFilters
                ? "bg-sesame-text text-sesame-surface"
                : "bg-sesame-surface text-sesame-text hover:bg-sesame-surface-muted"
            )}
          >
            <Icon
              icon={FilterHorizontalIcon}
              size={14}
              color={showFilters ? "#FCFAF5" : "#2A241F"}
              aria-hidden
            />
            Filtres
          </button>

          {typeFilter !== "all" && (
            <FilterChip
              label={TYPE_FILTER_LABELS.find((t) => t.value === typeFilter)?.label ?? typeFilter}
              onRemove={() => setTypeFilter("all")}
            />
          )}
          {statusFilter !== "all" && (
            <FilterChip
              label={
                STATUS_FILTER_LABELS.find((s) => s.value === statusFilter)?.label ?? statusFilter
              }
              onRemove={() => setStatusFilter("all")}
            />
          )}
        </div>

        {/* Panneau filtres */}
        {showFilters && (
          <div className="space-y-3 pt-1">
            <div>
              <p className="font-body text-xs text-sesame-text-muted mb-1.5">Type</p>
              <div className="flex flex-wrap gap-1.5">
                {TYPE_FILTER_LABELS.map(({ value, label }) => (
                  <FilterButton
                    key={value}
                    label={label}
                    active={typeFilter === value}
                    onClick={() => setTypeFilter(value)}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="font-body text-xs text-sesame-text-muted mb-1.5">Statut</p>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_FILTER_LABELS.map(({ value, label }) => (
                  <FilterButton
                    key={value}
                    label={label}
                    active={statusFilter === value}
                    onClick={() => setStatusFilter(value as FilterStatus)}
                  />
                ))}
              </div>
            </div>
            {hasActiveFilters && (
              <TextLink className="text-xs" onClick={clearAllFilters}>
                Réinitialiser les filtres
              </TextLink>
            )}
          </div>
        )}
      </div>

      {/* Contenu */}
      <div className="px-4 py-5">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Icon
              icon={Loading03Icon}
              size={32}
              color="#7A7065"
              className="animate-spin"
              aria-label="Chargement"
            />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <Icon
              icon={DeliveryBox01Icon}
              size={48}
              color="#7A7065"
              strokeWidth={1.5}
              aria-hidden
            />
            {hasActiveFilters ? (
              <>
                <h2 className="font-heading font-semibold text-xl text-sesame-text">
                  Aucun résultat
                </h2>
                <p className="text-sesame-text-muted font-body text-sm max-w-xs">
                  Essaie avec un nom de marchand ou de produit.
                </p>
              </>
            ) : (
              <>
                <h2 className="font-heading font-semibold text-xl text-sesame-text">
                  Ton coffre est vide
                </h2>
                <p className="text-sesame-text-muted font-body text-sm max-w-xs">
                  Lance l'import depuis Réglages pour importer tes mails.
                </p>
                <TextLink onClick={() => navigate("/reglages")} className="text-sesame-text">
                  Aller aux réglages
                </TextLink>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(({ key, label, items }) => (
              <div key={key}>
                <SectionTitle className="capitalize">{label}</SectionTitle>
                <div className="space-y-3">
                  {items.map((d) => (
                    <DossierCard key={d.id} dossier={d} />
                  ))}
                </div>
              </div>
            ))}

            {data?.hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="secondary"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={isFetching}
                >
                  {isFetching ? "Chargement..." : "Charger plus"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-pill bg-sesame-text text-sesame-surface font-body text-xs font-medium">
      {label}
      <button
        onClick={onRemove}
        className="cursor-pointer"
        aria-label={`Retirer le filtre ${label}`}
      >
        <Icon icon={Cancel01Icon} size={12} color="#FCFAF5" aria-hidden />
      </button>
    </span>
  );
}

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1 rounded-pill font-body text-xs font-medium border cursor-pointer transition-colors",
        active
          ? "bg-sesame-text text-sesame-surface border-sesame-text"
          : "bg-sesame-surface text-sesame-text border-sesame-text/30 hover:border-sesame-text"
      )}
    >
      {label}
    </button>
  );
}
