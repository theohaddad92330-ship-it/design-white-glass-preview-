import { NotFoundException } from '@nestjs/common'
import { replyDigest, type CreateReplyFeedback } from '@bellum/contracts'
import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import type { ChatReplyFeedbackEntity } from '../../database/entities/chat-reply-feedback.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import { createMockRepository } from '../../database/test-utils'
import { ReplyFeedbackService } from './reply-feedback.service'

const REPLY = 'Priorise EDF cette semaine : le DSI vient de changer.'
const DIGEST = replyDigest(REPLY)

function entityRow(partial: Partial<ChatReplyFeedbackEntity> = {}): ChatReplyFeedbackEntity {
  return {
    id: 'rf-1',
    workspace_id: 'ws-1',
    user_id: 'u-1',
    reply_digest: DIGEST,
    message_id: null,
    account_id: null,
    contact_id: null,
    action_kind: null,
    verdict: 'pas_pertinent',
    reason: 'mauvais_timing',
    category: null,
    note: null,
    correction_field: null,
    correction_value: null,
    correction_scope: null,
    account_feedback_id: null,
    reuse_scope: 'tenant_private',
    withdrawn_at: null,
    created_at: new Date('2026-09-12T08:00:00.000Z'),
    ...partial,
  }
}

function build() {
  const feedback = createMockRepository<ChatReplyFeedbackEntity>()
  const messages = createMockRepository<ChatMessageEntity>()
  const accounts = createMockRepository<AccountEntity>()
  const contacts = createMockRepository<ContactEntity>()
  feedback.save.mockImplementation(async (entity: ChatReplyFeedbackEntity) => ({
    ...entity,
    id: 'rf-1',
    created_at: new Date('2026-09-13T08:00:00.000Z'),
  }))
  const service = new ReplyFeedbackService(
    feedback as unknown as Repository<ChatReplyFeedbackEntity>,
    messages as unknown as Repository<ChatMessageEntity>,
    accounts as unknown as Repository<AccountEntity>,
    contacts as unknown as Repository<ContactEntity>,
  )
  return { feedback, messages, accounts, contacts, service }
}

const body = (partial: Partial<CreateReplyFeedback> = {}): CreateReplyFeedback =>
  ({ replyDigest: DIGEST, verdict: 'pas_pertinent', reason: 'mauvais_timing', ...partial }) as CreateReplyFeedback

