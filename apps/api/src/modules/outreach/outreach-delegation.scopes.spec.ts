import type { Repository } from 'typeorm'
import type { MailboxStatus } from '@bellum/contracts'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ContactStopEntity } from '../../database/entities/contact-stop.entity'
import type { OutreachDelegationEntity } from '../../database/entities/outreach-delegation.entity'
import type { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import { OutreachDelegationService } from './outreach-delegation.service'
import type { OutreachCtx, OutreachMessageService } from './outreach-message.service'

/**
 * #4016 L5 — DÉCISION LOUIS 11/10/2026 : l'envoi automatique est possible pour
 * cinq usages, TOUJOURS derrière un mandat signé. Ces tests tiennent le service :
 * signer (geste explicite, bornes du plan), renouveler (re-signé), et la porte du
 * dispatcher pour un message qui ATTEND un mandat.
 */

// Mercredi 7 octobre 2026, 10 h — dans les heures calmes.
const NOW = new Date(2026, 9, 7, 10)
const SIGNED_AT = new Date(2026, 9, 6, 9)
const CTX: OutreachCtx = { userId: 'u-theo', workspaceId: 'ws', role: 'owner' }
const CAPS = {
  connected: true,
  address: 'theo@esn.fr',
  capabilities: { send: true, read: true },
} as unknown as MailboxStatus

function mandateRow(over: Partial<OutreachDelegationEntity> = {}): OutreachDelegationEntity {
  return {
    id: 'm-laura',
    workspace_id: 'ws',
    user_id: 'u-theo',
    scope: 'laura_send',
    renewed_from: null,
    campaign_label: 'Laura envoie',
    contact_ids: [],
    channels: ['email'],
    sender_mailbox_id: 'theo@esn.fr',
    messages: [],
    content_hash: null,
    window_start_hour: 8,
    window_end_hour: 19,
    starts_at: SIGNED_AT,
    expires_at: new Date(2026, 9, 20),
    max_messages: 10,
    sent_count: 0,
    validated_by: ['u-theo'],
    validated_at: SIGNED_AT,
    revoked_at: null,
    paused_at: null,
    created_at: SIGNED_AT,
    ...over,
  } as OutreachDelegationEntity
}

function awaiting(over: Partial<OutreachMessageEntity> = {}): OutreachMessageEntity {
  return {
    id: 'msg-1',
    workspace_id: 'ws',
    user_id: 'u-theo',
    contact_id: 'c-1',
    channel: 'email',
    status: 'needs_review',
    current_version: 1,
    approval: null,
    mandate_scope: 'laura_send',
    mandate_originated_at: new Date(2026, 9, 7, 9),
    ...over,
  } as unknown as OutreachMessageEntity
}

function build(
  rows: OutreachDelegationEntity[],
  o: { affected?: number; contact?: Partial<ContactEntity> | null; approve?: { ok: boolean; reason?: string } } = {},
) {
  const exec = jest.fn().mockResolvedValue({ affected: o.affected ?? 1 })
  const qb = { update: () => qb, set: () => qb, where: () => qb, execute: exec }
  const saved: OutreachDelegationEntity[] = []
  const repo = {
    find: jest.fn().mockResolvedValue(rows),
    findOne: jest.fn().mockResolvedValue(rows[0] ?? null),
    create: jest.fn((entity: OutreachDelegationEntity) => entity),
    save: jest.fn(async (entity: OutreachDelegationEntity) => {
      saved.push({ ...entity })
      return entity
    }),
    createQueryBuilder: () => qb,
  } as unknown as Repository<OutreachDelegationEntity>
  const approveUnderMandate = jest.fn().mockResolvedValue(o.approve ?? { ok: true })
  const messages = {
    repliedAmong: jest.fn().mockResolvedValue(new Set()),
    approveUnderMandate,
    tagDelegation: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'msg-new' }),
    awaitMandate: jest.fn().mockResolvedValue(undefined),
  } as unknown as OutreachMessageService
  const stops = { count: jest.fn().mockResolvedValue(0) } as unknown as Repository<ContactStopEntity>
  const contactRow = o.contact === undefined ? { id: 'c-1', excluded_at: null, deleted_at: null } : o.contact
  const contacts = { findOne: jest.fn().mockResolvedValue(contactRow) } as unknown as Repository<ContactEntity>
  const svc = new OutreachDelegationService(repo, messages, stops, contacts)
  const noStops = async () => new Set<string>()
  return { svc, repo, exec, saved, messages, approveUnderMandate, noStops }
}

const DRAFT = {
  scope: 'laura_send' as const,
  campaign_label: 'Laura envoie ce qu’elle prépare',
  contact_ids: [],
  channels: ['email' as const],
  sender_mailbox_id: 'theo@esn.fr',
  window: { start_hour: 9, end_hour: 18 },
  duration_days: 14,
  max_messages: 40,
  signed: true as const,
}

