import { describe, expect, it } from 'vitest'
import {
  SEND_TIMING_MIN_ATTEMPTS,
  classifyTimingOutcome,
  computeSendTiming,
  snapDatesToRecommendedWeekday,
  sendTimingSchema,
  type SendTimingObservation,
} from './send-timing.js'

// Un mardi de septembre 2026, 10 h à Paris (UTC+2) = 08:00 UTC.
const TUESDAY_10H_PARIS = '2026-09-01T08:00:00.000Z'
// Le même jour, 15 h à Paris.
const TUESDAY_15H_PARIS = '2026-09-01T13:00:00.000Z'

function obs(overrides: Partial<SendTimingObservation> = {}): SendTimingObservation {
  return {
    channel: 'email',
    at: TUESDAY_10H_PARIS,
    contactTimezone: null,
    outcome: 'positive',
    seniority: null,
    ...overrides,
  }
}

function many(n: number, overrides: Partial<SendTimingObservation>): SendTimingObservation[] {
  return Array.from({ length: n }, () => obs(overrides))
}

describe('classifyTimingOutcome — #3264.31', () => {
  it('une réponse, même négative, est une réponse', () => {
    expect(classifyTimingOutcome('positive')).toBe('answered')
    expect(classifyTimingOutcome('declined')).toBe('answered')
    expect(classifyTimingOutcome('not_now')).toBe('answered')
  })
  it('le silence est le silence', () => {
    expect(classifyTimingOutcome('no_response')).toBe('silent')
    expect(classifyTimingOutcome('no_answer')).toBe('silent')
  })
  it("ce qui ne parle pas d'horaire sort de la mesure (mauvais contact, erreur technique…)", () => {
    for (const outcome of [
      'wrong_contact',
      'invalid_contact',
      'left_company',
      'technical_error',
      'other',
      'abandoned',
    ]) {
      expect(classifyTimingOutcome(outcome)).toBeNull()
    }
  })
})

