import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { ChatMessagesService } from './chat-messages.service'

/**
 * #1939 — UN MESSAGE ENVOYÉ À LAURA PEUT PORTER SON ENREGISTREMENT.
 *
 * Le texte transcrit part par le tour ORDINAIRE, et `POST /ia/chat/messages`
 * l'écrit comme n'importe quel message — il gagne seulement `voiceObjectId`.
 * Ce qui est tenu ici, c'est qu'un identifiant d'objet reçu du CLIENT ne vaut
 * rien tant qu'on n'a pas vérifié qu'il désigne SON enregistrement :
 *
 *  · de CET utilisateur — un collègue du même espace ne rattache pas la voix
 *    d'un autre à son propre message ;
 *  · dans CET espace — un identifiant deviné ailleurs ne trouve rien ;
 *  · du domaine VOCAL — un justificatif ne devient pas un « message vocal ».
 */
describe('#1939 — ChatMessagesService et le message vocal', () => {
  const USER = 'u-1'
  const COLLEAGUE = 'u-2'
  const WORKSPACE = 'ws-1'
  const OTHER_WORKSPACE = 'ws-2'
  const VOICE = '44444444-4444-4444-8444-444444444444'
  const MESSAGE = '55555555-5555-4555-8555-555555555555'

  let repo: MockRepository<ChatMessageEntity>
  let service: ChatMessagesService

  const base = {
    userId: USER,
    workspaceId: WORKSPACE,
    accountId: null,
    conversationId: 'conv-1',
    role: 'user' as const,
    content: 'Prépare une relance pour EDF',
  }

  beforeEach(() => {
    repo = createMockRepository<ChatMessageEntity>()
    service = new ChatMessagesService(repo as never)
  })

  describe('create — le rattachement', () => {
    it('rattache l’enregistrement quand il est À CETTE PERSONNE, dans CET espace, au domaine vocal', async () => {
      repo.manager.query.mockResolvedValueOnce([{ id: VOICE }])

      const saved = await service.create({ ...base, voiceObjectId: VOICE })

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ voice_object_id: VOICE }))
      expect(saved.voice_object_id).toBe(VOICE)
      const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain('FROM storage_objects')
      expect(sql).toContain('workspace_id = $2')
      expect(sql).toContain('uploaded_by = $3')
      expect(sql).toContain("domain = 'chat_voice_message'")
      expect(params).toEqual([VOICE, WORKSPACE, USER])
    })

    it('NON — l’enregistrement d’un COLLÈGUE du même espace ne se rattache pas', async () => {
      // La base ne rend rien : l'objet existe, mais `uploaded_by` est le collègue.
      repo.manager.query.mockResolvedValueOnce([])

      await expect(service.create({ ...base, userId: COLLEAGUE, voiceObjectId: VOICE })).rejects.toBeInstanceOf(
        NotFoundException,
      )
      expect(repo.save).not.toHaveBeenCalled()
      expect((repo.manager.query.mock.calls[0] as [string, unknown[]])[1]).toEqual([VOICE, WORKSPACE, COLLEAGUE])
    })

    it('NON — un enregistrement d’un AUTRE espace ne se rattache pas', async () => {
      repo.manager.query.mockResolvedValueOnce([])

      await expect(
        service.create({ ...base, workspaceId: OTHER_WORKSPACE, voiceObjectId: VOICE }),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(repo.save).not.toHaveBeenCalled()
      expect((repo.manager.query.mock.calls[0] as [string, unknown[]])[1]).toEqual([VOICE, OTHER_WORKSPACE, USER])
    })

    it('NON — une réponse de Laura ne porte jamais d’enregistrement', async () => {
      await expect(service.create({ ...base, role: 'assistant', voiceObjectId: VOICE })).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(repo.manager.query).not.toHaveBeenCalled()
      expect(repo.save).not.toHaveBeenCalled()
    })

    it('un message tapé ne consulte pas le stockage, et reste sans enregistrement', async () => {
      await service.create(base)
      expect(repo.manager.query).not.toHaveBeenCalled()
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ voice_object_id: null }))
    })
  })

  describe('la réécoute — même portée que le texte du fil', () => {
    it('lit le message DANS l’espace du demandeur, jamais par son seul identifiant', async () => {
      repo.findOne.mockResolvedValueOnce({ id: MESSAGE, voice_object_id: VOICE } as ChatMessageEntity)

      expect(await service.voiceObjectIdInWorkspace(WORKSPACE, MESSAGE)).toBe(VOICE)
      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: MESSAGE, workspace_id: WORKSPACE } }),
      )
    })

    it('NON — le message d’un autre espace n’existe pas ici', async () => {
      repo.findOne.mockResolvedValueOnce(null)
      expect(await service.voiceObjectIdInWorkspace(OTHER_WORKSPACE, MESSAGE)).toBeNull()
    })

    it('un message sans enregistrement conservé rend `null`, pas une chaîne vide', async () => {
      repo.findOne.mockResolvedValueOnce({ id: MESSAGE, voice_object_id: null } as ChatMessageEntity)
      expect(await service.voiceObjectIdInWorkspace(WORKSPACE, MESSAGE)).toBeNull()
    })

    it('le fil dit à l’écran quels messages portent un enregistrement', async () => {
      repo.find.mockResolvedValueOnce([])
      await service.listThread({
        userId: 'u-1',
        workspaceId: WORKSPACE,
        accountId: null,
        conversationId: 'conv-1',
        limit: 50,
      })
      const options = repo.find.mock.calls[0][0] as { select: string[] }
      expect(options.select).toContain('voice_object_id')
    })
  })
})
