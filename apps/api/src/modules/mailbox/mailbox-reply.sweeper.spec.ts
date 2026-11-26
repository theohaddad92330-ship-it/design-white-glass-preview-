import { MailboxReplySweeper } from './mailbox-reply.sweeper'
import type { MailboxService } from './mailbox.service'

function build(users: string[], reconcile: jest.Mock, actionUsers: string[] = [], proofs: jest.Mock = jest.fn()) {
  const mailbox = {
    usersWithLiveSequences: jest.fn().mockResolvedValue(users),
    reconcileLiveSequenceReplies: reconcile,
    usersWithOpenContactActions: jest.fn().mockResolvedValue(actionUsers),
    reconcileOpenActionSentProofs: proofs,
  } as unknown as MailboxService
  return new MailboxReplySweeper(mailbox)
}

describe('balayeur des réponses entrantes (#3718.6)', () => {
  afterEach(() => {
    delete process.env.MAILBOX_REPLY_SWEEP_DISABLED
  })

  it('relit la boîte de CHAQUE utilisateur à séquence vivante, et additionne', async () => {
    const reconcile = jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(3)
    await expect(build(['u1', 'u2'], reconcile).sweep()).resolves.toBe(5)
    expect(reconcile).toHaveBeenNthCalledWith(1, 'u1')
    expect(reconcile).toHaveBeenNthCalledWith(2, 'u2')
  })

  it('un utilisateur en échec ne bloque pas les suivants', async () => {
    const reconcile = jest.fn().mockRejectedValueOnce(new Error('boîte en panne')).mockResolvedValueOnce(1)
    await expect(build(['u1', 'u2'], reconcile).sweep()).resolves.toBe(1)
    expect(reconcile).toHaveBeenCalledTimes(2)
  })

  it('aucun utilisateur à séquence vivante ⇒ aucune lecture', async () => {
    const reconcile = jest.fn()
    await expect(build([], reconcile).sweep()).resolves.toBe(0)
    expect(reconcile).not.toHaveBeenCalled()
  })

  it('ne lit RIEN quand l’interrupteur d’urgence est posé', async () => {
    process.env.MAILBOX_REPLY_SWEEP_DISABLED = 'true'
    const reconcile = jest.fn()
    await expect(build(['u1'], reconcile).sweep()).resolves.toBe(0)
    expect(reconcile).not.toHaveBeenCalled()
  })

  // #4016.13e — le même balayage lit aussi « Envoyé » pour les contacts à action ouverte.
  it('relit aussi la boîte des utilisateurs à action de contact ouverte (preuve d’envoi)', async () => {
    const proofs = jest.fn().mockResolvedValue(2)
    await expect(build([], jest.fn(), ['u9'], proofs).sweep()).resolves.toBe(2)
    expect(proofs).toHaveBeenCalledWith('u9')
  })

  it('un échec de la preuve d’envoi ne bloque ni la détection des réponses ni les suivants', async () => {
    const proofs = jest.fn().mockRejectedValueOnce(new Error('panne')).mockResolvedValueOnce(1)
    await expect(build(['u1'], jest.fn().mockResolvedValue(1), ['u8', 'u9'], proofs).sweep()).resolves.toBe(2)
  })
})
