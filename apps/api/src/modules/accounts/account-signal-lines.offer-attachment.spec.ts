import { analysisCandidates } from './account-signal-lines.sources'

/** #5185 — la recherche de l'Historique lit titre, compétences et extrait : l'API doit les SERVIR. */
describe('analysisCandidates — rattachement d’offre (#5185)', () => {
  const recent = (offerAttachment: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    type: 'recrutement',
    signal: 'Offre : Ingénieur logiciel H/F',
    date: '2026-05-02',
    offer_attachment: { status: 'attached', fact_type: null, job_family: null, ...offerAttachment },
    ...extra,
  })

  it('sert l’extrait de l’offre quand aucune implication commerciale n’est portée', () => {
    const [line] = analysisCandidates({}, [recent({ skills: [], extract: 'Stack Java 17, Spring Boot' })])
    expect(line?.detail).toBe('Stack Java 17, Spring Boot')
  })

  it('garde l’implication commerciale en détail et ne mélange pas', () => {
    const [line] = analysisCandidates({}, [
      recent({ skills: [], extract: 'Stack Java' }, { sales_implication: 'Renfort probable' }),
    ])
    expect(line?.detail).toBe('Renfort probable')
  })

  it('sert les compétences écrites en objets { term }', () => {
    const [line] = analysisCandidates({}, [recent({ skills: [{ term: 'Java' }, 'Spring'] })])
    expect(line?.technologies).toEqual(['Java', 'Spring'])
  })

  it('une valeur absente reste absente', () => {
    const [line] = analysisCandidates({}, [recent({ skills: [], extract: null })])
    expect(line?.detail).toBeNull()
    expect(line?.technologies).toEqual([])
  })
})
