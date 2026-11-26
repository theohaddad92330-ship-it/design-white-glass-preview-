import { LinkedInController } from './linkedin.controller'
import type { LinkedInService } from './linkedin.service'
import type { MailboxService } from '../mailbox/mailbox.service'
import type { LinkedInMandateService } from './linkedin-mandate.service'

const USER = { userId: 'u1' } as never
const SAVED = { id: 'i1', contactId: 'c1', kind: 'reply_received', occurredAt: '2026-10-14T09:00:00.000Z', note: null }

function controllerOver(onReplyReceived: jest.Mock) {
  const linkedin = { record: jest.fn().mockResolvedValue(SAVED) } as unknown as LinkedInService
  const mailbox = { onReplyReceived } as unknown as MailboxService
  return new LinkedInController(linkedin, mailbox, {} as unknown as LinkedInMandateService)
}

describe('LinkedInController.record — une réponse reçue arrête les relances (#4181.1)', () => {
  it('une réponse LinkedIn déclarée passe par le point d’arrêt unique, canal LinkedIn', async () => {
    const onReplyReceived = jest.fn().mockResolvedValue(undefined)

    await controllerOver(onReplyReceived).record(USER, { contactId: 'c1', kind: 'reply_received' } as never)

    expect(onReplyReceived).toHaveBeenCalledWith('u1', 'c1', {
      channel: 'linkedin',
      event: 'reply_received',
      accountId: null,
    })
  })

  it('SAIT DIRE NON : un message envoyé n’arrête rien', async () => {
    const onReplyReceived = jest.fn()

    await controllerOver(onReplyReceived).record(USER, { contactId: 'c1', kind: 'message_sent' } as never)

    expect(onReplyReceived).not.toHaveBeenCalled()
  })

  it('un arrêt en échec ne fait pas perdre le fait déclaré (best-effort)', async () => {
    const onReplyReceived = jest.fn().mockRejectedValue(new Error('base indisponible'))

    await expect(
      controllerOver(onReplyReceived).record(USER, { contactId: 'c1', kind: 'reply_received' } as never),
    ).resolves.toEqual(SAVED)
  })
})
