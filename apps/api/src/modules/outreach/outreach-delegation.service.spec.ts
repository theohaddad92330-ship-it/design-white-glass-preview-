import type { Repository } from 'typeorm'
import type { OutreachDelegationEntity } from '../../database/entities/outreach-delegation.entity'
import type { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import type { MailboxStatus } from '@bellum/contracts'
import type { ContactStopEntity } from '../../database/entities/contact-stop.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import { delegationIdOf, OutreachDelegationService, reviewedContentHash } from './outreach-delegation.service'
import type { OutreachMessageService } from './outreach-message.service'

const NOW = new Date('2026-10-07T10:00:00')
const MSG = '11111111-1111-4111-8111-111111111111'

function row(over: Partial<OutreachDelegationEntity> = {}): OutreachDelegationEntity {
  return {
    id: 'd-1',
    workspace_id: 'ws',
    user_id: 'u',
    campaign_label: 'Q4',
    contact_ids: ['c-1'],
    channels: ['email'],
    sender_mailbox_id: 'me@esn.fr',
    messages: [{ id: MSG, version: 2 }],
    content_hash: reviewedContentHash([{ id: MSG, version: 2 }]),
    window_start_hour: 8,
    window_end_hour: 19,
    starts_at: new Date('2026-10-07T08:00:00'),
    expires_at: new Date('2026-10-20T08:00:00'),
    max_messages: 5,
    sent_count: 0,
    validated_by: ['u'],
    validated_at: NOW,
    revoked_at: null,
    paused_at: null,
    created_at: NOW,
    ...over,
  } as OutreachDelegationEntity
}
const message = {
  id: MSG,
  workspace_id: 'ws',
  user_id: 'u',
  contact_id: 'c-1',
  channel: 'email',
  current_version: 2,
  approval: { conditions: ['delegation:11111111-1111-4111-8111-111111111111'] },
} as unknown as OutreachMessageEntity

function build(
  r: OutreachDelegationEntity | null,
  o: { replied?: boolean; read?: boolean; stopped?: boolean; affected?: number; excluded?: boolean } = {},
) {
  const exec = jest.fn().mockResolvedValue({ affected: o.affected ?? 1 })
  const qb = { update: () => qb, set: () => qb, where: () => qb, execute: exec }
  const repo = {
    findOne: jest.fn().mockResolvedValue(r),
    save: jest.fn(async (saved: OutreachDelegationEntity) => saved),
    createQueryBuilder: () => qb,
  } as unknown as Repository<OutreachDelegationEntity>
  const messages = {
    repliedAmong: jest.fn().mockResolvedValue(new Set(o.replied ? ['c-1'] : [])),
  } as unknown as OutreachMessageService
  const caps = {
    connected: true,
    address: 'me@esn.fr',
    capabilities: { send: true, read: o.read ?? true },
  } as unknown as MailboxStatus
  const stops = { count: jest.fn().mockResolvedValue(o.stopped ? 1 : 0) } as unknown as Repository<ContactStopEntity>
  const contacts = {
    findOne: jest.fn().mockResolvedValue({ excluded_at: o.excluded ? NOW : null }),
  } as unknown as Repository<ContactEntity>
  const svc = new OutreachDelegationService(repo, messages, stops, contacts)
  return {
    gate: (m: OutreachMessageEntity, now: Date) => svc.gate(m, caps, now),
    pause: (now: Date) => svc.pause({ workspaceId: 'ws' } as never, 'd-1', now),
    resume: (now: Date) => svc.resume({ workspaceId: 'ws' } as never, 'd-1', now),
  }
}

describe('OutreachDelegationService.gate (#3702)', () => {
  it('sans condition delegation: ⇒ individual', async () => {
    const svc = build(row())
    expect(
      await svc.gate({ ...message, approval: { conditions: ['no_blocker'] } } as unknown as OutreachMessageEntity, NOW),
    ).toEqual({ kind: 'individual' })
  })
  it('mandat valide ⇒ run et réserve un envoi', async () => {
    expect(await build(row()).gate(message, NOW)).toEqual({ kind: 'run', delegationId: 'd-1' })
  })
  it('plafond atteint à la réservation ⇒ attend (pas de double envoi concurrent)', async () => {
    expect(await build(row(), { affected: 0 }).gate(message, NOW)).toEqual({ kind: 'hold', reason: 'quota_reached' })
  })
  it('réponse ⇒ stop ; opposition ⇒ stop', async () => {
    expect(await build(row(), { replied: true }).gate(message, NOW)).toEqual({ kind: 'stop', reason: 'replied' })
    expect(await build(row(), { stopped: true }).gate(message, NOW)).toEqual({ kind: 'stop', reason: 'opposed' })
  })
  // #3702.9 — un contact exclu (compte écarté, effacement RGPD…) après la création du mandat ne reçoit plus rien.
  it('contact exclu (`excluded_at`) ⇒ stop, raison « excluded »', async () => {
    expect(await build(row(), { excluded: true }).gate(message, NOW)).toEqual({ kind: 'stop', reason: 'excluded' })
  })
  it('lecture des réponses indisponible ⇒ suspend, raison nommée', async () => {
    expect(await build(row(), { read: false }).gate(message, NOW)).toEqual({
      kind: 'hold',
      reason: 'replies_unreadable',
    })
  })
  it('version relue changée ⇒ nouvelle validation ; révoqué/pause ⇒ attend', async () => {
    expect(await build(row()).gate({ ...message, current_version: 3 } as OutreachMessageEntity, NOW)).toEqual({
      kind: 'hold',
      reason: 'content_changed',
    })
    expect(await build(row({ revoked_at: NOW })).gate(message, NOW)).toEqual({ kind: 'hold', reason: 'revoked' })
    expect(await build(row({ paused_at: NOW })).gate(message, NOW)).toEqual({ kind: 'hold', reason: 'paused' })
  })
  it('hors fenêtre ⇒ attend ; mandat introuvable ⇒ attend (inconnu ⇒ attend)', async () => {
    expect(await build(row({ window_start_hour: 12 })).gate(message, NOW)).toEqual({
      kind: 'hold',
      reason: 'outside_window',
    })
    expect(await build(null).gate(message, NOW)).toEqual({ kind: 'hold', reason: 'no_delegation' })
  })
  it('empreinte stable et sensible à la version ; delegationIdOf lit la condition', () => {
    expect(
      reviewedContentHash([
        { id: 'a', version: 1 },
        { id: 'b', version: 1 },
      ]),
    ).toBe(
      reviewedContentHash([
        { id: 'b', version: 1 },
        { id: 'a', version: 1 },
      ]),
    )
    expect(reviewedContentHash([{ id: 'a', version: 1 }])).not.toBe(reviewedContentHash([{ id: 'a', version: 2 }]))
    expect(delegationIdOf(message)).toBe(MSG)
  })
})

describe('OutreachDelegationService — pause et reprise (#4293.2, #3702.3)', () => {
  it('pause : aucun envoi pendant la pause ; reprise : le mandat reparti sans re-signature', async () => {
    const paused = row({ paused_at: NOW })
    expect(await build(paused).gate(message, NOW)).toEqual({ kind: 'hold', reason: 'paused' })
    const resumed = await build(paused).resume(NOW)
    expect(resumed.paused_at).toBeNull()
    expect(paused.paused_at).toBeNull()
    expect(await build(paused).gate(message, NOW)).toMatchObject({ kind: 'run' })
  })

  it('un mandat EXPIRÉ ne se reprend pas : il se renouvelle (nouvelle signature)', async () => {
    const expired = row({ paused_at: NOW, expires_at: new Date('2026-10-07T09:00:00') })
    await expect(build(expired).resume(NOW)).rejects.toMatchObject({ response: { code: 'expired' } })
    expect(expired.paused_at).toEqual(NOW)
  })

  it('un mandat révoqué ne reprend pas', async () => {
    await expect(build(row({ revoked_at: NOW })).resume(NOW)).rejects.toMatchObject({
      response: { code: 'revoked' },
    })
  })
})
