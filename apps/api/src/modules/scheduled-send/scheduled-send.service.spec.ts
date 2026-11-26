import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import type { ScheduledMessageSendEntity } from '../../database/entities/scheduled-message-send.entity'
import type { ScheduledSendTransport } from './module-tokens'
import { dispatchJobId } from './scheduled-send.queue'
import { ScheduledSendService } from './scheduled-send.service'

// Théo M2 — envoi programmé — le geste du commercial (valider + programmer), décalé dans le temps.
const WS = '00000000-0000-4000-8000-0000000000aa'
const OTHER_WS = '00000000-0000-4000-8000-0000000000bb'
const USER = '00000000-0000-4000-8000-000000000001'
const VERSION = '00000000-0000-4000-8000-000000000002'
const CONTACT = '00000000-0000-4000-8000-000000000003'
const VALIDATION = '00000000-0000-4000-8000-000000000004'
const SEND = '00000000-0000-4000-8000-000000000005'
const NOW = new Date('2026-10-22T10:00:00.000Z')
const LATER = '2026-10-23T09:30:00+02:00'

const HASH = createHash('sha256').update('Point rapide\nBonjour Claire').digest('hex')

function version(overrides: Record<string, unknown> = {}) {
  return {
    id: VERSION,
    workspace_id: WS,
    contact_id: CONTACT,
    channel: 'email',
    subject: 'Point rapide',
    body: 'Bonjour Claire',
    edited_subject: null,
    edited_body: null,
    recorded_by: USER,
    created_at: NOW,
    ...overrides,
  }
}

function row(overrides: Partial<ScheduledMessageSendEntity> = {}): ScheduledMessageSendEntity {
  return {
    id: SEND,
    workspace_id: WS,
    user_id: USER,
    version_id: VERSION,
    validation_id: VALIDATION,
    contact_id: CONTACT,
    content_hash: HASH,
    scheduled_at: new Date('2026-10-22T09:59:00.000Z'),
    time_zone: 'Europe/Paris',
    status: 'scheduled',
    attempted_at: null,
    sent_at: null,
    failure_code: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  }
}

function setup(
  opts: {
    version?: ReturnType<typeof version> | null
    validation?: { id: string; version_id: string; content_hash: string; validated_by: string } | null
    send?: ScheduledMessageSendEntity | null
    claimAffected?: number
    outcome?: Awaited<ReturnType<ScheduledSendTransport['sendEmail']>> | Error
    activeWorkspace?: string | null
    contact?: Record<string, unknown> | null
  } = {},
) {
  const send = opts.send === undefined ? row() : opts.send
  const versions = {
    findOne: jest.fn().mockResolvedValue(opts.version === undefined ? version() : opts.version),
    find: jest.fn().mockResolvedValue([version()]),
  }
  const validations = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        opts.validation === undefined
          ? { id: VALIDATION, version_id: VERSION, content_hash: HASH, validated_by: USER }
          : opts.validation,
      ),
  }
  const sends = {
    create: jest.fn((value: Partial<ScheduledMessageSendEntity>) => value),
    save: jest.fn(async (value: Partial<ScheduledMessageSendEntity>) => row({ ...value, id: SEND })),
    findOne: jest.fn().mockResolvedValue(send),
    find: jest.fn().mockResolvedValue(send ? [send] : []),
    update: jest.fn().mockResolvedValue({ affected: opts.claimAffected ?? 1 }),
  }
  const contacts = {
    findOne: jest.fn().mockResolvedValue(opts.contact === undefined ? { id: CONTACT, email: 'c@x.fr' } : opts.contact),
    find: jest.fn().mockResolvedValue([]),
  }
  const removed = jest.fn()
  const queue = {
    add: jest.fn().mockResolvedValue(undefined),
    getJob: jest.fn().mockResolvedValue({ remove: removed }),
  }
  const transport: ScheduledSendTransport = {
    activeWorkspace: jest.fn().mockResolvedValue(opts.activeWorkspace === undefined ? WS : opts.activeWorkspace),
    sendEmail: jest.fn(async () => {
      if (opts.outcome instanceof Error) throw opts.outcome
      return opts.outcome ?? { ok: true as const }
    }),
    lookForSentProof: jest.fn().mockResolvedValue(undefined),
  }
  const service = new ScheduledSendService(
    sends as never,
    versions as never,
    validations as never,
    contacts as never,
    queue as never,
    transport,
    () => NOW,
  )
  return { service, sends, versions, validations, contacts, queue, transport, removed }
}

