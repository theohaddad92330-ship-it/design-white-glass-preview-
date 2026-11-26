import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4031 — DECATHLON-FIN : la Veille de la démo montre des offres d'emploi de PLUSIEURS entités d'un même groupe
 * (le compteur « Jobs IT » les compte toutes). Un lien de démonstration qui ne montrerait qu'une offre cacherait
 * justement ce que le correctif apporte. Les liens sont distincts : deux offres, jamais un doublon.
 */
describe('démo — offres de plusieurs entités d’un même groupe', () => {
  const sncf = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'SNCF')

  it('le dossier SNCF porte au moins trois offres de recrutement aux liens distincts', () => {
    expect(sncf).toBeDefined()
    const offers = (sncf!.account.recent_signals ?? []).filter(signal => signal.type === 'recrutement')
    expect(offers.length).toBeGreaterThanOrEqual(3)
    expect(new Set(offers.map(offer => offer.url)).size).toBe(offers.length)
  })

  it('sait dire NON : tous les dossiers ne se ressemblent pas, un dossier sans offre n’en reçoit pas', () => {
    const others = DEMO_DOSSIERS.filter(dossier => dossier.account.company_name !== 'SNCF')
    expect(others.some(dossier => (dossier.account.recent_signals ?? []).every(s => s.type !== 'recrutement'))).toBe(
      true,
    )
  })
})
