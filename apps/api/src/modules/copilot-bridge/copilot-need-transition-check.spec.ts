import { CopilotBridgeController } from './copilot-bridge.controller'

/**
 * #2320.26 / #2320.27 (épopée #2967) — Laura peut PRÉPARER une transition
 * SANS l'exécuter, et SIGNALER ce qui manque. Même motif que `needTransitions`
 * (#2320.24) : lecture seule, scopée à l'espace ACTIF.
 */
describe('CopilotBridgeController.needTransitionCheck (#2320.26/.27)', () => {
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) }

  function call(pipeline: unknown) {
    return CopilotBridgeController.prototype.needTransitionCheck.call(
      { pipeline, workspaceContext } as never,
      { userId: 'u-1', needId: 'n-1', nextStatus: 'qualified' } as never,
    )
  }

  it("rend le verdict lu sur l'espace ACTIF", async () => {
    const needTransitionCheck = jest
      .fn()
      .mockResolvedValue({ currentStatus: 'to_qualify', allowed: true, reason: null, requiresReason: false })
    const out = await call({ needTransitionCheck })
    expect(needTransitionCheck).toHaveBeenCalledWith('w-1', 'n-1', 'qualified')
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(out).toEqual({ currentStatus: 'to_qualify', allowed: true, reason: null, requiresReason: false })
  })

  it("un besoin introuvable (ou d'un AUTRE espace) : une erreur nommée, jamais un verdict inventé", async () => {
    const out = await call({ needTransitionCheck: jest.fn().mockResolvedValue(null) })
    expect(out).toEqual({ error: 'need_not_found' })
  })
})