describe('computeSendTiming — #3264.31/.32/.33', () => {
  it('ne recommande RIEN sans assez de tentatives — et le dit, jamais un créneau inventé', () => {
    const result = computeSendTiming(many(SEND_TIMING_MIN_ATTEMPTS - 1, {}), { workspaceTimezone: null })
    expect(result.channels[0]?.best).toBeNull()
    expect(result.channels[0]?.reason).toBe('not_enough_attempts')
  })

  it('recommande le créneau où les réponses arrivent, en heure LOCALE du contact', () => {
    const n = SEND_TIMING_MIN_ATTEMPTS
    const result = computeSendTiming(
      [
        ...many(n, { at: TUESDAY_10H_PARIS, outcome: 'positive' }),
        ...many(n, { at: TUESDAY_15H_PARIS, outcome: 'no_response' }),
      ],
      { workspaceTimezone: 'Europe/Paris' },
    )
    const email = result.channels.find(c => c.channel === 'email')
    expect(email?.best).toEqual({ weekday: 'tuesday', band: 'morning', answered: n, attempts: n })
    expect(email?.attempts).toBe(2 * n)
  })

  it("le fuseau du CONTACT prime : 10 h à Paris est 4 h à New York, hors plage — l'envoi n'est pas compté au matin", () => {
    const n = SEND_TIMING_MIN_ATTEMPTS
    const result = computeSendTiming(many(n, { contactTimezone: 'America/New_York' }), {
      workspaceTimezone: 'Europe/Paris',
    })
    expect(result.channels[0]?.ignored).toBe(n)
    expect(result.channels[0]?.best).toBeNull()
  })

  it('un créneau pas meilleur que la moyenne du canal ne se recommande pas', () => {
    const n = SEND_TIMING_MIN_ATTEMPTS
    const result = computeSendTiming(
      [
        ...many(n, { at: TUESDAY_10H_PARIS, outcome: 'positive' }),
        ...many(n, { at: TUESDAY_15H_PARIS, outcome: 'positive' }),
      ],
      { workspaceTimezone: 'Europe/Paris' },
    )
    expect(result.channels[0]?.best).toBeNull()
    expect(result.channels[0]?.reason).toBe('no_difference')
  })

  it('sépare les canaux', () => {
    const n = SEND_TIMING_MIN_ATTEMPTS
    const result = computeSendTiming(
      [
        ...many(n, { channel: 'phone', outcome: 'positive' }),
        ...many(n, { channel: 'phone', at: TUESDAY_15H_PARIS, outcome: 'no_answer' }),
        ...many(n, { channel: 'email', outcome: 'positive' }),
      ],
      { workspaceTimezone: 'Europe/Paris' },
    )
    expect(result.channels.map(c => c.channel).sort()).toEqual(['email', 'phone'])
    expect(result.channels.find(c => c.channel === 'phone')?.best?.band).toBe('morning')
  })

  it('filtre par persona (séniorité) : les autres personas ne pèsent pas dans la mesure', () => {
    const n = SEND_TIMING_MIN_ATTEMPTS
    const observations = [
      ...many(n, { seniority: 'director', outcome: 'positive' }),
      ...many(n, { seniority: 'director', at: TUESDAY_15H_PARIS, outcome: 'no_response' }),
      ...many(n, { seniority: 'manager', at: TUESDAY_15H_PARIS, outcome: 'positive' }),
    ]
    const director = computeSendTiming(observations, { workspaceTimezone: 'Europe/Paris', seniority: 'director' })
    expect(director.seniority).toBe('director')
    expect(director.channels[0]?.attempts).toBe(2 * n)
    expect(director.channels[0]?.best?.band).toBe('morning')
    const manager = computeSendTiming(observations, { workspaceTimezone: 'Europe/Paris', seniority: 'manager' })
    expect(manager.channels[0]?.attempts).toBe(n)
  })

  it("n'affiche jamais un pourcentage : le schéma refuse un taux", () => {
    const result = computeSendTiming(many(3, {}), { workspaceTimezone: null })
    expect(sendTimingSchema.safeParse(result).success).toBe(true)
    expect(sendTimingSchema.safeParse({ ...result, rate: 0.5 }).success).toBe(false)
    expect(JSON.stringify(result)).not.toMatch(/rate|percent|probab/i)
  })

  it('aucune observation : aucun canal, pas un zéro', () => {
    expect(computeSendTiming([], { workspaceTimezone: null }).channels).toEqual([])
  })
})

describe('snapDatesToRecommendedWeekday (#3289.29)', () => {
  // 2026-07-18 est un samedi ; 2026-07-21 un mardi ; 2026-07-24 un vendredi.
  it('recale chaque échéance sur le prochain jour recommandé, jamais plus tôt', () => {
    const out = snapDatesToRecommendedWeekday(['2026-07-18', '2026-07-21', '2026-07-24'], 'tuesday')
    expect(out).toEqual(['2026-07-21', '2026-07-28', '2026-08-04'])
    out.forEach((d, i) => expect(d >= ['2026-07-18', '2026-07-21', '2026-07-24'][i]!).toBe(true))
  })

  it('une échéance déjà sur le bon jour ne bouge pas', () => {
    expect(snapDatesToRecommendedWeekday(['2026-07-21'], 'tuesday')).toEqual(['2026-07-21'])
  })

  it("deux touches ne tombent jamais le même jour : la suivante passe à la semaine d'après", () => {
    // mercredi 22 et samedi 25 convergent tous deux vers le mardi 28.
    expect(snapDatesToRecommendedWeekday(['2026-07-22', '2026-07-25'], 'tuesday')).toEqual(['2026-07-28', '2026-08-04'])
  })

  it('aucun jour recommandé : les dates sortent inchangées (NON au recalage deviné)', () => {
    expect(snapDatesToRecommendedWeekday(['2026-07-18', '2026-07-24'], null)).toEqual(['2026-07-18', '2026-07-24'])
  })
})
