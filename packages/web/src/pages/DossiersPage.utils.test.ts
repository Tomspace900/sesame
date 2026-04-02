import type { DossierCardData } from "@/components/dossiers/DossierCard.tsx";
import { describe, expect, it } from "vitest";
import { formatMonthHeader, getMonthKey, groupByMonth } from "./DossiersPage.utils.ts";

// ─── Fixture ──────────────────────────────────────────────────────────────────

function makeDossier(overrides: Partial<DossierCardData> = {}): DossierCardData {
  return {
    id: "id-1",
    dossier_type: "purchase",
    title: "Commande test",
    status: "confirmed",
    amount: 49.99,
    currency: "EUR",
    started_at: "2026-01-15T10:00:00.000Z",
    merchants: null,
    ...overrides,
  };
}

// ─── getMonthKey ──────────────────────────────────────────────────────────────

describe("getMonthKey", () => {
  it("retourne le format YYYY-MM", () => {
    expect(getMonthKey("2026-01-15T10:00:00.000Z")).toBe("2026-01");
  });

  it("padde le mois avec un zéro pour les mois < 10", () => {
    expect(getMonthKey("2026-03-01T00:00:00.000Z")).toBe("2026-03");
  });

  it("retourne le bon mois pour décembre", () => {
    expect(getMonthKey("2025-12-15T12:00:00.000Z")).toBe("2025-12");
  });

  it("deux dates du même mois produisent la même clé", () => {
    const key1 = getMonthKey("2026-07-01T12:00:00.000Z");
    const key2 = getMonthKey("2026-07-15T12:00:00.000Z");
    expect(key1).toBe(key2);
  });

  it("deux dates de mois différents produisent des clés différentes", () => {
    expect(getMonthKey("2026-01-15T00:00:00.000Z")).not.toBe(
      getMonthKey("2026-02-15T00:00:00.000Z")
    );
  });
});

// ─── formatMonthHeader ────────────────────────────────────────────────────────

describe("formatMonthHeader", () => {
  it("retourne le mois en toutes lettres et l'année", () => {
    const result = formatMonthHeader("2026-01-15T10:00:00.000Z");
    expect(result).toMatch(/janvier/);
    expect(result).toContain("2026");
  });

  it("retourne des valeurs différentes pour des mois différents", () => {
    const jan = formatMonthHeader("2026-01-01T00:00:00.000Z");
    const feb = formatMonthHeader("2026-02-01T00:00:00.000Z");
    expect(jan).not.toBe(feb);
  });
});

// ─── groupByMonth ─────────────────────────────────────────────────────────────

describe("groupByMonth", () => {
  it("retourne un tableau vide pour une entrée vide", () => {
    expect(groupByMonth([])).toEqual([]);
  });

  it("regroupe un seul dossier dans un seul groupe", () => {
    const result = groupByMonth([makeDossier({ started_at: "2026-01-15T10:00:00.000Z" })]);
    expect(result).toHaveLength(1);
    expect(result[0]?.key).toBe("2026-01");
    expect(result[0]?.items).toHaveLength(1);
  });

  it("regroupe deux dossiers du même mois ensemble", () => {
    const dossiers = [
      makeDossier({ id: "a", started_at: "2026-01-10T00:00:00.000Z" }),
      makeDossier({ id: "b", started_at: "2026-01-28T00:00:00.000Z" }),
    ];
    const result = groupByMonth(dossiers);
    expect(result).toHaveLength(1);
    expect(result[0]?.items).toHaveLength(2);
  });

  it("crée un groupe distinct par mois", () => {
    const dossiers = [
      makeDossier({ id: "a", started_at: "2026-01-10T00:00:00.000Z" }),
      makeDossier({ id: "b", started_at: "2026-02-05T00:00:00.000Z" }),
      makeDossier({ id: "c", started_at: "2026-03-20T00:00:00.000Z" }),
    ];
    const result = groupByMonth(dossiers);
    expect(result).toHaveLength(3);
  });

  it("trie les groupes du plus récent au plus ancien", () => {
    const dossiers = [
      makeDossier({ id: "a", started_at: "2026-01-10T00:00:00.000Z" }),
      makeDossier({ id: "b", started_at: "2026-03-20T00:00:00.000Z" }),
      makeDossier({ id: "c", started_at: "2026-02-05T00:00:00.000Z" }),
    ];
    const result = groupByMonth(dossiers);
    expect(result[0]?.key).toBe("2026-03");
    expect(result[1]?.key).toBe("2026-02");
    expect(result[2]?.key).toBe("2026-01");
  });

  it('regroupe les dossiers sans started_at dans un groupe "unknown"', () => {
    const dossiers = [
      makeDossier({ id: "a", started_at: null }),
      makeDossier({ id: "b", started_at: null }),
    ];
    const result = groupByMonth(dossiers);
    expect(result).toHaveLength(1);
    expect(result[0]?.key).toBe("unknown");
    expect(result[0]?.label).toBe("Date inconnue");
    expect(result[0]?.items).toHaveLength(2);
  });

  it("sépare les dossiers avec et sans started_at", () => {
    const dossiers = [
      makeDossier({ id: "a", started_at: "2026-01-10T00:00:00.000Z" }),
      makeDossier({ id: "b", started_at: null }),
    ];
    const result = groupByMonth(dossiers);
    expect(result).toHaveLength(2);
    const keys = result.map((g) => g.key);
    expect(keys).toContain("2026-01");
    expect(keys).toContain("unknown");
  });

  it("inclut le label du mois correspondant à chaque groupe", () => {
    const result = groupByMonth([makeDossier({ started_at: "2026-03-15T00:00:00.000Z" })]);
    expect(result[0]?.label).toMatch(/mars/);
    expect(result[0]?.label).toContain("2026");
  });
});
