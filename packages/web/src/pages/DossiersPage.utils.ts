import type { DossierCardData } from '@/components/dossiers/DossierCard.tsx';

export function formatMonthHeader(dateStr: string): string {
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(
    new Date(dateStr),
  );
}

export function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function groupByMonth(
  dossiers: DossierCardData[],
): { key: string; label: string; items: DossierCardData[] }[] {
  const groups = new Map<string, { label: string; items: DossierCardData[] }>();
  for (const d of dossiers) {
    const key = d.started_at ? getMonthKey(d.started_at) : 'unknown';
    if (!groups.has(key)) {
      groups.set(key, {
        label: d.started_at ? formatMonthHeader(d.started_at) : 'Date inconnue',
        items: [],
      });
    }
    const group = groups.get(key);
    if (group) group.items.push(d);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, { label, items }]) => ({ key, label, items }));
}
