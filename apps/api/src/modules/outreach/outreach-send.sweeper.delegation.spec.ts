import type { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import { OutreachSendSweeper } from './outreach-send.sweeper'
import type { OutreachMessageService } from './outreach-message.service'
import type { OutreachDelegationService, StepGate } from './outreach-delegation.service'
import type { MailboxService } from '../mailbox/mailbox.service'

/**
 * #3702.9 — le dispatcher appelle la porte du mandat. Un message rattaché à un
 * mandat ne part que sur `run` ; sans condition `delegation:`, c81 inchangée.
 */
const NOON = new Date('2026-10-07T10:00:00')

function message(conditions: string[]): OutreachMessageEntity {
  return {
    id: 'msg-1',
    workspace_id: 'ws-1',
    user_id: 'u-1',
    contact_id: 'c-1',
    channel: 'email',
    approval: { conditions },
  } as unknown as OutreachMessageEntity
}

function build(msg: OutreachMessageEntity, gate: StepGate | null, awaiting: OutreachMessageEntity[] = []) {
  const outreach = {
    listApproved: jest.fn().mockResolvedValue(awaiting.length ? [] : [msg]),
    // #4016 L5 — la population « attend un mandat ».
    listAwaitingMandate: jest.fn().mockResolvedValue(awaiting),
    markSending: jest.fn().mockResolvedValue(msg),
    dispatchPayload: jest.fn().mockResolvedValue({ channel: 'email', address: 'a@b.fr', subject: 'S', body: 'B' }),
    markSent: jest.fn().mockResolvedValue(undefined),
    markSendFailed: jest.fn().mockResolvedValue(undefined),
    cancelByDelegation: jest.fn().mockResolvedValue(undefined),
    releaseMandate: jest.fn().mockResolvedValue(undefined),
  }
  const sendBatch = jest
    .fn()
    .mockResolvedValue({ batchId: 'b', sent: 1, outcomes: [{ to: 'a@b.fr', status: 'sent', error: null }] })
  const delegations = {
    gate: jest.fn().mockResolvedValue(gate),
    gateAwaitingMandate: jest.fn().mockResolvedValue(gate),
    stopLookup: jest.fn().mockReturnValue(async () => new Set<string>()),
    release: jest.fn().mockResolvedValue(undefined),
  }
  const sweeper = new OutreachSendSweeper(
    outreach as unknown as OutreachMessageService,
    { sendBatch, status: jest.fn().mockResolvedValue({ connected: true }) } as unknown as MailboxService,
    undefined,
    undefined,
    undefined,
    gate === null ? undefined : (delegations as unknown as OutreachDelegationService),
  )
  return { sweeper, outreach, sendBatch, delegations }
}

describe('OutreachSendSweeper — porte du mandat (#3702.9)', () => {
  it('sans condition `delegation:`, la porte n’est jamais consultée (c81 inchangée)', async () => {
    const { sweeper, delegations, sendBatch } = build(message(['no_blocker']), { kind: 'individual' })
    expect((await sweeper.sweep(NOON)).sent).toBe(1)
    expect(delegations.gate).not.toHaveBeenCalled()
    expect(sendBatch).toHaveBeenCalledTimes(1)
  })

  it('mandat en attente (hold) : rien ne part, le message reste approuvé', async () => {
    const { sweeper, outreach, sendBatch } = build(message(['delegation:d']), { kind: 'hold', reason: 'paused' })
    expect(await sweeper.sweep(NOON)).toEqual({ sent: 0, failed: 0 })
    expect(outreach.markSending).not.toHaveBeenCalled()
    expect(sendBatch).not.toHaveBeenCalled()
  })

  it('réponse du contact (stop) : le message est annulé, jamais envoyé', async () => {
    const { sweeper, outreach, sendBatch } = build(message(['delegation:d']), { kind: 'stop', reason: 'replied' })
    await sweeper.sweep(NOON)
    expect(outreach.cancelByDelegation).toHaveBeenCalledWith('ws-1', 'msg-1', 'replied')
    expect(sendBatch).not.toHaveBeenCalled()
  })

  it('run : envoie une fois ; échec du connecteur ⇒ le quota réservé est rendu', async () => {
    const ok = build(message(['delegation:d']), { kind: 'run', delegationId: 'd' })
    expect((await ok.sweeper.sweep(NOON)).sent).toBe(1)
    expect(ok.delegations.release).not.toHaveBeenCalled()

    const ko = build(message(['delegation:d']), { kind: 'run', delegationId: 'd' })
    ko.sendBatch.mockResolvedValue({
      batchId: 'b',
      sent: 0,
      outcomes: [{ to: 'a@b.fr', status: 'failed', error: 'boom' }],
    })
    expect((await ko.sweeper.sweep(NOON)).failed).toBe(1)
    expect(ko.delegations.release).toHaveBeenCalledWith('d')
  })

  it('mandat illisible (service absent) : inconnu ⇒ attend', async () => {
    const { sweeper, sendBatch } = build(message(['delegation:d']), null)
    expect((await sweeper.sweep(NOON)).sent).toBe(0)
    expect(sendBatch).not.toHaveBeenCalled()
  })
})

describe('OutreachSendSweeper — un message qui ATTEND un mandat (#4016 L5)', () => {
  function laura(): OutreachMessageEntity {
    return { ...message([]), status: 'needs_review', approval: null, mandate_scope: 'laura_send' } as never
  }

  it('sans mandat qui le couvre : il attend en relecture, rien ne part', async () => {
    const { sweeper, sendBatch, outreach } = build(laura(), { kind: 'hold', reason: 'no_delegation' }, [laura()])
    expect(await sweeper.sweep(NOON)).toEqual({ sent: 0, failed: 0 })
    expect(outreach.markSending).not.toHaveBeenCalled()
    expect(sendBatch).not.toHaveBeenCalled()
  })

  it('mandat actif : part par le MÊME chemin d’envoi (annonce, connecteur, preuve)', async () => {
    const { sweeper, sendBatch, outreach, delegations } = build(laura(), { kind: 'run', delegationId: 'm' }, [laura()])
    expect((await sweeper.sweep(NOON)).sent).toBe(1)
    expect(delegations.gateAwaitingMandate).toHaveBeenCalledTimes(1)
    expect(outreach.markSending).toHaveBeenCalledWith('ws-1', 'msg-1')
    expect(outreach.markSent).toHaveBeenCalledTimes(1)
    expect(sendBatch).toHaveBeenCalledTimes(1)
  })

  it('un fait du contact (effacé, opposé, a répondu) : annulé, jamais envoyé', async () => {
    const { sweeper, sendBatch, outreach } = build(laura(), { kind: 'stop', reason: 'erased' }, [laura()])
    await sweeper.sweep(NOON)
    expect(outreach.cancelByDelegation).toHaveBeenCalledWith('ws-1', 'msg-1', 'erased')
    expect(sendBatch).not.toHaveBeenCalled()
  })

  it('un délai dépassé (timeout) est un échec NOMMÉ, jamais un renvoi dans le même passage', async () => {
    const { sweeper, sendBatch, outreach, delegations } = build(laura(), { kind: 'run', delegationId: 'm' }, [laura()])
    sendBatch.mockRejectedValue(new Error('timeout'))
    expect((await sweeper.sweep(NOON)).failed).toBe(1)
    expect(sendBatch).toHaveBeenCalledTimes(1)
    expect(outreach.markSendFailed).toHaveBeenCalledWith('ws-1', 'msg-1', 'timeout')
    expect(delegations.release).toHaveBeenCalledWith('m')
  })

  it('sans le service des mandats, la file « attend un mandat » n’est même pas lue', async () => {
    const { sweeper, outreach } = build(laura(), null, [laura()])
    await sweeper.sweep(NOON)
    expect(outreach.listAwaitingMandate).not.toHaveBeenCalled()
  })

  /*
   * #4016 L5 (reprise 20/10) — la file « attend un mandat » ne se bouche pas :
   * elle ne lit que les messages ÉCHUS (une étape à J+3 n'y entre qu'à J+3), et
   * un message qu'aucun mandat ne pourra plus couvrir (révoqué, expiré, né avant
   * la signature, plus de mandat) en SORT — il reste en relecture, un humain le
   * valide d'un clic. Sans ça, cinquante messages orphelins bloquaient la file.
   */
  it('ne lit que les messages échus, à l’horloge du passage', async () => {
    const { sweeper, outreach } = build(laura(), { kind: 'hold', reason: 'paused' }, [laura()])
    await sweeper.sweep(NOON)
    expect(outreach.listAwaitingMandate).toHaveBeenCalledWith(expect.any(Number), NOON)
  })

  it.each(['no_delegation', 'revoked', 'expired', 'predates_mandate', 'scope_mismatch', 'sequence_over'] as const)(
    '%s : aucun mandat ne le couvrira plus — il sort de la file, reste en relecture, rien ne part',
    async reason => {
      const { sweeper, outreach, sendBatch } = build(laura(), { kind: 'hold', reason }, [laura()])
      await sweeper.sweep(NOON)
      expect(outreach.releaseMandate).toHaveBeenCalledWith('ws-1', 'msg-1')
      expect(sendBatch).not.toHaveBeenCalled()
    },
  )

  it.each(['paused', 'outside_window', 'quota_reached', 'not_due', 'mailbox_unavailable'] as const)(
    '%s : passager — il reste dans la file, au prochain passage',
    async reason => {
      const { sweeper, outreach } = build(laura(), { kind: 'hold', reason }, [laura()])
      await sweeper.sweep(NOON)
      expect(outreach.releaseMandate).not.toHaveBeenCalled()
    },
  )
})
