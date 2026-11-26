import { NotFoundException } from '@nestjs/common'

import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { CopilotBridgeController } from './copilot-bridge.controller'

/**
 * #2324.39 — l'ÉTAT ACTUEL d'une opportunité, lu par Laura AVANT de proposer
 * une mise à jour : c'est ce qui rend le diff (« avant → après ») VRAI et figé
 * au moment de la proposition, au lieu d'un « avant » que le modèle devinerait.
 * Lecture seule, scopée à l'espace ACTIF (`getRow(id, workspaceId)`).
 */
describe('CopilotBridgeController.projectRead (#2324.39)', () => {
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) }

  function call(projects: unknown, projectId = 'p-1') {
    return CopilotBridgeController.prototype.projectRead.call(
      { projects, workspaceContext } as never,
      {
        userId: 'u-1',
        projectId,
      } as never,
    )
  }

  it("rend les champs qu'une proposition peut changer, lus sur l'espace ACTIF", async () => {
    const projects = {
      getRow: jest.fn().mockResolvedValue({
        id: 'p-1',
        label: 'Refonte data',
        company_name: 'SNCF',
        stage: 'qualified',
        estimated_amount: 120000,
        expected_close_on: '2026-11-30',
        btmmp: { nextStep: 'Atelier cadrage' },
        risks: ' Budget non voté ',
        detail: 'ne sort pas',
      }),
    }
    const out = await call(projects)
    expect(projects.getRow).toHaveBeenCalledWith('p-1', 'w-1')
    expect(out).toEqual({
      project: {
        id: 'p-1',
        label: 'Refonte data',
        company_name: 'SNCF',
        stage: 'qualified',
        estimated_amount: 120000,
        next_step: 'Atelier cadrage',
        // #2324.37 — le risque, rogné ; l'« avant » du champ `risk` du diff.
        risk: 'Budget non voté',
      },
    })
  })

  it('une valeur absente reste null — jamais « 0 » ni une chaîne vide inventée', async () => {
    const projects = {
      getRow: jest
        .fn()
        .mockResolvedValue({ id: 'p-1', label: 'X', company_name: null, stage: 'detected', btmmp: null }),
    }
    const out = await call(projects)
    expect(out).toEqual({
      project: {
        id: 'p-1',
        label: 'X',
        company_name: null,
        stage: 'detected',
        estimated_amount: null,
        next_step: null,
        risk: null,
      },
    })
  })

  it('hors de l’espace (ou inexistante) : 404, jamais une opportunité d’un autre espace', async () => {
    await expect(call({ getRow: jest.fn().mockResolvedValue(null) })).rejects.toBeInstanceOf(NotFoundException)
  })

  it("une opportunité d'un AUTRE espace : lue sur l'espace de l'utilisateur, donc 404", async () => {
    // Le service ne rend la ligne qu'à SON espace (`w-autre`) ; l'utilisateur
    // au nom duquel Laura parle est sur `w-1` — la lecture ne la voit pas.
    const getRow = jest.fn((_id: string, workspaceId: string) =>
      Promise.resolve(workspaceId === 'w-autre' ? { id: 'p-9', label: 'Chez le voisin', stage: 'qualified' } : null),
    )
    await expect(call({ getRow }, 'p-9')).rejects.toBeInstanceOf(NotFoundException)
    expect(getRow).toHaveBeenCalledWith('p-9', 'w-1')
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
  })

  it('gardée par le secret interne, comme ses voisines du pont', () => {
    const onClass = Reflect.getMetadata('__guards__', CopilotBridgeController) as unknown[]
    expect(onClass).toContain(InternalSecretGuard)
    // Aucune garde propre à la méthode qui remplacerait celle de la classe.
    expect(Reflect.getMetadata('__guards__', CopilotBridgeController.prototype.projectRead)).toBeUndefined()
  })

  it('sans le service (optionnel), le DIT plutôt que de faire tomber le pont', async () => {
    const out = await call(undefined)
    expect(out).toEqual({ error: 'projects_unavailable' })
  })
})
