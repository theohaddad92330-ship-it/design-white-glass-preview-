import { describe, expect, it } from 'vitest'
import type { AdminRouteMigrationReport } from '@/lib/admin'
import {
  statutCoexistence,
  statutMetriques,
  statutNonRegression,
  statutRollback,
  statutRouteMigration,
  statutRouteMigration2208,
} from './route-migration-panel.logic'

function rapport(overrides: Partial<AdminRouteMigrationReport> = {}): AdminRouteMigrationReport {
  return {
    registry: { total: 14, redirectedCount: 7, entries: [] },
    goNoGo: { canGo: false, noGo: [], go: [] },
    goNoGo2208: { canGo: false, noGo: [], go: [] },
    rollback: { rollbackableCount: 7, entries: [] },
    coexistence: { sharedViewCount: 2, entries: [] },
    nonRegression: { capacities: [] },
    metrics: { instrumentedCount: 4, entries: [] },
    ...overrides,
  }
}

describe('statutRouteMigration', () => {
  it('est « NO-GO » tant que canGo() rend `false`', () => {
    const statut = statutRouteMigration(rapport())
    expect(statut.pret).toBe(false)
    expect(statut.libelle).toBe('NO-GO')
  })

  it('serait « GO » si canGo() rendait un jour `true`', () => {
    const statut = statutRouteMigration(rapport({ goNoGo: { canGo: true, noGo: [], go: [] } }))
    expect(statut.pret).toBe(true)
    expect(statut.libelle).toBe('GO')
  })

  it('compte les routes qui restent (total moins redirigées), jamais fondu avec les redirigées', () => {
    const statut = statutRouteMigration(rapport({ registry: { total: 14, redirectedCount: 7, entries: [] } }))
    expect(statut.redirectedCount).toBe(7)
    expect(statut.gapCount).toBe(7)
    expect(statut.total).toBe(14)
  })
})

describe('statutRollback — #2154.7', () => {
  it('sept défaisables sur quatorze : sept ne le sont pas', () => {
    const statut = statutRollback(
      rapport({
        rollback: {
          rollbackableCount: 7,
          entries: Array.from({ length: 14 }, (_, i) => ({
            key: `route-${i}`,
            sourceIssue: '#2154.7',
            stageReached: i < 7 ? 'suppression_anciens_onglets' : null,
            evidence: 'x',
            rollbackHolderFile: i < 7 ? 'x.tsx' : null,
            rollbackAction: 'x',
            canRollback: i < 7,
          })),
        },
      }),
    )
    expect(statut.rollbackableCount).toBe(7)
    expect(statut.total).toBe(14)
    expect(statut.notRollbackableCount).toBe(7)
  })
})

describe('statutCoexistence — #2154.8', () => {
  it('deux routes en vue partagée, distinctes des routes en redirection pure', () => {
    const statut = statutCoexistence(
      rapport({
        coexistence: {
          sharedViewCount: 2,
          entries: [
            {
              key: 'positionnements',
              sourceIssue: '#2154.8',
              mode: 'vue_partagee',
              canonicalDataSource: 'x',
              evidence: 'x',
            },
            {
              key: 'reactivation',
              sourceIssue: '#2154.8',
              mode: 'vue_partagee',
              canonicalDataSource: 'x',
              evidence: 'x',
            },
            {
              key: 'veille',
              sourceIssue: '#2154.8',
              mode: 'redirection_pure',
              canonicalDataSource: null,
              evidence: 'x',
            },
            {
              key: 'contacts',
              sourceIssue: '#2154.8',
              mode: 'non_verifiable',
              canonicalDataSource: null,
              evidence: 'x',
            },
          ],
        },
      }),
    )
    expect(statut.sharedViewCount).toBe(2)
    expect(statut.pureRedirectCount).toBe(1)
    expect(statut.total).toBe(4)
  })
})

describe('statutNonRegression — #2154.9', () => {
  it('rend `null` sans capacité — jamais un score inventé', () => {
    const statut = statutNonRegression(rapport())
    expect(statut.capacityLabel).toBeNull()
    expect(statut.total).toBe(0)
  })

  it('compte les dimensions VÉRIFIÉES, pas les treize en bloc', () => {
    const statut = statutNonRegression(
      rapport({
        nonRegression: {
          capacities: [
            {
              key: 'ecritures_centre_actions',
              sourceIssue: '#2154.9',
              label: "Écritures → Centre d'actions",
              routeMigrationKey: 'ecritures',
              checks: [
                { dimension: 'route_accessible', status: 'verified', evidence: 'x', file: 'x.tsx' },
                { dimension: 'erreur', status: 'gap', evidence: 'x', file: null },
              ],
            },
          ],
        },
      }),
    )
    expect(statut.capacityLabel).toBe("Écritures → Centre d'actions")
    expect(statut.verifiedCount).toBe(1)
    expect(statut.total).toBe(2)
  })
})