describe('#4016 L5 — signer un mandat d’espace', () => {
  it('crée un mandat signé, daté, borné, sans contenu figé à l’avance', async () => {
    const { svc } = build([])
    const view = await svc.createScoped(CTX, DRAFT, CAPS, 'growth', NOW)
    expect(view).toMatchObject({
      scope: 'laura_send',
      lifecycle: 'active',
      validated_by: ['u-theo'],
      validated_at: NOW.toISOString(),
      max_messages: 40,
      renewed_from: null,
    })
  })

  it('refuse un mandat qui dépasse les bornes du plan — refus NOMMÉ', async () => {
    const { svc } = build([])
    await expect(svc.createScoped(CTX, { ...DRAFT, max_messages: 201 }, CAPS, 'growth', NOW)).rejects.toMatchObject({
      response: { code: 'plan_bound_volume' },
    })
  })

  it('refuse sans boîte d’envoi connectée, ou pour une autre boîte', async () => {
    const { svc } = build([])
    const off = { ...CAPS, connected: false } as MailboxStatus
    await expect(svc.createScoped(CTX, DRAFT, off, 'growth', NOW)).rejects.toMatchObject({
      response: { code: 'mailbox_unavailable' },
    })
    await expect(
      svc.createScoped(CTX, { ...DRAFT, sender_mailbox_id: 'autre@esn.fr' }, CAPS, 'growth', NOW),
    ).rejects.toMatchObject({ response: { code: 'sender_mismatch' } })
  })

  it('un seul mandat vivant par usage : un second est refusé', async () => {
    const { svc } = build([mandateRow()])
    await expect(svc.createScoped(CTX, DRAFT, CAPS, 'growth', NOW)).rejects.toMatchObject({
      response: { code: 'already_signed' },
    })
  })

  it('un mandat révoqué ou expiré n’empêche pas d’en signer un nouveau', async () => {
    const { svc } = build([mandateRow({ revoked_at: SIGNED_AT }), mandateRow({ expires_at: new Date(2026, 9, 7, 9) })])
    await expect(svc.createScoped(CTX, DRAFT, CAPS, 'growth', NOW)).resolves.toMatchObject({ lifecycle: 'active' })
  })
})

describe('#4016 L5 — renouveler, c’est re-signer', () => {
  it('crée un NOUVEAU mandat (compteur à zéro, nouveau signataire) et révoque l’ancien', async () => {
    const source = mandateRow({ sent_count: 10, expires_at: new Date(2026, 9, 7, 9) })
    const { svc, saved } = build([source])
    const view = await svc.renew(
      { ...CTX, userId: 'u-louis' },
      'm-laura',
      { duration_days: 7, signed: true },
      null,
      NOW,
    )
    expect(view).toMatchObject({
      renewed_from: 'm-laura',
      sent_count: 0,
      validated_by: ['u-louis'],
      lifecycle: 'active',
      scope: 'laura_send',
    })
    expect(view.id).not.toBe('m-laura')
    expect(saved.find(row => row.id === 'm-laura')?.revoked_at).toEqual(NOW)
  })

  it('un mandat révoqué ne se renouvelle pas', async () => {
    const { svc } = build([mandateRow({ revoked_at: SIGNED_AT })])
    await expect(svc.renew(CTX, 'm-laura', { duration_days: 7, signed: true }, null, NOW)).rejects.toMatchObject({
      response: { code: 'revoked' },
    })
  })
})

describe('#4016 L5 — la porte du dispatcher pour un message qui attend un mandat', () => {
  it('sans mandat de cette portée : attend (c81 inchangée)', async () => {
    const { svc, approveUnderMandate } = build([])
    expect(await svc.gateAwaitingMandate(awaiting(), CAPS, async () => new Set(), NOW)).toEqual({
      kind: 'hold',
      reason: 'no_delegation',
    })
    expect(approveUnderMandate).not.toHaveBeenCalled()
  })

  it('mandat actif de la bonne portée : réserve le quota, valide SOUS mandat, part', async () => {
    const { svc, approveUnderMandate, exec, noStops } = build([mandateRow()])
    expect(await svc.gateAwaitingMandate(awaiting(), CAPS, noStops, NOW)).toEqual({
      kind: 'run',
      delegationId: 'm-laura',
    })
    expect(exec).toHaveBeenCalledTimes(1)
    expect(approveUnderMandate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'msg-1' }),
      { id: 'm-laura', signer: 'u-theo', scope: 'laura_send' },
      noStops,
      NOW,
    )
  })

  it('un mandat RÉVOQUÉ ne couvre rien', async () => {
    const { svc } = build([mandateRow({ revoked_at: SIGNED_AT })])
    expect(await svc.gateAwaitingMandate(awaiting(), CAPS, async () => new Set(), NOW)).toEqual({
      kind: 'hold',
      reason: 'no_delegation',
    })
  })

  it('pas de mandat rétroactif : un fait né avant la signature attend', async () => {
    const { svc, approveUnderMandate } = build([mandateRow()])
    const before = awaiting({ mandate_originated_at: new Date(2026, 9, 5) })
    expect(await svc.gateAwaitingMandate(before, CAPS, async () => new Set(), NOW)).toEqual({
      kind: 'hold',
      reason: 'predates_mandate',
    })
    expect(approveUnderMandate).not.toHaveBeenCalled()
  })

  it('une personne EFFACÉE (fiche disparue, c69) arrête la suite, relu à l’envoi', async () => {
    const { svc } = build([mandateRow()], { contact: null })
    expect(await svc.gateAwaitingMandate(awaiting(), CAPS, async () => new Set(), NOW)).toEqual({
      kind: 'stop',
      reason: 'erased',
    })
  })

  it('un message bloqué (opt-out, adresse…) ne part pas : le quota réservé est RENDU', async () => {
    const { svc, exec } = build([mandateRow()], { approve: { ok: false, reason: 'blocked:opted_out' } })
    expect(await svc.gateAwaitingMandate(awaiting(), CAPS, async () => new Set(), NOW)).toEqual({
      kind: 'hold',
      reason: 'blocked:opted_out',
    })
    expect(exec).toHaveBeenCalledTimes(2) // réservation puis restitution
  })

  it('plafond atteint entre deux passages : attend, jamais au-delà', async () => {
    const { svc, approveUnderMandate } = build([mandateRow()], { affected: 0 })
    expect(await svc.gateAwaitingMandate(awaiting(), CAPS, async () => new Set(), NOW)).toEqual({
      kind: 'hold',
      reason: 'quota_reached',
    })
    expect(approveUnderMandate).not.toHaveBeenCalled()
  })

  it('un mandat d’une AUTRE portée ne couvre pas ce message', async () => {
    const { svc } = build([mandateRow({ scope: 'payment_reminder' })])
    expect(await svc.gateAwaitingMandate(awaiting(), CAPS, async () => new Set(), NOW)).toEqual({
      kind: 'hold',
      reason: 'scope_mismatch',
    })
  })
})

