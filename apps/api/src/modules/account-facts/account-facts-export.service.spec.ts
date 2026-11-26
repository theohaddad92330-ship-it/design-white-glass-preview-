import type { AccountFacts } from '@bellum/contracts'
import { AccountFactsExportService } from './account-facts-export.service'

const WS = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const A = '33333333-3333-4333-8333-333333333333'
const B = '44444444-4444-4444-8444-444444444444'
const GONE = '55555555-5555-4555-8555-555555555555'

const facts = (rows: AccountFacts['facts']): AccountFacts => ({ asOf: '2026-10-12T08:00:00.000Z', facts: rows })

function build(byAccount: Record<string, AccountFacts | null>) {
  const forAccount = jest.fn(async (args: { accountId: string }) => byAccount[args.accountId] ?? null)
  const resolveActiveWorkspace = jest.fn(async () => ({ workspaceId: WS, role: 'member' }))
  const service = new AccountFactsExportService({ forAccount } as never, { resolveActiveWorkspace } as never)
  return { service, forAccount }
}

describe('#4073.1 — cellules de faits pour un export', () => {
  it('lit chaque compte DANS l’espace du demandeur et rend les six colonnes', async () => {
    const { service, forAccount } = build({
      [A]: facts([{ date: '2026-03-02', kind: 'hiring', label: 'Architecte cloud', weight: 1, ageDays: 224 }]),
      [B]: facts([]),
    })
    const out = await service.cellsFor(USER, [A, B])
    expect(forAccount).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WS, userId: USER, accountId: A }))
    expect(out.cells[A]?.lastHiring).toBe('2026-03-02 — Architecte cloud')
    expect(out.cells[B]).toEqual({
      lastHiring: '',
      lastNeed: '',
      lastSignal: '',
      dealWon: '',
      dealLost: '',
      mission: '',
    })
  })

  it('un compte hors espace n’a AUCUNE entrée (ni cellules vides, ni erreur)', async () => {
    const { service } = build({ [A]: facts([]) })
    const out = await service.cellsFor(USER, [A, GONE])
    expect(Object.keys(out.cells)).toEqual([A])
  })

  it('déduplique les identifiants : un compte est lu une seule fois', async () => {
    const { service, forAccount } = build({ [A]: facts([]) })
    await service.cellsFor(USER, [A, A])
    expect(forAccount).toHaveBeenCalledTimes(1)
  })
})
