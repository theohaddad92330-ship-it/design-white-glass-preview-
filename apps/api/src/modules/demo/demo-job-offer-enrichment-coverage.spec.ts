import { DEMO_JOB_OFFER_ENRICHMENT_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #2322.70 — ce que la salle MONTRE sur la carte d'offre du dossier SNCF : rôle, équipe, compétences, tension
 * AVEC sa raison, exécuté sur le jeu réel (jamais une relecture du commentaire de `demo-coverage.ts`).
 */
type Offer = {
  title?: string
  role?: string
  team?: string
  tension?: boolean
  tension_reason?: string
  tension_days?: number
}

function sncfOffers(): Offer[] {
  const dossier = DEMO_DOSSIERS.find(d => d.account.company_name === 'SNCF')
  const raw = (dossier?.account.raw_analysis ?? {}) as { it_job_signals?: Offer[] }
  return raw.it_job_signals ?? []
}

describe('démo — extraction des offres (#2322.70)', () => {
  it('est classée SEMÉE dans demo-coverage.ts', () => {
    expect(DEMO_JOB_OFFER_ENRICHMENT_COVERAGE.state).toBe('seede')
  })

  it('SNCF : au moins une offre porte rôle ET équipe, et une tension avec sa raison', () => {
    const offers = sncfOffers()
    expect(offers.some(o => o.role && o.team)).toBe(true)
    const tense = offers.filter(o => o.tension === true)
    expect(tense.length).toBeGreaterThan(0)
    for (const o of tense) expect(o.tension_reason).toBeDefined()
    expect(tense.find(o => o.tension_reason === 'online_long')?.tension_days).toBeGreaterThan(0)
  })

  it('une offre sans preuve reste sans champ : ni rôle, ni équipe, ni tension inventés', () => {
    const bare = sncfOffers().filter(o => !o.role && !o.team && o.tension === undefined)
    expect(bare.length).toBeGreaterThan(0)
    for (const o of bare) expect(o).not.toHaveProperty('tension_reason')
  })
})
