import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DossierCardData } from '@/components/dossiers/DossierCard.tsx';
import { buildAlerts, type DossierWithDeadline } from './DashboardPage.utils.ts';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// "now" figé pour tous les tests de ce fichier
const NOW = new Date('2026-01-15T12:00:00.000Z');

function makeBase(overrides: Partial<DossierCardData> = {}): DossierCardData {
  return {
    id: 'id-1',
    dossier_type: 'purchase',
    title: 'Mon produit',
    status: 'confirmed',
    amount: 100,
    currency: 'EUR',
    started_at: '2026-01-01T12:00:00.000Z',
    merchants: null,
    ...overrides,
  };
}

function makeDossier(
  overrides: Partial<DossierWithDeadline> = {},
): DossierWithDeadline {
  return {
    ...makeBase(),
    return_deadline: null,
    warranty_deadline: null,
    next_renewal_at: null,
    ...overrides,
  };
}

/** ISO string décalée de `days` jours par rapport à NOW */
function daysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60_000).toISOString();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildAlerts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retourne un tableau vide si aucun dossier', () => {
    expect(buildAlerts([])).toEqual([]);
  });

  it("retourne un tableau vide si aucune deadline n'est renseignée", () => {
    const dossiers = [makeDossier(), makeDossier({ id: 'id-2', title: 'Autre' })];
    expect(buildAlerts(dossiers)).toHaveLength(0);
  });

  it("ignore les deadlines expirées (passées)", () => {
    const dossier = makeDossier({ return_deadline: daysFromNow(-1) });
    expect(buildAlerts([dossier])).toHaveLength(0);
  });

  it("ignore les deadlines au-delà de 30 jours", () => {
    const dossier = makeDossier({ warranty_deadline: daysFromNow(31) });
    expect(buildAlerts([dossier])).toHaveLength(0);
  });

  it('crée une alerte pour une deadline urgente (≤ 3 jours)', () => {
    const dossier = makeDossier({ return_deadline: daysFromNow(2) });
    const alerts = buildAlerts([dossier]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.urgent).toBe(true);
  });

  it('crée une alerte non urgente pour une deadline entre 4 et 30 jours', () => {
    const dossier = makeDossier({ warranty_deadline: daysFromNow(15) });
    const alerts = buildAlerts([dossier]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.urgent).toBe(false);
  });

  it("le label d'une alerte urgente de retour mentionne \"Dernier appel\"", () => {
    const dossier = makeDossier({ title: 'Chaussures', return_deadline: daysFromNow(2) });
    const alerts = buildAlerts([dossier]);
    expect(alerts[0]?.label).toContain('Dernier appel');
    expect(alerts[0]?.label).toContain('Chaussures');
  });

  it("le label d'une alerte non urgente de retour mentionne \"encore renvoyer\"", () => {
    const dossier = makeDossier({ title: 'T-shirt', return_deadline: daysFromNow(10) });
    const alerts = buildAlerts([dossier]);
    expect(alerts[0]?.label).toContain('encore renvoyer');
    expect(alerts[0]?.label).toContain('T-shirt');
  });

  it("le label d'une alerte garantie urgente mentionne \"expire dans\"", () => {
    const dossier = makeDossier({ title: 'Télé', warranty_deadline: daysFromNow(2) });
    const alerts = buildAlerts([dossier]);
    expect(alerts[0]?.label).toContain('expire dans');
    expect(alerts[0]?.label).toContain('Télé');
  });

  it("le label d'une alerte renouvellement mentionne \"renouvelle\"", () => {
    const dossier = makeDossier({ title: 'Netflix', next_renewal_at: daysFromNow(5) });
    const alerts = buildAlerts([dossier]);
    expect(alerts[0]?.label).toContain('renouvelle');
    expect(alerts[0]?.label).toContain('Netflix');
  });

  it('un dossier peut générer plusieurs alertes (retour + garantie)', () => {
    const dossier = makeDossier({
      return_deadline: daysFromNow(2),
      warranty_deadline: daysFromNow(20),
    });
    const alerts = buildAlerts([dossier]);
    expect(alerts).toHaveLength(2);
  });

  it('trie les alertes par deadline croissante', () => {
    const dossiers = [
      makeDossier({ id: 'a', warranty_deadline: daysFromNow(20) }),
      makeDossier({ id: 'b', return_deadline: daysFromNow(3) }),
      makeDossier({ id: 'c', next_renewal_at: daysFromNow(10) }),
    ];
    const alerts = buildAlerts(dossiers);
    expect(alerts).toHaveLength(3);
    const deadlines = alerts.map((a) => a.deadline.getTime());
    const sorted = [...deadlines].sort((a, b) => a - b);
    expect(deadlines).toEqual(sorted);
  });

  it('utilise "cet article" si title est null pour un retour', () => {
    const dossier = makeDossier({ title: null, return_deadline: daysFromNow(2) });
    const alerts = buildAlerts([dossier]);
    expect(alerts[0]?.label).toContain('cet article');
  });

  it('expose le bon objet dossier dans chaque alerte', () => {
    const dossier = makeDossier({ id: 'mon-id', return_deadline: daysFromNow(5) });
    const alerts = buildAlerts([dossier]);
    expect(alerts[0]?.dossier.id).toBe('mon-id');
  });

  it("ignore les deadlines exactement égales à now (non strictement dans le futur)", () => {
    const dossier = makeDossier({ return_deadline: NOW.toISOString() });
    expect(buildAlerts([dossier])).toHaveLength(0);
  });

  it("inclut une deadline à exactement 30 jours dans le futur", () => {
    const dossier = makeDossier({ warranty_deadline: daysFromNow(30) });
    const alerts = buildAlerts([dossier]);
    expect(alerts).toHaveLength(1);
  });
});
