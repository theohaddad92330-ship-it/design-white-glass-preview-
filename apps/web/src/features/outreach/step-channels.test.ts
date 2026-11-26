import { describe, expect, it } from 'vitest'
import type { OutreachSequence, OutreachSequenceStep } from '@bellum/contracts'
import {
  STEP_KIND_ICON,
  callScriptOf,
  delayOf,
  gateOf,
  linkedinDraftOf,
  moveId,
  outcomeOptions,
  vacationOf,
} from './step-channels'

const step = (over: Partial<OutreachSequenceStep> & { position: number }): OutreachSequenceStep => ({
  id: `s${over.position}`,
  sequence_id: 'seq',
  due_at: '2026-10-20T07:00:00.000Z',
  kind: 'email',
  payload: {},
  status: 'pending',
  done_at: null,
  engagement_signal: null,
  engagement_signal_at: null,
  ...over,
})

describe('step-channels — canaux d’étape', () => {
  it('chaque nature d’étape a une icône', () => {
    for (const kind of ['email', 'reminder', 'task', 'linkedin_invite', 'linkedin_message', 'call'] as const) {
      expect(STEP_KIND_ICON[kind]).toBeDefined()
    }
  })

  it('le délai vient du payload quand il existe, avec l’unité de la séquence', () => {
    const seq = { delay_unit: 'business_days', created_at: '2026-10-14T08:00:00.000Z' } as OutreachSequence
    expect(delayOf(step({ position: 0, payload: { offset_days: 3 } }), seq)).toEqual({ days: 3, unit: 'business_days' })
  })

  it('sans délai gardé, il se déduit de la création : jours ouvrés ou calendaires', () => {
    const created = '2026-10-14T07:00:00.000Z' // mercredi
    const due = step({ position: 0, due_at: '2026-10-19T07:00:00.000Z' }) // lundi
    expect(delayOf(due, { delay_unit: 'business_days', created_at: created } as OutreachSequence)).toEqual({
      days: 3,
      unit: 'business_days',
    })
    expect(delayOf(due, { delay_unit: 'calendar_days', created_at: created } as OutreachSequence)).toEqual({
      days: 5,
      unit: 'calendar_days',
    })
  })

  it('la porte LinkedIn : message en attente d’acceptation seulement si l’invitation précédente n’est pas acceptée', () => {
    const steps = [
      step({ position: 0, kind: 'linkedin_invite', status: 'done', payload: { outcome: 'pending' } }),
      step({ position: 1, kind: 'linkedin_message' }),
    ]
    expect(gateOf(steps, steps[1] as OutreachSequenceStep)).toBe('awaiting_acceptance')
    const accepted = [
      step({ position: 0, kind: 'linkedin_invite', status: 'done', payload: { outcome: 'accepted' } }),
      steps[1] as OutreachSequenceStep,
    ]
    expect(gateOf(accepted, accepted[1] as OutreachSequenceStep)).toBe('accepted')
  })

  it('la matière du geste LinkedIn et de l’appel vient du payload, jamais inventée', () => {
    expect(
      linkedinDraftOf(
        step({
          position: 0,
          kind: 'linkedin_message',
          payload: { linkedin_draft: { body: 'Bonjour', profile_url: 'https://l/in/x' } },
        }),
      ),
    ).toEqual({
      body: 'Bonjour',
      profileUrl: 'https://l/in/x',
    })
    expect(
      linkedinDraftOf(
        step({
          position: 0,
          kind: 'linkedin_message',
          payload: { linkedin_draft: null, profile_url: 'https://l/in/x' },
        }),
      ),
    ).toEqual({
      body: null,
      profileUrl: 'https://l/in/x',
    })
    expect(callScriptOf(step({ position: 0, kind: 'call', payload: { call_script: 'Trame' } }))).toBe('Trame')
    expect(callScriptOf(step({ position: 0, kind: 'call', payload: { call_script: null } }))).toBeNull()
  })

  it('refuse une URL de profil qui n’est pas http(s) (jamais javascript:)', () => {
    expect(
      linkedinDraftOf(step({ position: 0, kind: 'linkedin_invite', payload: { profile_url: 'javascript:alert(1)' } }))
        .profileUrl,
    ).toBeNull()
  })

  it('les issues proposées dépendent de la nature', () => {
    expect(outcomeOptions('linkedin_invite')).toEqual(['accepted', 'pending'])
    expect(outcomeOptions('call')).toEqual(['reached', 'voicemail', 'no_answer'])
    expect(outcomeOptions('email')).toEqual([])
  })

  it('déplacer un identifiant : haut, bas, bornes', () => {
    expect(moveId(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b'])
    expect(moveId(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c'])
    expect(moveId(['a', 'b', 'c'], 'a', -1)).toBeNull()
    expect(moveId(['a', 'b', 'c'], 'c', 1)).toBeNull()
  })

  it('la pause vacances se lit sur les séquences : la date de reprise la plus proche, et le nombre', () => {
    const seqs = [
      { status: 'paused', vacation_until: '2026-10-28T07:00:00.000Z' },
      { status: 'paused', vacation_until: '2026-10-25T07:00:00.000Z' },
      { status: 'paused', vacation_until: null },
      { status: 'active', vacation_until: null },
    ] as OutreachSequence[]
    expect(vacationOf(seqs)).toEqual({ count: 2, until: '2026-10-28T07:00:00.000Z' })
    expect(vacationOf([{ status: 'active', vacation_until: null } as OutreachSequence])).toBeNull()
  })
})
