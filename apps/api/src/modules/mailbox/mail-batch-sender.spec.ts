import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { MailBatchEntity } from '../../database/entities/mail-batch.entity'
import { MailThreadMarkEntity } from '../../database/entities/mail-thread-mark.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SuppressionService } from '../mailer/suppression.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { MAILBOX_BACKENDS } from './mailbox-backend'
import { MailboxService } from './mailbox.service'

/**
 * (#4546.5 — l'expéditeur choisi) L'envoi de masse est la décision la plus risquée du chantier (arbitrage Louis
 * du 03/08 : un lot validé peut PARTIR). Ces tests sont ses garde-fous — un
 * mauvais lot part en entier, et la réputation d'envoi d'un domaine se répare
 * en semaines.
 */
const CONNECTED = {
  connected: true,
  provider: 'google' as const,
  address: 'moi@bellum.fr',
  capabilities: { read: true, draft: true, send: true, labels: false, outOfOffice: false },
}

const BATCH_ID = '11111111-2222-3333-4444-555555555555'

function backend(overrides: Record<string, unknown> = {}) {
  return {
    status: jest.fn().mockResolvedValue(CONNECTED),
    search: jest.fn(),
    listAttachments: jest.fn(),
    createDraft: jest.fn().mockResolvedValue({
      provider: 'google',
      draftId: 'd1',
      messageId: 'm1',
      threadId: 't1',
      webUrl: null,
    }),
    send: jest.fn().mockResolvedValue(undefined),
    getOutOfOffice: jest.fn(),
    setOutOfOffice: jest.fn(),
    signature: jest.fn().mockResolvedValue({ text: null, address: 'moi@bellum.fr' }),
    ...overrides,
  }
}

