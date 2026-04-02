import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils.ts';
import DeliveryBox01Icon from '@hugeicons/core-free-icons/DeliveryBox01Icon';
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import Loading03Icon from '@hugeicons/core-free-icons/Loading03Icon';
import { Icon } from '@/components/ui/Icon.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { SectionTitle } from '@/components/ui/SectionTitle.tsx';
import { DossierCard, type DossierCardData } from '@/components/dossiers/DossierCard.tsx';
import { supabase } from '@/lib/supabase.ts';
import { useAuthStore } from '@/stores/authStore.ts';
import {
  buildAlerts,
  type DossierWithDeadline,
  type AlertData,
} from './DashboardPage.utils.ts';

export function DashboardPage(): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const firstName =
    (user?.user_metadata?.['display_name'] as string | undefined) ??
    user?.email?.split('@')[0] ??
    'toi';

  const { data: inProgressDossiers, isLoading: loadingInProgress } = useQuery<DossierCardData[]>({
    queryKey: ['dossiers', 'in_progress', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('dossiers')
        .select(
          'id, dossier_type, title, status, amount, currency, started_at, merchants(canonical_name)',
        )
        .eq('user_id', user.id)
        .in('status', ['confirmed', 'in_progress'])
        .order('started_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as unknown as DossierCardData[];
    },
    enabled: !!user,
  });

  const { data: recentDossiers, isLoading: loadingRecent } = useQuery<DossierCardData[]>({
    queryKey: ['dossiers', 'recent', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('dossiers')
        .select(
          'id, dossier_type, title, status, amount, currency, started_at, merchants(canonical_name)',
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as unknown as DossierCardData[];
    },
    enabled: !!user,
  });

  const { data: deadlineDossiers } = useQuery<DossierWithDeadline[]>({
    queryKey: ['dossiers', 'deadlines', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const now = new Date().toISOString();
      const limit = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('dossiers')
        .select(
          'id, dossier_type, title, status, amount, currency, started_at, merchants(canonical_name), return_deadline, warranty_deadline, next_renewal_at',
        )
        .eq('user_id', user.id)
        .or(`return_deadline.gte.${now},warranty_deadline.gte.${now},next_renewal_at.gte.${now}`)
        .or(
          `return_deadline.lte.${limit},warranty_deadline.lte.${limit},next_renewal_at.lte.${limit}`,
        );
      if (error) throw error;
      return (data ?? []) as unknown as DossierWithDeadline[];
    },
    enabled: !!user,
  });

  const allAlerts = deadlineDossiers ? buildAlerts(deadlineDossiers) : [];
  const alerts = allAlerts.filter(
    (a) => !dismissedAlerts.has(`${a.dossier.id}-${a.deadline.getTime()}`),
  );
  const isLoading = loadingInProgress || loadingRecent;
  const hasAnyDossier =
    (inProgressDossiers && inProgressDossiers.length > 0) ||
    (recentDossiers && recentDossiers.length > 0);

  if (isLoading) {
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

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-8">
      <h1 className="font-heading font-semibold text-2xl text-sesame-text">
        Bonjour, {firstName}
      </h1>

      {!hasAnyDossier && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <Icon icon={DeliveryBox01Icon} size={48} color="#7A7065" strokeWidth={1.5} aria-hidden />
          <h2 className="font-heading font-semibold text-xl text-sesame-text">
            Ton coffre est vide
          </h2>
          <p className="text-sesame-text-muted font-body text-sm max-w-xs">
            Connecte ta boîte mail pour réveiller Sésame.
          </p>
          <Button variant="primary" onClick={() => navigate('/reglages')}>
            Connecter ma boîte mail
          </Button>
        </div>
      )}

      {alerts.length > 0 && (
        <section>
          <SectionTitle>Alertes</SectionTitle>
          <div className="space-y-2">
            {alerts.map((alert) => {
              const alertKey = `${alert.dossier.id}-${alert.deadline.getTime()}`;
              return (
                <AlertCard
                  key={alertKey}
                  alert={alert}
                  onNavigate={() => navigate(`/dossiers/${alert.dossier.id}`)}
                  onDismiss={() =>
                    setDismissedAlerts((prev) => new Set([...prev, alertKey]))
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      {inProgressDossiers && inProgressDossiers.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle className="mb-0">En cours</SectionTitle>
            <button
              onClick={() => navigate('/dossiers?status=in_progress')}
              className="font-body text-xs text-sesame-text-muted underline underline-offset-2 cursor-pointer bg-transparent border-none p-0 hover:opacity-70 transition-opacity"
            >
              Voir tout
            </button>
          </div>
          <div className="space-y-3">
            {inProgressDossiers.map((d) => (
              <DossierCard key={d.id} dossier={d} />
            ))}
          </div>
        </section>
      )}

      {recentDossiers && recentDossiers.length > 0 && (
        <section>
          <SectionTitle>Derniers dossiers</SectionTitle>
          <div className="bg-sesame-surface border-2 border-sesame-text rounded-lg overflow-hidden">
            {recentDossiers.map((d) => (
              <DossierCard key={d.id} dossier={d} variant="compact" className="px-4" />
            ))}
          </div>
          <button
            onClick={() => navigate('/dossiers')}
            className="mt-3 w-full font-body text-sm text-sesame-text-muted text-right underline underline-offset-2 cursor-pointer bg-transparent border-none p-0 block hover:opacity-70 transition-opacity"
          >
            Voir tous les dossiers
          </button>
        </section>
      )}
    </div>
  );
}

function AlertCard({
  alert,
  onNavigate,
  onDismiss,
}: {
  alert: AlertData;
  onNavigate: () => void;
  onDismiss: () => void;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'relative bg-sesame-surface border-2 border-sesame-text rounded-lg overflow-hidden border-l-4',
        alert.urgent ? 'border-l-sesame-danger' : 'border-l-sesame-accent',
      )}
    >
      <button
        onClick={onNavigate}
        className="w-full text-left p-4 cursor-pointer focus-visible:outline-2 focus-visible:outline-sesame-accent focus-visible:outline-offset-2 pr-10"
      >
        <div className="flex items-start gap-3">
          <Icon
            icon={Alert02Icon}
            size={18}
            color={alert.urgent ? 'var(--color-sesame-danger)' : 'var(--color-sesame-accent)'}
            aria-hidden
          />
          <p className="font-body text-sm text-sesame-text leading-snug">{alert.label}</p>
        </div>
      </button>
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 cursor-pointer hover:opacity-60 transition-opacity"
        aria-label="Masquer cette alerte"
      >
        <Icon icon={Cancel01Icon} size={16} color="#7A7065" aria-hidden />
      </button>
    </div>
  );
}
