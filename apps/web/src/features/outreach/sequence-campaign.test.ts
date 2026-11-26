import type { OutreachSequence, OutreachSequenceStep } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  campaignCounts,
  campaignMembers,
  campaignTitle,
  dryRun,
  memberLine,
  pendingCalls,
  stepSummaries,
} from './sequence-campaign'

const NOW = new Date('2026-10-23T10:00:00.000Z')

function step(over: Partial<OutreachSequenceStep> = {}): OutreachSequenceStep {
  return {
    id: `s-${Math.random()}`,
    sequence_id: 'seq',
    position: 0,
    due_at: '2026-10-30T09:00:00.000Z',
    kind: 'email',
    payload: {},
    status: 'pending',
    done_at: null,
    engagement_signal: null,
    engagement_signal_at: null,
    ...over,
  }
}

function seq(over: Partial<OutreachSequence> = {}): OutreachSequence {
  const steps = over.steps ?? [step()]
  return {
    id: `q-${Math.random()}`,
    contact_id: `c-${Math.random()}`,
    contact_name: 'Clémence Aubry',
    contact_role: null,
    account_id: null,
    account_name: null,
    name: 'Ouverture Data',
    campaign_label: 'Ouverture Data · SNCF',
    template_key: null,
    duplicated_from: null,
    forced_over_sequence_id: null,
    force_justification: null,
    status: 'active',
    created_at: '2026-10-14T09:00:00.000Z',
    steps,
    next_step: steps.find(s => s.status === 'pending') ?? null,
    contact_replied: false,
    cancel_reason: null,
    not_now_revalidation: null,
    can_send: true,
    delay_unit: 'calendar_days',
    vacation_until: null,
    ...over,
  } as OutreachSequence
}

describe('campaignMembers', () => {
  it('réunit toute l’audience de la même étiquette, la séquence ouverte comprise', () => {
    const a = seq({ id: 'a' })
    const b = seq({ id: 'b' })
    const other = seq({ id: 'x', campaign_label: 'Autre' })
    expect(campaignMembers(a, [a, b, other]).map(member => member.id)).toEqual(['a', 'b'])
  })

  it('une séquence lancée seule est sa propre campagne', () => {
    const solo = seq({ id: 's', campaign_label: null })
    const other = seq({ id: 'o', campaign_label: null })
    expect(campaignMembers(solo, [solo, other])).toEqual([solo])
    expect(campaignTitle(solo)).toBe('Ouverture Data')
  })

  it('la séquence ouverte reste présente même absente de la liste lue', () => {
    const a = seq({ id: 'a' })
    expect(campaignMembers(a, []).map(member => member.id)).toEqual(['a'])
  })
})

describe('campaignCounts', () => {
  it('compte les personnes, les étapes faites, les réponses et les arrêts', () => {
    const members = [
      seq({ steps: [step({ status: 'done' }), step({ position: 1 })], contact_replied: true }),
      seq({ steps: [step({ status: 'done' }), step({ position: 1 })], status: 'cancelled' }),
      seq({ steps: [step({ status: 'done' }), step({ position: 1 })] }),
    ]
    const counts = campaignCounts(members)
    expect(counts).toMatchObject({ contacts: 3, steps: 2, stepsDone: 3, replies: 1, stopped: 1 })
    expect(counts.started).toBe('2026-10-14T09:00:00.000Z')
  })
})

