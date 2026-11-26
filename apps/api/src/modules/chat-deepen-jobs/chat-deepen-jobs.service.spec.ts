import { Repository } from 'typeorm'
import { ChatDeepenJobEntity } from '../../database/entities/chat-deepen-job.entity'
import { ChatDeepenJobsService } from './chat-deepen-jobs.service'

describe('ChatDeepenJobsService', () => {
  let findOne: jest.Mock
  let save: jest.Mock
  let update: jest.Mock
  let service: ChatDeepenJobsService

  beforeEach(() => {
    findOne = jest.fn().mockResolvedValue(null)
    save = jest.fn().mockImplementation(async (entity: ChatDeepenJobEntity) => entity)
    update = jest.fn().mockResolvedValue({ affected: 1 })
    const repo = { findOne, save, update } as unknown as Repository<ChatDeepenJobEntity>
    service = new ChatDeepenJobsService(repo)
  })

  describe('reportInterrupted', () => {
    it('crée une ligne queued quand aucun job non terminal n’existe pour cette conversation', async () => {
      const job = await service.reportInterrupted({
        userId: 'user-1',
        conversationId: 'conv-1',
        label: 'Étude du groupe Thales',
        completedSteps: 4,
        currentStep: 'Lecture des filiales',
      })

      expect(findOne).toHaveBeenCalledWith({
        where: { user_id: 'user-1', conversation_id: 'conv-1', status: expect.anything() },
        order: { updated_at: 'DESC' },
      })
      expect(save).toHaveBeenCalledTimes(1)
      const saved = save.mock.calls[0][0] as ChatDeepenJobEntity
      expect(saved.status).toBe('queued')
      expect(saved.user_id).toBe('user-1')
      expect(saved.conversation_id).toBe('conv-1')
      expect(saved.label).toBe('Étude du groupe Thales')
      expect(saved.completed_steps).toBe(4)
      expect(saved.current_step).toBe('Lecture des filiales')
      expect(job.status).toBe('queued')
    })

    it('met à jour la MÊME ligne quand un job non terminal existe déjà pour cette conversation (jamais un doublon)', async () => {
      const existing: ChatDeepenJobEntity = {
        id: 'job-1',
        user_id: 'user-1',
        conversation_id: 'conv-1',
        label: 'Étude du groupe Thales',
        status: 'queued',
        completed_steps: 2,
        current_step: 'Lecture des filiales',
        auto_resumes: 0,
        stopped_reason: null,
        created_at: new Date('2026-10-07T10:00:00.000Z'),
        updated_at: new Date('2026-10-07T10:00:00.000Z'),
      }
      findOne.mockResolvedValue(existing)

      await service.reportInterrupted({
        userId: 'user-1',
        conversationId: 'conv-1',
        label: 'Étude du groupe Thales (suite)',
        completedSteps: 6,
        currentStep: 'Lecture des contacts',
      })

      expect(save).toHaveBeenCalledTimes(1)
      const saved = save.mock.calls[0][0] as ChatDeepenJobEntity
      expect(saved.id).toBe('job-1')
      expect(saved.completed_steps).toBe(6)
      expect(saved.current_step).toBe('Lecture des contacts')
      expect(saved.status).toBe('queued')
    })

    it('tronque le libellé à 500 caractères — jamais la question brute sans borne', async () => {
      const long = 'a'.repeat(600)
      const job = await service.reportInterrupted({
        userId: 'user-1',
        conversationId: 'conv-1',
        label: long,
        completedSteps: 1,
        currentStep: null,
      })

      expect(job.label).toHaveLength(500)
    })
  })

  describe('getLatestForConversation', () => {
    it('ne rend que les jobs de la personne ET de la conversation demandées', async () => {
      await service.getLatestForConversation('user-1', 'conv-1')

      expect(findOne).toHaveBeenCalledWith({
        where: { user_id: 'user-1', conversation_id: 'conv-1' },
        order: { updated_at: 'DESC' },
      })
    })

    it('rend null sans aucun job — jamais un statut inventé', async () => {
      findOne.mockResolvedValue(null)
      const job = await service.getLatestForConversation('user-1', 'conv-1')
      expect(job).toBeNull()
    })
  })

  describe('markStaleBefore', () => {
    it('ne bascule que les lignes encore queued/running plus vieilles que la borne — transition gardée, jamais de verrou (GA-76)', async () => {
      const cutoff = new Date('2026-10-07T09:00:00.000Z')
      const count = await service.markStaleBefore(cutoff)

      expect(update).toHaveBeenCalledWith(
        { status: expect.anything(), updated_at: expect.anything() },
        { status: 'unknown' },
      )
      expect(count).toBe(1)
    })
  })

  describe('resolveForConversation (#3862.1)', () => {
    it('referme seulement les lignes non terminales de CETTE personne et CE fil', async () => {
      const n = await service.resolveForConversation('user-1', 'conv-1')
      expect(n).toBe(1)
      expect(update).toHaveBeenCalledWith(
        { user_id: 'user-1', conversation_id: 'conv-1', status: expect.anything() },
        { status: 'done' },
      )
    })

    it('rend 0 sans ligne à refermer', async () => {
      update.mockResolvedValue({ affected: 0 })
      expect(await service.resolveForConversation('user-1', 'conv-9')).toBe(0)
    })
  })
  describe('reprise automatique (#3236, lot W2)', () => {
    it('réclame une reprise : queued → running, +1 reprise, gardé par le statut', async () => {
      expect(await service.claimForAutoResume('job-1')).toBe(true)
      expect(update).toHaveBeenCalledWith(
        { id: 'job-1', status: 'queued' },
        { status: 'running', auto_resumes: expect.any(Function) },
      )
      const bump = update.mock.calls[0][1].auto_resumes as () => string
      expect(bump()).toBe('auto_resumes + 1')
    })

    it('une ligne déjà réclamée ailleurs n’est pas reprise deux fois', async () => {
      update.mockResolvedValue({ affected: 0 })
      expect(await service.claimForAutoResume('job-1')).toBe(false)
    })

    it('l’arrêt est NOMMÉ et rend unknown (jamais failed), sur une ligne non terminale seulement', async () => {
      expect(await service.stop('job-1', 'credit_ceiling')).toBe(true)
      expect(update).toHaveBeenCalledWith(
        { id: 'job-1', status: expect.anything() },
        { status: 'unknown', stopped_reason: 'credit_ceiling' },
      )
    })

    it('ne cherche que les coupures réglées, la plus ancienne d’abord', async () => {
      const before = new Date('2026-10-11T22:00:00.000Z')
      await service.findQueuedBefore(before)
      expect(findOne).toHaveBeenCalledWith({
        where: { status: 'queued', updated_at: expect.anything() },
        order: { updated_at: 'ASC' },
      })
    })
  })
})
