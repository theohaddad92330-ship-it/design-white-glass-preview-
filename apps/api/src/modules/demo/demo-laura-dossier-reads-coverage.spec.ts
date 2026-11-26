import { DEMO_COMPANY_PUBLIC_FACTS_COVERAGE, DEMO_LAURA_DOSSIER_READS_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'
import { projectOrgChart } from '../copilot-bridge/org-chart-projection'

/**
 * LOT DATA-B (15/10), craft rule n°9 — les lectures neuves de Laura (firmographie, organigramme, briefing
 * élargi) doivent avoir de quoi lire dans la salle. Ce test MESURE le jeu semé, il ne le suppose pas.
 */
describe('démo — Laura lit le dossier déjà collecté (LOT DATA-B)', () => {
  const raws = DEMO_DOSSIERS.map(dossier => dossier.account.raw_analysis as Record<string, unknown>)
  const readList = (raw: Record<string, unknown>, key: string): unknown[] => {
    const value = raw[key]
    return Array.isArray(value) ? value : []
  }

  it('au moins un dossier porte des technologies détectées et des dépôts publics (firmographie)', () => {
    expect(raws.some(raw => readList(raw, 'detected_tech_stack').length > 0)).toBe(true)
    expect(raws.some(raw => raw['github_signals'] && typeof raw['github_signals'] === 'object')).toBe(true)
  })

  it('au moins un dossier porte programmes, sites et hypothèses (briefing élargi)', () => {
    for (const key of ['program_names', 'sites_france', 'qualified_hypotheses']) {
      expect(raws.some(raw => readList(raw, key).length > 0)).toBe(true)
    }
  })

  it('au moins un dossier a un organigramme que la route de Laura sait projeter', () => {
    const projections = raws.map(raw => projectOrgChart(raw['org'], []))
    expect(projections.some(p => p.status === 'ok')).toBe(true)
  })

  it('classe les deux entrées, la seconde VIDE À DESSEIN avec sa raison', () => {
    expect(DEMO_LAURA_DOSSIER_READS_COVERAGE.state).toBe('seede')
    expect(DEMO_COMPANY_PUBLIC_FACTS_COVERAGE.state).toBe('vide_a_dessein')
    expect(DEMO_COMPANY_PUBLIC_FACTS_COVERAGE.reason.length).toBeGreaterThan(40)
  })
})
