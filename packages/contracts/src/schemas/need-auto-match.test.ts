import { describe, expect, it } from 'vitest'
import { routineKeySchema } from './routines.js'
import {
  AUTO_NEED_MATCH_DAILY_CAP,
  NEED_AUTO_MATCH_ROUTINE_KEY,
  NEED_AUTO_MATCH_STATUSES,
  needAutoMatchArrivalStatus,
  needAutoMatchSchema,
} from './need-auto-match.js'

const WITH_SKILLS = { skills: [{ term: 'Kubernetes' }], seniority: null, location: null, start_on: null }
const WITHOUT_SKILLS = { skills: [], seniority: 'senior', location: 'Paris', start_on: '2026-11-01' }

describe('#2916 / #2399.2 — matching automatique d’un besoin entrant (c93)', () => {
  it('la routine est une clé RÉELLE du catalogue — jamais une chaîne libre', () => {
    expect(routineKeySchema.options).toContain(NEED_AUTO_MATCH_ROUTINE_KEY)
  })

  it('un délai dépassé a son propre statut — un timeout n’est pas un échec', () => {
    expect(NEED_AUTO_MATCH_STATUSES).toContain('unknown')
    expect(NEED_AUTO_MATCH_STATUSES).toContain('failed')
  })

  it('le plafond quotidien est un nombre ÉCRIT et positif', () => {
    expect(Number.isInteger(AUTO_NEED_MATCH_DAILY_CAP)).toBe(true)
    expect(AUTO_NEED_MATCH_DAILY_CAP).toBeGreaterThan(0)
  })

  it('OUI — un besoin avec compétence, sous le plafond, part en file', () => {
    expect(needAutoMatchArrivalStatus(WITH_SKILLS, 0)).toBe('queued')
    expect(needAutoMatchArrivalStatus(WITH_SKILLS, AUTO_NEED_MATCH_DAILY_CAP - 1)).toBe('queued')
  })

  it('NON — sans compétence, même règle que le bouton « Lancer le matching » (needMatcherGate)', () => {
    expect(needAutoMatchArrivalStatus(WITHOUT_SKILLS, 0)).toBe('no_criteria')
  })

  it('NON — le plafond atteint ne lance rien, et le dit', () => {
    expect(needAutoMatchArrivalStatus(WITH_SKILLS, AUTO_NEED_MATCH_DAILY_CAP)).toBe('capped')
  })

  it('le contrat refuse un compteur négatif et accepte un résultat encore inconnu (null)', () => {
    const base = {
      status: 'unknown' as const,
      runId: null,
      launchedAt: '2026-10-11T08:00:00.000Z',
      settledAt: null,
      evaluatedCount: null,
      recommendedCount: null,
      borderlineCount: null,
    }
    expect(needAutoMatchSchema.safeParse(base).success).toBe(true)
    expect(needAutoMatchSchema.safeParse({ ...base, recommendedCount: -1 }).success).toBe(false)
  })
})
