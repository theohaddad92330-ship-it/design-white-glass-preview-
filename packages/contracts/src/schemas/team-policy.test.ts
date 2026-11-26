import { describe, expect, it } from 'vitest'
import {
  EMPTY_TEAM_POLICY,
  formatTeamPolicyMinute,
  isTeamPolicySet,
  parseTeamPolicyMinute,
  teamPolicySchema,
  updateTeamPolicySchema,
} from './team-policy.js'

const policy = {
  prospectingWindows: [{ startMinute: 540, endMinute: 660 }],
  forbiddenWindows: [{ startMinute: 720, endMinute: 840 }],
  maxMeetingsPerDay: 4,
  dailyCallTarget: 20,
}

describe('teamPolicySchema — #2770.37, la politique d’équipe saisie par le manager', () => {
  it('accepte une politique complète', () => {
    expect(teamPolicySchema.safeParse(policy).success).toBe(true)
  })

  it('accepte la politique vide — « aucune politique saisie », jamais un 0', () => {
    expect(teamPolicySchema.safeParse(EMPTY_TEAM_POLICY).success).toBe(true)
    expect(isTeamPolicySet(EMPTY_TEAM_POLICY)).toBe(false)
    expect(isTeamPolicySet(policy)).toBe(true)
    expect(isTeamPolicySet({ ...EMPTY_TEAM_POLICY, dailyCallTarget: 10 })).toBe(true)
  })

  it('refuse une plage à largeur nulle ou à l’envers', () => {
    const bad = { ...policy, forbiddenWindows: [{ startMinute: 600, endMinute: 600 }] }
    expect(teamPolicySchema.safeParse(bad).success).toBe(false)
  })

  it('refuse deux plages qui se chevauchent, même entre prospection et interdit', () => {
    const overlap = { ...policy, forbiddenWindows: [{ startMinute: 600, endMinute: 700 }] }
    expect(teamPolicySchema.safeParse(overlap).success).toBe(false)
  })

  it('refuse un plafond de réunions ou un objectif d’appels à zéro — on efface, on ne met pas 0', () => {
    expect(teamPolicySchema.safeParse({ ...policy, maxMeetingsPerDay: 0 }).success).toBe(false)
    expect(teamPolicySchema.safeParse({ ...policy, dailyCallTarget: 0 }).success).toBe(false)
  })

  it('borne le nombre de plages', () => {
    const many = Array.from({ length: 5 }, (_, index) => ({ startMinute: index * 60, endMinute: index * 60 + 30 }))
    expect(teamPolicySchema.safeParse({ ...EMPTY_TEAM_POLICY, forbiddenWindows: many }).success).toBe(false)
  })

  it('le PATCH est partiel et refuse un champ inconnu', () => {
    expect(updateTeamPolicySchema.safeParse({ dailyCallTarget: null }).success).toBe(true)
    expect(updateTeamPolicySchema.safeParse({ workspaceId: 'x' }).success).toBe(false)
  })
})

describe('heures d’une plage', () => {
  it('« HH:MM » ↔ minutes depuis minuit', () => {
    expect(parseTeamPolicyMinute('09:30')).toBe(570)
    expect(parseTeamPolicyMinute('24:00')).toBe(1440)
    expect(parseTeamPolicyMinute('25:00')).toBeNull()
    expect(parseTeamPolicyMinute('')).toBeNull()
    expect(formatTeamPolicyMinute(570)).toBe('09:30')
    expect(formatTeamPolicyMinute(1440)).toBe('24:00')
  })
})

describe('teamPolicySchema — #2770.37, le « jour » d’une plage', () => {
  const lunch = { startMinute: 720, endMinute: 840 }

  it('refuse un jour hors 1-7, un doublon, ou une liste vide (vide = chaque jour, on omet)', () => {
    const base = { ...policy, prospectingWindows: [], forbiddenWindows: [lunch] }
    for (const weekdays of [[0], [8], [2, 2], []]) {
      const bad = { ...base, forbiddenWindows: [{ ...lunch, weekdays }] }
      expect(teamPolicySchema.safeParse(bad).success).toBe(false)
    }
  })

  it('deux plages qui se recouvrent mais sur des jours différents ne se contredisent pas', () => {
    const ok = {
      ...policy,
      prospectingWindows: [{ startMinute: 600, endMinute: 700, weekdays: [1] }],
      forbiddenWindows: [{ startMinute: 600, endMinute: 700, weekdays: [2] }],
    }
    expect(teamPolicySchema.safeParse(ok).success).toBe(true)
    const clash = { ...ok, forbiddenWindows: [{ startMinute: 650, endMinute: 700, weekdays: [1, 2] }] }
    expect(teamPolicySchema.safeParse(clash).success).toBe(false)
    const everyDay = { ...ok, forbiddenWindows: [{ startMinute: 650, endMinute: 700 }] }
    expect(teamPolicySchema.safeParse(everyDay).success).toBe(false)
  })
})
