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
 * L'envoi de masse est la décision la plus risquée du chantier (arbitrage Louis
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

describe('MailboxService — lots', () => {
  it('réserve le lot AVANT d’envoyer quoi que ce soit', async () => {
    const target = backend()
    const { batches } = await build({ target }).then(async built => {
      await built.service.sendBatch('u1', {
        batchId: BATCH_ID,
        mode: 'send',
        items: [item('a@acme.com')],
      })
      return built
    })
    expect(batches.insert.mock.invocationCallOrder[0]).toBeLessThan(target.send.mock.invocationCallOrder[0])
  })

  it('ne rejoue JAMAIS un lot déjà traité', async () => {
    const target = backend()
    const { service } = await build({
      target,
      existingBatch: { mode: 'send', sent: 3, drafted: 0, skipped: 1, failed: 0, aborted: false },
    })
    const result = await service.sendBatch('u1', {
      batchId: BATCH_ID,
      mode: 'send',
      items: [item('a@acme.com')],
    })
    expect(result.alreadyProcessed).toBe(true)
    expect(result.sent).toBe(3)
    expect(target.send).not.toHaveBeenCalled()
  })

  it('s’arrête proprement quand une autre requête a pris le lot', async () => {
    const target = backend()
    const { service } = await build({ target, insertThrows: true })
    const result = await service.sendBatch('u1', {
      batchId: BATCH_ID,
      mode: 'send',
      items: [item('a@acme.com')],
    })
    expect(result.alreadyProcessed).toBe(true)
    expect(target.send).not.toHaveBeenCalled()
  })

  it('écarte un destinataire désabonné avec sa raison, jamais en silence', async () => {
    const target = backend()
    const { service } = await build({ target, suppressed: email => email === 'stop@acme.com' })
    const result = await service.sendBatch('u1', {
      batchId: BATCH_ID,
      mode: 'send',
      items: [item('ok@acme.com'), item('stop@acme.com')],
    })
    expect(result.sent).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.outcomes.find(outcome => outcome.to === 'stop@acme.com')?.reason).toBe('suppressed')
    expect(target.send).toHaveBeenCalledTimes(1)
  })

  it('#3234 — le message-id du FOURNISSEUR remonte sur l’issue d’un envoi confirmé, jamais le corps', async () => {
    const target = backend({ send: jest.fn().mockResolvedValue({ messageId: 'gm-42', threadId: 'gt-7' }) })
    const { service } = await build({ target })
    const result = await service.sendBatch('u1', { batchId: BATCH_ID, mode: 'send', items: [item('a@acme.com')] })
    expect(result.outcomes[0]).toMatchObject({ status: 'sent', providerMessageId: 'gm-42', providerThreadId: 'gt-7' })
    expect(JSON.stringify(result)).not.toContain('Bonjour')
  })

  it('#3234 — un fournisseur qui ne rend aucun identifiant : null, jamais un identifiant deviné', async () => {
    const target = backend({ send: jest.fn().mockResolvedValue({ messageId: null, threadId: null }) })
    const { service } = await build({ target })
    const result = await service.sendBatch('u1', { batchId: BATCH_ID, mode: 'send', items: [item('a@acme.com')] })
    expect(result.outcomes[0]).toMatchObject({ status: 'sent', providerMessageId: null, providerThreadId: null })
  })

  it('#3234 — un brouillon n’a pas d’identifiant d’envoi : le champ reste absent', async () => {
    const target = backend()
    const { service } = await build({ target })
    const result = await service.sendBatch('u1', { batchId: BATCH_ID, mode: 'draft', items: [item('a@acme.com')] })
    expect(result.outcomes[0]?.providerMessageId ?? null).toBeNull()
  })

  it('déduplique : deux fois la même adresse, c’est deux messages chez la même personne', async () => {
    const target = backend()
    const { service } = await build({ target })
    const result = await service.sendBatch('u1', {
      batchId: BATCH_ID,
      mode: 'send',
      items: [item('a@acme.com'), item('A@ACME.com')],
    })
    expect(result.sent).toBe(1)
    expect(result.outcomes[1]?.reason).toBe('duplicate')
  })

  it('interrompt le lot après trois échecs consécutifs', async () => {
    // Trois refus d'affilée signalent un problème de compte, pas trois adresses
    // malchanceuses. Continuer transformerait un incident en réputation abîmée.
    const target = backend({ send: jest.fn().mockRejectedValue(new Error('quota exceeded')) })
    const { service } = await build({ target })
    const result = await service.sendBatch('u1', {
      batchId: BATCH_ID,
      mode: 'send',
      items: ['a', 'b', 'c', 'd', 'e'].map(letter => item(`${letter}@acme.com`)),
    })
    expect(result.aborted).toBe(true)
    expect(result.failed).toBe(3)
    expect(result.skipped).toBe(2)
    expect(result.outcomes[4]?.reason).toBe('aborted_after_failures')
  })

  it('en mode brouillon, rien ne part', async () => {
    const target = backend()
    const { service } = await build({ target })
    const result = await service.sendBatch('u1', {
      batchId: BATCH_ID,
      mode: 'draft',
      items: [item('a@acme.com')],
    })
    expect(result.drafted).toBe(1)
    expect(result.sent).toBe(0)
    expect(target.send).not.toHaveBeenCalled()
  })

  it('refuse le mode envoi quand la messagerie ne l’autorise pas', async () => {
    const target = backend({
      status: jest.fn().mockResolvedValue({ ...CONNECTED, capabilities: { ...CONNECTED.capabilities, send: false } }),
    })
    const { service } = await build({ target })
    await expect(
      service.sendBatch('u1', { batchId: BATCH_ID, mode: 'send', items: [item('a@acme.com')] }),
    ).rejects.toThrow(/envoi/)
  })

  it('refuse un lot au-delà de la borne — une campagne n’est pas une relance', async () => {
    const target = backend()
    const { service } = await build({ target })
    const items = Array.from({ length: 51 }, (_, index) => item(`c${index}@acme.com`))
    await expect(service.sendBatch('u1', { batchId: BATCH_ID, mode: 'send', items })).rejects.toThrow()
  })
})
