import { BadGatewayException, BadRequestException } from '@nestjs/common'
import type { IaClient } from '../ia/ia.client'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { REQUIRE_FEATURE_KEY } from '../plan-features/require-feature.decorator'
import { TechnologyRadarController } from './technology-radar.controller'

const RADAR = {
  technology: { kind: 'closed', code: 'SAP', label: 'SAP' },
  generatedAt: '2026-10-19T00:00:00+00:00',
  accounts: [],
  historicalNeeds: [],
  prescribers: [],
  footprints: [],
  notEvaluated: [],
}

function build(opts: { demo?: boolean; ia?: unknown } = {}) {
  const ia = { technologyRadar: jest.fn().mockResolvedValue(opts.ia ?? RADAR) }
  const workspaceContext = { isDemoWorkspace: jest.fn().mockResolvedValue(opts.demo ?? false) }
  const controller = new TechnologyRadarController(
    ia as unknown as IaClient,
    workspaceContext as unknown as WorkspaceContextService,
  )
  return { controller, ia }
}

const user = { userId: 'u-1' } as never

describe('#4282.10 — POST /ia/discover/technology-radar', () => {
  it('relaie la sortie commune de l’IA, validée contre le contrat, sans retri', async () => {
    const { controller, ia } = build()
    await expect(controller.technologyRadar(user, { technology: 'SAP' })).resolves.toEqual(RADAR)
    expect(ia.technologyRadar).toHaveBeenCalledWith('SAP', expect.objectContaining({ maxAttempts: 1 }))
  })

  it('NON : une sortie qui porterait une probabilité est refusée en erreur claire, jamais affichée', async () => {
    const { controller } = build({ ia: { ...RADAR, probability: 0.4 } })
    await expect(controller.technologyRadar(user, { technology: 'SAP' })).rejects.toBeInstanceOf(BadGatewayException)
  })

  it('NON : technologie vide refusée sans appel', async () => {
    const { controller, ia } = build()
    await expect(controller.technologyRadar(user, { technology: '  ' })).rejects.toBeInstanceOf(BadRequestException)
    expect(ia.technologyRadar).not.toHaveBeenCalled()
  })

  it('en salle de démonstration : le radar préparé, aucun appel', async () => {
    const { controller, ia } = build({ demo: true })
    const radar = await controller.technologyRadar(user, { technology: 'radar SAP France' })
    expect(radar.accounts.length).toBeGreaterThan(0)
    expect(ia.technologyRadar).not.toHaveBeenCalled()
  })

  // #4285.3 — droits : tout utilisateur authentifié dont le plan porte Découvrir voit le radar (aucun réglage
  // d'espace n'est modifié) ; REFUSÉ : l'anonyme (JwtGuard) et un plan sans Découvrir (PlanFeatureGuard).
  it('NON : la route est fermée à l’anonyme et à un plan sans Découvrir', () => {
    const guards: unknown[] = Reflect.getMetadata('__guards__', TechnologyRadarController) ?? []
    expect(guards).toEqual(expect.arrayContaining([JwtGuard, PlanFeatureGuard]))
    const handler = TechnologyRadarController.prototype.technologyRadar
    expect(Reflect.getMetadata(REQUIRE_FEATURE_KEY, handler)).toBe('discover')
  })
})
