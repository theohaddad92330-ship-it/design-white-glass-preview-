import { Test } from '@nestjs/testing'
import { CommercialAuditFeedbackController } from './commercial-audit-feedback.controller'
import { CommercialAuditFeedbackService } from './commercial-audit-feedback.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

describe('CommercialAuditFeedbackController — #2075.12 / #2075.13', () => {
  const feedback = { create: jest.fn(), listForUser: jest.fn() }
  const workspaceContext = { resolveActiveWorkspace: jest.fn() }
  let controller: CommercialAuditFeedbackController

  const user = { userId: 'u1', email: 'u1@test.fr' } as never

  beforeEach(async () => {
    jest.resetAllMocks()
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws1' })
    feedback.listForUser.mockResolvedValue({})

    const moduleRef = await Test.createTestingModule({
      controllers: [CommercialAuditFeedbackController],
      providers: [
        { provide: CommercialAuditFeedbackService, useValue: feedback },
        { provide: WorkspaceContextService, useValue: workspaceContext },
      ],
    }).compile()

    controller = moduleRef.get(CommercialAuditFeedbackController)
  })

  it('POST : pose la note avec l’espace RÉSOLU, puis rend l’état courant', async () => {
    feedback.listForUser.mockResolvedValue({
      stop: { target_key: 'stop', kind: 'refused', comment_text: null, created_at: '2026-09-26T10:00:00.000Z' },
    })

    const result = await controller.create(user, { target_key: 'stop', kind: 'refused' })

    expect(feedback.create).toHaveBeenCalledWith('u1', 'ws1', { target_key: 'stop', kind: 'refused' })
    expect(result.feedback.stop?.kind).toBe('refused')
  })

  it('POST : un espace non résolu ne bloque JAMAIS la note — `workspaceId: null`', async () => {
    workspaceContext.resolveActiveWorkspace.mockRejectedValue(new Error('boom'))

    await controller.create(user, { target_key: 'bottleneck', kind: 'comment', comment_text: 'Note.' })

    expect(feedback.create).toHaveBeenCalledWith('u1', null, {
      target_key: 'bottleneck',
      kind: 'comment',
      comment_text: 'Note.',
    })
  })

  it('GET : délègue à `listForUser`, scopé à l’utilisateur courant', async () => {
    feedback.listForUser.mockResolvedValue({
      bottleneck: {
        target_key: 'bottleneck',
        kind: 'comment',
        comment_text: 'Note.',
        created_at: '2026-09-26T10:00:00.000Z',
      },
    })

    const result = await controller.list(user)

    expect(feedback.listForUser).toHaveBeenCalledWith('u1')
    expect(result.feedback.bottleneck?.comment_text).toBe('Note.')
  })
})
