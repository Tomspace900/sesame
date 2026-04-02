import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatAmount,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatMonthYear,
  formatRelativeTime,
  formatShortDate,
} from "./format.ts";

// ─── formatDate ───────────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("retourne une chaîne vide si null", () => {
    expect(formatDate(null)).toBe("");
  });

  it("retourne une chaîne vide si undefined", () => {
    expect(formatDate(undefined)).toBe("");
  });

  it("retourne une chaîne vide si chaîne vide", () => {
    expect(formatDate("")).toBe("");
  });

  it("retourne une chaîne non vide pour une date valide", () => {
    const result = formatDate("2026-01-15T10:00:00.000Z");
    expect(result).toBeTruthy();
    expect(result).toContain("2026");
  });

  it("contient le jour et le mois court en fr-FR", () => {
    const result = formatDate("2026-01-15T12:00:00.000Z");
    expect(result).toMatch(/15/);
    expect(result).toMatch(/janv/);
  });
});

// ─── formatDateLong ───────────────────────────────────────────────────────────

describe("formatDateLong", () => {
  it("retourne une chaîne vide si null", () => {
    expect(formatDateLong(null)).toBe("");
  });

  it("retourne une chaîne vide si undefined", () => {
    expect(formatDateLong(undefined)).toBe("");
  });

  it("retourne le mois en toutes lettres pour une date valide", () => {
    const result = formatDateLong("2026-01-15T12:00:00.000Z");
    expect(result).toContain("2026");
    expect(result).toContain("15");
    expect(result).toMatch(/janvier/);
  });

  it("diffère de formatDate (mois long vs court)", () => {
    const date = "2026-01-15T12:00:00.000Z";
    expect(formatDateLong(date)).not.toBe(formatDate(date));
  });
});

// ─── formatDateTime ───────────────────────────────────────────────────────────

describe("formatDateTime", () => {
  it("retourne une chaîne vide si null", () => {
    expect(formatDateTime(null)).toBe("");
  });

  it("retourne une chaîne vide si undefined", () => {
    expect(formatDateTime(undefined)).toBe("");
  });

  it("contient la date et l'heure pour une datetime valide", () => {
    // 15 janvier 2026 à 14h30 UTC
    const result = formatDateTime("2026-01-15T14:30:00.000Z");
    expect(result).toContain("2026");
    expect(result).toMatch(/janvier/);
    expect(result).toMatch(/\d{2}/); // contient des chiffres d'heure
  });

  it("est plus long que formatDate pour la même date", () => {
    const date = "2026-01-15T14:30:00.000Z";
    expect(formatDateTime(date).length).toBeGreaterThan(formatDate(date).length);
  });
});

// ─── formatShortDate ──────────────────────────────────────────────────────────

describe("formatShortDate", () => {
  it("retourne le jour et le mois court sans l'année", () => {
    const result = formatShortDate("2026-03-05T12:00:00.000Z");
    expect(result).toMatch(/5/);
    expect(result).toMatch(/mars/);
    expect(result).not.toContain("2026");
  });

  it("retourne une valeur différente pour deux mois différents", () => {
    const jan = formatShortDate("2026-01-15T12:00:00.000Z");
    const jul = formatShortDate("2026-07-15T12:00:00.000Z");
    expect(jan).not.toBe(jul);
  });
});

// ─── formatMonthYear ──────────────────────────────────────────────────────────

describe("formatMonthYear", () => {
  it("retourne le mois en toutes lettres et l'année", () => {
    const result = formatMonthYear("2026-03-01T00:00:00.000Z");
    expect(result).toMatch(/mars/);
    expect(result).toContain("2026");
  });

  it("ne contient pas le jour", () => {
    const result = formatMonthYear("2026-03-15T00:00:00.000Z");
    expect(result).not.toMatch(/\b15\b/);
  });

  it("retourne une valeur différente pour deux années différentes", () => {
    const r2026 = formatMonthYear("2026-01-01T00:00:00.000Z");
    const r2025 = formatMonthYear("2025-01-01T00:00:00.000Z");
    expect(r2026).not.toBe(r2025);
  });
});

