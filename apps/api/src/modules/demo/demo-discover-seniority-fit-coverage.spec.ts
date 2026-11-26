import { seniorityFit } from '@bellum/contracts'
import { DEMO_DISCOVER_SENIORITY_FIT_COVERAGE } from './demo-coverage'
import { DEMO_SOLD_SENIORITY_LEVELS } from './demo-dataset'
import { demoDiscoverResponse } from './demo-scripts'

/**
 * #3238 (recette prod 02/10, Y18) — « Démo /discover : 0× « (niveau que tu places) » / « (… ne places pas) »,
 * aucune séniorité affichée ». Les niveaux vendus du profil démo étaient semés, mais AUCUN signal de la salle
 * ne portait de séniorité : le croisement n'avait rien à croiser. Lit la VRAIE réponse scriptée (sans `.parse`,
 * `seniority` voyage hors contrat comme les autres champs d'extraction).
 */
type RawSignal = { type: string; seniority?: 'junior' | 'confirme' | 'senior' | null }
type RawCandidate = { name: string; signals: RawSignal[] }

const hiringSeniorities = (query: Record<string, unknown>): Array<RawSignal['seniority']> =>
  (demoDiscoverResponse(query) as { candidates: RawCandidate[] }).candidates
    .flatMap(c => c.signals ?? [])
    .filter(s => s.type === 'hiring')
    .map(s => s.seniority)

describe('#3238 — séniorité des offres de Découvrir, en démonstration', () => {
  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_DISCOVER_SENIORITY_FIT_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_SENIORITY_FIT_COVERAGE.reason).toContain('#3238')
  })

  it('la VUE PAR DÉFAUT montre un niveau que la société place ET un niveau qu’elle ne place pas', () => {
    const fits = hiringSeniorities({}).map(level => seniorityFit(level, [...DEMO_SOLD_SENIORITY_LEVELS]))
    expect(fits).toContain('sold')
    expect(fits).toContain('not_sold')
  })
})
