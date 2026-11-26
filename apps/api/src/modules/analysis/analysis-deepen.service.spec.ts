import { REFRESH_DIMENSION_CREDIT_COST } from '@bellum/contracts'
import { AnalysisDeepenService } from './analysis-deepen.service'

const A = '11111111-1111-4111-8111-111111111111'
const FOREIGN = '99999999-9999-4999-8999-999999999999'
const NOW = new Date('2026-09-22T20:00:00.000Z')
const SCOPE = { workspaceId: 'ws-1', businessUnitScope: null }

const accountA = {
  id: A,
  company_name: 'Acme',
  status: 'completed',
  signals_refreshed_at: new Date(NOW.getTime() - 3_600_000),
  contacts_refreshed_at: null,
  entities_refreshed_at: null,
  strategy_refreshed_at: null,
}

function build(opts: { ledger?: Array<{ account_id: string; kind: string; delta: number }> } = {}) {
  const ledger = { find: jest.fn(async () => opts.ledger ?? []) }
  const service = new AnalysisDeepenService(ledger as never)
  const quote = (
    targets: Array<{ accountId: string; dimension: 'signals' | 'contacts' }>,
    accounts: object[] = [accountA],
  ) => service.quote({ scope: SCOPE, targets, accounts: accounts as never, remaining: 10, now: NOW })
  return { quote, ledger }
}

describe('AnalysisDeepenService.quote (#2452.2 / #2452.4 / #2452.5)', () => {
  it('réutilise la phase fraîche, devise le reste, et compte ce qui a déjà été investi', async () => {
    const { quote: run } = build({
      ledger: [
        { account_id: A, kind: 'consume_analysis', delta: -1 },
        { account_id: A, kind: 'consume_enrichment', delta: -1 },
        { account_id: A, kind: 'refund_enrichment', delta: 1 },
        { account_id: A, kind: 'consume_enrichment', delta: -1 },
      ],
    })
    const quote = await run([
      { accountId: A, dimension: 'signals' },
      { accountId: A, dimension: 'contacts' },
    ])
    expect(quote.lines.map(l => [l.dimension, l.status])).toEqual([
      ['signals', 'reuse'],
      ['contacts', 'run'],
    ])
    expect(quote.alreadyInvested).toBe(2)
    expect(quote.delta).toBe(REFRESH_DIMENSION_CREDIT_COST.contacts)
    expect(quote.remaining).toBe(10)
  })

  it('un compte hors de l’espace de l’appelant ne fait AUCUNE ligne (un id écrit par le modèle n’est qu’une candidature)', async () => {
    const { quote: run } = build()
    // Le contrôleur n'a résolu AUCUN compte visible : rien n'arrive ici.
    const quote = await run([{ accountId: FOREIGN, dimension: 'signals' }], [])
    expect(quote.lines).toEqual([])
    expect(quote.delta).toBe(0)
  })

  it('le grand livre est lu DANS l’espace de l’appelant, jamais agrégé entre espaces (GA-43)', async () => {
    const { quote: run, ledger } = build()
    await run([{ accountId: A, dimension: 'signals' }])
    expect(ledger.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspace_id: 'ws-1' }) }),
    )
  })

  it('un compte sans dossier terminé se nomme, sans coût', async () => {
    const { quote: run } = build()
    const quote = await run([{ accountId: A, dimension: 'signals' }], [{ ...accountA, status: 'analyzing' }])
    expect(quote.lines[0]).toEqual(expect.objectContaining({ status: 'no_dossier', cost: 0 }))
  })
})
