import { CrmDealSignalsSweeper } from './crm-deal-signals.sweeper'

type QueryStub = jest.Mock<Promise<unknown[]>, [string, unknown[]?]>

function build(options: { query: QueryStub; record?: jest.Mock }) {
  const repo = { manager: { query: options.query } } as never
  const sweeper = new CrmDealSignalsSweeper(repo, undefined, options.record as never)
  return { sweeper }
}

const NOW = new Date('2026-10-15T12:00:00Z')

const lostDealRow = {
  id: 'deal-1',
  name: 'Refonte SI — ACME',
  amount: '12000',
  deal_created_at: new Date('2026-01-01T00:00:00Z'),
  closed_at: new Date('2026-07-01T00:00:00Z'),
  last_activity_at: null,
  is_closed: true,
  is_won: false,
  workspace_id: 'ws-1',
  owner_id: null,
  account_id: 'acc-1',
}

describe('CrmDealSignalsSweeper — #3918', () => {
  const previous = process.env.CRM_DEAL_SIGNALS_DISABLED
  afterEach(() => {
    if (previous === undefined) delete process.env.CRM_DEAL_SIGNALS_DISABLED
    else process.env.CRM_DEAL_SIGNALS_DISABLED = previous
  })

  it('ne touche à RIEN quand l’interrupteur est posé', async () => {
    process.env.CRM_DEAL_SIGNALS_DISABLED = 'true'
    const query: QueryStub = jest.fn()
    const { sweeper } = build({ query })
    expect(await sweeper.sweep(NOW)).toBe(0)
    expect(query).not.toHaveBeenCalled()
  })

  it('exclut les espaces de démonstration de sa propre requête', async () => {
    const query: QueryStub = jest.fn().mockResolvedValue([])
    const { sweeper } = build({ query })
    await sweeper.sweep(NOW)
    expect(query.mock.calls[0]?.[0]).toContain('w.is_demo = false')
  })

  it('persiste un événement canonique pour chaque signal détecté', async () => {
    const query: QueryStub = jest.fn().mockResolvedValue([lostDealRow])
    const record = jest.fn().mockResolvedValue(true)
    const { sweeper } = build({ query, record })

    expect(await sweeper.sweep(NOW)).toBe(1)
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'affaire_perdue',
        source: 'crm-deal-signals',
        object: { subjectType: 'crm_deal', subjectId: 'deal-1' },
        scope: { workspaceId: 'ws-1', ownerId: null },
      }),
      'crm/crm-deal-signals.sweeper',
      // #3918.a — le compte rattaché et la date du FAIT (clôture), pas l'instant du balayage.
      { accountId: 'acc-1', factOccurredAt: '2026-07-01T00:00:00.000Z' },
    )
  })

  it('#3918.a — une affaire DÉJÀ consignée n’est pas recomptée (balayage quotidien)', async () => {
    const query: QueryStub = jest.fn().mockResolvedValue([lostDealRow])
    const record = jest.fn().mockResolvedValue(false)
    const { sweeper } = build({ query, record })
    expect(await sweeper.sweep(NOW)).toBe(0)
  })

  it('#3918.a — rattache les deals à leurs comptes AVANT les règles', async () => {
    const order: string[] = []
    const query: QueryStub = jest.fn(async (_sql: string) => {
      order.push('rules')
      return []
    })
    const linker = { link: jest.fn(async () => (order.push('link'), 0)) }
    const sweeper = new CrmDealSignalsSweeper({ manager: { query } } as never, undefined, undefined, linker as never)
    await sweeper.sweep(NOW)
    expect(order).toEqual(['link', 'rules'])
  })

  it('ne compte que les signaux RÉELLEMENT persistés', async () => {
    const query: QueryStub = jest.fn().mockResolvedValue([lostDealRow])
    const { sweeper } = build({ query })
    expect(await sweeper.sweep(NOW)).toBe(0)
  })
})

/** #3920.crm (lot M01) — la cloche suit le registre : une alerte par compte, seulement pour du NEUF. */
describe('CrmDealSignalsSweeper — alerte « nouveau signal » CRM (#3920.crm)', () => {
  const dormant = {
    ...lostDealRow,
    id: 'deal-2',
    name: 'Data — ACME',
    is_closed: false,
    is_won: null,
    closed_at: null,
    last_activity_at: new Date('2026-07-01T00:00:00Z'),
  }
  const orphan = { ...lostDealRow, id: 'deal-3', name: 'Sans compte', account_id: null }

  function sweeperWith(rows: unknown[], record: jest.Mock, notify: jest.Mock) {
    const query: QueryStub = jest.fn().mockResolvedValue(rows)
    return new CrmDealSignalsSweeper(
      { manager: { query } } as never,
      undefined,
      record as never,
      undefined,
      notify as never,
    )
  }

  it('UNE alerte par compte, qui porte les faits NEUFS de ce compte', async () => {
    const notify = jest.fn().mockResolvedValue(undefined)
    await sweeperWith([lostDealRow, dormant], jest.fn().mockResolvedValue(true), notify).sweep(NOW)
    expect(notify).toHaveBeenCalledTimes(1)
    const [accountId, evidences] = notify.mock.calls[0] ?? []
    expect(accountId).toBe('acc-1')
    expect(evidences).toHaveLength(2)
  })

  it('une affaire DÉJÀ consignée ne sonne pas une seconde fois', async () => {
    const notify = jest.fn()
    await sweeperWith([lostDealRow], jest.fn().mockResolvedValue(false), notify).sweep(NOW)
    expect(notify).not.toHaveBeenCalled()
  })

  it('une affaire sans compte rattaché ne sonne jamais (pas de compte à ouvrir)', async () => {
    const notify = jest.fn()
    await sweeperWith([orphan], jest.fn().mockResolvedValue(true), notify).sweep(NOW)
    expect(notify).not.toHaveBeenCalled()
  })
})
