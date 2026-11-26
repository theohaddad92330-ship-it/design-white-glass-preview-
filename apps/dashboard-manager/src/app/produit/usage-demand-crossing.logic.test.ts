import { describe, expect, it } from 'vitest'
import type { RapportDemande } from '@/lib/product-analytics'
import type { VerdictEcran } from './screen-verdict.logic'
import {
  TAUX_ECHEC_RECHERCHE_MIN_DEMANDE_ELEVEE,
  axeDemandePourEcran,
  axeUsageDeVerdict,
  croiserUsageEtDemande,
  croisementParEcran,
  libelleQuadrant,
} from './usage-demand-crossing.logic'

/**
 * #1688.4 — LE CROISEMENT USAGE × DEMANDE, testé AVANT d'être rendu.
 *
 * ⚠️ Ce croisement est la SEULE chose qui manquait : usage (#1683), retours
 * bêta et recherches sans résultat (#1688) sont déjà lus ailleurs sur cette
 * page. Ce fichier ne relit rien — il prend un verdict déjà calculé
 * (#1683.1) et le rapport de demande déjà chargé, et en tire quatre cases
 * nommées, plus une cinquième pour ce qu'une des deux sources ne permet pas
 * de trancher.
 */

const LABEL = { fr: 'Comptes', en: 'Accounts' }

function demandeMesuree(
  lignes: Array<{ route: string; searches: number; emptySearches: number; sessions: number }>,
): RapportDemande {
  return {
    generatedAt: '2026-09-10T00:00:00.000Z',
    coverage: { windowDays: 7, complete: true, eventsScanned: 0, maxEventsScanned: 50_000, oldestEventAt: null },
    families: [],
    emptySearches: {
      kind: 'measured',
      sessions: 6,
      value: lignes.map(l => ({
        route: l.route,
        label: LABEL,
        searches: l.searches,
        emptySearches: l.emptySearches,
        sessions: l.sessions,
        emptyRate:
          l.searches > 0
            ? { kind: 'measured', ratio: l.emptySearches / l.searches, over: l.searches }
            : { kind: 'unmeasured' },
      })),
    },
    notes: [],
  }
}

describe('#1688.4 — axeUsageDeVerdict (réutilise #1683.1, ne redérive rien)', () => {
  it('travaillé et consulté → usage élevé', () => {
    expect(axeUsageDeVerdict({ kind: 'travaille' })).toBe('eleve')
    expect(axeUsageDeVerdict({ kind: 'consulte' })).toBe('eleve')
  })

  it('survolé, jamais ouvert, trop récent → usage faible', () => {
    expect(axeUsageDeVerdict({ kind: 'survole' })).toBe('faible')
    expect(axeUsageDeVerdict({ kind: 'jamais_ouvert' })).toBe('faible')
    expect(axeUsageDeVerdict({ kind: 'trop_recent', depuisJours: 1 })).toBe('faible')
  })

  it('observations insuffisantes et non mesuré → usage non mesuré, jamais faible par défaut', () => {
    expect(axeUsageDeVerdict({ kind: 'observations_insuffisantes', sessions: 1, seuil: 5 })).toBe('non_mesure')
    expect(axeUsageDeVerdict({ kind: 'non_mesure', raison: 'x' })).toBe('non_mesure')
  })
})

describe('#1688.4 — axeDemandePourEcran', () => {
  it('canal recherche jamais instrumenté → non mesuré pour tout écran', () => {
    const demande: RapportDemande = {
      generatedAt: '',
      coverage: { windowDays: 7, complete: true, eventsScanned: 0, maxEventsScanned: 1, oldestEventAt: null },
      families: [],
      emptySearches: { kind: 'not_instrumented' },
      notes: [],
    }
    expect(axeDemandePourEcran('/dashboard', demande)).toBe('non_mesure')
  })

  it('canal mesuré mais écran absent du tableau → un ZÉRO VRAI, demande faible', () => {
    const demande = demandeMesuree([{ route: '/autre', searches: 10, emptySearches: 5, sessions: 6 }])
    expect(axeDemandePourEcran('/dashboard', demande)).toBe('faible')
  })

  it('écran présent mais sous le seuil de sessions distinctes → non mesuré, jamais le taux affiché', () => {
    const demande = demandeMesuree([{ route: '/dashboard', searches: 4, emptySearches: 4, sessions: 2 }])
    expect(axeDemandePourEcran('/dashboard', demande)).toBe('non_mesure')
  })

  it('taux d’échec au-dessus du seuil, assez de sessions → demande élevée', () => {
    const demande = demandeMesuree([{ route: '/dashboard', searches: 10, emptySearches: 4, sessions: 6 }])
    expect(axeDemandePourEcran('/dashboard', demande)).toBe('eleve')
    expect(4 / 10).toBeGreaterThanOrEqual(TAUX_ECHEC_RECHERCHE_MIN_DEMANDE_ELEVEE)
  })

  it('taux d’échec sous le seuil, assez de sessions → demande faible', () => {
    const demande = demandeMesuree([{ route: '/dashboard', searches: 20, emptySearches: 1, sessions: 6 }])
    expect(axeDemandePourEcran('/dashboard', demande)).toBe('faible')
  })
})

