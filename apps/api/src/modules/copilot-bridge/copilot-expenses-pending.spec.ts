import { CopilotBridgeController } from './copilot-bridge.controller'

/**
 * #2987.56 — la file des notes de frais qui attendent une décision, pour que
 * Laura puisse PROPOSER de valider/refuser pendant une conversation (vocale
 * comme texte) — jusqu'ici elle ne savait que naviguer vers `/expenses`.
 * Lecture seule, comme tout ce pont : aucune décision ne s'écrit d'ici.
 */
describe('CopilotBridgeController.expensesPending (#2987.56)', () => {
  const can = jest.requireActual('@bellum/contracts').can as (...args: unknown[]) => boolean

  function call(context: { expenseReports?: { list: jest.Mock }; role?: string; extra?: string[] }) {
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1', role: context.role ?? 'finance' }),
      extraPermissionsOf: jest.fn().mockResolvedValue(context.extra ?? []),
    }
    return {
      workspaceContext,
      out: CopilotBridgeController.prototype.expensesPending.call(
        { expenseReports: context.expenseReports, workspaceContext } as never,
        { userId: 'u-1' } as never,
      ),
    }
  }

  it("sans le droit `finance:write`, rend une file VIDE plutôt qu'une carte qui échouerait au clic", async () => {
    const list = jest.fn()
    const { out, workspaceContext } = call({ expenseReports: { list }, role: 'member', extra: [] })
    expect(await out).toEqual({ items: [], allowed: false })
    expect(list).not.toHaveBeenCalled()
    expect(workspaceContext.extraPermissionsOf).toHaveBeenCalledWith('w-1', 'u-1')
  })

  it('avec le droit, relaie la file des SOUMISES (`pending`) SANS le montant — `canReadFinance: false` en dur', async () => {
    const list = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'r-1',
          reference: 'NF-2026-014',
          bearerName: 'Julie Martin',
          accountName: 'Orange',
          periodMonth: '2026-09',
          status: 'pending',
          missionId: null,
          lineCount: 3,
          totalAmountCents: null,
        },
      ],
      tiles: {},
      canReadFinance: false,
      total: 1,
      page: 1,
      pageSize: 50,
    })
    const { out } = call({ expenseReports: { list }, role: 'finance' })
    expect(await out).toEqual({
      items: [
        {
          id: 'r-1',
          reference: 'NF-2026-014',
          bearerName: 'Julie Martin',
          accountName: 'Orange',
          periodMonth: '2026-09',
        },
      ],
      allowed: true,
    })
    expect(list).toHaveBeenCalledWith('w-1', { status: 'pending', pageSize: 50 }, false)
  })

  it('`reportId` resserre la file à UNE note — absente de la file des SOUMISES, la liste reste vide', async () => {
    const list = jest.fn().mockResolvedValue({
      items: [
        { id: 'r-1', reference: 'NF-2026-014', bearerName: 'Julie Martin', accountName: null, periodMonth: '2026-09' },
      ],
      tiles: {},
      canReadFinance: false,
      total: 1,
      page: 1,
      pageSize: 50,
    })
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1', role: 'finance' }),
      extraPermissionsOf: jest.fn().mockResolvedValue([]),
    }
    const out = await CopilotBridgeController.prototype.expensesPending.call(
      { expenseReports: { list }, workspaceContext } as never,
      { userId: 'u-1', reportId: 'r-9-absente' } as never,
    )
    expect(out).toEqual({ items: [], allowed: true })
  })

  it('sans le service (optionnel), le DIT plutôt que de faire tomber le pont', async () => {
    const workspaceContext = { resolveActiveWorkspace: jest.fn(), extraPermissionsOf: jest.fn() }
    const out = await CopilotBridgeController.prototype.expensesPending.call(
      { expenseReports: undefined, workspaceContext } as never,
      { userId: 'u-1' } as never,
    )
    expect(out).toEqual({ items: [], allowed: false })
    expect(workspaceContext.resolveActiveWorkspace).not.toHaveBeenCalled()
  })

  it('témoin : `can` refuse bien `finance:write` à un rôle `member` sans droit étendu — la garde teste une vraie règle', () => {
    expect(can('member', [], 'finance:write')).toBe(false)
    expect(can('finance', [], 'finance:write')).toBe(true)
  })
})