describe('stepSummaries', () => {
  it('résume chaque position : faites, à valider aujourd’hui, à venir, ignorées', () => {
    const members = [
      seq({
        steps: [
          step({ status: 'done', done_at: '2026-10-14T09:00:00.000Z' }),
          step({ position: 1, due_at: '2026-10-23T09:00:00.000Z' }),
        ],
      }),
      seq({
        steps: [
          step({ status: 'done', done_at: '2026-10-14T09:00:00.000Z' }),
          step({ position: 1, due_at: '2026-10-23T09:00:00.000Z' }),
        ],
      }),
      seq({ steps: [step({ status: 'done' }), step({ position: 1, status: 'skipped' })], contact_replied: true }),
    ]
    const [first, second] = stepSummaries(members, NOW)
    expect(first).toMatchObject({ position: 0, done: 3, total: 3 })
    expect(first?.doneAt).toBe('2026-10-14T09:00:00.000Z')
    expect(second).toMatchObject({ position: 1, dueToday: 2, skipped: 1, done: 0 })
  })

  it('une étape en retard se compte à part, une étape future donne sa date', () => {
    const members = [
      seq({ steps: [step({ due_at: '2026-10-20T09:00:00.000Z' })] }),
      seq({ steps: [step({ due_at: '2026-10-27T09:00:00.000Z' })] }),
    ]
    const [only] = stepSummaries(members, NOW)
    expect(only).toMatchObject({ late: 1, upcoming: 1, nextDueAt: '2026-10-27T09:00:00.000Z' })
  })
})

describe('memberLine', () => {
  it('dit en un mot où en est la personne', () => {
    expect(memberLine(seq({ contact_replied: true }), NOW)).toMatchObject({ tone: 'green', key: 'replied' })
    expect(memberLine(seq({ status: 'cancelled', cancel_reason: 'opt_out' }), NOW)).toMatchObject({
      tone: 'red',
      key: 'refused',
    })
    expect(memberLine(seq({ status: 'cancelled', cancel_reason: 'hard_bounce' }), NOW)).toMatchObject({
      key: 'bounced',
    })
    expect(memberLine(seq({ status: 'cancelled', cancel_reason: 'meeting_booked' }), NOW)).toMatchObject({
      key: 'meeting',
    })
    expect(memberLine(seq({ status: 'cancelled', cancel_reason: 'manual_stop' }), NOW)).toMatchObject({
      key: 'stopped',
    })
    expect(memberLine(seq({ status: 'paused' }), NOW)).toMatchObject({ tone: 'amber', key: 'paused' })
    expect(memberLine(seq({ status: 'completed' }), NOW)).toMatchObject({ key: 'completed' })
  })

  it('une étape due aujourd’hui est « à valider » (violet), une étape future « à venir » (neutre)', () => {
    expect(memberLine(seq({ steps: [step({ due_at: '2026-10-23T09:00:00.000Z' })] }), NOW)).toMatchObject({
      tone: 'purple',
      key: 'dueNow',
    })
    expect(memberLine(seq({ steps: [step({ due_at: '2026-10-28T09:00:00.000Z' })] }), NOW)).toMatchObject({
      tone: 'neutral',
      key: 'next',
    })
  })
})

describe('dryRun', () => {
  it('regroupe par jour, étape et canal les personnes concernées, sans toucher à celles qui ont répondu', () => {
    const members = [
      seq({ contact_name: 'A', steps: [step({ position: 1, due_at: '2026-10-23T09:00:00.000Z' })] }),
      seq({ contact_name: 'B', steps: [step({ position: 1, due_at: '2026-10-23T11:00:00.000Z' })] }),
      seq({
        contact_name: 'C',
        steps: [step({ position: 1, due_at: '2026-10-23T09:00:00.000Z' })],
        contact_replied: true,
      }),
      seq({ contact_name: 'D', steps: [step({ position: 2, due_at: '2026-10-27T09:00:00.000Z' })] }),
    ]
    const items = dryRun(members, NOW)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ position: 1, names: ['A', 'B'] })
    expect(items[1]).toMatchObject({ position: 2, names: ['D'] })
  })

  it('une séquence en pause ou arrêtée ne prépare rien', () => {
    expect(dryRun([seq({ status: 'paused' }), seq({ status: 'cancelled' })], NOW)).toEqual([])
  })
})

describe('pendingCalls', () => {
  it('ne garde que les personnes dont la prochaine étape est un appel', () => {
    const caller = seq({ contact_name: 'Hakim', steps: [step({ kind: 'call' })] })
    const mailer = seq({ contact_name: 'Élise', steps: [step({ kind: 'email' })] })
    expect(pendingCalls([caller, mailer]).map(entry => entry.member.contact_name)).toEqual(['Hakim'])
  })
})
