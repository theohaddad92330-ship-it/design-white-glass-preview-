import { analysisCandidates } from './account-signal-lines.sources'

/** #5000.1 — le contrat DÉCLARÉ par l'offre doit être SERVI sur la ligne (champ à part), jamais lu dans le titre. */
describe('analysisCandidates — type de contrat des offres (#5000.1)', () => {
  it('sert le contrat déclaré d’une offre collectée (it_job_signals)', () => {
    const out = analysisCandidates(
      { it_job_signals: [{ title: 'Joaillier (H/F)', date: '2026-10-10', contract_type: 'CDI' }] },
      [],
    )
    expect(out.find(c => c.type === 'recrutement')?.contractType).toBe('CDI')
  })

  it('une offre sans contrat déclaré n’en sert pas, même si le titre dit CDI', () => {
    const out = analysisCandidates({ it_job_signals: [{ title: 'Joaillier (H/F) CDI', date: '2026-10-10' }] }, [])
    expect(out.find(c => c.type === 'recrutement')?.contractType).toBeNull()
  })

  it('sert le contrat d’un signal de l’analyse et d’un besoin mémoire marché', () => {
    const recent = [{ type: 'recrutement', signal: 'Offre : Chef de projet', date: '2026-10-02', contract_type: 'CDD' }]
    const items = {
      historical_needs: {
        items: [{ label: 'Offre ancienne', date: '2024-02-02', source: 'job_offer', contract_type: 'CDI' }],
      },
    }
    const out = analysisCandidates(items, recent)
    expect(out.map(c => c.contractType)).toEqual(expect.arrayContaining(['CDD', 'CDI']))
  })
})