describe('statutRouteMigration2208 — #2958.94-.112', () => {
  it('est « NO-GO » tant que canGo2208() rend `false`, séparément de statutRouteMigration', () => {
    const statut = statutRouteMigration2208(rapport())
    expect(statut.pret).toBe(false)
    expect(statut.libelle).toBe('NO-GO')
  })

  it('compte les conditions NO-GO `blocked` et les conditions GO `met`, jamais fondues avec #2154.31/.32', () => {
    const statut = statutRouteMigration2208(
      rapport({
        goNoGo2208: {
          canGo: false,
          noGo: [
            { key: 'route_cassee', label: 'x', status: 'clear', evidence: 'x' },
            { key: 'matching_opaque', label: 'x', status: 'blocked', evidence: 'x' },
          ],
          go: [
            { key: 'tests_e2e', label: 'x', status: 'not_met', evidence: 'x', humanOnly: false },
            { key: 'recette_antoine', label: 'x', status: 'unknown', evidence: 'x', humanOnly: true },
          ],
        },
      }),
    )
    expect(statut.noGoBloqueCount).toBe(1)
    expect(statut.goMetCount).toBe(0)
    expect(statut.goTotal).toBe(2)
  })

  it('serait « GO » si canGo2208() rendait un jour `true`', () => {
    const statut = statutRouteMigration2208(rapport({ goNoGo2208: { canGo: true, noGo: [], go: [] } }))
    expect(statut.pret).toBe(true)
    expect(statut.libelle).toBe('GO')
  })
})

describe('statutMetriques — #2958.72-.93', () => {
  it('compte les métriques `instrumented`, pas les neuf en bloc', () => {
    const statut = statutMetriques(
      rapport({
        metrics: {
          instrumentedCount: 2,
          entries: [
            {
              key: 'screen_viewed',
              sourceIssue: '#2958.72-.93',
              eventName: 'screen_viewed',
              label: 'écran ouvert',
              aggregation: 'route_or_screen',
              status: 'instrumented',
              provenOnDestinations: ['/actions'],
              evidence: 'x',
              file: 'x.ts',
            },
            {
              key: 'tab_opened',
              sourceIssue: '#2958.72-.93',
              eventName: 'tab_opened',
              label: 'onglet ouvert',
              aggregation: 'route_or_screen',
              status: 'gap',
              provenOnDestinations: [],
              evidence: 'x',
              file: null,
            },
          ],
        },
      }),
    )
    expect(statut.instrumentedCount).toBe(2)
    expect(statut.total).toBe(2)
  })
})

describe('statutNonRegression — #2958.72-.84 : toutes les capacités, pas la première seule', () => {
  const capacity = (key: 'ecritures_centre_actions' | 'contacts_liste', statuses: ('verified' | 'gap')[]) => ({
    key,
    sourceIssue: '#2154.9' as const,
    label: key,
    routeMigrationKey: 'ecritures' as const,
    checks: statuses.map(status => ({
      dimension: 'erreur' as const,
      status,
      evidence: 'x',
      file: status === 'verified' ? 'x.tsx' : null,
    })),
  })

  it('compte les capacités et somme les dimensions vérifiées sur toutes', () => {
    const statut = statutNonRegression(
      rapport({
        nonRegression: {
          capacities: [
            capacity('ecritures_centre_actions', ['verified', 'gap']),
            capacity('contacts_liste', ['verified', 'verified', 'gap']),
          ],
        },
      }),
    )
    expect(statut.capacitiesCount).toBe(2)
    expect(statut.allVerifiedCount).toBe(3)
    expect(statut.allTotal).toBe(5)
  })

  it('sans capacité : zéro, jamais un score inventé', () => {
    const statut = statutNonRegression(rapport())
    expect(statut.capacitiesCount).toBe(0)
    expect(statut.allTotal).toBe(0)
  })
})
