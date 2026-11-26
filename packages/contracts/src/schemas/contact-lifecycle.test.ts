import { describe, expect, it } from 'vitest'

import {
  CONTACT_LIFECYCLE_LABELS,
  CONTACT_LIFECYCLE_STATES,
  computeContactLifecycleState,
  computeContactState,
  contactLifecycleLabel,
  contactLifecycleStateSchema,
  isContactActionnable,
  isContactIdentityComplete,
  type ContactLifecycleState,
} from './classified-data.js'
import { contactLifecycleHistorySchema, contactLifecycleTransitionSchema } from './contact.js'

// The canonical 7-state machine — 5 ladder rungs then the 2 terminal states the
// annexe organigramme adds (p15: historique / rejete). Each `it` pins one state
// boundary so the KPIs + filters that derive from it stay stable.

describe('CONTACT_LIFECYCLE_STATES + labels (single source)', () => {
  it('lists the 7 states — 5 ladder rungs then the 2 terminal states', () => {
    expect(CONTACT_LIFECYCLE_STATES).toEqual([
      'detecte',
      'identite_verifiee',
      'qualifie',
      'enrichi',
      'actionnable',
      'historique',
      'rejete',
    ])
  })

  it('produces the terminal states from their signal, overriding the ladder', () => {
    // ex-employee (employerMismatch) → historique ; explicit rejection → rejete (wins).
    const base = { fullName: 'Jean Dupont', title: 'DSI', role: 'technical', email: 'j@x.com' }
    expect(computeContactLifecycleState({ ...base, employerMismatch: true })).toBe('historique')
    expect(computeContactLifecycleState({ ...base, rejected: true })).toBe('rejete')
    expect(computeContactLifecycleState({ ...base, employerMismatch: true, rejected: true })).toBe('rejete')
    // Dormant without their signal — the ladder is unchanged.
    expect(computeContactLifecycleState(base)).toBe('actionnable')
  })

  it('has a non-empty French label for every state', () => {
    for (const state of CONTACT_LIFECYCLE_STATES) {
      expect(CONTACT_LIFECYCLE_LABELS[state].length).toBeGreaterThan(0)
      expect(contactLifecycleLabel(state)).toBe(CONTACT_LIFECYCLE_LABELS[state])
    }
    expect(contactLifecycleLabel('actionnable')).toBe('Actionnable')
    expect(contactLifecycleLabel('detecte')).toBe('Détecté')
  })

  it('keeps `computeContactState` as an alias of the canonical function', () => {
    expect(computeContactState).toBe(computeContactLifecycleState)
  })
})

describe('computeContactLifecycleState — each state boundary', () => {
  it('détecté — only a first name, no anchor and no channel', () => {
    expect(computeContactLifecycleState({ fullName: 'Jean' })).toBe('detecte')
    expect(computeContactLifecycleState({})).toBe('detecte')
  })

  it('identité vérifiée — full name + anchor, but no known role nor coordinates', () => {
    expect(computeContactLifecycleState({ fullName: 'Jean Dupont', title: 'DSI' })).toBe('identite_verifiee')
    // An entity anchor also completes the identity.
    expect(computeContactLifecycleState({ fullName: 'Jean Dupont', entity: 'Boursorama' })).toBe('identite_verifiee')
    expect(isContactIdentityComplete({ fullName: 'Jean Dupont', title: 'DSI' })).toBe(true)
  })

  it('qualifié — identity complete + known persona/role, still unreachable', () => {
    expect(computeContactLifecycleState({ fullName: 'Jean Dupont', title: 'DSI', role: 'technical' })).toBe('qualifie')
  })

  it('enrichi — has coordinates (email/phone) but identity still incomplete', () => {
    // Prénom-seul with an email: worth enriching, NEVER actionnable (Théo P0).
    expect(computeContactLifecycleState({ fullName: 'Jean', role: 'economic', email: 'jean@sg.com' })).toBe('enrichi')
    expect(computeContactLifecycleState({ fullName: 'Jean', phone: '+33123456789' })).toBe('enrichi')
    expect(isContactActionnable({ fullName: 'Jean', role: 'economic', email: 'jean@sg.com' })).toBe(false)
  })

  it('actionnable — identity complete + known role + a reachable channel', () => {
    const viaEmail = { fullName: 'Jean Dupont', title: 'DSI', role: 'technical', email: 'jean@sg.com' }
    expect(computeContactLifecycleState(viaEmail)).toBe('actionnable')
    expect(isContactActionnable(viaEmail)).toBe(true)
    // A phone or a LinkedIn URL is a reachable channel too.
    expect(
      computeContactLifecycleState({ fullName: 'Jean Dupont', title: 'DSI', role: 'technical', phone: '+33...' }),
    ).toBe('actionnable')
    expect(
      computeContactLifecycleState({
        fullName: 'Jean Dupont',
        title: 'DSI',
        role: 'technical',
        linkedinUrl: 'https://linkedin.com/in/jd',
      }),
    ).toBe('actionnable')
  })

  it('always returns one of the 5 canonical states', () => {
    const states: ContactLifecycleState[] = [
      computeContactLifecycleState({ fullName: 'X' }),
      computeContactLifecycleState({ fullName: 'Jean Dupont', title: 'DSI', role: 'technical', email: 'a@b.com' }),
    ]
    for (const s of states) expect(CONTACT_LIFECYCLE_STATES).toContain(s)
  })
})

