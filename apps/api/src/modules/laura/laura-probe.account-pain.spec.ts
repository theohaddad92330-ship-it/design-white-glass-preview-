import type { DataSource } from 'typeorm'
import { LauraProbeService } from './laura-probe.service'

/**
 * #3939.3 — la sonde lit la douleur du dossier ouvert : trois clés de
 * `raw_analysis`, jamais le dossier entier, et un `null` qui ne conclut rien.
 */
describe('LauraProbeService.accountPainFacts (#3939.3)', () => {
  const NOW = new Date(Date.UTC(2026, 9, 13))
  const WS = '00000000-0000-4000-8000-000000000001'
  const ACCOUNT = '00000000-0000-4000-8000-000000000002'

  function probe(query: jest.Mock): LauraProbeService {
    return new LauraProbeService({ query } as unknown as DataSource)
  }

  it('rend l’hypothèse fondée et ses signaux datés, portée de l’espace', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        hypotheses: [{ hypothesis: 'Arbitrage budgétaire', basedOnSignalIds: ['s1'] }],
        pains: null,
        signals: [{ id: 's1', signal: 'Plan annoncé', date: '2026-09-20', freshness: 'current' }],
      },
    ])
    const facts = await probe(query).accountPainFacts(WS, ACCOUNT, NOW)
    expect(facts?.map(fact => fact.kind)).toEqual(['pain_hypothesis', 'pain_signal'])
    expect(facts?.[1]?.observedOn).toBe('2026-09-20')
    expect(query.mock.calls[0]?.[1]).toEqual([ACCOUNT, WS])
    expect(String(query.mock.calls[0]?.[0])).not.toMatch(/SELECT\s+raw_analysis\s+FROM/)
  })

  it('sait dire NON : un signal sans date ne fonde rien ⇒ `[]`', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        hypotheses: [{ hypothesis: 'Arbitrage budgétaire', based_on_signal_ids: ['s1'] }],
        pains: null,
        signals: [{ id: 's1', signal: 'Plan annoncé', date: null, freshness: 'current' }],
      },
    ])
    expect(await probe(query).accountPainFacts(WS, ACCOUNT, NOW)).toEqual([])
  })

  it('compte introuvable ou lecture en échec ⇒ `null`, jamais « aucune douleur »', async () => {
    expect(await probe(jest.fn().mockResolvedValue([])).accountPainFacts(WS, ACCOUNT, NOW)).toBeNull()
    expect(await probe(jest.fn().mockRejectedValue(new Error('boom'))).accountPainFacts(WS, ACCOUNT, NOW)).toBeNull()
  })
})
