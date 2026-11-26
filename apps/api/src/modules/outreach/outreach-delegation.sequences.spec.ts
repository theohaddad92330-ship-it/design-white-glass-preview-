import type { Repository } from 'typeorm'
import type { MailboxStatus } from '@bellum/contracts'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { ContactStopEntity } from '../../database/entities/contact-stop.entity'
import type { OutreachDelegationEntity } from '../../database/entities/outreach-delegation.entity'
import type { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import type { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import type { OutreachSequenceStepEntity } from '../../database/entities/outreach-sequence-step.entity'
import { OutreachDelegationService } from './outreach-delegation.service'
import type { OutreachMessageService } from './outreach-message.service'

/**
 * #4016 L5 (reprise 20/10) — la portée `workspace_sequences` : les étapes e-mail
 * d'une séquence partent sous le mandat de l'espace, mais SEULEMENT à l'échéance
 * VIVANTE de leur étape (une étape reportée attend), tant que la séquence est
 * active (en pause : attend ; arrêtée, terminée, étape faite ou sautée : le
 * message sort de la file et reste en relecture). Le fait est relu à CHAQUE
 * envoi, jamais figé au dépôt.
 */

// Mercredi 7 octobre 2026, 10 h — dans les heures calmes.
const NOW = new Date(2026, 9, 7, 10)
const SIGNED_AT = new Date(2026, 9, 6, 9)
const CAPS = {
  connected: true,
  address: 'theo@esn.fr',
  capabilities: { send: true, read: true },
} as unknown as MailboxStatus

const MANDATE = {
  id: 'm-seq',
  workspace_id: 'ws',
  user_id: 'u-theo',
  scope: 'workspace_sequences',
  renewed_from: null,
  campaign_label: 'Séquences de l’espace',
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
} as unknown as OutreachDelegationEntity

const MESSAGE = {
  id: 'msg-1',
  workspace_id: 'ws',
  user_id: 'u-theo',
  contact_id: 'c-1',
  channel: 'email',
  status: 'needs_review',
  current_version: 1,
  approval: null,
  sequence_id: 'seq-1',
  sequence_step_id: 'step-2',
  mandate_scope: 'workspace_sequences',
  // Daté au dépôt : l'échéance d'ALORS. L'étape a pu être reportée depuis.
  mandate_originated_at: new Date(2026, 9, 7, 9),
} as unknown as OutreachMessageEntity

function build(sequence: Partial<OutreachSequenceEntity> | null, step: Partial<OutreachSequenceStepEntity> | null) {
  const exec = jest.fn().mockResolvedValue({ affected: 1 })
  const qb = { update: () => qb, set: () => qb, where: () => qb, execute: exec }
  const repo = {
    find: jest.fn().mockResolvedValue([MANDATE]),
    createQueryBuilder: () => qb,
  } as unknown as Repository<OutreachDelegationEntity>
  const messages = {
    repliedAmong: jest.fn().mockResolvedValue(new Set()),
    approveUnderMandate: jest.fn().mockResolvedValue({ ok: true }),
  } as unknown as OutreachMessageService
  const stops = { count: jest.fn().mockResolvedValue(0) } as unknown as Repository<ContactStopEntity>
  const contacts = {
    findOne: jest.fn().mockResolvedValue({ id: 'c-1', excluded_at: null, deleted_at: null }),
  } as unknown as Repository<ContactEntity>
  const sequences = { findOne: jest.fn().mockResolvedValue(sequence) } as unknown as Repository<OutreachSequenceEntity>
  const steps = { findOne: jest.fn().mockResolvedValue(step) } as unknown as Repository<OutreachSequenceStepEntity>
  const svc = new OutreachDelegationService(repo, messages, stops, contacts, sequences, steps)
  return { svc, sequences, steps }
}

const noStops = async () => new Set<string>()
const ACTIVE = { id: 'seq-1', workspace_id: 'ws', status: 'active' } as const
const DUE = { id: 'step-2', sequence_id: 'seq-1', status: 'pending', due_at: new Date(2026, 9, 7, 9) } as const

describe('#4016 L5 — workspace_sequences : l’étape relue à chaque envoi', () => {
  it('séquence active, étape échue et en attente : part sous le mandat de l’espace', async () => {
    const { svc, steps } = build(ACTIVE, DUE)
    expect(await svc.gateAwaitingMandate(MESSAGE, CAPS, noStops, NOW)).toEqual({ kind: 'run', delegationId: 'm-seq' })
    expect(steps.findOne).toHaveBeenCalledWith({ where: { id: 'step-2', sequence_id: 'seq-1' } })
  })

  it('étape REPORTÉE depuis le dépôt : l’échéance vivante gagne, le message attend `not_due`', async () => {
    const { svc } = build(ACTIVE, { ...DUE, due_at: new Date(2026, 9, 9, 9) })
    expect(await svc.gateAwaitingMandate(MESSAGE, CAPS, noStops, NOW)).toEqual({ kind: 'hold', reason: 'not_due' })
  })

  it('séquence en pause (vacances, événement de pause) : attend, passager', async () => {
    const { svc } = build({ ...ACTIVE, status: 'paused' }, DUE)
    expect(await svc.gateAwaitingMandate(MESSAGE, CAPS, noStops, NOW)).toEqual({ kind: 'hold', reason: 'paused' })
  })

  it.each([
    ['séquence arrêtée', { ...ACTIVE, status: 'cancelled' }, DUE],
    ['séquence terminée', { ...ACTIVE, status: 'completed' }, DUE],
    ['étape faite', ACTIVE, { ...DUE, status: 'done' }],
    ['étape sautée', ACTIVE, { ...DUE, status: 'skipped' }],
    ['séquence introuvable', null, DUE],
    ['étape introuvable', ACTIVE, null],
  ] as const)('%s : rien ne part, le message sort de la file (`sequence_over`)', async (_label, sequence, step) => {
    const { svc } = build(sequence, step)
    expect(await svc.gateAwaitingMandate(MESSAGE, CAPS, noStops, NOW)).toEqual({
      kind: 'hold',
      reason: 'sequence_over',
    })
  })

  it('séquence d’un AUTRE espace : jamais relue comme la sienne', async () => {
    const { svc, sequences } = build(ACTIVE, DUE)
    await svc.gateAwaitingMandate(MESSAGE, CAPS, noStops, NOW)
    expect(sequences.findOne).toHaveBeenCalledWith({ where: { id: 'seq-1', workspace_id: 'ws' } })
  })

  it('sans les tables des séquences (module amputé) : inconnu ⇒ attend, rien ne part', async () => {
    const svc = new OutreachDelegationService(
      { find: jest.fn().mockResolvedValue([MANDATE]) } as never,
      {} as never,
      {} as never,
      {} as never,
    )
    expect(await svc.gateAwaitingMandate(MESSAGE, CAPS, noStops, NOW)).toEqual({
      kind: 'hold',
      reason: 'sequence_over',
    })
  })
})

/**
 * #5029.2 — une séquence qui PROPOSE un consultant en intercontrat (Reverse
 * Market) reste TOUJOURS manuelle, même sous mandat `workspace_sequences`
 * signé : un message qui s'y serait rattaché (avant la colonne, par erreur)
 * n'est jamais validé sous mandat — il reste en relecture.
 */
describe('#5029.2 — séquence intercontrat : jamais sous mandat', () => {
  it('séquence rattachée à un consultant : rien ne part (`manual_only`), même mandat signé et étape échue', async () => {
    const { svc } = build({ ...ACTIVE, consultant_id: 'cons-1' } as never, DUE)
    expect(await svc.gateAwaitingMandate(MESSAGE, CAPS, noStops, NOW)).toEqual({
      kind: 'hold',
      reason: 'manual_only',
    })
  })
})