async function build(options: {
  target: ReturnType<typeof backend>
  existingBatch?: Partial<MailBatchEntity> | null
  suppressed?: (email: string) => boolean
  insertThrows?: boolean
}) {
  const batches = {
    findOne: jest.fn().mockResolvedValue(options.existingBatch ?? null),
    insert: options.insertThrows
      ? jest.fn().mockRejectedValue(new Error('duplicate key'))
      : jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  }
  const moduleRef = await Test.createTestingModule({
    providers: [
      MailboxService,
      { provide: MAILBOX_BACKENDS, useValue: [options.target] },
      { provide: getRepositoryToken(ProfileEntity), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
      { provide: getRepositoryToken(MailBatchEntity), useValue: batches },
      // Le rattachement d'un fil à son compte (MAIL-01) lit les contacts. Un lot
      // d'envoi ne s'en sert pas — la doublure rend un portefeuille vide.
      {
        provide: getRepositoryToken(ContactEntity),
        useValue: {
          // #4546.5 — le fil d'un contact déjà écrit (`createContactDraft`) : aucun message antérieur ici.
          query: jest.fn().mockResolvedValue([]),
          createQueryBuilder: jest.fn(() => ({
            innerJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            addSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getRawMany: jest.fn().mockResolvedValue([]),
          })),
        },
      },
      // #2104.6/.7/.8 — la décision manuelle sur un fil. Un lot d'envoi ne
      // s'en sert pas : la doublure rend une table vide.
      {
        provide: getRepositoryToken(MailThreadMarkEntity),
        useValue: {
          createQueryBuilder: jest.fn(() => ({
            leftJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            addSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getRawMany: jest.fn().mockResolvedValue([]),
          })),
        },
      },
      { provide: getRepositoryToken(AccountEntity), useValue: {} },
      { provide: getRepositoryToken(ChatMessageEntity), useValue: {} },
      {
        provide: SuppressionService,
        useValue: {
          isSuppressed: jest.fn(async (_workspace: string, email: string) =>
            options.suppressed ? options.suppressed(email) : false,
          ),
        },
      },
      {
        provide: WorkspaceContextService,
        useValue: {
          resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws1' }),
          isDemoWorkspace: jest.fn().mockResolvedValue(false),
        },
      },
    ],
  }).compile()
  return { service: moduleRef.get(MailboxService), batches }
}

const item = (to: string) => ({ to, subject: 'Suite à notre échange', body: 'Bonjour,' })

const SECOND = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NO_SEND = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const senders = () =>
  jest.fn().mockResolvedValue([
    {
      connectionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      provider: 'google',
      address: 'nominative@esn.fr',
      capabilities: { read: true, draft: true, send: true },
    },
    {
      connectionId: SECOND,
      provider: 'google',
      address: 'prospection@marque.fr',
      capabilities: { read: true, draft: true, send: true },
    },
    {
      connectionId: NO_SEND,
      provider: 'google',
      address: 'lecture@esn.fr',
      capabilities: { read: true, draft: false, send: false },
    },
  ])

describe('MailboxService — l’expéditeur se choisit parmi SES boîtes (#4546.5)', () => {
  it('le brouillon ET l’envoi partent de la boîte désignée', async () => {
    const target = backend({ senders: senders() })
    const { service } = await build({ target })
    const result = await service.sendBatch('u1', {
      batchId: BATCH_ID,
      mode: 'send',
      senderConnectionId: SECOND,
      items: [item('a@acme.com')],
    })
    expect(result.sent).toBe(1)
    expect(target.createDraft).toHaveBeenCalledWith('u1', expect.anything(), null, SECOND)
    expect(target.send).toHaveBeenCalledWith('u1', expect.anything(), SECOND)
  })

  it('REFUS — une boîte qui n’est pas à lui (absente de SES boîtes) : rien ne part, le lot n’est pas réservé', async () => {
    const target = backend({ senders: senders() })
    const { service, batches } = await build({ target })
    await expect(
      service.sendBatch('u1', {
        batchId: BATCH_ID,
        mode: 'send',
        senderConnectionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        items: [item('a@acme.com')],
      }),
    ).rejects.toThrow()
    expect(target.send).not.toHaveBeenCalled()
    expect(target.createDraft).not.toHaveBeenCalled()
    expect(batches.insert).not.toHaveBeenCalled()
  })

  it('une boîte sans la portée d’envoi ne propose pas l’envoi', async () => {
    const target = backend({ senders: senders() })
    const { service } = await build({ target })
    await expect(
      service.sendBatch('u1', {
        batchId: BATCH_ID,
        mode: 'send',
        senderConnectionId: NO_SEND,
        items: [item('a@acme.com')],
      }),
    ).rejects.toThrow()
    expect(target.send).not.toHaveBeenCalled()
  })

  it('sans expéditeur désigné : le comportement d’avant (boîte par défaut)', async () => {
    const target = backend({ senders: senders() })
    const { service } = await build({ target })
    await service.sendBatch('u1', { batchId: BATCH_ID, mode: 'send', items: [item('a@acme.com')] })
    expect(target.send).toHaveBeenCalledWith('u1', expect.anything(), undefined)
  })

  it('listSenders rend SES boîtes, adresse comprise, tous fournisseurs confondus', async () => {
    const target = backend({ senders: senders() })
    const { service } = await build({ target })
    const list = await service.listSenders('u1')
    expect(list.map(sender => sender.address)).toEqual(['nominative@esn.fr', 'prospection@marque.fr', 'lecture@esn.fr'])
  })
})

describe('MailboxService — l’expéditeur d’un envoi INDIVIDUEL se choisit parmi SES boîtes (#4546.5)', () => {
  const FOREIGN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const mail = { to: 'a@acme.com', subject: 'Suite à notre échange', body: 'Bonjour,' }

  it('individualSendStatus dit l’adresse de la boîte DÉSIGNÉE et si elle peut envoyer', async () => {
    const { service } = await build({ target: backend({ senders: senders() }) })
    expect(await service.individualSendStatus('u1', SECOND)).toEqual({
      connected: true,
      provider: 'google',
      address: 'prospection@marque.fr',
      can_send: true,
    })
    expect(await service.individualSendStatus('u1', NO_SEND)).toMatchObject({ connected: true, can_send: false })
  })

  it('REFUS — individualSendStatus d’une boîte qui n’est pas à lui : non connectée, jamais l’adresse d’un autre', async () => {
    const { service } = await build({ target: backend({ senders: senders() }) })
    expect(await service.individualSendStatus('u1', FOREIGN)).toEqual({
      connected: false,
      provider: null,
      address: null,
      can_send: false,
    })
  })

  it('sendIndividual part de la boîte désignée', async () => {
    const target = backend({ senders: senders() })
    const { service } = await build({ target })
    await service.sendIndividual('u1', mail, SECOND)
    expect(target.send).toHaveBeenCalledWith('u1', mail, SECOND)
  })

  it('REFUS — sendIndividual avec la boîte d’un autre, ou sans portée d’envoi : rien ne part', async () => {
    const target = backend({ senders: senders() })
    const { service } = await build({ target })
    await expect(service.sendIndividual('u1', mail, FOREIGN)).rejects.toThrow()
    await expect(service.sendIndividual('u1', mail, NO_SEND)).rejects.toThrow()
    expect(target.send).not.toHaveBeenCalled()
  })

  it('sans expéditeur désigné : la boîte par défaut, comme avant', async () => {
    const target = backend({ senders: senders() })
    const { service } = await build({ target })
    await service.sendIndividual('u1', mail)
    expect(target.send).toHaveBeenCalledWith('u1', mail)
  })

  it('le brouillon d’un contact est déposé dans la boîte désignée — et refusé pour celle d’un autre', async () => {
    const target = backend({ senders: senders() })
    const { service } = await build({ target })
    await service.createContactDraft('u1', { contactId: 'c1', ...mail, senderConnectionId: SECOND })
    expect(target.createDraft).toHaveBeenCalledWith('u1', expect.anything(), null, SECOND)
    target.createDraft.mockClear()
    await expect(
      service.createContactDraft('u1', { contactId: 'c1', ...mail, senderConnectionId: FOREIGN }),
    ).rejects.toThrow()
    expect(target.createDraft).not.toHaveBeenCalled()
  })
})