describe('#4016 L5 — un usage dépose, il n’envoie pas', () => {
  it('enqueueUnderMandate prépare le message et le rattache à sa portée, rien de plus', async () => {
    const { svc, messages } = build([])
    const origin = new Date(2026, 9, 7, 9)
    const out = await svc.enqueueUnderMandate(
      CTX,
      'meeting_follow_up',
      {
        contact_id: '5a1b0c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d',
        channel: 'email',
        intent: 'follow_up',
        source: 'meeting',
        subject: 'Suite à notre échange',
        body: 'Bonjour',
      } as never,
      async () => new Set(),
      origin,
    )
    expect(out).toEqual({ id: 'msg-new', scope: 'meeting_follow_up' })
    expect(messages.awaitMandate).toHaveBeenCalledWith('ws', 'msg-new', 'meeting_follow_up', origin)
  })
})

/*
 * #4016 L5 (reprise 20/10) — LES APPELANTS. Un usage qui vient de préparer un
 * message le rattache à sa portée SEULEMENT si un mandat de cette portée est
 * signé et vivant : sans mandat, le message reste un brouillon ordinaire en
 * relecture (c81 inchangée) — jamais une file d'orphelins qui attendraient une
 * signature qui ne les couvrira pas (pas de mandat rétroactif).
 */
describe('#4016 L5 — awaitIfMandated : rattacher seulement sous un mandat vivant', () => {
  const origin = new Date(2026, 9, 7, 9)

  it('aucun mandat de cette portée : rien n’est rattaché, le brouillon reste ordinaire', async () => {
    const { svc, messages } = build([])
    expect(await svc.awaitIfMandated('ws', 'msg-1', 'laura_send', origin, NOW)).toBe(false)
    expect(messages.awaitMandate).not.toHaveBeenCalled()
  })

  it('mandat révoqué, ou expiré : rien n’est rattaché', async () => {
    const revoked = build([mandateRow({ revoked_at: SIGNED_AT })])
    expect(await revoked.svc.awaitIfMandated('ws', 'msg-1', 'laura_send', origin, NOW)).toBe(false)
    const expired = build([mandateRow({ expires_at: new Date(2026, 9, 7, 8) })])
    expect(await expired.svc.awaitIfMandated('ws', 'msg-1', 'laura_send', origin, NOW)).toBe(false)
    expect(revoked.messages.awaitMandate).not.toHaveBeenCalled()
    expect(expired.messages.awaitMandate).not.toHaveBeenCalled()
  })

  it('mandat signé et vivant : le message est rattaché à sa portée, daté de son fait déclencheur', async () => {
    const { svc, repo, messages } = build([mandateRow()])
    expect(await svc.awaitIfMandated('ws', 'msg-1', 'laura_send', origin, NOW)).toBe(true)
    expect(repo.find).toHaveBeenCalledWith({ where: { workspace_id: 'ws', scope: 'laura_send' } })
    expect(messages.awaitMandate).toHaveBeenCalledWith('ws', 'msg-1', 'laura_send', origin)
  })

  it('sans espace : rien (on ne devine pas un espace)', async () => {
    const { svc, messages } = build([mandateRow()])
    expect(await svc.awaitIfMandated(null, 'msg-1', 'laura_send', origin, NOW)).toBe(false)
    expect(messages.awaitMandate).not.toHaveBeenCalled()
  })
})
