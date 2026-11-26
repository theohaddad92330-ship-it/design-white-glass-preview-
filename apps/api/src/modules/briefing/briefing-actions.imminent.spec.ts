import type { AgendaEvent } from '@bellum/contracts'
import { MEETING_PREP_IMMINENT_MINUTES } from '@bellum/contracts'
import { BRIEFING_CONTEXT_LABEL_KEYS, buildBriefingActions } from './briefing-actions'

/**
 * #2319.21 — le brief proposé à T-1 h.
 *
 * Le premier déclencheur (T-24 h) choisit les rendez-vous À PRÉPARER. Le
 * second dit qu'il est temps d'OUVRIR le brief : la carte passe en tête et son
 * contexte énonce le vrai critère (« moins de 60 min »), lu au même endroit que
 * l'écran (`MEETING_PREP_IMMINENT_MINUTES`, GA-26).
 */

const NOW = new Date('2026-08-03T07:00:00Z')

function meeting(id: string, start: string): AgendaEvent {
  return {
    id,
    summary: 'Point client',
    description: null,
    location: null,
    start,
    end: null,
    organizer: 'moi@bellum.fr',
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: 'confirmed',
    isExternal: true,
    cancelled: false,
  }
}

function actionsFor(meetings: AgendaEvent[]) {
  return buildBriefingActions({
    now: NOW,
    meetings,
    conflicts: [],
    awaitingReply: [],
    unread: [],
    positiveReplies: [],
    accountsWithFreshSignal: [],
    staleNeeds: [],
  })
}

describe('#2319.21 — le rendez-vous dans l’heure', () => {
  it('déclare la clé de contexte du second horizon', () => {
    expect(BRIEFING_CONTEXT_LABEL_KEYS).toContain('briefing.context.meetingImminent')
  })

  it('un rendez-vous dans 30 min passe EN TÊTE, avec le vrai critère', () => {
    const [first] = actionsFor([
      meeting('later', '2026-08-03T12:00:00.000Z'),
      meeting('soon', '2026-08-03T07:30:00.000Z'),
    ])
    expect(first?.id).toBe('meeting:soon')
    expect(first?.priority).toBe(1)
    expect(first?.context).toEqual({
      labelKey: 'briefing.context.meetingImminent',
      labelVars: { minutes: MEETING_PREP_IMMINENT_MINUTES },
    })
  })

  it('sait dire NON — un rendez-vous dans 5 h garde le premier horizon et son rang', () => {
    const [only] = actionsFor([meeting('later', '2026-08-03T12:00:00.000Z')])
    expect(only?.priority).toBe(2)
    expect(only?.context?.labelKey).toBe('briefing.context.meetingWithin')
  })

  it('un rendez-vous sans date lisible n’est jamais « imminent »', () => {
    const [only] = actionsFor([meeting('undated', 'pas une date')])
    expect(only?.context?.labelKey).toBe('briefing.context.meetingWithin')
  })
})