describe('ReplyFeedbackService.create — #1919.14 un retour relié à sa réponse, jamais recopiée', () => {
  it('estampille l’espace et l’auteur reçus de l’appelant, et ne stocke aucun texte de réponse', async () => {
    const { feedback, service } = build()
    const ack = await service.create({ workspaceId: 'ws-1', userId: 'u-1', body: body(), accountFeedbackId: null })

    const saved = feedback.save.mock.calls[0]?.[0] as Record<string, unknown>
    expect(saved).toMatchObject({
      workspace_id: 'ws-1',
      user_id: 'u-1',
      reply_digest: DIGEST,
      verdict: 'pas_pertinent',
      reason: 'mauvais_timing',
      // GA-47 — la portée la plus fermée, écrite au site d'écriture.
      reuse_scope: 'tenant_private',
    })
    expect(Object.keys(saved)).not.toContain('content')
    expect(Object.values(saved)).not.toContain(REPLY)
    expect(ack.item).toEqual({
      id: 'rf-1',
      replyDigest: DIGEST,
      verdict: 'pas_pertinent',
      reason: 'mauvais_timing',
      category: null,
      accountCorrected: false,
      createdAt: '2026-09-13T08:00:00.000Z',
    })
    expect(ack.item).not.toHaveProperty('userId')
  })

  // #2444.1 — la catégorie est indépendante du verdict/motif, persistée et rendue.
  it('#2444.1 — garde la catégorie quand elle accompagne un verdict', async () => {
    const { feedback, service } = build()
    const ack = await service.create({
      workspaceId: 'ws-1',
      userId: 'u-1',
      body: body({ verdict: 'utile', reason: undefined, category: 'bug_interface' }),
      accountFeedbackId: null,
    })

    const saved = feedback.save.mock.calls[0]?.[0] as Record<string, unknown>
    expect(saved).toMatchObject({ category: 'bug_interface' })
    expect(ack.item.category).toBe('bug_interface')
  })

  it('retrouve l’identifiant du message par son empreinte, dans les réponses de l’ESPACE', async () => {
    const { feedback, messages, service } = build()
    messages.find.mockResolvedValue([
      { id: 'm-other', content: 'Une autre réponse.' },
      { id: 'm-42', content: `  ${REPLY}\n` },
    ] as ChatMessageEntity[])

    await service.create({ workspaceId: 'ws-1', userId: 'u-1', body: body(), accountFeedbackId: null })

    expect(messages.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspace_id: 'ws-1', role: 'assistant' } }),
    )
    expect(feedback.save.mock.calls[0]?.[0]).toMatchObject({ message_id: 'm-42' })
  })

  it('une réponse pas encore écrite (ou illisible) garde son empreinte, sans identifiant deviné', async () => {
    const { feedback, messages, service } = build()
    messages.find.mockRejectedValue(new Error('db down'))
    await service.create({ workspaceId: 'ws-1', userId: 'u-1', body: body(), accountFeedbackId: null })
    expect(feedback.save.mock.calls[0]?.[0]).toMatchObject({ message_id: null, reply_digest: DIGEST })
  })

  it('#1919.14 — garde le compte, le contact et la nature d’action que la réponse portait', async () => {
    const { feedback, service } = build()
    await service.create({
      workspaceId: 'ws-1',
      userId: 'u-1',
      body: body({
        accountId: '5b7d0c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
        contactId: '6b7d0c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
        actionKind: 'prepare_message',
      }),
      accountFeedbackId: null,
    })
    expect(feedback.save.mock.calls[0]?.[0]).toMatchObject({
      account_id: '5b7d0c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
      contact_id: '6b7d0c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
      action_kind: 'prepare_message',
    })
  })

  it('#1919.7 — garde la correction et le lien vers la correction du dossier', async () => {
    const { feedback, service } = build()
    const ack = await service.create({
      workspaceId: 'ws-1',
      userId: 'u-1',
      body: {
        replyDigest: DIGEST,
        verdict: 'donnee_fausse',
        accountId: '5b7d0c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
        correction: { field: 'Le DSI', value: 'Claire Martin', scope: 'account' },
      },
      accountFeedbackId: 'af-1',
    })
    expect(feedback.save.mock.calls[0]?.[0]).toMatchObject({
      verdict: 'donnee_fausse',
      reason: null,
      correction_field: 'Le DSI',
      correction_value: 'Claire Martin',
      correction_scope: 'account',
      account_feedback_id: 'af-1',
    })
    expect(ack.item.accountCorrected).toBe(true)
  })
})

describe('ReplyFeedbackService.create — #1928.7 proposer une préférence, seulement après des retours répétés', () => {
  it('propose des réponses plus courtes quand « trop long » vise TROIS réponses distinctes', async () => {
    const { feedback, service } = build()
    feedback.find.mockResolvedValue([
      entityRow({ reply_digest: 'aaaaaaaaaaaaaaaa', reason: 'trop_long' }),
      entityRow({ reply_digest: 'bbbbbbbbbbbbbbbb', reason: 'trop_long' }),
      entityRow({ reply_digest: 'cccccccccccccccc', reason: 'trop_long' }),
    ])
    const ack = await service.create({
      workspaceId: 'ws-1',
      userId: 'u-1',
      body: body({ reason: 'trop_long' }),
      accountFeedbackId: null,
    })
    expect(feedback.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspace_id: 'ws-1', user_id: 'u-1' }) }),
    )
    expect(ack.preferenceSuggestion).toEqual({ kind: 'shorter_replies', count: 3 })
  })

  it('sait dire NON — deux réponses, ou trois clics sur la même, ne font pas une préférence', async () => {
    const { feedback, service } = build()
    feedback.find.mockResolvedValue([
      entityRow({ reply_digest: 'aaaaaaaaaaaaaaaa', reason: 'trop_long' }),
      entityRow({ reply_digest: 'aaaaaaaaaaaaaaaa', reason: 'trop_long' }),
      entityRow({ reply_digest: 'bbbbbbbbbbbbbbbb', reason: 'trop_long' }),
    ])
    const ack = await service.create({
      workspaceId: 'ws-1',
      userId: 'u-1',
      body: body({ reason: 'trop_long' }),
      accountFeedbackId: null,
    })
    expect(ack.preferenceSuggestion).toBeNull()
  })

  it('ne compte rien pour un autre motif', async () => {
    const { feedback, service } = build()
    const ack = await service.create({ workspaceId: 'ws-1', userId: 'u-1', body: body(), accountFeedbackId: null })
    expect(feedback.find).not.toHaveBeenCalled()
    expect(ack.preferenceSuggestion).toBeNull()
  })
})

