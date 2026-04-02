import type { DossierCardData } from "@/components/dossiers/DossierCard.tsx";
import { useDebouncedSearch } from "@/hooks/useDebouncedSearch.ts";
import { supabase } from "@/lib/supabase.ts";
import { useAuthStore } from "@/stores/authStore.ts";
import { DOSSIER_STATUSES, type DossierStatus, type DossierType } from "@sesame/shared/types";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { groupByMonth } from "./DossiersPage.utils.ts";

const PAGE_SIZE = 20;

export type FilterType = DossierType | "all";
export type FilterStatus = DossierStatus | "all";

const VALID_STATUSES: FilterStatus[] = ["all", ...(DOSSIER_STATUSES as readonly DossierStatus[])];

export function useDossierList() {
  const user = useAuthStore((s) => s.user);
  const [searchParams] = useSearchParams();
  const rawStatus = searchParams.get("status");
  const initialStatus: FilterStatus = VALID_STATUSES.includes(rawStatus as FilterStatus)
    ? (rawStatus as FilterStatus)
    : "all";

  const {
    search,
    debouncedSearch,
    handleSearchChange: baseHandleSearch,
    clearSearch,
  } = useDebouncedSearch();
  const [typeFilter, setTypeFilterState] = useState<FilterType>("all");
  const [statusFilter, setStatusFilterState] = useState<FilterStatus>(initialStatus);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const handleSearchChange = useCallback(
    (value: string) => {
      baseHandleSearch(value);
      setPage(1);
    },
    [baseHandleSearch]
  );

  const setTypeFilter = useCallback((v: FilterType) => {
    setTypeFilterState(v);
    setPage(1);
  }, []);

  const setStatusFilter = useCallback((v: FilterStatus) => {
    setStatusFilterState(v);
    setPage(1);
  }, []);

  const clearAllFilters = useCallback(() => {
    setTypeFilterState("all");
    setStatusFilterState("all");
    clearSearch();
    setPage(1);
  }, [clearSearch]);

  const hasActiveFilters =
    typeFilter !== "all" || statusFilter !== "all" || debouncedSearch.trim() !== "";

  const { data, isLoading, isFetching } = useQuery<{ items: DossierCardData[]; hasMore: boolean }>({
    queryKey: ["dossiers", "list", user?.id, debouncedSearch, typeFilter, statusFilter, page],
    queryFn: async () => {
      if (!user) throw new Error("Not authenticated");
      let q = supabase
        .from("dossiers")
        .select(
          "id, dossier_type, title, status, amount, currency, started_at, merchants(canonical_name)"
        )
        .eq("user_id", user.id)
        .order("started_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(0, page * PAGE_SIZE - 1);

      if (typeFilter !== "all") q = q.eq("dossier_type", typeFilter);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (debouncedSearch.trim()) {
        const s = debouncedSearch.trim();
        q = q.or(`title.ilike.%${s}%,reference.ilike.%${s}%`);
      }

      const { data: rows, error } = await q;
      if (error) throw error;
      const items = (rows ?? []) as unknown as DossierCardData[];
      return { items, hasMore: items.length === page * PAGE_SIZE };
    },
    enabled: !!user,
  });

  const groups = data ? groupByMonth(data.items) : [];

  return {
    search,
    debouncedSearch,
    handleSearchChange,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    showFilters,
    setShowFilters,
    page,
    setPage,
    clearAllFilters,
    hasActiveFilters,
    data,
    isLoading,
    isFetching,
    groups,
  };
}
