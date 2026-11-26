import { ExpertiseGroundingController } from './expertise-grounding.controller'
import type { ExpertiseGroundingService } from './expertise-grounding.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'

describe('ExpertiseGroundingController (#2880)', () => {
  const response = { groundings: [], audit: [], sourceOptions: [] }
  const service = { list: jest.fn(async () => response), create: jest.fn(), update: jest.fn(), archive: jest.fn() }
  const workspaceContext = { resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: 'ws-1' })) }
  const reader = { getAnswers: jest.fn(async () => ({ expertise_areas: ['Cloud'] })) }
  const controller = new ExpertiseGroundingController(
    service as unknown as ExpertiseGroundingService,
    workspaceContext as unknown as WorkspaceContextService,
    reader as unknown as EsnProfileReader,
  )
  const user = { userId: 'user-1' } as never

  it('lit les réponses d’onboarding de l’appelant et les passe au service, borné à SON espace', async () => {
    await expect(controller.list(user)).resolves.toBe(response)
    expect(reader.getAnswers).toHaveBeenCalledWith('user-1')
    expect(service.list).toHaveBeenCalledWith('ws-1', { expertise_areas: ['Cloud'] })
  })

  it('après un geste, renvoie la réponse relue (une seule source pour l’écran)', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    await expect(controller.archive(user, id)).resolves.toBe(response)
    expect(service.archive).toHaveBeenCalledWith('ws-1', id)
  })
})
