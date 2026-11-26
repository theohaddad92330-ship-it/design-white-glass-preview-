import { NotFoundException } from '@nestjs/common'
import { ProspectingSessionsService } from './prospecting-sessions.service'

function serviceWith(rows: unknown[] = [], findOneResult: unknown = null) {
  const find = jest.fn().mockResolvedValue(rows)
  const findOne = jest.fn().mockResolvedValue(findOneResult)
  const save = jest.fn().mockImplementation((row: unknown) => Promise.resolve(row))
  const create = jest.fn().mockImplementation((row: unknown) => ({ ...(row as object) }))
  const service = new ProspectingSessionsService({ find, findOne, save, create } as never)
  return { service, find, findOne, save, create }
}

describe('ProspectingSessionsService — #2386.9', () => {
  describe('start — l’appelant réel de ProspectingSessionDialog', () => {
    it('crée une ligne pour le parcours donné, retourne son id', async () => {
      const { service, save } = serviceWith()
      save.mockResolvedValue({ id: 'sess-1', journey: 'email', workspace_id: 'ws1' })

      const id = await service.start('ws1', 'email')

      expect(id).toBe('sess-1')
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ journey: 'email', workspace_id: 'ws1' }))
    })

    it('accepte `workspaceId: null` — un espace non résolu n’empêche jamais la session de démarrer', async () => {
      const { service, save } = serviceWith()
      save.mockResolvedValue({ id: 'sess-2', journey: 'appels', workspace_id: null })

      await service.start(null, 'appels')

      expect(save).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: null }))
    })
  })

  describe('recordEvent — best-effort, jamais un blocage', () => {
    it('NON — une session introuvable lève NotFoundException, jamais un écrit muet', async () => {
      const { service } = serviceWith([], null)
      await expect(service.recordEvent('missing', { kind: 'first_message' })).rejects.toBeInstanceOf(NotFoundException)
    })

    it('`first_message` pose l’horodatage UNE seule fois — jamais réécrit par un second appel', async () => {
      const existing = { id: 's1', first_message_at: new Date('2026-09-27T10:00:00.000Z') }
      const { service, save } = serviceWith([], existing)

      await service.recordEvent('s1', { kind: 'first_message' })

      expect(save).toHaveBeenCalledWith(expect.objectContaining({ first_message_at: existing.first_message_at }))
    })

    it('`message_sent` incrémente le total, et le compte modifié seulement si `modified`', async () => {
      const existing = { id: 's1', messages_total: 2, messages_modified: 1 }
      const { service, save } = serviceWith([], existing)

      await service.recordEvent('s1', { kind: 'message_sent', modified: true })

      expect(save).toHaveBeenCalledWith(expect.objectContaining({ messages_total: 3, messages_modified: 2 }))
    })

    it('`connector_attempt` incrémente les tentatives, et les succès seulement si `success`', async () => {
      const existing = { id: 's1', connector_attempts: 1, connector_successes: 1 }
      const { service, save } = serviceWith([], existing)

      await service.recordEvent('s1', { kind: 'connector_attempt', success: false })

      expect(save).toHaveBeenCalledWith(expect.objectContaining({ connector_attempts: 2, connector_successes: 1 }))
    })

    it('`duplicates_avoided` ajoute le compte transmis', async () => {
      const existing = { id: 's1', duplicates_avoided: 2 }
      const { service, save } = serviceWith([], existing)

      await service.recordEvent('s1', { kind: 'duplicates_avoided', count: 3 })

      expect(save).toHaveBeenCalledWith(expect.objectContaining({ duplicates_avoided: 5 }))
    })
  })

  describe('getMetrics — délègue TOUT le calcul à `aggregateProspectingSessionMetrics`', () => {
    it('convertit les lignes en enregistrements purs, sans recalculer de moyenne ici', async () => {
      const startedAt = new Date('2026-09-27T10:00:00.000Z')
      const rows = Array.from({ length: 5 }, () => ({
        journey: 'email',
        started_at: startedAt,
        first_message_at: null,
        messages_total: 0,
        messages_modified: 0,
        connector_attempts: 0,
        connector_successes: 0,
        duplicates_avoided: 1,
      }))
      const { service } = serviceWith(rows)

      const metrics = await service.getMetrics('ws1')

      expect(metrics).toEqual([expect.objectContaining({ journey: 'email', sessions: 5, duplicatesAvoided: 5 })])
    })

    it('lit UNIQUEMENT les sessions de CET espace quand il est résolu', async () => {
      const { service, find } = serviceWith([])

      await service.getMetrics('ws1')

      expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace_id: 'ws1' } }))
    })
  })
})