describe('ReplyFeedbackService — cloisonnement espace + auteur', () => {
  it('refuse un compte hors de l’espace (404) — un nom de compte d’un autre espace ne doit jamais entrer dans un prompt', async () => {
    const { accounts, service } = build()
    accounts.findOne.mockResolvedValue(null)
    await expect(
      service.assertTargetsInWorkspace({ workspaceId: 'ws-1', accountId: 'acc-x', contactId: null }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(accounts.findOne).toHaveBeenCalledWith({ where: { id: 'acc-x', workspace_id: 'ws-1' } })
  })

  it('refuse un contact hors de l’espace (404)', async () => {
    const { contacts, service } = build()
    contacts.findOne.mockResolvedValue(null)
    await expect(
      service.assertTargetsInWorkspace({ workspaceId: 'ws-1', accountId: null, contactId: 'c-x' }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('ne lit rien quand la réponse ne porte ni compte ni contact', async () => {
    const { accounts, contacts, service } = build()
    await service.assertTargetsInWorkspace({ workspaceId: 'ws-1', accountId: null, contactId: null })
    expect(accounts.findOne).not.toHaveBeenCalled()
    expect(contacts.findOne).not.toHaveBeenCalled()
  })

  it('listMine ne rend que les retours actifs de CETTE personne dans CET espace', async () => {
    const { feedback, service } = build()
    feedback.find.mockResolvedValue([entityRow()])
    const items = await service.listMine({ workspaceId: 'ws-1', userId: 'u-1' })
    expect(feedback.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspace_id: 'ws-1', user_id: 'u-1' }) }),
    )
    expect(items).toHaveLength(1)
    expect(items[0]).not.toHaveProperty('user_id')
  })

  it('withdraw ne retire que le retour de son auteur, et dit quand rien n’a été retiré', async () => {
    const { feedback, service } = build()
    feedback.update.mockResolvedValue({ affected: 0 })
    expect(await service.withdraw({ id: 'rf-1', workspaceId: 'ws-1', userId: 'u-1' })).toBe(false)
    expect(feedback.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rf-1', workspace_id: 'ws-1', user_id: 'u-1' }),
      expect.objectContaining({ withdrawn_at: expect.any(Date) }),
    )
  })
})

describe('ReplyFeedbackService.memoryFor — #1919.15 ce que Laura relit pour CETTE personne', () => {
  it('lit les retours de la personne et nomme les comptes relus DANS l’espace', async () => {
    const { feedback, accounts, service } = build()
    feedback.find.mockResolvedValue([entityRow({ account_id: 'acc-1', reason: 'hors_positionnement' })])
    accounts.find.mockResolvedValue([{ id: 'acc-1', company_name: 'Groupe Vallée' }] as AccountEntity[])

    const lines = await service.memoryFor({ workspaceId: 'ws-1', userId: 'u-1' })

    expect(feedback.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspace_id: 'ws-1', user_id: 'u-1' }) }),
    )
    expect(accounts.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspace_id: 'ws-1' }) }),
    )
    expect(lines).toContain('« Groupe Vallée »')
    expect(lines).toContain('hors positionnement')
  })

  it('rend une chaîne vide sans retour, sans lire les comptes', async () => {
    const { accounts, service } = build()
    expect(await service.memoryFor({ workspaceId: 'ws-1', userId: 'u-1' })).toBe('')
    expect(accounts.find).not.toHaveBeenCalled()
  })

  it('une lecture ratée ne casse jamais le chat — chaîne vide', async () => {
    const { feedback, service } = build()
    feedback.find.mockRejectedValue(new Error('db down'))
    expect(await service.memoryFor({ workspaceId: 'ws-1', userId: 'u-1' })).toBe('')
  })
})
