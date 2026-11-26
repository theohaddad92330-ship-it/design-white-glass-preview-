import { DEMO_DOSSIERS } from './demo-dataset'
import { DEMO_ACCOUNTS_LIST_V22_COVERAGE } from './demo-coverage'

/**
 * #4497 (PR 12C, maquette V22) — LES QUATRE PREMIERS DOSSIERS DE LA SALLE REMPLISSENT « REPRENDRE LE FIL »
 * ET LE TABLEAU DES COMPTES : un sujet (le signal dominant), une prochaine action écrite (première action du
 * plan, lue par `GET /accounts` à `raw_analysis.plan.nextActions[0].label`) et des personnes.
 *
 * L'étagère ne montre QUE les comptes qui ont une prochaine action (`accountsToResume`) : un dossier sans
 * action ne fait pas de carte, et une salle dont trois des quatre premiers comptes n'en ont pas montrerait
 * une étagère à une carte devant un prospect. Le responsable, lui, est posé au semis pour tous les comptes
 * (`assigned_to`, garde `demo-portfolio-is-owned.spec.ts`).
 */
const FIRST_FOUR = DEMO_DOSSIERS.slice(0, 4)

function firstNextActionLabel(rawAnalysis: unknown): string | null {
  const plan = (rawAnalysis as { plan?: { nextActions?: { label?: unknown }[] } } | null)?.plan
  const label = plan?.nextActions?.[0]?.label
  return typeof label === 'string' && label.trim() !== '' ? label : null
}

describe('démo — la liste des comptes V22 (#4497)', () => {
  it.each(FIRST_FOUR.map(dossier => [dossier.account.company_name, dossier] as const))(
    '%s porte une prochaine action écrite (première action du plan)',
    (_name, dossier) => {
      expect(firstNextActionLabel(dossier.account.raw_analysis)).not.toBeNull()
    },
  )

  it.each(FIRST_FOUR.map(dossier => [dossier.account.company_name, dossier] as const))(
    '%s porte un sujet (au moins un signal) et des personnes',
    (_name, dossier) => {
      expect((dossier.account.recent_signals ?? []).length).toBeGreaterThan(0)
      expect(dossier.contacts.length).toBeGreaterThan(1)
    },
  )
})

describe('démo — la liste des comptes V22 est classée (craft rule n°9)', () => {
  it('est classée « seedée » dans demo-coverage.ts', () => {
    expect(DEMO_ACCOUNTS_LIST_V22_COVERAGE.state).toBe('seede')
  })
})