describe('ScheduledSendService.schedule — programmer un brouillon VALIDÉ', () => {
  it('programme une version validée par ce commercial et pose UN job différé, idempotent par ligne', async () => {
    const { service, sends, queue } = setup({ send: null })
    const item = await service.schedule(WS, USER, { versionId: VERSION, scheduledAt: LATER, timeZone: 'Europe/Paris' })
    expect(sends.save).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: WS,
        user_id: USER,
        version_id: VERSION,
        validation_id: VALIDATION,
        contact_id: CONTACT,
        content_hash: HASH,
        status: 'scheduled',
      }),
    )
    expect(queue.add).toHaveBeenCalledWith(
      'dispatch',
      { scheduledSendId: SEND },
      expect.objectContaining({
        jobId: dispatchJobId(SEND, new Date(LATER)),
        delay: new Date(LATER).getTime() - NOW.getTime(),
      }),
    )
    expect(item.status).toBe('scheduled')
    expect(item.subject).toBe('Point rapide')
    expect(item).not.toHaveProperty('body')
  })

  it('refuse un brouillon NON validé : programmer n’est pas valider', async () => {
    const { service, sends } = setup({ validation: null })
    await expect(
      service.schedule(WS, USER, { versionId: VERSION, scheduledAt: LATER, timeZone: 'Europe/Paris' }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(sends.save).not.toHaveBeenCalled()
  })

  it('refuse une version validée par quelqu’un d’autre : c’est le geste de CE commercial', async () => {
    const { service } = setup({
      validation: { id: VALIDATION, version_id: VERSION, content_hash: HASH, validated_by: OTHER_WS },
    })
    await expect(
      service.schedule(WS, USER, { versionId: VERSION, scheduledAt: LATER, timeZone: 'Europe/Paris' }),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('ne voit jamais un brouillon d’un autre espace', async () => {
    const { service, versions } = setup({ version: null })
    await expect(
      service.schedule(WS, USER, { versionId: VERSION, scheduledAt: LATER, timeZone: 'Europe/Paris' }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(versions.findOne).toHaveBeenCalledWith({ where: { id: VERSION, workspace_id: WS, recorded_by: USER } })
  })

  it('refuse une heure passée et un canal que « Envoyer » ne fait pas partir', async () => {
    const { service } = setup()
    await expect(
      service.schedule(WS, USER, { versionId: VERSION, scheduledAt: '2026-10-22T09:00:00Z', timeZone: 'UTC' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    const linkedin = setup({ version: version({ channel: 'linkedin' }) })
    await expect(
      linkedin.service.schedule(WS, USER, { versionId: VERSION, scheduledAt: LATER, timeZone: 'UTC' }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('reprogrammer la même version rend la ligne vivante, sans en créer une seconde', async () => {
    const { service, sends, queue } = setup({ send: row({ scheduled_at: new Date(LATER) }) })
    const item = await service.schedule(WS, USER, { versionId: VERSION, scheduledAt: LATER, timeZone: 'Europe/Paris' })
    expect(item.id).toBe(SEND)
    expect(sends.save).not.toHaveBeenCalled()
    expect(queue.add).not.toHaveBeenCalled()
  })
})

describe('ScheduledSendService.reschedule / cancel — tant que rien n’est parti', () => {
  it('déplace l’heure par une écriture CONDITIONNELLE, puis repose le job', async () => {
    const { service, sends, queue, removed } = setup({ send: row({ scheduled_at: new Date(LATER) }) })
    await service.reschedule(WS, USER, SEND, { scheduledAt: '2026-10-24T08:00:00Z', timeZone: 'Europe/Paris' })
    const [criteria, patch] = sends.update.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>]
    expect(criteria).toMatchObject({ id: SEND, workspace_id: WS, user_id: USER, status: 'scheduled' })
    expect(criteria).toHaveProperty('attempted_at')
    expect(patch).toMatchObject({ scheduled_at: new Date('2026-10-24T08:00:00Z'), time_zone: 'Europe/Paris' })
    expect(removed).toHaveBeenCalled()
    expect(queue.add).toHaveBeenCalledWith('dispatch', { scheduledSendId: SEND }, expect.anything())
  })

  it('refuse de déplacer ou d’annuler un envoi déjà tenté', async () => {
    const { service } = setup({ send: row({ attempted_at: NOW }), claimAffected: 0 })
    await expect(
      service.reschedule(WS, USER, SEND, { scheduledAt: '2026-10-24T08:00:00Z', timeZone: 'UTC' }),
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(service.cancel(WS, USER, SEND)).rejects.toBeInstanceOf(ConflictException)
  })

  it('annule : statut `cancelled`, job retiré', async () => {
    const { service, sends, removed } = setup({ send: row({ scheduled_at: new Date(LATER) }) })
    await service.cancel(WS, USER, SEND)
    expect(sends.update.mock.calls[0]?.[1]).toEqual({ status: 'cancelled' })
    expect(removed).toHaveBeenCalled()
  })

  it('ne touche jamais l’envoi d’un autre utilisateur ou d’un autre espace', async () => {
    const { service, sends } = setup({ send: null })
    await expect(service.cancel(OTHER_WS, USER, SEND)).rejects.toBeInstanceOf(NotFoundException)
    expect(sends.findOne).toHaveBeenCalledWith({ where: { id: SEND, workspace_id: OTHER_WS, user_id: USER } })
  })
})

describe('ScheduledSendService.dispatch — part seul, à l’heure, par le chemin de « Envoyer »', () => {
  it('à l’heure : réserve la ligne PUIS appelle le chemin du clic avec le texte validé', async () => {
    const { service, sends, transport, queue } = setup()
    expect(await service.dispatch(SEND)).toBe('sent')
    const claim = sends.update.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>]
    expect(claim[0]).toMatchObject({ id: SEND, status: 'scheduled' })
    expect(claim[1]).toEqual({ attempted_at: NOW })
    expect(transport.sendEmail).toHaveBeenCalledWith(CONTACT, USER, { subject: 'Point rapide', body: 'Bonjour Claire' })
    expect(sends.update.mock.calls[1]?.[1]).toEqual({ status: 'sent', sent_at: NOW, failure_code: null })
    expect(queue.add).toHaveBeenCalledWith(
      'proof',
      { scheduledSendId: SEND },
      expect.objectContaining({ delay: expect.any(Number) }),
    )
  })

  it('un timeout n’est pas un échec : `unknown`, et rien ne repart', async () => {
    const uncertain = setup({ outcome: { ok: false, code: 'send_uncertain' } })
    expect(await uncertain.service.dispatch(SEND)).toBe('unknown')
    const thrown = setup({ outcome: new Error('socket hang up') })
    expect(await thrown.service.dispatch(SEND)).toBe('unknown')
    expect(thrown.sends.update.mock.calls[1]?.[1]).toEqual({ status: 'unknown', failure_code: 'transport_no_answer' })
  })

  it('une tentative déjà commencée (reprise après coupure) devient `unknown` SANS renvoyer', async () => {
    const { service, transport, sends } = setup({ send: row({ attempted_at: new Date('2026-10-22T09:59:30Z') }) })
    expect(await service.dispatch(SEND)).toBe('unknown')
    expect(transport.sendEmail).not.toHaveBeenCalled()
    expect(sends.update.mock.calls[0]?.[1]).toEqual({ status: 'unknown', failure_code: 'attempt_interrupted' })
  })

  it('une réservation perdue (autre passage concurrent) ne renvoie pas', async () => {
    const { service, transport } = setup({ claimAffected: 0 })
    expect(await service.dispatch(SEND)).toBe('skipped')
    expect(transport.sendEmail).not.toHaveBeenCalled()
  })

  it('annulé, déplacé plus tard, ou déjà parti : le job ne fait rien', async () => {
    for (const send of [
      row({ status: 'cancelled' }),
      row({ status: 'sent' }),
      row({ scheduled_at: new Date('2026-10-23T10:00:00Z') }),
    ]) {
      const { service, transport } = setup({ send })
      expect(await service.dispatch(SEND)).toBe('skipped')
      expect(transport.sendEmail).not.toHaveBeenCalled()
    }
  })

  it('refus net du chemin de clic (boîte débranchée, désabonné…) : `failed`, motif nommé', async () => {
    const { service, sends } = setup({ outcome: { ok: false, code: 'mailbox_unavailable' } })
    expect(await service.dispatch(SEND)).toBe('failed')
    expect(sends.update.mock.calls[1]?.[1]).toEqual({ status: 'failed', failure_code: 'mailbox_unavailable' })
  })

  it('le texte ne correspond plus à l’empreinte validée : rien ne part', async () => {
    const { service, transport, sends } = setup({ version: version({ edited_body: 'Autre texte' }) })
    expect(await service.dispatch(SEND)).toBe('failed')
    expect(transport.sendEmail).not.toHaveBeenCalled()
    expect(sends.update.mock.calls[0]?.[1]).toEqual({ status: 'failed', failure_code: 'validation_mismatch' })
  })

  it('l’espace actif du commercial a changé : rien ne part depuis un autre espace', async () => {
    const { service, transport, sends } = setup({ activeWorkspace: OTHER_WS })
    expect(await service.dispatch(SEND)).toBe('failed')
    expect(transport.sendEmail).not.toHaveBeenCalled()
    expect(sends.update.mock.calls[0]?.[1]).toEqual({ status: 'failed', failure_code: 'workspace_changed' })
  })
})

describe('ScheduledSendService — la preuve, dans la boîte', () => {
  it('« Envoyé le … » vient du message retrouvé dans les éléments envoyés, jamais du départ', async () => {
    const sent = row({ status: 'sent', attempted_at: NOW, sent_at: NOW })
    const { service, contacts } = setup({ send: sent })
    contacts.find.mockResolvedValue([
      { id: CONTACT, email_send_channel: 'mailbox', email_sent_observed_at: new Date('2026-10-22T10:00:05Z') },
    ])
    const { items } = await service.listUpcoming(WS, USER)
    expect(items[0]?.proofSentAt).toBe('2026-10-22T10:00:05.000Z')

    contacts.find.mockResolvedValue([
      { id: CONTACT, email_send_channel: 'mailbox', email_sent_observed_at: new Date('2026-10-20T08:00:00Z') },
    ])
    const older = await service.listUpcoming(WS, USER)
    expect(older.items[0]?.proofSentAt).toBeNull()
  })

  it('cherche la preuve dans la boîte, et redit « pas retrouvé » tant qu’elle manque', async () => {
    const sent = row({ status: 'sent', attempted_at: NOW, sent_at: NOW })
    const { service, transport } = setup({
      send: sent,
      contact: { id: CONTACT, email: 'c@x.fr', email_send_channel: 'mailbox', email_sent_observed_at: null },
    })
    expect(await service.confirmProof(SEND)).toBe(false)
    expect(transport.lookForSentProof).toHaveBeenCalledWith(USER, 'c@x.fr')
  })

  it('« À venir » ne lit que l’espace ET l’utilisateur du jeton', async () => {
    const { service, sends } = setup()
    await service.listUpcoming(WS, USER)
    expect(sends.find.mock.calls[0]?.[0]).toMatchObject({
      where: expect.objectContaining({ workspace_id: WS, user_id: USER }),
    })
  })
})
