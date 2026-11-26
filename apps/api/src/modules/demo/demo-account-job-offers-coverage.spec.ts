import { loadAccountJobOffers } from '../accounts/job-offers'
import { DEMO_ACCOUNT_JOB_OFFERS_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * Louis 30/10 — ce que la salle MONTRE quand on cherche un métier sur un compte, exécuté sur le jeu réel
 * (jamais une relecture du commentaire de `demo-coverage.ts`).
 */
function sncfAccount() {
  const dossier = DEMO_DOSSIERS.find(d => d.account.company_name === 'SNCF')
  if (!dossier) throw new Error('dossier SNCF absent du jeu de démo')
  return dossier.account
}

async function titles(term: string): Promise<string[]> {
  const search = jest.fn()
  const out = await loadAccountJobOffers(search, sncfAccount(), term, true)
  expect(search).not.toHaveBeenCalled()
  return out.offers.map(o => o.title)
}

describe('démo — offres d’un compte par métier (Louis 30/10)', () => {
  it('est classée SEMÉE dans demo-coverage.ts', () => {
    expect(DEMO_ACCOUNT_JOB_OFFERS_COVERAGE.state).toBe('seede')
  })

  it('SNCF : « data » et « devops » rendent les offres semées du métier', async () => {
    const data = await titles('data')
    expect(data).toEqual(expect.arrayContaining(['Ingénieur plateforme data (H/F)', 'Data analyst exploitation (H/F)']))
    expect(await titles('devops')).toEqual(expect.arrayContaining(['Ingénieur DevOps Kubernetes (H/F)']))
  })

  it('l’offre de stage semée n’est jamais servie', async () => {
    expect((await titles('')).some(t => /stage/i.test(t))).toBe(false)
  })
})
