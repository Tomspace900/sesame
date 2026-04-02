import type { DossierCardData } from '@/components/dossiers/DossierCard.tsx';

export type DossierWithDeadline = DossierCardData & {
  return_deadline: string | null;
  warranty_deadline: string | null;
  next_renewal_at: string | null;
};

export type AlertData = {
  dossier: DossierCardData;
  label: string;
  deadline: Date;
  urgent: boolean;
};

function daysUntil(date: Date): number {
  const now = new Date();
  return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function buildAlerts(dossiers: DossierWithDeadline[]): AlertData[] {
  const now = new Date();
  const limit = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const alerts: AlertData[] = [];

  for (const d of dossiers) {
    const checks: { field: string | null; label: (days: number) => string }[] = [
      {
        field: d.return_deadline,
        label: (days) =>
          days <= 3
            ? `Dernier appel : ${days}j pour renvoyer ${d.title ?? 'cet article'}`
            : `Tu peux encore renvoyer ${d.title ?? 'cet article'} — dans ${days} jours`,
      },
      {
        field: d.warranty_deadline,
        label: (days) =>
          days <= 3
            ? `Garantie de ${d.title ?? 'ce produit'} expire dans ${days} jours`
            : `Ta garantie pour ${d.title ?? 'ce produit'} expire bientôt`,
      },
      {
        field: d.next_renewal_at,
        label: (days) =>
          `Ton abonnement ${d.title ?? ''} se renouvelle dans ${days} jours`.trim(),
      },
    ];

    for (const check of checks) {
      if (!check.field) continue;
      const deadline = new Date(check.field);
      if (deadline > now && deadline <= limit) {
        const days = daysUntil(deadline);
        alerts.push({ dossier: d, label: check.label(days), deadline, urgent: days <= 3 });
      }
    }
  }

  return alerts.sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
}
