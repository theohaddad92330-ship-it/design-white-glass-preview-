import { ChatMessagesService } from './chat-messages.service'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * #2876 (#2433.4) — l'IMAGE de conversation jointe à un message ENVOYÉ, ÉCRITE
 * puis RELUE.
 *
 * Avant ce lot, une image de conversation (cas a, éphémère — jamais un
 * `rag_documents`) ne survivait ni à l'envoi ni à un rechargement du fil :
 * seule une URL `blob:` locale existait. Même discipline que
 * `resolveOwnVoiceObject` : un identifiant `storage_objects` venu du
 * navigateur ne rend un nom qu'après avoir été RETROUVÉ dans l'espace de
 * l'appelant, au domaine `chat_image_attachment` — jamais celui envoyé.
 */
describe('#2876 (#2433.4) — les images de conversation d’un message', () => {
  const USER = 'u-1'
  const WORKSPACE = 'ws-1'
  const IMAGE = 'img-1'

  let repo: MockRepository<ChatMessageEntity>
  let service: ChatMessagesService

  const base = {
    userId: USER,
    workspaceId: WORKSPACE,
    accountId: null,
    conversationId: 'conv-1',
    role: 'user' as const,
    content: 'Voici une capture de mon CRM',
  }

  beforeEach(() => {
    repo = createMockRepository<ChatMessageEntity>()
    repo.save.mockImplementation(async (entity: Partial<ChatMessageEntity>) => ({
      id: 'm-1',
      account_id: null,
      conversation_id: 'conv-1',
      role: 'user',
      content: base.content,
      created_at: new Date('2026-09-29T09:00:00Z'),
      ...entity,
    }))
    service = new ChatMessagesService(repo as never)
  })

  it('retrouve le NOM dans l’espace de l’appelant, au domaine chat_image_attachment, et l’écrit avec le message', async () => {
    repo.manager.query.mockResolvedValueOnce([{ id: IMAGE, file_name: 'capture-crm.png' }])

    const saved = await service.create({ ...base, imageObjectIds: [IMAGE] })

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ image_attachments: [{ id: IMAGE, name: 'capture-crm.png' }] }),
    )
    expect(saved.image_attachments).toEqual([{ id: IMAGE, name: 'capture-crm.png' }])
    const [sql, params] = repo.manager.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('FROM storage_objects')
    expect(sql).toContain('workspace_id = $2')
    expect(sql).toContain('uploaded_by = $3')
    expect(sql).toContain("domain = 'chat_image_attachment'")
    expect(params).toEqual([[IMAGE], WORKSPACE, USER])
  })

  it('sait dire NON : un identifiant d’un AUTRE espace (ou d’un collègue) n’écrit aucune image', async () => {
    repo.manager.query.mockResolvedValueOnce([])

    await service.create({ ...base, imageObjectIds: [IMAGE] })

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ image_attachments: null }))
  })

  it('un message ordinaire, sans image, écrit `image_attachments: null` sans consulter le stockage', async () => {
    await service.create(base)

    expect(repo.manager.query).not.toHaveBeenCalled()
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ image_attachments: null }))
  })

  describe('#2433.4 / #2433.12 — les zones et objets détectés survivent à la session', () => {
    const region = { quote: 'Total HT 1 250,00', bounding_box: { x: 0.1, y: 0.2, w: 0.3, h: 0.05 } }
    const objects = {
      document_bounds: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 },
      table: {
        bounding_box: null,
        rows: [
          ['Poste', 'Montant'],
          ['Dev', null],
        ],
      },
    }

    it('écrit les zones et les objets de l’image avec le message, relus et validés', async () => {
      repo.manager.query.mockResolvedValueOnce([{ id: IMAGE, file_name: 'facture.png' }])

      await service.create({
        ...base,
        imageObjectIds: [IMAGE],
        imageVision: [{ id: IMAGE, regions: [region], objects }],
      })

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          image_attachments: [
            {
              id: IMAGE,
              name: 'facture.png',
              regions: [region],
              objects: {
                documentBounds: objects.document_bounds,
                table: { boundingBox: null, rows: objects.table.rows },
              },
            },
          ],
        }),
      )
    })

    it('sait dire NON : une zone qui déborde est écartée, jamais rognée', async () => {
      repo.manager.query.mockResolvedValueOnce([{ id: IMAGE, file_name: 'facture.png' }])
      const overflowing = { quote: 'Hors image', bounding_box: { x: 0.9, y: 0.9, w: 0.5, h: 0.5 } }

      await service.create({
        ...base,
        imageObjectIds: [IMAGE],
        imageVision: [{ id: IMAGE, regions: [overflowing, region] }],
      })

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ image_attachments: [{ id: IMAGE, name: 'facture.png', regions: [region] }] }),
      )
    })

    it('sait dire NON : la vision d’une image qui n’est pas celle de l’appelant n’est écrite nulle part', async () => {
      repo.manager.query.mockResolvedValueOnce([{ id: IMAGE, file_name: 'facture.png' }])

      await service.create({
        ...base,
        imageObjectIds: [IMAGE],
        imageVision: [{ id: 'img-etrangere', regions: [region] }],
      })

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ image_attachments: [{ id: IMAGE, name: 'facture.png' }] }),
      )
    })

    it('rien de mesuré = clé absente (jamais un tableau vide, jamais un objet vide)', async () => {
      repo.manager.query.mockResolvedValueOnce([{ id: IMAGE, file_name: 'facture.png' }])

      await service.create({
        ...base,
        imageObjectIds: [IMAGE],
        imageVision: [{ id: IMAGE, regions: [], objects: { document_bounds: null, table: null } }],
      })

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ image_attachments: [{ id: IMAGE, name: 'facture.png' }] }),
      )
    })

    it('relit les zones et objets avec le fil', async () => {
      const stored = {
        id: IMAGE,
        name: 'facture.png',
        regions: [region],
        objects: { documentBounds: null, table: null },
      }
      repo.find.mockResolvedValueOnce([
        {
          id: 'm-1',
          role: 'user',
          content: base.content,
          created_at: new Date(),
          image_attachments: [stored],
        } as never,
      ])

      const [message] = await service.listThread({
        userId: USER,
        workspaceId: WORKSPACE,
        accountId: null,
        conversationId: 'conv-1',
        limit: 50,
      })

      expect(message.image_attachments).toEqual([stored])
    })
  })

  it('relit les images jointes avec le fil', async () => {
    repo.find.mockResolvedValueOnce([
      {
        id: 'm-1',
        role: 'user',
        content: base.content,
        created_at: new Date(),
        image_attachments: [{ id: IMAGE, name: 'capture-crm.png' }],
      } as ChatMessageEntity,
    ])

    const [message] = await service.listThread({
      userId: USER,
      workspaceId: WORKSPACE,
      accountId: null,
      conversationId: 'conv-1',
      limit: 50,
    })

    expect(message.image_attachments).toEqual([{ id: IMAGE, name: 'capture-crm.png' }])
  })

  /** LE TÉMOIN QUI COMPTE — un message d'AVANT la colonne n'a pas d'image ;
   *  il doit continuer de sortir de la lecture, `image_attachments: null`. */
  it('rend un message d’AVANT la colonne avec `image_attachments: null`', async () => {
    repo.find.mockResolvedValueOnce([
      { id: 'm-0', role: 'user', content: 'Question de mars.', created_at: new Date() } as ChatMessageEntity,
    ])

    const [message] = await service.listThread({
      userId: USER,
      workspaceId: WORKSPACE,
      accountId: null,
      conversationId: 'conv-1',
      limit: 50,
    })

    expect(message.image_attachments).toBeNull()
  })
})
