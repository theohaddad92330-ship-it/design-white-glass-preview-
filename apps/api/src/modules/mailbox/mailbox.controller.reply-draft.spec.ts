import { BadGatewayException, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { HttpError } from '@bellum/errors'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { IaClient } from '../ia/ia.client'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { MailboxController } from './mailbox.controller'
import type { MailThreadText } from './mail-thread-text'
import type { MailboxService } from './mailbox.service'

/**
 * #4405.1 — « Préparer la réponse » pré-génère le mail prêt à l'envoi.
 *
 * Le contrôleur lit le fil avec le jeton de CET utilisateur (c96), le remet à
 * l'IA et rend objet + corps. Il n'écrit rien et n'envoie rien (c82) ; un échec
 * est une erreur claire, jamais un texte inventé.
 */
const user = { userId: 'u-1', email: 'commercial@kicklox.test' } as CurrentUserPayload
const dto = { threadId: 't-1', counterpart: 'claire@acme.fr', locale: 'fr' as const }
const thread: MailThreadText = {
  threadId: 't-1',
  subject: 'Point mission',
  truncated: false,
  messages: [
    { direction: 'outbound', date: '2026-10-14', from: 'moi@esn.fr', text: 'On cale un point ?' },
    { direction: 'inbound', date: '2026-10-16', from: 'claire@acme.fr', text: 'Jeudi après-midi.' },
  ],
}

function build(opts: { thread?: MailThreadText | null; draft?: () => Promise<unknown>; demo?: boolean } = {}) {
  const mailbox = {
    readOwnThread: jest.fn().mockResolvedValue(opts.thread === undefined ? thread : opts.thread),
    createDraft: jest.fn(),
    sendBatch: jest.fn(),
  } as unknown as jest.Mocked<Pick<MailboxService, 'readOwnThread' | 'createDraft' | 'sendBatch'>>
  const ia = {
    draftMailReply: jest.fn(opts.draft ?? (async () => ({ subject: 'Re: Point mission', body: 'Jeudi 15 h me va.' }))),
  } as unknown as jest.Mocked<Pick<IaClient, 'draftMailReply'>>
  const workspaceContext = {
    isDemoWorkspace: jest.fn().mockResolvedValue(opts.demo ?? false),
  } as unknown as jest.Mocked<Pick<WorkspaceContextService, 'isDemoWorkspace'>>
  const controller = new MailboxController(
    mailbox as unknown as MailboxService,
    workspaceContext as unknown as WorkspaceContextService,
    ia as unknown as IaClient,
  )
  return { mailbox, ia, controller }
}

describe('MailboxController — POST /mailbox/reply-draft', () => {
  it('lit le fil de CET utilisateur, le remet à l’IA et rend objet + corps', async () => {
    const built = build()
    const result = await built.controller.draftReply(user, dto)
    expect(built.mailbox.readOwnThread).toHaveBeenCalledWith('u-1', { threadId: 't-1', counterpart: 'claire@acme.fr' })
    expect(built.ia.draftMailReply).toHaveBeenCalledWith({
      counterpart: 'claire@acme.fr',
      subject: 'Point mission',
      messages: thread.messages,
      locale: 'fr',
    })
    expect(result).toEqual({ subject: 'Re: Point mission', body: 'Jeudi 15 h me va.' })
  })

  // #4405.1 — un fil sans interlocuteur identifié (groupe, événement) : la réponse se rédige quand même.
  it('un fil sans interlocuteur est lu sans filtre de participant et rédigé', async () => {
    const built = build()
    const result = await built.controller.draftReply(user, { threadId: 't-1', locale: 'fr' })
    expect(built.mailbox.readOwnThread).toHaveBeenCalledWith('u-1', { threadId: 't-1' })
    expect(built.ia.draftMailReply.mock.calls[0]?.[0]).not.toHaveProperty('counterpart')
    expect(result.body).not.toBe('')
  })

  it('n’écrit ni n’envoie rien : ni brouillon déposé ni lot', async () => {
    const built = build()
    await built.controller.draftReply(user, dto)
    expect(built.mailbox.createDraft).not.toHaveBeenCalled()
    expect(built.mailbox.sendBatch).not.toHaveBeenCalled()
  })

  it('un fil introuvable est DIT (404), l’IA n’est pas appelée', async () => {
    const built = build({ thread: null })
    await expect(built.controller.draftReply(user, dto)).rejects.toBeInstanceOf(NotFoundException)
    expect(built.ia.draftMailReply).not.toHaveBeenCalled()
  })

  it('sans clé de modèle (503 IA) : « indisponible », jamais un texte inventé', async () => {
    const built = build({
      draft: async () => {
        throw new HttpError(503, 'mail_reply_unavailable', true, '/mail/reply-draft')
      },
    })
    await expect(built.controller.draftReply(user, dto)).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('tout autre échec IA devient une 502 claire', async () => {
    const built = build({
      draft: async () => {
        throw new Error('boom')
      },
    })
    await expect(built.controller.draftReply(user, dto)).rejects.toBeInstanceOf(BadGatewayException)
  })

  it('en démonstration : réponse scriptée, le client IA n’est jamais appelé', async () => {
    const built = build({ demo: true })
    const result = await built.controller.draftReply(user, { ...dto, threadId: 'demo-thread-verdal-proposal' })
    expect(built.ia.draftMailReply).not.toHaveBeenCalled()
    expect(built.mailbox.readOwnThread).not.toHaveBeenCalled()
    expect(result.subject.startsWith('Re: ')).toBe(true)
    expect(result.body.length).toBeGreaterThan(20)
  })
})
