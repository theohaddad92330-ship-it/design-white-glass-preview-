import { ChatMessagesService } from './chat-messages.service'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #2494 — la pièce jointe ENVOYÉE avec un message, ÉCRITE puis RELUE.
 *
 * « J'ai ajouté à Laura un CV en contexte pour la conversation puis j'ai
 * envoyé le message, mais avec le message je ne vois pas le fichier attaché » :
 * le nom déposé dans le composeur ne survivait ni à l'envoi ni à un
 * rechargement du fil. Même discipline que `resolveOwnVoiceObject` /
 * `linkBranchOf` : un identifiant venu du navigateur ne rend un nom qu'après
 * avoir été RETROUVÉ dans l'espace de l'appelant.
 */
describe('#2494 — les pièces jointes d’un message', () => {
  let service: ChatMessagesService
  let repo: MockRepository<ChatMessageEntity>
  let docs: MockRepository<RagDocumentEntity>

  beforeEach(() => {
    repo = createMockRepository<ChatMessageEntity>()
    docs = createMockRepository<RagDocumentEntity>()
    repo.save.mockImplementation(async (entity: Partial<ChatMessageEntity>) => ({
      id: 'm-1',
      account_id: null,
      conversation_id: 'conv-1',
      role: 'user',
      content: 'Résume ce CV',
      created_at: new Date('2026-09-17T09:00:00Z'),
      ...entity,
    }))
    service = new ChatMessagesService(repo as never, docs as never)
  })

  it('retrouve le NOM dans l’espace de l’appelant et l’écrit avec le message', async () => {
    docs.find.mockResolvedValueOnce([{ id: 'doc-1', title: 'cv.txt' }])
    await service.create({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: 'conv-1',
      role: 'user',
      content: 'Résume ce CV',
      documentIds: ['doc-1'],
    })
    expect(docs.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspace_id: 'ws-1' }) }),
    )
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [{ id: 'doc-1', name: 'cv.txt' }] }),
    )
  })

  it('sait dire NON : un identifiant d’un AUTRE espace n’écrit aucune pièce', async () => {
    // La requête est scopée par workspace_id — un document d'un autre espace
    // ne remonte jamais dans le résultat.
    docs.find.mockResolvedValueOnce([])
    await service.create({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: 'conv-1',
      role: 'user',
      content: 'Résume ce CV',
      documentIds: ['doc-dun-autre-espace'],
    })
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ attachments: null }))
  })

  it('un message ordinaire, sans document, écrit `attachments: null` — corps identique à avant ce lot', async () => {
    await service.create({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: 'conv-1',
      role: 'user',
      content: 'Où en est Latécoère ?',
    })
    expect(docs.find).not.toHaveBeenCalled()
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ attachments: null }))
  })

  it('relit les pièces jointes avec le fil', async () => {
    repo.find.mockResolvedValueOnce([
      {
        id: 'm-1',
        role: 'user',
        content: 'Résume ce CV',
        created_at: new Date(),
        attachments: [{ id: 'doc-1', name: 'cv.txt' }],
      } as ChatMessageEntity,
    ])
    const [message] = await service.listThread({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: 'conv-1',
      limit: 50,
    })
    expect(message.attachments).toEqual([{ id: 'doc-1', name: 'cv.txt' }])
  })

  /** LE TÉMOIN QUI COMPTE — un message d'AVANT la colonne n'a pas de pièce
   *  jointe ; il doit continuer de sortir de la lecture, `attachments: null`. */
  it('rend un message d’AVANT la colonne avec `attachments: null`', async () => {
    repo.find.mockResolvedValueOnce([
      { id: 'm-0', role: 'user', content: 'Question de mars.', created_at: new Date() } as ChatMessageEntity,
    ])
    const [message] = await service.listThread({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: 'conv-1',
      limit: 50,
    })
    expect(message.content).toBe('Question de mars.')
    expect(message.attachments).toBeNull()
  })
})
