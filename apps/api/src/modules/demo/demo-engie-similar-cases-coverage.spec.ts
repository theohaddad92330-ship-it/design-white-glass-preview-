import { DEMO_DOSSIERS, DEMO_SIMILAR_CASES, DEMO_THIRD_LOST_DEAL } from './demo-dataset'
import { deriveSimilarCases } from '../capitalisation/similar-cases'

/**
 * #4289.2 / #3246.5 (recette démo 21/10) — la fiche ENGIE n'avait AUCUNE section « cas comparables » : les seuls
 * cas clos de la salle sont sur BNP Paribas (ancien client) et sur ENGIE elle-même (exclue de sa propre comparaison).
 * Une perte sur un AUTRE client actif donne à ENGIE son point commun : « Même stade de relation (client actif) ».
 */
const memoryOf = (company: string) =>
  DEMO_DOSSIERS.find(dossier => dossier.account.company_name === company)?.account.relationship_memory ?? null

const candidate = (company: string, accountId: string, relationStage: string | undefined) => ({
  accountId,
  accountLabel: company,
  sector: null,
  employees: null,
  groupRole: null,
  relationStage,
  outcome: 'lost' as const,
  missionLabel: null,
  whatWorked: null,
  whatFailed: null,
  projectLabel: 'x',
  lossReason: 'x',
  closedAt: null,
})

describe('#4289.2 — ENGIE a des cas comparables en démonstration', () => {
  const target = {
    accountId: 'engie',
    sector: null,
    employees: null,
    groupRole: null,
    relationStage: memoryOf('ENGIE')?.relationStage,
  }

  it('sans la perte sur un autre client actif, ENGIE ne se compare à rien (le défaut constaté)', () => {
    const bnp = candidate(
      DEMO_SIMILAR_CASES.account.company_name,
      'bnp',
      memoryOf(DEMO_SIMILAR_CASES.account.company_name)?.relationStage,
    )
    expect(deriveSimilarCases(target, [bnp])).toEqual([])
  })

  it('la perte semée sur un autre client actif ressort avec « Même stade de relation (client actif) »', () => {
    const company = DEMO_THIRD_LOST_DEAL.account.company_name
    expect(company).not.toBe('ENGIE')
    const cases = deriveSimilarCases(target, [candidate(company, 'other', memoryOf(company)?.relationStage)])
    expect(cases).toHaveLength(1)
    expect(cases[0]?.similarities).toContain('Même stade de relation (client actif).')
  })

  it('la perte est dans la liste fermée des motifs et datée', () => {
    expect([
      'price',
      'competitor_won',
      'no_budget',
      'project_cancelled',
      'bad_timing',
      'no_profile_available',
      'other',
    ]).toContain(DEMO_THIRD_LOST_DEAL.lost.loss_reason_code)
    expect(DEMO_THIRD_LOST_DEAL.lost.closed_days_ago).toBeGreaterThan(0)
  })
})
