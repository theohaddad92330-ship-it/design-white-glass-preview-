import { ChatDeepenJobEntity } from '../../database/entities/chat-deepen-job.entity'
import { ChatDeepenJobsController } from './chat-deepen-jobs.controller'
import { ChatDeepenJobsService } from './chat-deepen-jobs.service'

describe('ChatDeepenJobsController', () => {
  let service: { reportInterrupted: jest.Mock; getLatestForConversation: jest.Mock; resolveForConversation: jest.Mock }
  let controller: ChatDeepenJobsController

  const job: ChatDeepenJobEntity = {
    id: 'job-1',
    user_id: 'user-1',
    conversation_id: 'conv-1',
    label: 'Étude du groupe Thales',
    status: 'queued',
    completed_steps: 4,
    current_step: 'Lecture des filiales',
    auto_resumes: 0,
    stopped_reason: null,
    created_at: new Date('2026-10-07T10:00:00.000Z'),
    updated_at: new Date('2026-10-07T10:05:00.000Z'),
  }

  beforeEach(() => {
    service = {
      reportInterrupted: jest.fn().mockResolvedValue(job),
      getLatestForConversation: jest.fn().mockResolvedValue(job),
      resolveForConversation: jest.fn().mockResolvedValue(1),
    }
    controller = new ChatDeepenJobsController(service as unknown as ChatDeepenJobsService)
  })

  describe('latest (JwtGuard — l’écran, reprise après rechargement)', () => {
    it('rend le job de la personne authentifiée, jamais un identifiant fourni par la requête', async () => {
      const result = await controller.latest('conv-1', { userId: 'user-1', email: 'a@b.c' })

      expect(service.getLatestForConversation).toHaveBeenCalledWith('user-1', 'conv-1')
      expect(result).toEqual({
        id: 'job-1',
        status: 'queued',
        label: 'Étude du groupe Thales',
        completedSteps: 4,
        currentStep: 'Lecture des filiales',
        autoResumes: 0,
        stoppedReason: null,
        updatedAt: '2026-10-07T10:05:00.000Z',
      })
    })

    it('rend null sans job — jamais un statut inventé', async () => {
      service.getLatestForConversation.mockResolvedValue(null)
      const result = await controller.latest('conv-1', { userId: 'user-1', email: 'a@b.c' })
      expect(result).toBeNull()
    })
  })

  describe('report (InternalSecretGuard — appelé par l’IA)', () => {
    it('relaie les champs reçus au service, bornés par son contrat', async () => {
      await controller.report({
        userId: 'user-1',
        conversationId: 'conv-1',
        label: 'Étude du groupe Thales',
        completedSteps: 4,
        currentStep: 'Lecture des filiales',
      })

      expect(service.reportInterrupted).toHaveBeenCalledWith({
        userId: 'user-1',
        conversationId: 'conv-1',
        label: 'Étude du groupe Thales',
        completedSteps: 4,
        currentStep: 'Lecture des filiales',
      })
    })
  })

  describe('resolve (#3862.1, secret interne)', () => {
    it('referme le fil nommé par l’IA et rend le nombre de lignes refermées', async () => {
      const result = await controller.resolve({ userId: 'user-1', conversationId: 'conv-1' })
      expect(service.resolveForConversation).toHaveBeenCalledWith('user-1', 'conv-1')
      expect(result).toEqual({ resolved: 1 })
    })
  })
})