describe('#1688.4 — croiserUsageEtDemande', () => {
  it('usage élevé + demande élevée → adopté sous tension', () => {
    expect(croiserUsageEtDemande('eleve', 'eleve')).toBe('adopte_sous_tension')
  })

  it('usage élevé + demande faible → adopté sans tension', () => {
    expect(croiserUsageEtDemande('eleve', 'faible')).toBe('adopte_sans_tension')
  })

  it('usage faible + demande élevée → « ce qu’on n’a pas et que tout le monde cherche »', () => {
    expect(croiserUsageEtDemande('faible', 'eleve')).toBe('attendu_mais_absent')
  })

  it('usage faible + demande faible → « ce qu’on a et que personne n’utilise »', () => {
    expect(croiserUsageEtDemande('faible', 'faible')).toBe('sous_utilise')
  })

  it('sait dire NON — une case dont UNE SEULE des deux sources manque est non mesuré, jamais un zéro ni les trois autres quadrants', () => {
    expect(croiserUsageEtDemande('non_mesure', 'eleve')).toBe('non_mesure')
    expect(croiserUsageEtDemande('eleve', 'non_mesure')).toBe('non_mesure')
    expect(croiserUsageEtDemande('non_mesure', 'non_mesure')).toBe('non_mesure')
    expect(croiserUsageEtDemande('non_mesure', 'faible')).toBe('non_mesure')
    expect(croiserUsageEtDemande('faible', 'non_mesure')).toBe('non_mesure')
  })
})

describe('#1688.4 — croisementParEcran (totalité, et jamais une seconde dérivation)', () => {
  const CATALOGUE = [
    { route: '/dashboard', label: { fr: 'Tableau de bord', en: 'Dashboard' } },
    { route: '/rfp', label: { fr: 'Appels d’offres', en: 'Tenders' } },
  ]

  it('une ligne par écran du catalogue, jamais plus, jamais moins', () => {
    const verdictParRoute = new Map<string, VerdictEcran>([['/dashboard', { kind: 'travaille' }]])
    const demande = demandeMesuree([{ route: '/dashboard', searches: 10, emptySearches: 1, sessions: 6 }])
    const lignes = croisementParEcran(CATALOGUE, verdictParRoute, demande)
    expect(lignes).toHaveLength(CATALOGUE.length)
    expect(new Set(lignes.map(l => l.route)).size).toBe(CATALOGUE.length)
  })

  it('un écran sans verdict connu (source usage manquante) est non mesuré, jamais un zéro silencieux', () => {
    const verdictParRoute = new Map<string, VerdictEcran>() // aucun verdict pour aucun écran
    const demande = demandeMesuree([{ route: '/rfp', searches: 10, emptySearches: 8, sessions: 6 }])
    const lignes = croisementParEcran(CATALOGUE, verdictParRoute, demande)
    for (const ligne of lignes) {
      expect(ligne.usage).toBe('non_mesure')
      expect(ligne.quadrant).toBe('non_mesure')
    }
  })
})

describe('#1688.4 — libelleQuadrant', () => {
  it('nomme les cinq cases, jamais un code brut', () => {
    expect(libelleQuadrant('adopte_sous_tension')).not.toBe('adopte_sous_tension')
    expect(libelleQuadrant('sous_utilise')).toContain('sous-utilisé')
    expect(libelleQuadrant('attendu_mais_absent')).toContain('attendu')
    expect(libelleQuadrant('non_mesure')).toBe('non mesuré')
  })
})
