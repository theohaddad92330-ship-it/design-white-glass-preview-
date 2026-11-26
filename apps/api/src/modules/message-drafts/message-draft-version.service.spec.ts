import { MessageDraftValidationEntity } from '../../database/entities/message-draft-validation.entity'
import { MessageDraftVersionEntity } from '../../database/entities/message-draft-version.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { MessageDraftVersionService } from './message-draft-version.service'

function row(partial: Partial<MessageDraftVersionEntity>): MessageDraftVersionEntity {
  return {
    id: 'mdv-1',
    workspace_id: 'ws-1',
    contact_id: 'contact-1',
    channel: 'email',
    subject: 'Objet',
    body: 'Corps.',
    edited_subject: null,
    edited_body: null,
    used_template_source: null,
    used_template_version: null,
    used_style_id: null,
    unchanged: false,
    angle: null,
    recorded_by: 'u-1',
    created_at: new Date('2026-10-06T10:00:00.000Z'),
    ...partial,
  } as MessageDraftVersionEntity
}

describe('#3695.4/.6, #3696 — MessageDraftVersionService', () => {
  let repo: MockRepository<MessageDraftVersionEntity>
  let validations: MockRepository<MessageDraftValidationEntity>
  let service: MessageDraftVersionService

  beforeEach(() => {
    repo = createMockRepository<MessageDraftVersionEntity>()
    validations = createMockRepository<MessageDraftValidationEntity>()
    validations.find.mockResolvedValue([])
    service = new MessageDraftVersionService(repo as never, validations as never)
  })

  it('record stamps identity from the caller (JWT/workspace), never the body', async () => {
    repo.save.mockImplementation(async (e: Partial<MessageDraftVersionEntity>) => ({
      ...e,
      id: 'mdv-9',
      created_at: new Date('2026-10-06T10:00:00.000Z'),
    }))
    const item = await service.record({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      recordedBy: 'u-1',
      channel: 'email',
      subject: '  Objet  ',
      body: 'Corps.',
    })
    expect(repo.create).toHaveBeenCalledWith({
      workspace_id: 'ws-1',
      contact_id: 'contact-1',
      channel: 'email',
      subject: 'Objet',
      body: 'Corps.',
      edited_subject: null,
      edited_body: null,
      used_template_source: null,
      used_template_version: null,
      used_style_id: null,
      unchanged: false,
      angle: null,
      recorded_by: 'u-1',
    })
    expect(item.id).toBe('mdv-9')
    expect(item.channel).toBe('email')
  })

  it('#3695.4 — persiste le modèle approuvé (source, version) ou le style appliqué quand fournis', async () => {
    repo.save.mockImplementation(async (e: Partial<MessageDraftVersionEntity>) => ({
      ...e,
      id: 'mdv-10',
      created_at: new Date('2026-10-06T10:00:00.000Z'),
    }))
    const item = await service.record({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      recordedBy: 'u-1',
      channel: 'email',
      body: 'Corps.',
      usedTemplateSource: 'Relance sans réponse',
      usedTemplateVersion: 3,
      usedStyleId: '11111111-1111-1111-1111-111111111111',
    })
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        used_template_source: 'Relance sans réponse',
        used_template_version: 3,
        used_style_id: '11111111-1111-1111-1111-111111111111',
      }),
    )
    expect(item.usedTemplateSource).toBe('Relance sans réponse')
    expect(item.usedTemplateVersion).toBe(3)
  })

  it('#3696.3 — persiste la correction manuelle sur sa propre ligne, sans réécrire la précédente', async () => {
    repo.save.mockImplementation(async (e: Partial<MessageDraftVersionEntity>) => ({
      ...e,
      id: 'mdv-11',
      created_at: new Date('2026-10-06T10:05:00.000Z'),
    }))
    const item = await service.record({
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      recordedBy: 'u-1',
      channel: 'email',
      body: 'Corps généré.',
      editedSubject: 'Objet corrigé',
      editedBody: 'Corps corrigé à la main.',
    })
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ edited_subject: 'Objet corrigé', edited_body: 'Corps corrigé à la main.' }),
    )
    expect(item.editedBody).toBe('Corps corrigé à la main.')
  })

  it('listFor scopes by contact, workspace AND channel, dans l’ordre d’apparition', async () => {
    repo.find.mockResolvedValue([row({ id: 'mdv-1' }), row({ id: 'mdv-2' })])
    const items = await service.listFor('contact-1', 'ws-1', 'email')
    expect(repo.find).toHaveBeenCalledWith({
      where: { contact_id: 'contact-1', workspace_id: 'ws-1', channel: 'email' },
      order: { created_at: 'ASC' },
    })
    expect(items).toHaveLength(2)
    // Pas de fuite d'identifiants internes vers le wire.
    expect(items[0]).not.toHaveProperty('workspace_id')
    expect(items[0]).not.toHaveProperty('recorded_by')
  })

  it('Théo C6.N2 — listFor dit quelle version est validée (et rien d’autre : aucune validation ⇒ null)', async () => {
    repo.find.mockResolvedValue([row({ id: 'mdv-1' }), row({ id: 'mdv-2' })])
    validations.find.mockResolvedValue([
      { version_id: 'mdv-2', created_at: new Date('2026-10-22T09:00:00.000Z') } as MessageDraftValidationEntity,
    ])
    const items = await service.listFor('contact-1', 'ws-1', 'email')
    expect(items.map(item => item.validatedAt)).toEqual([null, '2026-10-22T09:00:00.000Z'])
    const where = validations.find.mock.calls[0]?.[0]?.where
    expect(where?.workspace_id).toBe('ws-1')
  })

  it('Théo C6.N2 — aucune version ⇒ aucune lecture des validations', async () => {
    repo.find.mockResolvedValue([])
    await service.listFor('contact-1', 'ws-1', 'email')
    expect(validations.find).not.toHaveBeenCalled()
  })
})
