import { buildTechStructure } from '../accounts/account-tech-structure'
import { DEMO_TECH_STRUCTURE_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4742 (craft rule n°9) — la structure technique est REMPLIE en démo : un prospect qui ouvre le compte voit des
 * outils prouvés, et un axe non observé nommé. La garde lit le jeu RÉEL, pas une copie.
 */
describe('démo — la structure technique du compte (#4742)', () => {
  const sncf = DEMO_DOSSIERS.find(dossier => /SNCF/i.test(dossier.account.company_name ?? ''))
  const raw = (sncf?.account.raw_analysis ?? {}) as {
    it_job_signals?: Parameters<typeof buildTechStructure>[0]['jobSignals']
  }
  const structure = buildTechStructure({ jobSignals: raw.it_job_signals })

  it('la garde trouve le dossier SNCF', () => {
    expect(sncf).toBeDefined()
  })

  it('ressort ERP, données, hébergement et outils métier, chacun avec une preuve datée et un lien', () => {
    for (const axis of ['erp', 'data', 'hosting', 'business'] as const) {
      const read = structure.axes.find(a => a.axis === axis)
      expect(read?.status).toBe('observed')
      for (const tech of read?.technologies ?? []) {
        expect(tech.proofs[0]?.observed_at).toBeTruthy()
        expect(tech.proofs[0]?.url).toMatch(/^https:\/\/example\.org\/demo\//)
      }
    }
  })

  it('sait dire NON : le CRM reste nommé « non observé », et l’offre de stage ne prouve rien', () => {
    expect(structure.not_observed_axes).toEqual(['crm'])
  })

  it('est classée « seedée » avec sa raison', () => {
    expect(DEMO_TECH_STRUCTURE_COVERAGE.state).toBe('seede')
    expect(DEMO_TECH_STRUCTURE_COVERAGE.reason).toContain('#4742')
  })
})
