import { AccountFactsController } from './account-facts.controller'
import { AccountFactsService } from './account-facts.service'

const WS = '11111111-1111-4111-8111-111111111111'
const A1 = '33333333-3333-4333-8333-333333333331'
const A2 = '33333333-3333-4333-8333-333333333332'
const A3 = '33333333-3333-4333-8333-333333333333'
const AS_OF = new Date('2026-10-15T08:00:00.000Z')

function build(history: unknown[], current: unknown[]) {
  const query = jest.fn(async (sql: string) => (/FROM signal_history\b/.test(sql) ? history : current))
  const service = new AccountFactsService({ manager: { query } } as never)
  return { service, query }
}

// #4072.4 — le lecteur de récurrence PAR LOT
describe('AccountFactsService.recurrenceForAccounts', () => {
  it('lit TOUTES les cibles en deux requêtes, quel que soit leur nombre', async () => {
    const { service, query } = build(
      [
        {
          account_id: A1,
          label: 'Recrute un chef de projet',
          signal_type: 'recrutement',
          signal_date: '2026-10-10',
          first_detected_at: '2026-10-10',
        },
        {
          account_id: A1,
          label: 'Recrute 3 data engineers',
          signal_type: 'recrutement',
          signal_date: '2026-10-01',
          first_detected_at: '2026-10-01',
        },
      ],
      [
        {
          id: A1,
          recent_signals: [{ signal: 'Recrute un architecte', type: 'recrutement', date: '2026-09-25' }],
        },
        { id: A2, recent_signals: [{ signal: 'Recrute un DevOps', type: 'recrutement', date: '2026-10-12' }] },
      ],
    )
    const out = await service.recurrenceForAccounts({ workspaceId: WS, accountIds: [A1, A2, A3], asOf: AS_OF })
    expect(query).toHaveBeenCalledTimes(2)
    expect(out[A1]).toEqual({ kind: 'hiring', count: 3, windowDays: 30 })
    // Un seul signal, ou aucun : aucune clé — jamais « 0 », jamais « 1 ».
    expect(A2 in out).toBe(false)
    expect(A3 in out).toBe(false)
  })

  it('cloisonne par espace et sans cible ne lit rien', async () => {
    const { service, query } = build([], [])
    expect(await service.recurrenceForAccounts({ workspaceId: WS, accountIds: [], asOf: AS_OF })).toEqual({})
    expect(query).not.toHaveBeenCalled()
    await service.recurrenceForAccounts({ workspaceId: WS, accountIds: [A1], asOf: AS_OF })
    for (const [sql, params] of query.mock.calls as unknown as Array<[string, unknown[]]>) {
      expect(sql).toMatch(/workspace_id = \$1/)
      expect(params[0]).toBe(WS)
    }
  })

  it('une lecture en panne rend une réponse vide, pas une erreur', async () => {
    const query = jest.fn(async () => {
      throw new Error('boom')
    })
    const service = new AccountFactsService({ manager: { query } } as never)
    expect(await service.recurrenceForAccounts({ workspaceId: WS, accountIds: [A1], asOf: AS_OF })).toEqual({})
  })
})

describe('AccountFactsController.recurrence', () => {
  it('passe les identifiants (dédoublonnés, bornés) au lecteur par lot, pour l’espace actif', async () => {
    const facts = {
      recurrenceForAccounts: jest.fn(async () => ({ [A1]: { kind: 'hiring', count: 3, windowDays: 30 } })),
    }
    const workspace = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WS, role: 'member' })) }
    const controller = new AccountFactsController(facts as never, workspace as never)
    const res = await controller.recurrence({ userId: 'u1' } as never, `${A1},${A1},${A2},pas-un-uuid`)
    expect(facts.recurrenceForAccounts).toHaveBeenCalledWith({ workspaceId: WS, accountIds: [A1, A2] })
    expect(res.recurrences[A1]?.count).toBe(3)
  })
})
