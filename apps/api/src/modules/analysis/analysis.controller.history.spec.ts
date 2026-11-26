/**
 * Théo B r2-mes-analyses — L'APPELANT de l'historique : l'espace vient de la session, le périmètre d'unité est résolu
 * au bord, « Retirer » ne touche que MA ligne.
 */
import { NotFoundException } from '@nestjs/common'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { AnalysisController } from './analysis.controller'

const USER = { userId: 'u-1' } as CurrentUserPayload

function build(hidden = true) {
  const analysisRuns = {
    listHistory: jest.fn().mockResolvedValue({ runs: [], counts: { space: 0, mine: 0 } }),
    hideForUser: jest.fn().mockResolvedValue(hidden),
  }
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
  const businessUnits = { scopeFor: jest.fn().mockResolvedValue(null) }
  const controller = new AnalysisController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    workspaceContext as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    businessUnits as never,
    undefined,
    undefined,
    undefined,
    analysisRuns as never,
  )
  return { controller, analysisRuns }
}

describe('GET /analysis/history', () => {
  it('lit l’espace par défaut, dans l’espace de la session', async () => {
    const { controller, analysisRuns } = build()
    await controller.history({}, USER)
    expect(analysisRuns.listHistory).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1', viewerId: 'u-1', scope: 'space' }),
    )
  })

  it('transmet « moi » quand on le demande', async () => {
    const { controller, analysisRuns } = build()
    await controller.history({ scope: 'me' }, USER)
    expect(analysisRuns.listHistory).toHaveBeenCalledWith(expect.objectContaining({ scope: 'me' }))
  })
})

describe('POST /analysis/history/:runId/hide', () => {
  it('retire la ligne de l’appelant', async () => {
    const { controller, analysisRuns } = build()
    await expect(controller.hideFromHistory('run-1', USER)).resolves.toEqual({ id: 'run-1' })
    expect(analysisRuns.hideForUser).toHaveBeenCalledWith({ runId: 'run-1', userId: 'u-1', workspaceId: 'ws-1' })
  })

  it('404 quand la ligne n’est pas à l’appelant (un run de collègue ne se retire pas)', async () => {
    const { controller } = build(false)
    await expect(controller.hideFromHistory('run-2', USER)).rejects.toBeInstanceOf(NotFoundException)
  })
})
