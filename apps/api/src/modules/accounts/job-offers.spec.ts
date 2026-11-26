import { loadAccountJobOffers } from './job-offers'

/**
 * Louis 30/10 — offres d'un compte par métier saisi, 5 par 5 jusqu'à 50.
 * La route ne fait qu'ouvrir la porte d'appartenance puis appeler cette lecture.
 */
describe('loadAccountJobOffers', () => {
  const account = {
    company_name: 'DECATHLON',
    website: 'decathlon.fr',
    siren: '306138900',
    raw_analysis: { it_job_signals: [{ title: 'Data Engineer' }, { title: 'Vendeur' }] },
  }

  it('interroge le moteur avec le nom du compte et le métier, sans nommer le fournisseur', async () => {
    const search = jest.fn().mockResolvedValue({
      offers: [{ title: 'Data Scientist', company: 'DECATHLON', city: 'Lille', source: 'adzuna' }],
      searched: true,
    })
    const out = await loadAccountJobOffers(search, account, 'data', false)
    expect(search).toHaveBeenCalledWith({
      company: 'DECATHLON',
      term: 'data',
      website: 'decathlon.fr',
      siren: '306138900',
    })
    expect(out.searched).toBe(true)
    expect(out.offers).toEqual([expect.objectContaining({ title: 'Data Scientist', employer: 'DECATHLON' })])
    expect(JSON.stringify(out)).not.toContain('adzuna')
  })

  it('borne à 50 et écarte les stages', async () => {
    const rows = [...Array.from({ length: 60 }, (_, i) => ({ title: `Data ${i}` })), { title: 'Stage Data' }]
    const out = await loadAccountJobOffers(
      jest.fn().mockResolvedValue({ offers: rows, searched: true }),
      account,
      '',
      false,
    )
    expect(out.offers).toHaveLength(50)
    expect(out.offers.some(o => o.title.startsWith('Stage'))).toBe(false)
  })

  it('une recherche qui n’a pas pu partir le dit (searched: false), jamais « aucune offre »', async () => {
    const out = await loadAccountJobOffers(
      jest.fn().mockResolvedValue({ offers: [], searched: false }),
      account,
      'data',
      false,
    )
    expect(out).toEqual({ term: 'data', searched: false, offers: [] })
  })

  it('démo : aucune collecte, les offres semées du dossier filtrées par le métier', async () => {
    const search = jest.fn()
    const out = await loadAccountJobOffers(search, account, 'data', true)
    expect(search).not.toHaveBeenCalled()
    expect(out.offers.map(o => o.title)).toEqual(['Data Engineer'])
  })
})
