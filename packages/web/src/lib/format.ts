/**
 * Shared formatting utilities — single source of truth for dates and amounts.
 */

/** "15 janv. 2026" — compact, for cards and lists */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr));
}

/** "15 janvier 2026" — long form, for detail views */
export function formatDateLong(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(dateStr));
}

/** "15 janvier 2026 à 14h30" — for detail views with time */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));
}

/** "15 janv." — short form without year, for timelines */
export function formatShortDate(dateStr: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
  }).format(new Date(dateStr));
}

/** "janvier 2026" — month and year only, for descriptions */
export function formatMonthYear(dateStr: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(new Date(dateStr));
}

/** "Il y a 5 min" — relative time from now, for sync timestamps */
export function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Jamais synchronisé";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  return `Il y a ${Math.floor(hours / 24)} j`;
}

/** "150,00 €" — locale-aware currency */
export function formatAmount(amount: number | null, currency: string | null): string | null {
  if (amount == null) return null;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency ?? "EUR",
    maximumFractionDigits: 2,
  }).format(amount);
}
