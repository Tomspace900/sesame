import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase.ts';
import { useAuthStore } from '@/stores/authStore.ts';

export function BackfillBanner(): React.JSX.Element | null {
  const user = useAuthStore((s) => s.user);

  const { data: runningAccount } = useQuery({
    queryKey: ['backfill-status', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { data } = await supabase
        .from('mail_accounts')
        .select('id, email_address, backfill_status, backfill_progress')
        .eq('user_id', user.id)
        .eq('backfill_status', 'running')
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    refetchInterval: 5000, // Poll every 5s while banner is visible
  });

  if (!runningAccount) return null;

  const progress = runningAccount.backfill_progress as { processed: number; total: number | null } | null;
  const processed = progress?.processed ?? 0;
  const total = progress?.total ?? null;
  const pct = total && total > 0 ? Math.round((processed / total) * 100) : null;

  return (
    <div
      className="relative h-[3px] w-full overflow-hidden bg-sesame-surface-muted"
      role="status"
      aria-label="Import des mails en cours"
    >
      {pct !== null ? (
        <div
          className="absolute inset-y-0 left-0 bg-sesame-accent transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      ) : (
        /* Indeterminate shimmer animation */
        <div className="absolute inset-0 bg-sesame-accent backfill-shimmer" />
      )}
    </div>
  );
}
