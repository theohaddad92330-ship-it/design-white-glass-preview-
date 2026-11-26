import { describe, expect, it } from 'vitest'
import {
  scheduleMessageSendRequestSchema,
  scheduledSendDisplayState,
  scheduledSendIsChangeable,
  type ScheduledMessageSendItem,
} from './scheduled-message-send.js'

// Théo M2 — envoi programmé — le contrat : ce qui se programme, et ce que l'écran a le droit de dire.
const BASE: ScheduledMessageSendItem = {
  id: '00000000-0000-4000-8000-000000000001',
  versionId: '00000000-0000-4000-8000-000000000002',
  contactId: '00000000-0000-4000-8000-000000000003',
  channel: 'email',
  subject: 'Point rapide',
  scheduledAt: '2026-10-23T07:30:00.000Z',
  timeZone: 'Europe/Paris',
  status: 'scheduled',
  attemptedAt: null,
  sentAt: null,
  proofSentAt: null,
  failureCode: null,
  createdAt: '2026-10-22T10:00:00.000Z',
}

describe('scheduleMessageSendRequestSchema', () => {
  it('exige une date AVEC fuseau et le fuseau de l’utilisateur', () => {
    expect(
      scheduleMessageSendRequestSchema.safeParse({
        versionId: BASE.versionId,
        scheduledAt: '2026-10-23T09:30:00+02:00',
        timeZone: 'Europe/Paris',
      }).success,
    ).toBe(true)
    expect(
      scheduleMessageSendRequestSchema.safeParse({
        versionId: BASE.versionId,
        scheduledAt: '2026-10-23T09:30:00',
        timeZone: 'Europe/Paris',
      }).success,
    ).toBe(false)
    expect(
      scheduleMessageSendRequestSchema.safeParse({ versionId: BASE.versionId, scheduledAt: BASE.scheduledAt }).success,
    ).toBe(false)
  })
})

describe('scheduledSendDisplayState', () => {
  it('« Envoyé le … » seulement si le message est retrouvé dans la boîte', () => {
    expect(scheduledSendDisplayState({ ...BASE, status: 'sent', sentAt: BASE.scheduledAt })).toEqual({
      kind: 'sent_unproven',
      at: BASE.scheduledAt,
    })
    expect(
      scheduledSendDisplayState({
        ...BASE,
        status: 'sent',
        sentAt: BASE.scheduledAt,
        proofSentAt: '2026-10-23T07:30:04.000Z',
      }),
    ).toEqual({ kind: 'sent_proven', at: '2026-10-23T07:30:04.000Z' })
  })

  it('une issue inconnue n’est ni un échec ni un envoi', () => {
    expect(scheduledSendDisplayState({ ...BASE, status: 'unknown', attemptedAt: BASE.scheduledAt })).toEqual({
      kind: 'unknown',
      at: BASE.scheduledAt,
    })
  })

  it('programmé, annulé, échec gardent leur date et leur motif', () => {
    expect(scheduledSendDisplayState(BASE)).toEqual({ kind: 'scheduled', at: BASE.scheduledAt })
    expect(scheduledSendDisplayState({ ...BASE, status: 'cancelled' })).toEqual({ kind: 'cancelled', at: null })
    expect(scheduledSendDisplayState({ ...BASE, status: 'failed', failureCode: 'already_sent' })).toEqual({
      kind: 'failed',
      at: null,
      failureCode: 'already_sent',
    })
  })
})

describe('scheduledSendIsChangeable', () => {
  it('annuler ou déplacer l’heure : seulement tant que rien n’est parti', () => {
    expect(scheduledSendIsChangeable(BASE)).toBe(true)
    expect(scheduledSendIsChangeable({ ...BASE, attemptedAt: BASE.scheduledAt })).toBe(false)
    for (const status of ['sent', 'cancelled', 'failed', 'unknown'] as const) {
      expect(scheduledSendIsChangeable({ ...BASE, status })).toBe(false)
    }
  })
})