// ─── formatRelativeTime ───────────────────────────────────────────────────────

describe("formatRelativeTime", () => {
  const NOW = new Date("2026-01-15T12:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retourne "Jamais synchronisé" si null', () => {
    expect(formatRelativeTime(null)).toBe("Jamais synchronisé");
  });

  it('retourne "À l\'instant" si moins de 1 minute', () => {
    const thirtySecondsAgo = new Date(NOW.getTime() - 30_000).toISOString();
    expect(formatRelativeTime(thirtySecondsAgo)).toBe("À l'instant");
  });

  it('retourne "Il y a X min" pour 1 à 59 minutes', () => {
    const fiveMinutesAgo = new Date(NOW.getTime() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(fiveMinutesAgo)).toBe("Il y a 5 min");
  });

  it('retourne "Il y a 59 min" à la limite inférieure des heures', () => {
    const fiftyNineMinutesAgo = new Date(NOW.getTime() - 59 * 60_000).toISOString();
    expect(formatRelativeTime(fiftyNineMinutesAgo)).toBe("Il y a 59 min");
  });

  it('retourne "Il y a X h" pour 1 à 23 heures', () => {
    const threeHoursAgo = new Date(NOW.getTime() - 3 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(threeHoursAgo)).toBe("Il y a 3 h");
  });

  it('retourne "Il y a 23 h" à la limite inférieure des jours', () => {
    const twentyThreeHoursAgo = new Date(NOW.getTime() - 23 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(twentyThreeHoursAgo)).toBe("Il y a 23 h");
  });

  it('retourne "Il y a X j" pour 1 jour et plus', () => {
    const twoDaysAgo = new Date(NOW.getTime() - 2 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(twoDaysAgo)).toBe("Il y a 2 j");
  });

  it('retourne "Il y a 1 j" pour exactement 24 heures', () => {
    const oneDayAgo = new Date(NOW.getTime() - 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(oneDayAgo)).toBe("Il y a 1 j");
  });
});

// ─── formatAmount ─────────────────────────────────────────────────────────────

describe("formatAmount", () => {
  it("retourne null si amount est null", () => {
    expect(formatAmount(null, "EUR")).toBeNull();
  });

  it("retourne null si amount et currency sont null", () => {
    expect(formatAmount(null, null)).toBeNull();
  });

  it("formate zéro en EUR", () => {
    const result = formatAmount(0, "EUR");
    expect(result).not.toBeNull();
    expect(result).toContain("0");
    expect(result).toContain("€");
  });

  it("formate un montant positif en EUR", () => {
    const result = formatAmount(150, "EUR");
    expect(result).not.toBeNull();
    expect(result).toContain("150");
    expect(result).toContain("€");
  });

  it("formate un montant négatif en EUR", () => {
    const result = formatAmount(-50, "EUR");
    expect(result).not.toBeNull();
    expect(result).toContain("50");
    // Le signe négatif peut être un tiret ou un moins selon le moteur ICU
    expect(result).toMatch(/-|−/);
  });

  it("formate en USD", () => {
    const result = formatAmount(99.99, "USD");
    expect(result).not.toBeNull();
    expect(result).toContain("99");
    expect(result).toMatch(/USD|\$/);
  });

  it("formate en GBP", () => {
    const result = formatAmount(200, "GBP");
    expect(result).not.toBeNull();
    expect(result).toContain("200");
    expect(result).toMatch(/GBP|£/);
  });

  it("utilise EUR par défaut si currency est null", () => {
    const withNull = formatAmount(100, null);
    const withEur = formatAmount(100, "EUR");
    expect(withNull).toBe(withEur);
  });

  it("formate un montant décimal avec virgule fr-FR", () => {
    const result = formatAmount(9.99, "EUR");
    expect(result).not.toBeNull();
    // En fr-FR, le séparateur décimal est la virgule
    expect(result).toContain(",");
  });
});
