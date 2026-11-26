import type { HealthInput } from '@bellum/contracts'
import { AdminWorkspaceHealthController } from './admin-workspace-health.controller'
import { AdminWorkspaceHealthService } from './admin-workspace-health.service'
import type { LauraProbeService } from '../laura/laura-probe.service'

/**
 * `GET internal/admin/workspace-health/:workspaceId` (#2977) — le score
 * INTERNE de produit (§5.6), jamais celui de `/revenus/clients` (#1652).
 *
 * Trois choses à verrouiller, comme pour `AdminClientHealthController` :
 *  1. le contrôleur passe l'ID d'espace TEL QUEL à la sonde, rien d'autre ;
 *  2. le service compose bien LES QUATRE dérivations pures sur LE MÊME
 *     `HealthInput` — un axe non évaluable de la sonde doit ressortir NOMMÉ
 *     dans `dimensions`, jamais compté zéro ni dans le score ni dans les
 *     interventions ;
 *  3. une dimension sous le seuil propose une action, une dimension parfaite
 *     n'en propose aucune.
 */

const PERFECT: HealthInput = {
  activation: 1,
  connectors: 1,
  dataDensity: 1,
  teamAdoption: 1,
  depth: 1,
  consumption: 1,
  quality: 1,
  actionability: 1,
  value: 1,
}

function fakeProbe(input: HealthInput): { probe: LauraProbeService; appels: string[] } {
  const appels: string[] = []
  const probe = {
    measure: async (workspaceId: string) => {
      appels.push(workspaceId)
      return input
    },
  } as unknown as LauraProbeService
  return { probe, appels }
}

describe('GET internal/admin/workspace-health/:workspaceId', () => {
  it('transmet l’ID d’espace tel quel à la sonde', async () => {
    const { probe, appels } = fakeProbe(PERFECT)
    const controller = new AdminWorkspaceHealthController(new AdminWorkspaceHealthService(probe))

    await controller.get('11111111-1111-1111-1111-111111111111')

    expect(appels).toEqual(['11111111-1111-1111-1111-111111111111'])
  })

  it('un espace parfait : score 100, neuf dimensions à 100, aucune intervention', async () => {
    const { probe } = fakeProbe(PERFECT)
    const service = new AdminWorkspaceHealthService(probe)

    const report = await service.get('workspace-1')

    expect(report.health.score).toBe(100)
    expect(report.coverageLabel).toBe('9/9 axes évalués')
    expect(report.dimensions).toHaveLength(9)
    expect(report.dimensions.every(d => d.value === 100 && !d.nonEvaluable)).toBe(true)
    expect(report.interventions).toEqual([])
  })

  it('un axe non évaluable de la sonde ressort NOMMÉ, jamais compté zéro', async () => {
    const { probe } = fakeProbe({ ...PERFECT, connectors: null })
    const service = new AdminWorkspaceHealthService(probe)

    const report = await service.get('workspace-2')

    // Non évaluable : sort du score (toujours 100, pas 89), nommé dans les
    // dimensions, absent des interventions (aucune cause devinée).
    expect(report.health.score).toBe(100)
    expect(report.coverageLabel).toBe('8/9 axes évalués')
    const connectors = report.dimensions.find(d => d.axis === 'connectors')
    expect(connectors?.nonEvaluable).toBe(true)
    expect(connectors?.value).toBeNull()
    expect(connectors?.reason).toBeTruthy()
    expect(report.interventions.find(i => i.axis === 'connectors')).toBeUndefined()
  })

  it('une dimension mesurée sous le seuil propose une intervention', async () => {
    const { probe } = fakeProbe({ ...PERFECT, quality: 0.3 })
    const service = new AdminWorkspaceHealthService(probe)

    const report = await service.get('workspace-3')

    expect(report.interventions).toHaveLength(1)
    expect(report.interventions[0]).toMatchObject({ axis: 'quality', value: 30 })
  })
})
