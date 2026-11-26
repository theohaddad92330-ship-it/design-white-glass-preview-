import type { MatchCandidate, MatchNeed } from '@bellum/contracts'
import { evaluateCandidate, rankMatches, weightedScore } from './engine'

/**
 * #2176.13 — l'axe « Expérience comparable », VISIBLE à POIDS 0 (arbitrage
 * Louis, 31/10/2026) : il se lit, il ne déplace ni un score ni un rang.
 */
const NOW = new Date('2026-09-01T09:00:00Z')

const NEED: MatchNeed = {
  needId: '11111111-1111-4111-8111-111111111111',
  role: 'Data Engineer',
  accountName: 'EDF DSI',
  accountSector: 'énergie',
  projectSectors: [],
  skills: [
    { term: 'spark', label: 'Spark', required: true, level: null },
    { term: 'python', label: 'Python', required: true, level: null },
    { term: 'databricks', label: 'Databricks', required: false, level: null },
  ],
  minYears: null,
  seniorityBand: null,
  environment: [],
  languages: [],
  clearances: [],
  location: 'Paris',
  remote: 'hybrid',
  startOn: '2026-09-15',
  targetRateCents: 62000,
  contractKind: 'regie',
}

function candidate(id: string, overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    consultantId: id,
    skills: [
      { term: 'spark', label: 'Spark', level: 'expert', source: 'mission', proof: 'mission Orange, 18 mois' },
      { term: 'python', label: 'Python', level: 'confirme', source: 'cv', proof: 'CV' },
    ],
    yearsExperience: 7,
    seniorityBand: 'senior',
    sectors: ['énergie'],
    environment: [],
    languages: [],
    clearances: [],
    zones: ['Paris'],
    remote: 'hybrid',
    contractKind: 'cdi',
    dailyRateCents: 62000,
    freeFrom: '2026-09-01',
    derivedAvailability: 'available',
    declaredAvailability: 'immediate',
    availabilityCheckedAt: '2026-08-25T09:00:00Z',
    consentState: 'valid',
    clientHistoryFlag: null,
    clientHistoryReason: null,
    clientHistoryAt: null,
    clientHistoryRecoverable: false,
    onMissionAtClient: false,
    activeSubmissionsElsewhere: 0,
    preferenceWarnings: [],
    ...overrides,
  }
}

const axisOf = (result: ReturnType<typeof evaluateCandidate>) =>
  result.axes.find(axis => axis.axis === 'comparable_experience')

describe('#2176.13 — axe « Expérience comparable »', () => {
  it('se voit dans le résultat, à poids 0, avec la part des obligatoires prouvées EN MISSION', () => {
    const axis = axisOf(evaluateCandidate(NEED, candidate('22222222-2222-4222-8222-222222222222'), { now: NOW }))
    expect(axis).toBeDefined()
    expect(axis?.weight).toBe(0)
    expect(axis?.score).toBe(50)
    expect(axis?.detail).toContain('Spark')
    expect(axis?.evidence).toEqual([{ label: 'Spark — mission Orange, 18 mois', source: 'mission' }])
  })

  it('reste NON ÉVALUABLE et nommé (jamais 0) quand aucune mission passée n’est renseignée', () => {
    const noMission = candidate('33333333-3333-4333-8333-333333333333', {
      skills: [
        { term: 'spark', label: 'Spark', level: 'expert', source: 'cv', proof: 'CV' },
        { term: 'python', label: 'Python', level: 'confirme', source: 'cv', proof: 'CV' },
      ],
    })
    const axis = axisOf(evaluateCandidate(NEED, noMission, { now: NOW }))
    expect(axis?.score).toBeNull()
    expect(axis?.detail).toMatch(/aucune mission/)
  })

  it('reste NON ÉVALUABLE quand le besoin ne nomme aucune compétence obligatoire', () => {
    const loose = { ...NEED, skills: NEED.skills.map(skill => ({ ...skill, required: false })) }
    const axis = axisOf(evaluateCandidate(loose, candidate('22222222-2222-4222-8222-222222222222'), { now: NOW }))
    expect(axis?.score).toBeNull()
    expect(axis?.detail).toMatch(/obligatoire/)
  })

  it('ne bouge ni le score ni le rang : la correspondance est celle des quatorze autres axes', () => {
    // Profil qui prouve Spark ET Python en mission (axe à 100) mais dont
    // d'autres axes sont sous 100 (TJM au-dessus de la cible) : avec un poids
    // non nul, l'axe REMONTERAIT la correspondance. À poids 0, elle est
    // exactement celle calculée sans lui.
    const proven = candidate('44444444-4444-4444-8444-444444444444', {
      dailyRateCents: 70000,
      skills: [
        { term: 'spark', label: 'Spark', level: 'expert', source: 'mission', proof: 'mission A' },
        { term: 'python', label: 'Python', level: 'expert', source: 'mission', proof: 'mission B' },
      ],
    })
    const result = evaluateCandidate(NEED, proven, { now: NOW })
    expect(axisOf(result)?.score).toBe(100)
    expect(result.correspondenceScore).toBeLessThan(100)
    const withoutAxis = result.axes.filter(axis => axis.axis !== 'comparable_experience')
    expect(result.correspondenceScore).toBe(weightedScore(withoutAxis))

    // Le rang : l'ordre rendu est celui des scores SANS l'axe.
    const pool = [
      proven,
      candidate('55555555-5555-4555-8555-555555555555'),
      candidate('66666666-6666-4666-8666-666666666666', { skills: proven.skills, sectors: [] }),
    ]
    const ranked = rankMatches(NEED, pool, { now: NOW })
    const expected = [...ranked]
      .map(entry => ({
        id: entry.consultantId,
        pushable: entry.pushableScore,
        score: weightedScore(entry.axes.filter(axis => axis.axis !== 'comparable_experience')),
      }))
      .sort((a, b) => b.pushable - a.pushable || b.score - a.score || a.id.localeCompare(b.id))
      .map(entry => entry.id)
    expect(ranked.map(entry => entry.consultantId)).toEqual(expected)
  })

  it('reste à 0 même quand un espace tente de lui donner du poids', () => {
    const result = evaluateCandidate(NEED, candidate('22222222-2222-4222-8222-222222222222'), {
      now: NOW,
      weights: { comparable_experience: 50 },
    })
    expect(axisOf(result)?.weight).toBe(0)
  })
})
