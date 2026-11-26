import { NotFoundException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { MessageDraftArchivalEntity } from '../../database/entities/message-draft-archival.entity'
import type { MessageDraftValidationEntity } from '../../database/entities/message-draft-validation.entity'
import type { MessageDraftVersionEntity } from '../../database/entities/message-draft-version.entity'
import { createMockRepository } from '../../database/test-utils'
import { MessageDraftValidationService } from './message-draft-validation.service'

function version(partial: Partial<MessageDraftVersionEntity>): MessageDraftVersionEntity {
  return {
    id: 'v-1',
    workspace_id: 'ws-1',
    contact_id: 'c-1',
    channel: 'email',
    subject: 'Objet',
    body: 'Corps généré.',
    edited_subject: null,
    edited_body: null,
    used_template_source: null,
    used_template_version: null,
    used_style_id: null,
    unchanged: false,
    angle: null,
    recorded_by: 'u-1',
    created_at: new Date('2026-10-20T10:00:00.000Z'),
    ...partial,
  } as MessageDraftVersionEntity
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex')

describe('Théo B C6.N2 / M2.N1 — MessageDraftValidationService', () => {
  const versions = createMockRepository<MessageDraftVersionEntity>()
  const validations = createMockRepository<MessageDraftValidationEntity>()
  const archivals = createMockRepository<MessageDraftArchivalEntity>()
  const contacts = createMockRepository<ContactEntity>()
  const accounts = createMockRepository<AccountEntity>()
  let service: MessageDraftValidationService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new MessageDraftValidationService(
      versions as never,
      validations as never,
      contacts as never,
      accounts as never,
      archivals as never,
    )
  })

  it('valide une version de l’espace : empreinte du contenu EFFECTIF, validateur = l’appelant, aucun envoi', async () => {
    versions.findOne.mockResolvedValue(version({ edited_subject: 'Objet corrigé', edited_body: 'Corps corrigé.' }))
    validations.findOne.mockResolvedValue(null)
    validations.save.mockImplementation(async (e: Partial<MessageDraftValidationEntity>) => ({
      ...e,
      created_at: new Date('2026-10-22T09:00:00.000Z'),
    }))

    const result = await service.validate('v-1', 'ws-1', 'u-2')

    expect(versions.findOne).toHaveBeenCalledWith({ where: { id: 'v-1', workspace_id: 'ws-1' } })
    expect(result).toEqual({
      versionId: 'v-1',
      contentHash: sha('Objet corrigé\nCorps corrigé.'),
      validatedBy: 'u-2',
      validatedAt: '2026-10-22T09:00:00.000Z',
    })
  })

  it('une version d’un autre espace est introuvable — jamais validée', async () => {
    versions.findOne.mockResolvedValue(null)
    await expect(service.validate('v-9', 'ws-1', 'u-2')).rejects.toBeInstanceOf(NotFoundException)
    expect(validations.save).not.toHaveBeenCalled()
  })

  it('est idempotente : une version déjà validée rend sa validation, sans seconde ligne', async () => {
    versions.findOne.mockResolvedValue(version({}))
    validations.findOne.mockResolvedValue({
      version_id: 'v-1',
      content_hash: sha('Objet\nCorps généré.'),
      validated_by: 'u-1',
      created_at: new Date('2026-10-21T09:00:00.000Z'),
    } as MessageDraftValidationEntity)

    const result = await service.validate('v-1', 'ws-1', 'u-2')

    expect(result.validatedBy).toBe('u-1')
    expect(validations.save).not.toHaveBeenCalled()
  })

  it('« mes brouillons » : la dernière version de chaque fil (contact × canal), validée ou à relire, la plus récente d’abord', async () => {
    versions.find.mockResolvedValue([
      version({ id: 'v-3', contact_id: 'c-1', channel: 'email', created_at: new Date('2026-10-22T08:00:00Z') }),
      version({ id: 'v-2', contact_id: 'c-1', channel: 'email', created_at: new Date('2026-10-21T08:00:00Z') }),
      version({ id: 'v-4', contact_id: 'c-2', channel: 'linkedin', created_at: new Date('2026-10-20T08:00:00Z') }),
    ])
    validations.find.mockResolvedValue([
      { version_id: 'v-4', created_at: new Date('2026-10-20T09:00:00Z') } as MessageDraftValidationEntity,
    ])

    const { items, total } = await service.listMine('ws-1', 'u-1', { limit: 10, offset: 0 })

    expect(versions.find.mock.calls[0][0].where).toEqual({ workspace_id: 'ws-1', recorded_by: 'u-1' })
    expect(total).toBe(2)
    expect(items.map(i => [i.id, i.validatedAt])).toEqual([
      ['v-3', null],
      ['v-4', '2026-10-20T09:00:00.000Z'],
    ])
  })

  it('Théo B M2.N1 — chaque ligne dit QUI (contact, adresse en clair), chez QUEL compte, et combien de versions le fil compte', async () => {
    versions.find.mockResolvedValue([
      version({ id: 'v-3', contact_id: 'c-1', created_at: new Date('2026-10-22T08:00:00Z') }),
      version({ id: 'v-2', contact_id: 'c-1', created_at: new Date('2026-10-21T08:00:00Z') }),
      version({ id: 'v-1', contact_id: 'c-1', created_at: new Date('2026-10-20T08:00:00Z') }),
      version({ id: 'v-9', contact_id: 'c-2', channel: 'linkedin', created_at: new Date('2026-10-19T08:00:00Z') }),
    ])
    contacts.find.mockResolvedValue([
      { id: 'c-1', full_name: 'Paul Ferrer', email: 'paul.ferrer@altiver.example', account_id: 'a-1' },
      { id: 'c-2', full_name: 'Claire Vasseur', email: null, account_id: null },
    ] as ContactEntity[])
    accounts.find.mockResolvedValue([{ id: 'a-1', company_name: 'Altiver Industries' }] as AccountEntity[])

    const { items } = await service.listMine('ws-1', 'u-1', { limit: 10, offset: 0 })

    expect(contacts.find.mock.calls[0][0].where).toMatchObject({ workspace_id: 'ws-1' })
    expect(items[0]).toMatchObject({
      id: 'v-3',
      versionCount: 3,
      contactName: 'Paul Ferrer',
      contactEmail: 'paul.ferrer@altiver.example',
      accountId: 'a-1',
      accountName: 'Altiver Industries',
    })
    // Une valeur absente reste absente : ni adresse, ni compte inventés.
    expect(items[1]).toMatchObject({
      contactName: 'Claire Vasseur',
      contactEmail: null,
      accountId: null,
      accountName: null,
      versionCount: 1,
    })
  })

  it('Théo B M2.R6 — archiver un brouillon : une ligne d’audit, idempotente, jamais une suppression ni un envoi', async () => {
    versions.findOne.mockResolvedValue(version({}))
    archivals.findOne.mockResolvedValue(null)
    archivals.save.mockImplementation(async (e: Partial<MessageDraftArchivalEntity>) => ({
      ...e,
      created_at: new Date('2026-10-22T09:00:00.000Z'),
    }))

    const result = await service.archive('v-1', 'ws-1', 'u-2')

    expect(result).toEqual({ versionId: 'v-1', archivedAt: '2026-10-22T09:00:00.000Z' })
    expect(archivals.save).toHaveBeenCalledTimes(1)
    expect(versions.save).not.toHaveBeenCalled()

    archivals.findOne.mockResolvedValue({ version_id: 'v-1', created_at: new Date('2026-10-21T09:00:00.000Z') })
    await service.archive('v-1', 'ws-1', 'u-2')
    expect(archivals.save).toHaveBeenCalledTimes(1)
  })

  it('Théo B M2.R6 — une version d’un autre espace ne s’archive pas', async () => {
    versions.findOne.mockResolvedValue(null)
    await expect(service.archive('v-9', 'ws-1', 'u-2')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('Théo B M2.R6 — un fil dont la DERNIÈRE version est archivée sort de « mes brouillons » ; une version neuve le ramène', async () => {
    versions.find.mockResolvedValue([
      version({ id: 'v-2', contact_id: 'c-1', created_at: new Date('2026-10-22T08:00:00Z') }),
      version({ id: 'v-1', contact_id: 'c-2', created_at: new Date('2026-10-21T08:00:00Z') }),
    ])
    archivals.find.mockResolvedValue([{ version_id: 'v-2' }] as MessageDraftArchivalEntity[])

    const { items, total } = await service.listMine('ws-1', 'u-1', { limit: 10, offset: 0 })

    expect(items.map(i => i.id)).toEqual(['v-1'])
    expect(total).toBe(1)
  })
})
