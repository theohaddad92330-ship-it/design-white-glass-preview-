import { MissionExtractionController } from './mission-extraction.controller'
import type { MissionExtractionService } from './mission-extraction.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'

/**
 * EN DÉMONSTRATION, AUCUN APPEL MODÈLE N'ATTEINT LE SERVICE IA (#2560).
 *
 * Même garde que `RfpService.create` (`rfp.service.spec.ts`) : un espace de
 * démonstration reçoit une réponse SCRIPTÉE (`demoMissionExtraction`), jamais
 * un appel réel — « aucun geste n'atteint un modèle, un registre ou un
 * fournisseur » (tête de `demo-scripts.ts`).
 */
function build(isDemo: boolean) {
  const extract = jest.fn()
  const extraction = { extract } as unknown as MissionExtractionService
  const workspaceContext = {
    isDemoWorkspace: jest.fn().mockResolvedValue(isDemo),
  } as unknown as WorkspaceContextService
  const controller = new MissionExtractionController(extraction, workspaceContext)
  return { controller, extract }
}

describe('MissionExtractionController — la porte de démonstration', () => {
  it('sur un espace de démonstration, rend le script — le client IA n’est JAMAIS appelé', async () => {
    const { controller, extract } = build(true)

    const result = await controller.extract({ text: 'Fiche de mission' }, { userId: 'u1' } as never)

    expect(extract).not.toHaveBeenCalled()
    expect(result.status).toBe('ok')
    expect(result.costUsd).toBeNull()
    expect(result.fields.accountName.value).toContain('démo')
  })

  it('sur un espace RÉEL, relaie l’appel au service d’extraction', async () => {
    const { controller, extract } = build(false)
    extract.mockResolvedValue({ status: 'ok', costUsd: 0.001, fields: {} })

    await controller.extract({ text: 'Fiche de mission' }, { userId: 'u1' } as never)

    expect(extract).toHaveBeenCalledTimes(1)
  })
})