describe('contactLifecycleStateSchema', () => {
  it('accepts every canonical state and rejects an unknown one', () => {
    for (const state of CONTACT_LIFECYCLE_STATES) {
      expect(contactLifecycleStateSchema.parse(state)).toBe(state)
    }
    expect(contactLifecycleStateSchema.safeParse('perime').success).toBe(false)
  })
})

describe('contactLifecycleTransitionSchema (persisted journal)', () => {
  it('parses a detection row (from_state null, real source + date)', () => {
    const row = contactLifecycleTransitionSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      contact_id: '22222222-2222-2222-2222-222222222222',
      from_state: null,
      to_state: 'identite_verifiee',
      source: 'pappers',
      occurred_at: '2026-07-16T10:00:00.000Z',
      actor: '33333333-3333-3333-3333-333333333333',
    })
    expect(row.from_state).toBeNull()
    expect(row.to_state).toBe('identite_verifiee')
    expect(row.source).toBe('pappers')
  })

  it('parses an enrichment transition (from → to, source apollo, null actor)', () => {
    const row = contactLifecycleTransitionSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      contact_id: '22222222-2222-2222-2222-222222222222',
      from_state: 'identite_verifiee',
      to_state: 'enrichi',
      source: 'apollo',
      occurred_at: '2026-07-16T10:05:00.000Z',
      actor: null,
    })
    expect(row.from_state).toBe('identite_verifiee')
    expect(row.to_state).toBe('enrichi')
    expect(row.actor).toBeNull()
  })

  it('rejects a transition to an unknown state', () => {
    expect(
      contactLifecycleTransitionSchema.safeParse({
        id: '11111111-1111-1111-1111-111111111111',
        contact_id: '22222222-2222-2222-2222-222222222222',
        from_state: null,
        to_state: 'not_a_state',
        source: 'apollo',
        occurred_at: '2026-07-16T10:05:00.000Z',
        actor: null,
      }).success,
    ).toBe(false)
  })
})

describe('contactLifecycleHistorySchema', () => {
  it('parses the current state + chronological transitions', () => {
    const history = contactLifecycleHistorySchema.parse({
      contact_id: '22222222-2222-2222-2222-222222222222',
      state: 'enrichi',
      transitions: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          contact_id: '22222222-2222-2222-2222-222222222222',
          from_state: null,
          to_state: 'identite_verifiee',
          source: 'pappers',
          occurred_at: '2026-07-16T10:00:00.000Z',
          actor: null,
        },
        {
          id: '44444444-4444-4444-4444-444444444444',
          contact_id: '22222222-2222-2222-2222-222222222222',
          from_state: 'identite_verifiee',
          to_state: 'enrichi',
          source: 'apollo',
          occurred_at: '2026-07-16T10:05:00.000Z',
          actor: null,
        },
      ],
    })
    expect(history.state).toBe('enrichi')
    expect(history.transitions).toHaveLength(2)
  })
})
