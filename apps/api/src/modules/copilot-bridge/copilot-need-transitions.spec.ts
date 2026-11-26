import { CopilotBridgeController } from './copilot-bridge.controller'

/**
 * #2320.24 (épopée #2967) — Laura peut LIRE l'état de la chaîne commerciale
 * d'un besoin : statut actuel + historique de transition complet. Même motif
 * que `projectRead` (#2324.39) : lecture seule, scopée à l'espace ACTIF.
 */
describe('CopilotBridgeController.needTransitions (#2320.24)', () => {
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) }

  function call(pipeline: unknown) {
    return CopilotBridgeController.prototype.needTransitions.call(
      { pipeline, workspaceContext } as never,
      { userId: 'u-1', needId: 'n-1' } as never,
    )
  }

  it("rend le statut et l'historique lus sur l'espace ACTIF", async () => {
    const needTransitionHistory = jest.fn().mockResolvedValue({
      needId: 'n-1',
      status: 'qualified',
      transitions: [{ id: 't-1', toState: 'qualified', fromState: 'to_qualify' }],
    })
    const out = await call({ needTransitionHistory })
    expect(needTransitionHistory).toHaveBeenCalledWith('w-1', 'n-1')
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(out).toEqual({
      needId: 'n-1',
      status: 'qualified',
      transitions: [{ id: 't-1', toState: 'qualified', fromState: 'to_qualify' }],
    })
  })

  it("un besoin introuvable (ou d'un AUTRE espace) : une erreur nommée, jamais un historique inventé", async () => {
    const out = await call({ needTransitionHistory: jest.fn().mockResolvedValue(null) })
    expect(out).toEqual({ error: 'need_not_found' })
  })
})
