import type { DataSource } from 'typeorm'
import { LauraProbeService } from './laura-probe.service'

/**
 * #4759 critère 4 — le détecteur n'exclut plus les offres archivées « par principe » (revient sur le filtre
 * `freshness !== 'archive'` posé par #4769) : une offre ancienne est un besoin passé utilisable, sa date réelle voyage
 * brute avec elle. Sans date, une offre archivée ne se cite pas (on ne dit pas un âge qu'on ne connaît pas).
 */
describe('LauraProbeService.accountHiringSignals (#4759.4)', () => {
  const WS = '00000000-0000-4000-8000-000000000001'
  const ACCOUNT = '00000000-0000-4000-8000-000000000002'

  function probe(signals: unknown[]): LauraProbeService {
    const query = jest.fn().mockResolvedValue([{ recent_signals: signals }])
    return new LauraProbeService({ query } as unknown as DataSource)
  }

  const base = { type: 'recrutement', source: 'APEC' }

  it('garde une offre archivée datée, avec sa date réelle', async () => {
    const facts = await probe([
      { ...base, signal: 'Lead développeur Java', date: '2025-11-12', freshness: 'archive' },
    ]).accountHiringSignals(WS, ACCOUNT)
    expect(facts).toHaveLength(1)
    expect(facts?.[0]).toMatchObject({ kind: 'hiring_signal', observedOn: '2025-11-12', count: null })
  })

  it('une offre archivée SANS date ne se cite pas', async () => {
    const facts = await probe([
      { ...base, signal: 'Lead développeur Java', date: null, freshness: 'archive' },
      { ...base, signal: 'Architecte Java', date: '2026-10-20', freshness: 'current' },
    ]).accountHiringSignals(WS, ACCOUNT)
    expect(facts?.map(fact => fact.statement)).toEqual(['Architecte Java'])
  })
})
