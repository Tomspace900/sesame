import React, { useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import Loading03Icon from '@hugeicons/core-free-icons/Loading03Icon';
import { Icon } from '@/components/ui/Icon.tsx';
import { SectionTitle } from '@/components/ui/SectionTitle.tsx';
import { DossierCard, type DossierCardData } from '@/components/dossiers/DossierCard.tsx';
import { supabase } from '@/lib/supabase.ts';
import { useAuthStore } from '@/stores/authStore.ts';
import { useSearchStore } from '@/stores/searchStore.ts';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch.ts';
import { cn } from '@/lib/utils.ts';

export function RecherchePage(): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const { history, addToHistory } = useSearchStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const { search, debouncedSearch, handleSearchChange, setSearchImmediate, clearSearch } =
    useDebouncedSearch();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debouncedSearch.trim()) addToHistory(debouncedSearch.trim());
  }, [debouncedSearch, addToHistory]);

  const handleHistoryClick = (term: string) => {
    setSearchImmediate(term);
    inputRef.current?.focus();
  };

  const { data: results, isLoading } = useQuery<DossierCardData[]>({
    queryKey: ['recherche', user?.id, debouncedSearch],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');
      if (!debouncedSearch.trim()) return [];
      const s = debouncedSearch.trim();
      const { data, error } = await supabase
        .from('dossiers')
        .select(
          'id, dossier_type, title, status, amount, currency, started_at, merchants(canonical_name)',
        )
        .eq('user_id', user.id)
        .or(`title.ilike.%${s}%,reference.ilike.%${s}%`)
        .order('started_at', { ascending: false, nullsFirst: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as DossierCardData[];
    },
    enabled: !!user && debouncedSearch.trim().length > 0,
  });

  const hasSearch = search.trim().length > 0;
  const showHistory = !hasSearch && history.length > 0;
  const showResults = hasSearch && !!results && !isLoading;
  const showEmpty = hasSearch && results?.length === 0 && !isLoading;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="sticky top-0 z-10 bg-sesame-bg px-4 pt-4 pb-3 border-b border-sesame-surface-muted">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon icon={Search01Icon} size={18} color="#7A7065" aria-hidden />
          </span>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Que cherches-tu ?"
            className={cn(
              'w-full pl-10 pr-10 py-2.5',
              'bg-sesame-surface border-2 border-sesame-text rounded',
              'font-body text-sm text-sesame-text placeholder:text-sesame-text-muted',
              'focus:outline-none focus:border-sesame-accent',
              'focus-visible:outline-2 focus-visible:outline-sesame-accent focus-visible:outline-offset-2',
              'transition-colors',
            )}
          />
          {hasSearch && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
              aria-label="Effacer"
            >
              <Icon icon={Cancel01Icon} size={16} color="#7A7065" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-4">
        {showHistory && (
          <div>
            <SectionTitle>Recherches récentes</SectionTitle>
            <div className="bg-sesame-surface border-2 border-sesame-text rounded-lg overflow-hidden">
              {history.map((term) => (
                <button
                  key={term}
                  onClick={() => handleHistoryClick(term)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-sesame-surface-muted transition-colors border-b border-sesame-surface-muted last:border-0"
                >
                  <Icon icon={Search01Icon} size={14} color="#7A7065" aria-hidden />
                  <span className="font-body text-sm text-sesame-text">{term}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-12">
            <Icon
              icon={Loading03Icon}
              size={28}
              color="#7A7065"
              className="animate-spin"
              aria-label="Recherche en cours"
            />
          </div>
        )}

        {showResults && results.length > 0 && (
          <div>
            <SectionTitle>
              {results.length} résultat{results.length > 1 ? 's' : ''}
            </SectionTitle>
            <div className="bg-sesame-surface border-2 border-sesame-text rounded-lg overflow-hidden">
              {results.map((d) => (
                <DossierCard key={d.id} dossier={d} variant="compact" className="px-4" />
              ))}
            </div>
          </div>
        )}

        {showEmpty && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Icon icon={Search01Icon} size={40} color="#7A7065" aria-hidden />
            <p className="font-heading font-semibold text-lg text-sesame-text">
              Aucun dossier trouvé
            </p>
            <p className="font-body text-sm text-sesame-text-muted max-w-xs">
              Essaie avec un nom de marchand ou de produit.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
