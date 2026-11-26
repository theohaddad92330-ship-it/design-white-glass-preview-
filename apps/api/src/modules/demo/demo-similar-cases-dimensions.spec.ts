import { relationshipStateSchema } from '@bellum/contracts'
import { DEMO_DOSSIERS, DEMO_PIPE_L2, DEMO_SECOND_LOST_DEAL, DEMO_SIMILAR_CASES } from './demo-dataset'
import { deriveSimilarCases, medianClosedCycleDays, timingOf } from '../capitalisation/similar-cases'

/**
 * #3246.relation / #3246.timing (décision Louis 16/10/2026, craft n°9) — les deux
 * dernières dimensions de similarité sont REMPLIES en démonstration : la
 * relation par un stade SAISI dans la liste fermée, le timing CALCULÉ depuis
 * les dates d'affaires closes déjà semées. Une garde qui sait dire NON : un
 * stade hors liste, ou moins de trois cycles clos, la font échouer.
 */
const memoryOf = (company: string) =>
  DEMO_DOSSIERS.find(dossier => dossier.account.company_name === company)?.account.relationship_memory ?? null

describe('#3246.relation — stade de relation semé sur les porteurs de cas', () => {
  it.each([DEMO_SIMILAR_CASES.account.company_name, DEMO_SECOND_LOST_DEAL.account.company_name, 'Société Générale'])(
    '%s porte un stade de la liste fermée',
    company => {
      const stage = memoryOf(company)?.relationStage
      expect(relationshipStateSchema.safeParse(stage).success).toBe(true)
    },
  )

  it('Société Générale se compare à BNP Paribas ET à ENGIE sur la relation, nommée par libellé', () => {
    const target = {
      accountId: 'sg',
      sector: null,
      employees: null,
      groupRole: null,
      relationStage: memoryOf('Société Générale')?.relationStage,
    }
    const candidate = (accountId: string, company: string) => ({
      accountId,
      accountLabel: company,
      sector: null,
      employees: null,
      groupRole: null,
      relationStage: memoryOf(company)?.relationStage,
      outcome: 'lost' as const,
      missionLabel: null,
      whatWorked: null,
      whatFailed: null,
      projectLabel: 'x',
      lossReason: 'x',
      closedAt: null,
    })
    const cases = deriveSimilarCases(target, [candidate('engie', 'ENGIE')])
    expect(cases[0]?.similarities).toContain('Même stade de relation (client actif).')
    const [bnp] = deriveSimilarCases({ ...target, sector: 'Banque' }, [
      { ...candidate('bnp', 'BNP Paribas'), sector: 'Banque' },
    ])
    expect(bnp.differences).toContain(
      'Stade de relation différent (ancien client sur ce cas, contre client actif ici).',
    )
  })
})

describe('#3246.timing — le cycle habituel se CALCULE depuis les affaires closes semées', () => {
  const closedCycles = DEMO_PIPE_L2.deals
    .filter(deal => deal.stage === 'won' || deal.stage === 'lost')
    .map(deal =>
      typeof deal.created === 'number' && typeof deal.closed === 'number' ? deal.created - deal.closed : null,
    )

  it('au moins trois cycles clos datés : la médiane existe, le timing est évaluable', () => {
    expect(closedCycles.filter(days => days !== null).length).toBeGreaterThanOrEqual(3)
    const median = medianClosedCycleDays(closedCycles)
    expect(median).not.toBeNull()
    // Les deux pertes semées (cycle de 60 jours) reçoivent une position, jamais devinée.
    expect(timingOf(60, median)).not.toBeNull()
  })

  it('SAIT DIRE NON — deux cycles seulement ne font pas un cycle habituel', () => {
    expect(medianClosedCycleDays(closedCycles.filter(days => days !== null).slice(0, 2))).toBeNull()
  })
})
