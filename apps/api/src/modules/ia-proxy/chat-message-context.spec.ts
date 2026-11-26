import { ChatMessagesService } from './chat-messages.service'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #1914.14 — le contexte d'une réponse, ÉCRIT puis RELU.
 *
 * La porte d'écriture est unique (`create`) : c'est elle qui applique la liste
 * blanche de `persistedChatContext`. Un appelant ne peut donc pas faire entrer
 * dans la colonne ce que la liste refuse — ce n'est pas une politesse qu'on lui
 * demande, c'est un `z.object` qui retire les clés.
 */
describe('#1914.14 — le contexte persisté d’un message', () => {
  let service: ChatMessagesService
  let repo: MockRepository<ChatMessageEntity>

  const context = {
    active: {
      profile: { present: true, name: 'Sarah' },
      account: { present: true, name: 'Latécoère', as_of: '2026-09-10' },
      contacts_count: 4,
      plan: { present: true },
      portfolio: { present: true, count: 12 },
      memory: { pinned_facts: 3, has_summary: true },
    },
    sources: [{ kind: 'crm', label: 'CRM', as_of: null }],
    not_consulted: ['Site web'],
  }

  beforeEach(() => {
    repo = createMockRepository<ChatMessageEntity>()
    repo.save.mockResolvedValue({
      id: 'm-1',
      account_id: null,
      conversation_id: 'conv-1',
      role: 'assistant',
      content: 'Voilà.',
      created_at: new Date('2026-09-16T09:00:00Z'),
    } as ChatMessageEntity)
    service = new ChatMessagesService(repo as never)
  })

  it('écrit le contexte de la réponse', async () => {
    await service.create({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: 'conv-1',
      role: 'assistant',
      content: 'Voilà.',
      context,
    })
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ sources: context.sources }) }),
    )
  })

  /**
   * 🔴 D65 — une proposition BRUTE du modèle porte du texte libre qu'il a rédigé
   * à partir de ce qu'il a lu, corps de courriel compris. La colonne ne la garde
   * pas, même si l'appelant l'envoie.
   */
  it('n’écrit NI la proposition brute, NI les droits du lecteur, NI les cartes', async () => {
    await service.create({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: 'conv-1',
      role: 'assistant',
      content: 'Voilà.',
      context: {
        ...context,
        pending_actions: [{ action: 'create_mail_draft', body: 'Bonjour, suite à votre message…' }],
        permissions: ['accounts:write'],
        cards: [{ id: 'card-1' }],
      },
    })
    const written = repo.create.mock.calls[0][0] as { context: Record<string, unknown> | null }
    expect(written.context).not.toHaveProperty('pending_actions')
    expect(written.context).not.toHaveProperty('permissions')
    expect(written.context).not.toHaveProperty('cards')
    expect(JSON.stringify(written.context)).not.toContain('Bonjour, suite à votre message')
  })

  /** Un message TAPÉ n'a aucun contexte : la colonne reste `null`, et l'appel
   *  est celui d'avant ce lot. */
  it('écrit `null` quand il n’y a pas de contexte', async () => {
    await service.create({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: 'conv-1',
      role: 'user',
      content: 'Où en est Latécoère ?',
    })
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ context: null }))
  })

  it('relit le contexte avec le fil', async () => {
    repo.find.mockResolvedValueOnce([
      { id: 'm-1', role: 'assistant', content: 'Voilà.', created_at: new Date(), context } as ChatMessageEntity,
    ])
    const [message] = await service.listThread({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: 'conv-1',
      limit: 50,
    })
    expect(message.context).toEqual(context)
  })

  /**
   * LE TÉMOIN QUI COMPTE — un message ANCIEN, écrit avant la colonne, n'a pas de
   * contexte. Il doit continuer de sortir de la lecture, avec son texte, et
   * `context` à `null` : c'est ce que l'écran sait déjà rendre (aucun panneau).
   */
  it('rend un message d’AVANT la colonne, avec `context: null`', async () => {
    repo.find.mockResolvedValueOnce([
      { id: 'm-0', role: 'assistant', content: 'Réponse de mars.', created_at: new Date() } as ChatMessageEntity,
    ])
    const [message] = await service.listThread({
      userId: 'u-1',
      workspaceId: 'ws-1',
      accountId: null,
      conversationId: 'conv-1',
      limit: 50,
    })
    expect(message.content).toBe('Réponse de mars.')
    expect(message.context).toBeNull()
  })
})
