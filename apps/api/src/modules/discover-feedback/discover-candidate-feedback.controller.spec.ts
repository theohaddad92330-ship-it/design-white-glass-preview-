import { Test } from '@nestjs/testing'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { DiscoverCandidateFeedbackController } from './discover-candidate-feedback.controller'
import { DiscoverCandidateFeedbackService } from './discover-candidate-feedback.service'

describe('DiscoverCandidateFeedbackController', () => {
  it('résout l’espace, puis délègue au service avec le siren de l’URL et l’utilisateur courant', async () => {
    const record = jest
      .fn()
      .mockResolvedValue({ siren: '552081317', verdict: 'wrong_company', recordedAt: '2026-10-08T00:00:00.000Z' })
    const resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: 'ws-1' })
    const moduleRef = await Test.createTestingModule({
      controllers: [DiscoverCandidateFeedbackController],
      providers: [
        { provide: DiscoverCandidateFeedbackService, useValue: { record } },
        { provide: WorkspaceContextService, useValue: { resolveActiveWorkspace } },
      ],
    })
      .overrideGuard(JwtGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PlanFeatureGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(WorkspacePermissionGuard)
      .useValue({ canActivate: () => true })
      .compile()
    const controller = moduleRef.get(DiscoverCandidateFeedbackController)

    const result = await controller.create({ userId: 'u-1' } as never, '552081317', { verdict: 'wrong_company' })

    expect(resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    expect(record).toHaveBeenCalledWith('ws-1', 'u-1', '552081317', 'wrong_company')
    expect(result).toEqual({ siren: '552081317', verdict: 'wrong_company', recordedAt: '2026-10-08T00:00:00.000Z' })
  })
})
