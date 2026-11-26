import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MIGRATION_DESTINATION_SCREENS,
  ROUTE_MIGRATION_METRICS,
  ROUTE_MIGRATION_METRIC_KEYS,
  routeMigrationMetricSchema,
  routeMigrationMetricsCoverage,
} from './route-migration-metrics.js'

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')

/**
 * #2958.72-.93 — les neuf métriques ne peuvent pas se faire passer pour plus
 * instrumentées qu'elles ne le sont, ni pour un système produit-wide.
 */
describe('les neuf métriques de migration — un émetteur du traceur, une métrique', () => {
  it('couvrent exactement les neuf émetteurs de `product-tracker.ts`, sans doublon', () => {
    expect(ROUTE_MIGRATION_METRICS).toHaveLength(ROUTE_MIGRATION_METRIC_KEYS.length)
    expect(ROUTE_MIGRATION_METRICS).toHaveLength(9)
    expect(new Set(ROUTE_MIGRATION_METRICS.map(metric => metric.key)).size).toBe(9)
  })

  it('chaque métrique respecte le contrat', () => {
    for (const metric of ROUTE_MIGRATION_METRICS) {
      expect(routeMigrationMetricSchema.safeParse(metric).success).toBe(true)
    }
  })

  it("l'agrégation n'est JAMAIS autre chose que route/écran — jamais la personne", () => {
    expect(ROUTE_MIGRATION_METRICS.every(metric => metric.aggregation === 'route_or_screen')).toBe(true)
  })

  it('les neuf noms d’événement sont verbatim ceux de `product-tracker.ts`', () => {
    const tracker = readFileSync(join(REPO_ROOT, 'apps/web/src/lib/product-tracker.ts'), 'utf8')
    for (const metric of ROUTE_MIGRATION_METRICS) {
      expect(tracker).toMatch(new RegExp(`'${metric.eventName}'`))
    }
  })

  it('une métrique `gap` ne prétend couvrir AUCUNE destination', () => {
    const gaps = ROUTE_MIGRATION_METRICS.filter(metric => metric.status === 'gap')
    // #2154.30 (17/10) — `search_performed` n'est plus `gap` : la garde reste (aucun `gap` ne couvre rien),
    // mais elle n'exige plus qu'il en reste un.
    for (const metric of gaps) {
      expect(metric.provenOnDestinations).toEqual([])
      expect(metric.file).toBeNull()
      expect(metric.evidence.length).toBeGreaterThan(20)
    }
  })

  it('une métrique `instrumented` cite un fichier RÉEL et au moins une destination des six', () => {
    const instrumented = ROUTE_MIGRATION_METRICS.filter(metric => metric.status === 'instrumented')
    expect(instrumented.length).toBeGreaterThan(0)
    for (const metric of instrumented) {
      expect(metric.file).not.toBeNull()
      expect(existsSync(join(REPO_ROOT, metric.file as string))).toBe(true)
      expect(metric.provenOnDestinations.length).toBeGreaterThan(0)
      for (const destination of metric.provenOnDestinations) {
        expect(MIGRATION_DESTINATION_SCREENS).toContain(destination)
      }
    }
  })

  it('la garde sait dire NON — un fichier inventé serait vu', () => {
    expect(existsSync(join(REPO_ROOT, 'apps/web/src/lib/fichier-qui-nexiste-pas.ts'))).toBe(false)
  })

  it('compte les émetteurs prouvés sur au moins une destination — neuf sur neuf depuis #2154.30, chacun avec ses destinations NOMMÉES', () => {
    expect(routeMigrationMetricsCoverage()).toEqual({ instrumented: 9, total: 9 })
  })

  it('`filter_applied` cite VRAIMENT deux destinations différentes, avec preuve de contenu réelle', () => {
    const watchlist = readFileSync(join(REPO_ROOT, 'apps/web/src/features/watchlist/view/WatchlistBoard.tsx'), 'utf8')
    expect(watchlist).toMatch(/trackFilterApplied\(screen, facet\)/)
    const actionHistory = readFileSync(
      join(REPO_ROOT, 'apps/web/src/features/action-history/view/ActionHistoryJournal.tsx'),
      'utf8',
    )
    expect(actionHistory).toMatch(/ACTIONS_SCREEN = '\/actions'/)
    expect(actionHistory).toMatch(/trackFilterApplied\(ACTIONS_SCREEN, filterId\)/)

    const filterApplied = ROUTE_MIGRATION_METRICS.find(metric => metric.key === 'filter_applied')
    expect(filterApplied?.provenOnDestinations.sort()).toEqual(['/actions', '/signals'].sort())
  })

  it('`screen_viewed`/`screen_left`/`error_shown` citent des mécanismes VRAIMENT globaux (routeur, error boundary)', () => {
    const router = readFileSync(join(REPO_ROOT, 'apps/web/src/router.tsx'), 'utf8')
    expect(router).toMatch(/notifyRouteViewed\(/)

    const errorBoundary = readFileSync(join(REPO_ROOT, 'apps/web/src/components/templates/error-boundary.tsx'), 'utf8')
    expect(errorBoundary).toMatch(/trackErrorShown\(/)
  })

  // #2154.30 (17/10) — `search_performed` et `action_*` sur les destinations hors `/actions` : l'appelant est LU, pas supposé.
  it('`search_performed` cite VRAIMENT trois destinations, chacune par un appel au hook partagé', () => {
    const metric = ROUTE_MIGRATION_METRICS.find(candidate => candidate.key === 'search_performed')
    expect(metric?.status).toBe('instrumented')
    expect([...(metric?.provenOnDestinations ?? [])].sort()).toEqual(['/accounts', '/consultants', '/projects'])
    const hook = readFileSync(join(REPO_ROOT, 'apps/web/src/lib/useTrackSearchPerformed.ts'), 'utf8')
    expect(hook).toMatch(/trackSearchPerformed\(screen, total\)/)
    const callers: Record<string, string> = {
      '/accounts': 'apps/web/src/features/accounts/view/AccountsPage.tsx',
      '/consultants': 'apps/web/src/features/consultants/view/ConsultantsPage.tsx',
      '/projects': 'apps/web/src/features/projects/view/ProjectsPage.tsx',
    }
    for (const [screen, file] of Object.entries(callers)) {
      expect(readFileSync(join(REPO_ROOT, file), 'utf8'), screen).toContain(`useTrackSearchPerformed('${screen}'`)
    }
  })

  it('`action_started/completed/abandoned` couvrent les SIX destinations, chacune par un `trackedMutation` lu dans le code', () => {
    const callers: Record<string, string> = {
      '/actions': 'apps/web/src/features/action-os/view/ActionCenter.tsx',
      '/accounts': 'apps/web/src/features/accounts/view/accounts-list/AccountAssignSubmenu.tsx',
      '/consultants': 'apps/web/src/features/consultants/view/ConsultantsPage.tsx',
      '/projects': 'apps/web/src/features/projects/view/CreateProjectDialog.tsx',
      '/signals': 'apps/web/src/features/target-lists/view/ImportTargetListDialog.tsx',
      '/settings/knowledge': 'apps/web/src/features/knowledge/view/Knowledge.tsx',
    }
    for (const [screen, file] of Object.entries(callers)) {
      const source = readFileSync(join(REPO_ROOT, file), 'utf8')
      const names = source.includes(`'${screen}'`)
      const emits = names && /trackedMutation\(|trackActionStarted\(/.test(source)
      expect(emits, screen).toBe(true)
    }
    for (const key of ['action_started', 'action_completed', 'action_abandoned']) {
      const metric = ROUTE_MIGRATION_METRICS.find(candidate => candidate.key === key)
      expect([...(metric?.provenOnDestinations ?? [])].sort(), key).toEqual(Object.keys(callers).sort())
    }
  })
})
