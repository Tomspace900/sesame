import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore.ts';
import { supabase } from '@/lib/supabase.ts';

type ProtectedRouteProps = {
  children: React.ReactNode;
};

export function ProtectedRoute({
  children,
}: ProtectedRouteProps): React.JSX.Element {
  const session = useAuthStore((s) => s.session);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const isOnboarding = location.pathname === '/bienvenue';

  const { data: mailAccountCount, isLoading: mailCountLoading } = useQuery<number>({
    queryKey: ['mail-accounts-count', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { count } = await supabase
        .from('mail_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      return count ?? 0;
    },
    enabled: !!user,
  });

  if (isLoading || (!isOnboarding && !!user && mailCountLoading)) {
    return (
      <div className="min-h-svh bg-sesame-bg flex items-center justify-center">
        <p className="font-heading text-sesame-text-muted">Chargement...</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth/connexion" replace />;
  }

  if (!isOnboarding && mailAccountCount === 0) {
    return <Navigate to="/bienvenue" replace />;
  }

  return <>{children}</>;
}
