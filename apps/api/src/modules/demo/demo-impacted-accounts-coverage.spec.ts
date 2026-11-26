import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_IMPACTED_ACCOUNTS_COVERAGE, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_ANALYSIS_RUNS } from './demo-dataset'

/**
 * #2306.24 — « et en démonstration, "Comptes concernés par ce changement"
 * montre quoi ? » `DEMO_IMPACTED_ACCOUNTS_COVERAGE` n'a ni table ni clé
 * `raw_analysis` à elle (`analysis_runs.profile_provenance` est une clé
 * JSONB d'une table hors `DEMO_SEEDED_TABLES`) — même principe que
 * `demo-observed-only-partner-coverage.spec.ts` : ce fichier est l'appelant
 * réel, il lit le composant ET confirme que la cause citée (`analysis_runs`
 * non seedée) tient toujours.
 */

const BANNER = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'web',
  'src',
  'features',
  'profile-context',
  'components',
  'ImpactedAccountsBanner.tsx',
)

describe('couverture démo — « Comptes concernés par ce changement » (#2306.24)', () => {
  it('LIT le composant réel, pas une liste recopiée à la main', () => {
    const source = readFileSync(BANNER, 'utf8')
    expect(source.length).toBeGreaterThan(0)
    expect(source).toContain('useImpactedAccounts')
  })

  it('classe la capacité « vide à dessein », et la raison NOMME la table cause', () => {
    expect(DEMO_IMPACTED_ACCOUNTS_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_IMPACTED_ACCOUNTS_COVERAGE.reason).toContain('#2306.24')
    expect(DEMO_IMPACTED_ACCOUNTS_COVERAGE.reason).toContain('analysis_runs')
    // Une raison substantielle, comme les entrées voisines — sait dire NON.
    expect(DEMO_IMPACTED_ACCOUNTS_COVERAGE.reason.length).toBeGreaterThan(200)
  })

  it('sait dire NON — une raison trop courte échouerait à ce même contrôle (témoin)', () => {
    const tropCourte = { state: 'vide_a_dessein' as const, reason: 'Pas seedable.' }
    expect(tropCourte.reason.length).toBeLessThan(200)
  })

  // #3235 (05/10) — `analysis_runs` est désormais seedée (révision de verdict de Société Générale) :
  // la cause exacte devient « aucun run seedé ne porte de `profile_provenance` ». Elle ne doit pas
  // devenir fausse seule — un run seedé avec une provenance ferait apparaître la bannière.
  it('aucun run seedé ne porte de `profile_provenance` — c’est la cause exacte', () => {
    expect(DEMO_SEEDED_TABLES).toContain('analysis_runs')
    for (const run of DEMO_ANALYSIS_RUNS) expect(run).not.toHaveProperty('profile_provenance')
  })
})
