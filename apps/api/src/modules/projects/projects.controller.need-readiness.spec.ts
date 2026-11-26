import { NotFoundException } from '@nestjs/common'
import { ProjectsController } from './projects.controller'

/**
 * Refonte Théo — fiche besoin (`affaires/besoin.html`, AFFAIRES-B4 / B5) : « Avant la mission » et
 * « Doublons » se LISENT sur la fiche. Les deux calculs existaient (`NeedCommercialStateService`), seul
 * Laura les relisait ; ces deux routes les servent à l'écran, sans rien recalculer.
 */
describe('ProjectsController — avant la mission et doublons d’un besoin', () => {
  const build = (state: Record<string, jest.Mock> | undefined) => {
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) }
    const none = {} as never
    const controller = new ProjectsController(
      none,
      none,
      none,
      workspaceContext as never,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
    )
    ;(controller as unknown as { needCommercialState?: unknown }).needCommercialState = state
    return controller
  }
  const user = { userId: 'u-1' } as never

  it('relit le contrôle de passage en mission, borné à l’espace', async () => {
    const check = {
      needId: 'n-1',
      status: 'presented',
      allowed: false,
      missing: ['consultant_engaged'],
      existingMissionId: null,
    }
    const state = { missionHandoffCheck: jest.fn().mockResolvedValue(check), duplicateCandidates: jest.fn() }
    const controller = build(state)
    await expect(controller.needHandoffCheck('n-1', user)).resolves.toEqual(check)
    expect(state.missionHandoffCheck).toHaveBeenCalledWith('w-1', 'n-1')
  })

  it('relit les doublons probables ; aucun candidat est une vraie réponse', async () => {
    const state = {
      missionHandoffCheck: jest.fn(),
      duplicateCandidates: jest.fn().mockResolvedValue({ needId: 'n-1', candidates: [] }),
    }
    await expect(build(state).needDuplicates('n-1', user)).resolves.toEqual({ needId: 'n-1', candidates: [] })
  })

  it('un besoin d’un autre espace est introuvable, jamais « aucun doublon »', async () => {
    const state = {
      missionHandoffCheck: jest.fn().mockResolvedValue(null),
      duplicateCandidates: jest.fn().mockResolvedValue(null),
    }
    await expect(build(state).needDuplicates('n-1', user)).rejects.toBeInstanceOf(NotFoundException)
    await expect(build(state).needHandoffCheck('n-1', user)).rejects.toBeInstanceOf(NotFoundException)
  })
})
