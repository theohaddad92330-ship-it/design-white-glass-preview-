import type { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import type { Repository } from 'typeorm'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { OutreachSendSweeper } from './outreach-send.sweeper'
import type { OutreachMessageService } from './outreach-message.service'
import type { MailboxService } from '../mailbox/mailbox.service'
import type { CrmService } from '../crm/crm.service'

/**
 * #3069 — le dispatcher n'existait pas : `approved` restait `approved` pour
 * toujours. On ne le teste pas contre une base : on teste l'ORDRE des
 * opérations (annoncer avant d'appeler le connecteur, confirmer avec preuve,
 * nommer l'échec sans jamais poser un faux succès) et la RÈGLE qui protège
 * les canaux sans connecteur (jamais touchés).
 */

const EMAIL_MESSAGE: OutreachMessageEntity = {
  id: 'msg-1',
  workspace_id: 'ws-1',
  user_id: 'owner-1',
  contact_id: 'contact-1',
  channel: 'email',
} as OutreachMessageEntity

function build(options: {
  approved?: OutreachMessageEntity[]
  payload?: { channel: string; address: string | null; subject: string | null; body: string }
  markSendingResult?: OutreachMessageEntity | null
  sendResult?: {
    batchId: string
    sent: number
    outcomes: {
      to: string
      status: string
      error: string | null
      providerMessageId?: string | null
      providerThreadId?: string | null
    }[]
  }
  sendError?: Error
  killSwitch?: boolean
  crmRecord?: { recordId: string } | null
  crmError?: Error
  demo?: boolean
}) {
  if (options.killSwitch) process.env['OUTREACH_SEND_DISABLED'] = 'true'

  const listApproved = jest.fn().mockResolvedValue(options.approved ?? [EMAIL_MESSAGE])
  const markSending = jest
    .fn()
    .mockResolvedValue(options.markSendingResult === undefined ? EMAIL_MESSAGE : options.markSendingResult)
  const dispatchPayload = jest
    .fn()
    .mockResolvedValue(
      options.payload ?? { channel: 'email', address: 'marie@client.fr', subject: 'Bonjour', body: 'Le texte.' },
    )
  const markSent = jest.fn().mockResolvedValue(undefined)
  const markSendFailed = jest.fn().mockResolvedValue(undefined)
  const outreach = {
    listApproved,
    markSending,
    dispatchPayload,
    markSent,
    markSendFailed,
  } as unknown as OutreachMessageService

  const sendBatch = options.sendError
    ? jest.fn().mockRejectedValue(options.sendError)
    : jest.fn().mockResolvedValue(
        options.sendResult ?? {
          batchId: 'batch-1',
          sent: 1,
          outcomes: [{ to: 'marie@client.fr', status: 'sent', error: null }],
        },
      )
  const mailbox = { sendBatch } as unknown as MailboxService

  const findContactRecord = options.crmError
    ? jest.fn().mockRejectedValue(options.crmError)
    : jest.fn().mockResolvedValue(options.crmRecord === undefined ? { recordId: 'crm-1' } : options.crmRecord)
  const logActivity = jest.fn().mockResolvedValue({ id: 'note-1' })
  const crm = { findContactRecord, logActivity } as unknown as CrmService

  const findWorkspace = jest.fn().mockResolvedValue({ id: 'ws-1', is_demo: options.demo ?? false })
  const workspaces = { findOne: findWorkspace } as unknown as Repository<WorkspaceEntity>
  const sweeper = new OutreachSendSweeper(outreach, mailbox, crm, undefined, workspaces)
  return {
    sweeper,
    listApproved,
    markSending,
    dispatchPayload,
    markSent,
    markSendFailed,
    sendBatch,
    findWorkspace,
    findContactRecord,
    logActivity,
  }
}

describe('OutreachSendSweeper (#3069)', () => {
  it('#3420 — une salle de démo n’envoie jamais : le « Validé » d’exemple ne passe pas « En échec »', async () => {
    const { sweeper, markSending, markSendFailed, sendBatch, findWorkspace } = build({ demo: true })
    const result = await sweeper.sweep(new Date('2026-09-28T10:00:00'))
    expect(findWorkspace).toHaveBeenCalledWith(expect.objectContaining({ where: { id: EMAIL_MESSAGE.workspace_id } }))
    expect(markSending).not.toHaveBeenCalled()
    expect(markSendFailed).not.toHaveBeenCalled()
    expect(sendBatch).not.toHaveBeenCalled()
    expect(result).toEqual({ sent: 0, failed: 0 })
  })

  beforeEach(() => {
    // Horloge FIGÉE dans les heures calmes (lundi 10h) : les tests de ce
    // fichier portent sur l'ORDRE des opérations et les échecs nommés, pas sur
    // la politique d'heure (#2406.29, testée séparément ci-dessous avec un
    // `now` explicite) — sans elle, ces tests deviendraient flaky selon
    // l'heure/le jour réels d'exécution.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
    jest.setSystemTime(new Date('2026-09-28T10:00:00'))
  })

  afterEach(() => {
    delete process.env['OUTREACH_SEND_DISABLED']
    jest.useRealTimers()
  })

  it('ne dispatch RIEN quand l’interrupteur d’urgence est posé', async () => {
    const { sweeper, listApproved, sendBatch } = build({ killSwitch: true })
    await expect(sweeper.sweep()).resolves.toEqual({ sent: 0, failed: 0 })
    expect(listApproved).not.toHaveBeenCalled()
    expect(sendBatch).not.toHaveBeenCalled()
  })

  it('envoie un message e-mail validé, ANNONCE avant d’appeler le connecteur, puis CONFIRME avec la preuve', async () => {
    const { sweeper, markSending, sendBatch, markSent, markSendFailed } = build({})
    const result = await sweeper.sweep()
    expect(result).toEqual({ sent: 1, failed: 0 })
    expect(markSending).toHaveBeenCalledWith('ws-1', 'msg-1')
    expect(sendBatch).toHaveBeenCalledWith(
      'owner-1',
      expect.objectContaining({
        mode: 'send',
        items: [{ to: 'marie@client.fr', subject: 'Bonjour', body: 'Le texte.' }],
      }),
    )
    expect(markSent).toHaveBeenCalledWith('ws-1', 'msg-1', { mailboxBatchId: 'batch-1', to: 'marie@client.fr' })
    expect(markSendFailed).not.toHaveBeenCalled()
    // L'annonce précède l'appel réel : sans elle, deux passages concurrents
    // pourraient tous deux appeler le connecteur pour le même message.
    expect(markSending.mock.invocationCallOrder[0]).toBeLessThan(sendBatch.mock.invocationCallOrder[0])
  })

  it('#3234 — l’identifiant de message du fournisseur est confié à la preuve d’envoi', async () => {
    const { sweeper, markSent } = build({
      sendResult: {
        batchId: 'batch-1',
        sent: 1,
        outcomes: [
          { to: 'marie@client.fr', status: 'sent', error: null, providerMessageId: 'gm-42', providerThreadId: 'gt-7' },
        ],
      },
    })
    await sweeper.sweep()
    expect(markSent).toHaveBeenCalledWith('ws-1', 'msg-1', {
      mailboxBatchId: 'batch-1',
      to: 'marie@client.fr',
      providerMessageId: 'gm-42',
      providerThreadId: 'gt-7',
    })
  })

  it('ne touche JAMAIS un canal sans connecteur d’envoi (LinkedIn, etc.) — ni sending, ni failed', async () => {
    const linkedinMessage = { ...EMAIL_MESSAGE, channel: 'linkedin' } as OutreachMessageEntity
    const { sweeper, markSending, markSendFailed, sendBatch } = build({ approved: [linkedinMessage] })
    const result = await sweeper.sweep()
    expect(result).toEqual({ sent: 0, failed: 0 })
    expect(markSending).not.toHaveBeenCalled()
    expect(markSendFailed).not.toHaveBeenCalled()
    expect(sendBatch).not.toHaveBeenCalled()
  })

  // #2370 — Laura PRÉPARE, le commercial envoie : aucun canal neuf n'entre dans l'envoi automatique,
  // pas même l'e-mail de suivi ou le push de profil, qui ont pourtant la forme d'un e-mail.
  it.each(['sms', 'whatsapp', 'follow_up_email', 'profile_push', 'linkedin_connection_note'] as const)(
    '#2370 — n’envoie jamais seul un message préparé sur le canal %s',
    async channel => {
      const prepared = { ...EMAIL_MESSAGE, channel } as OutreachMessageEntity
      const { sweeper, markSending, sendBatch } = build({ approved: [prepared] })
      expect(await sweeper.sweep()).toEqual({ sent: 0, failed: 0 })
      expect(markSending).not.toHaveBeenCalled()
      expect(sendBatch).not.toHaveBeenCalled()
    },
  )

  it('NOMME l’échec quand le contact n’a pas d’adresse — sans appeler le connecteur', async () => {
    const { sweeper, markSendFailed, sendBatch } = build({
      payload: { channel: 'email', address: null, subject: 'Bonjour', body: 'Le texte.' },
    })
    const result = await sweeper.sweep()
    expect(result).toEqual({ sent: 0, failed: 1 })
    expect(markSendFailed).toHaveBeenCalledWith('ws-1', 'msg-1', 'Aucune adresse e-mail sur ce contact.')
    expect(sendBatch).not.toHaveBeenCalled()
  })

  it('NOMME l’échec quand le message est vide — sans appeler le connecteur', async () => {
    const { sweeper, markSendFailed, sendBatch } = build({
      payload: { channel: 'email', address: 'marie@client.fr', subject: 'Bonjour', body: '   ' },
    })
    await sweeper.sweep()
    expect(markSendFailed).toHaveBeenCalledWith('ws-1', 'msg-1', 'Message vide ou sans objet — rien à envoyer.')
    expect(sendBatch).not.toHaveBeenCalled()
  })

  it('NOMME l’échec quand la messagerie refuse — jamais un faux succès', async () => {
    const { sweeper, markSendFailed, markSent } = build({
      sendResult: {
        batchId: 'batch-1',
        sent: 0,
        outcomes: [{ to: 'marie@client.fr', status: 'failed', error: 'Quota dépassé' }],
      },
    })
    const result = await sweeper.sweep()
    expect(result).toEqual({ sent: 0, failed: 1 })
    expect(markSendFailed).toHaveBeenCalledWith('ws-1', 'msg-1', 'Quota dépassé')
    expect(markSent).not.toHaveBeenCalled()
  })

  it('NOMME l’échec quand le connecteur lève une exception — jamais un faux succès', async () => {
    const { sweeper, markSendFailed, markSent } = build({ sendError: new Error('Jeton expiré') })
    const result = await sweeper.sweep()
    expect(result).toEqual({ sent: 0, failed: 1 })
    expect(markSendFailed).toHaveBeenCalledWith('ws-1', 'msg-1', 'Jeton expiré')
    expect(markSent).not.toHaveBeenCalled()
  })

  it('passe au message suivant quand `markSending` refuse — déjà repris par un autre passage', async () => {
    const { sweeper, sendBatch } = build({ markSendingResult: null })
    const result = await sweeper.sweep()
    expect(result).toEqual({ sent: 0, failed: 0 })
    expect(sendBatch).not.toHaveBeenCalled()
  })

  it('#2386.3 — reflète l’envoi confirmé sur la fiche CRM du contact, sans le sujet ni le corps', async () => {
    const { sweeper, findContactRecord, logActivity } = build({})
    await sweeper.sweep()
    expect(findContactRecord).toHaveBeenCalledWith('owner-1', 'marie@client.fr')
    expect(logActivity).toHaveBeenCalledWith('owner-1', 'crm-1', expect.any(String))
    const note = logActivity.mock.calls[0]?.[2] as string
    // Doctrine (D65, `agent_docs/doctrine.md:33`) : le corps d'un message ne
    // sort jamais vers un humain — la fiche CRM est lue par un humain.
    expect(note).not.toContain('Bonjour')
    expect(note).not.toContain('Le texte.')
  })

  it('#2386.3 — ne reflète rien sur le CRM quand l’envoi a ÉCHOUÉ', async () => {
    const { sweeper, findContactRecord } = build({
      sendResult: {
        batchId: 'batch-1',
        sent: 0,
        outcomes: [{ to: 'marie@client.fr', status: 'failed', error: 'Quota dépassé' }],
      },
    })
    await sweeper.sweep()
    expect(findContactRecord).not.toHaveBeenCalled()
  })

  it('#2386.3 — reste un no-op silencieux sans fiche CRM trouvée (pas de doublon inventé)', async () => {
    const { sweeper, logActivity } = build({ crmRecord: null })
    const result = await sweeper.sweep()
    expect(result).toEqual({ sent: 1, failed: 0 })
    expect(logActivity).not.toHaveBeenCalled()
  })

  it('#2386.3 — un reflet CRM en échec ne fait pas régresser l’envoi déjà confirmé (best-effort)', async () => {
    const { sweeper, markSent } = build({ crmError: new Error('Jeton CRM expiré') })
    const result = await sweeper.sweep()
    expect(result).toEqual({ sent: 1, failed: 0 })
    expect(markSent).toHaveBeenCalled()
  })

  it('#2386.3 — sans CRM connecté (module retiré, règle #7), l’envoi reste inchangé', async () => {
    const outreach = {
      listApproved: jest.fn().mockResolvedValue([EMAIL_MESSAGE]),
      markSending: jest.fn().mockResolvedValue(EMAIL_MESSAGE),
      dispatchPayload: jest
        .fn()
        .mockResolvedValue({ channel: 'email', address: 'marie@client.fr', subject: 'Bonjour', body: 'Le texte.' }),
      markSent: jest.fn().mockResolvedValue(undefined),
      markSendFailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as OutreachMessageService
    const mailbox = {
      sendBatch: jest.fn().mockResolvedValue({
        batchId: 'batch-1',
        sent: 1,
        outcomes: [{ to: 'marie@client.fr', status: 'sent', error: null }],
      }),
    } as unknown as MailboxService
    const sweeper = new OutreachSendSweeper(outreach, mailbox)
    const result = await sweeper.sweep()
    expect(result).toEqual({ sent: 1, failed: 0 })
  })

  it('#2406.29 — ne dispatch RIEN hors des heures calmes, un job planifié n’envoie pas sans politique', async () => {
    const { sweeper, listApproved, sendBatch } = build({})
    // Dimanche 3h du matin — hors des heures ouvrées (8h-19h, lun-ven) que
    // `withinQuietHours` définit déjà pour les envois automatisés playbook.
    const night = new Date('2026-09-27T03:00:00')
    const result = await sweeper.sweep(night)
    expect(result).toEqual({ sent: 0, failed: 0 })
    expect(listApproved).not.toHaveBeenCalled()
    expect(sendBatch).not.toHaveBeenCalled()
  })

  it('#2406.29 — dispatche normalement DANS les heures calmes', async () => {
    const { sweeper, sendBatch } = build({})
    const businessHours = new Date('2026-09-28T10:00:00') // lundi 10h
    const result = await sweeper.sweep(businessHours)
    expect(result).toEqual({ sent: 1, failed: 0 })
    expect(sendBatch).toHaveBeenCalled()
  })

  it('un message isolé en échec (exception inattendue) ne bloque pas le reste de la file', async () => {
    const second = { ...EMAIL_MESSAGE, id: 'msg-2' } as OutreachMessageEntity
    const listApproved = jest.fn().mockResolvedValue([EMAIL_MESSAGE, second])
    const markSending = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(second)
    const dispatchPayload = jest
      .fn()
      .mockResolvedValue({ channel: 'email', address: 'marie@client.fr', subject: 'Bonjour', body: 'Le texte.' })
    const markSent = jest.fn().mockResolvedValue(undefined)
    const markSendFailed = jest.fn().mockResolvedValue(undefined)
    const outreach = {
      listApproved,
      markSending,
      dispatchPayload,
      markSent,
      markSendFailed,
    } as unknown as OutreachMessageService
    const sendBatch = jest.fn().mockResolvedValue({
      batchId: 'batch-1',
      sent: 1,
      outcomes: [{ to: 'marie@client.fr', status: 'sent', error: null }],
    })
    const mailbox = { sendBatch } as unknown as MailboxService
    const sweeper = new OutreachSendSweeper(outreach, mailbox)

    const result = await sweeper.sweep()
    expect(result).toEqual({ sent: 1, failed: 0 })
  })
})
