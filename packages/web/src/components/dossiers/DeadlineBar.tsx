import { formatDate, formatDateLong } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import React from "react";

type DeadlineBarProps = {
  label: string;
  deadline: string | null | undefined;
  startDate?: string | null;
  description?: string;
};

function getProgressColor(percent: number): string {
  if (percent <= 0) return "var(--color-sesame-surface-muted)"; // expiré
  if (percent < 15) return "var(--color-sesame-danger)"; // danger
  if (percent < 60) return "var(--color-sesame-accent)"; // accent
  return "var(--color-sesame-positive)"; // positive
}

function buildDescription(deadline: Date, _startDate: Date | null): string {
  const now = new Date();
  const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);

  if (daysLeft <= 0) {
    return `Expiré le ${formatDateLong(deadline.toISOString())}`;
  }
  if (daysLeft <= 3) {
    return `Dernier appel : ${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""}`;
  }
  if (daysLeft <= 30) {
    return `Il te reste ${daysLeft} jours — jusqu'au ${formatDateLong(deadline.toISOString())}`;
  }
  return `Tu es tranquille jusqu'au ${formatDateLong(deadline.toISOString())}`;
}

export function DeadlineBar({
  label,
  deadline,
  startDate,
  description,
}: DeadlineBarProps): React.JSX.Element | null {
  if (!deadline) return null;

  const deadlineDate = new Date(deadline);
  const now = new Date();
  const start = startDate ? new Date(startDate) : null;

  const totalMs = start ? deadlineDate.getTime() - start.getTime() : null;
  const elapsedMs = start ? now.getTime() - start.getTime() : null;
  const percent =
    totalMs !== null && elapsedMs !== null
      ? Math.max(0, Math.min(100, (1 - elapsedMs / totalMs) * 100))
      : deadlineDate > now
        ? null
        : 0;

  const fillColor =
    percent !== null ? getProgressColor(percent) : "var(--color-sesame-surface-muted)";
  const expired = deadlineDate <= now;
  const desc = description ?? buildDescription(deadlineDate, start);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-body font-medium text-sm text-sesame-text">{label}</span>
        {!expired && (
          <span className="font-body text-xs text-sesame-text-muted">{formatDate(deadline)}</span>
        )}
      </div>
      {/* Barre */}
      {percent !== null ? (
        <div className="h-2 rounded-sm bg-sesame-surface-muted border border-sesame-surface-muted overflow-hidden">
          <div
            className="h-full rounded-sm transition-all"
            style={{ width: `${Math.max(expired ? 0 : 4, percent)}%`, backgroundColor: fillColor }}
          />
        </div>
      ) : (
        <p className="font-body text-xs text-sesame-text-muted">
          Pas assez de données pour le moment
        </p>
      )}
      {/* Texte */}
      {percent !== null && (
        <p
          className={cn(
            "font-body text-xs mt-1.5",
            expired ? "text-sesame-text-muted" : "text-sesame-text"
          )}
        >
          {desc}
        </p>
      )}
    </div>
  );
}
