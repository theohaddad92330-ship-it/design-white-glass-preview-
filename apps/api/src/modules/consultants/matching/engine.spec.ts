import type { MatchCandidate, MatchNeed } from '@bellum/contracts'
import { evaluateCandidate, rankMatches, weightedScore } from './engine'
import { prefilter, PREFILTER_ABOVE } from './prefilter'

const NOW = new Date('2026-09-01T09:00:00Z')

const NEED: MatchNeed = {
  needId: '11111111-1111-4111-8111-111111111111',
  role: 'Data Engineer',
  accountName: 'EDF DSI',
  accountSector: 'énergie',
  projectSectors: [],
  skills: [
    { term: 'spark', label: 'Spark', required: true, level: 'confirmé' },
    { term: 'python', label: 'Python', required: true, level: null },
    { term: 'databricks', label: 'Databricks', required: false, level: null },
  ],
  minYears: 5,
  seniorityBand: 'senior',
  environment: ['airflow'],
  languages: [],
  clearances: [],
  location: 'Paris',
  remote: 'hybrid',
  startOn: '2026-09-15',
  targetRateCents: 62000,
  contractKind: 'regie',
}

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    consultantId: '22222222-2222-4222-8222-222222222222',
    skills: [
      { term: 'spark', label: 'Spark', level: 'expert', source: 'mission', proof: 'mission Orange, 18 mois' },
      { term: 'python', label: 'Python', level: 'confirme', source: 'cv', proof: 'CV' },
    ],
    yearsExperience: 7,
    seniorityBand: 'senior',
    sectors: ['banque'],
    environment: ['airflow', 'kafka'],
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

describe('les six tests obligatoires du ticket BEL-MTC-301', () => {
  it('T1 — une compétence déclarée sans preuve rend l’axe 1 partiel, et le dit', () => {
    const declared = candidate({
      skills: [
        { term: 'spark', label: 'Spark', level: 'confirme', source: 'declared', proof: null },
        { term: 'python', label: 'Python', level: 'confirme', source: 'declared', proof: null },
      ],
    })
    const result = evaluateCandidate(NEED, declared, { now: NOW })
    const axis = result.axes.find(item => item.axis === 'must_have')
    expect(axis?.score).toBeGreaterThan(0)
    expect(axis?.score).toBeLessThan(100)
    expect(result.skills.filter(skill => skill.required).every(skill => skill.source === 'declared')).toBe(true)
    const quality = result.axes.find(item => item.axis === 'evidence_quality')
    expect(quality?.detail).toContain('aucune compétence prouvée')
  })

  it('T2 — les profils écartés se groupent par motif, avec des compteurs exacts', () => {
    const vivier = [
      candidate({ consultantId: id(1), skills: [] }),
      candidate({
        consultantId: id(2),
        skills: [{ term: 'go', label: 'Go', level: 'expert', source: 'mission', proof: 'x' }],
      }),
      candidate({
        consultantId: id(3),
        skills: [{ term: 'rust', label: 'Rust', level: 'expert', source: 'mission', proof: 'x' }],
      }),
      candidate({ consultantId: id(4), consentState: 'expired' }),
    ]
    const ranked = rankMatches(NEED, vivier, { now: NOW })
    const counts = new Map<string, number>()
    for (const result of ranked) {
      for (const exclusion of result.exclusions) {
        counts.set(exclusion.reason, (counts.get(exclusion.reason) ?? 0) + 1)
      }
    }
    expect(counts.get('missing_required_skill')).toBe(3)
    expect(counts.get('consent_expired')).toBe(1)
    expect(counts.get('no_skills_recorded')).toBe(1)
    // Aucun profil n'est écarté sans code : c'est l'exigence de conformité du §4.1.
    for (const result of ranked) {
      if (result.bucket === 'excluded') expect(result.exclusions.length).toBeGreaterThan(0)
    }
  })

  it('T3 — un profil sans affectation ni disponibilité connue va dans « non évaluables », PAS dans « écartés »', () => {
    const unknown = candidate({ derivedAvailability: 'unknown', declaredAvailability: 'inconnu', freeFrom: null })
    const result = evaluateCandidate(NEED, unknown, { now: NOW })
    expect(result.axes.find(item => item.axis === 'availability')?.score).toBeNull()
    expect(result.bucket).toBe('not_evaluable')
  })

  it('T4 — profil parfait mais indisponible : correspondance haute, poussable bas', () => {
    const busy = candidate({ derivedAvailability: 'busy_open_ended', freeFrom: null })
    const result = evaluateCandidate(NEED, busy, { now: NOW })
    expect(result.correspondenceScore).toBeGreaterThanOrEqual(60)
    expect(result.pushableScore).toBeLessThan(result.correspondenceScore)
    // Les deux ne se fondent jamais : c'est là toute l'information utile.
    expect(result.pushableScore).not.toBe(result.correspondenceScore)
  })

  it('T5 — deux exécutions identiques rendent un classement identique', () => {
    const vivier = [
      candidate({ consultantId: id(1) }),
      candidate({ consultantId: id(2) }),
      candidate({ consultantId: id(3) }),
    ]
    const first = rankMatches(NEED, vivier, { now: NOW }).map(result => result.consultantId)
    const second = rankMatches(NEED, [...vivier].reverse(), { now: NOW }).map(result => result.consultantId)
    expect(second).toEqual(first)
  })

  it('T6 — sans finance:read, l’axe TJM ne nomme ni coût ni marge', () => {
    const withFinance = evaluateCandidate(NEED, candidate(), { now: NOW, canReadFinance: true })
    const without = evaluateCandidate(NEED, candidate(), { now: NOW, canReadFinance: false })
    const axis = without.axes.find(item => item.axis === 'rate')
    expect(axis?.detail).not.toMatch(/€/)
    expect(withFinance.axes.find(item => item.axis === 'rate')?.detail).toMatch(/€/)
    // Le score, lui, reste le même : masquer un montant ne change pas l'adéquation.
    expect(axis?.score).toBe(withFinance.axes.find(item => item.axis === 'rate')?.score)
  })
})

describe('les quatre blocs', () => {
  it('recommande un profil complet et disponible', () => {
    expect(evaluateCandidate(NEED, candidate(), { now: NOW }).bucket).toBe('recommended')
  })

  it('place en « limites » un profil bloqué dont la correspondance reste bonne', () => {
    const late = candidate({ freeFrom: '2026-12-01', derivedAvailability: 'busy' })
    const result = evaluateCandidate(NEED, late, { now: NOW })
    expect(result.bucket).toBe('borderline')
    expect(result.exclusions.map(item => item.reason)).not.toContain('consent_expired')
  })

  it('écarte un profil sans aucune des compétences obligatoires', () => {
    const off = candidate({
      skills: [{ term: 'cobol', label: 'COBOL', level: 'expert', source: 'mission', proof: 'x' }],
    })
    const result = evaluateCandidate(NEED, off, { now: NOW })
    expect(result.bucket).toBe('excluded')
    expect(result.exclusions.some(item => item.reason === 'missing_required_skill')).toBe(true)
  })

  it('range un profil sans compétence saisie en « non évaluables », avec son motif', () => {
    const empty = candidate({ skills: [] })
    const result = evaluateCandidate(NEED, empty, { now: NOW })
    expect(result.bucket).toBe('not_evaluable')
    expect(result.exclusions.some(item => item.reason === 'no_skills_recorded')).toBe(true)
  })
})

describe('adjacence, manques et questions', () => {
  // #4433.8 (recette 23/10) — l'adjacence COMPTE (partiellement), sans jamais valoir « trouvée » : un must-have
  // adjacent reste un manque nommé (exclusion), mais l'axe ne tombe plus à 0 quand le profil est voisin.
  it('#4433.8 — une compétence adjacente (même famille) compte partiellement, sans jamais être « matched »', () => {
    const near = candidate({
      skills: [{ term: 'angular', label: 'Angular', level: 'expert', source: 'mission', proof: 'x' }],
    })
    const result = evaluateCandidate(
      { ...NEED, skills: [{ term: 'react', label: 'React', required: true, level: null }] },
      near,
      { now: NOW },
    )
    const react = result.skills.find(skill => skill.term === 'react')
    expect(react?.status).toBe('adjacent')
    expect(react?.coverage).toBeGreaterThan(0)
    expect(react?.coverage).toBeLessThan(0.5)
    expect(result.axes.find(item => item.axis === 'must_have')?.score).toBeGreaterThan(0)
    expect(result.exclusions.some(item => item.reason === 'missing_required_skill')).toBe(true)
    expect(result.adjacency).toEqual(['Angular présent, react demandé'])
  })

  it('signale une compétence proche sans jamais la compter', () => {
    const near = candidate({
      skills: [
        { term: 'spark streaming', label: 'Spark Streaming', level: 'expert', source: 'mission', proof: 'x' },
        { term: 'python', label: 'Python', level: 'expert', source: 'mission', proof: 'x' },
      ],
    })
    const result = evaluateCandidate(
      { ...NEED, skills: [{ term: 'flink', label: 'Flink', required: true, level: null }] },
      near,
      {
        now: NOW,
      },
    )
    const flink = result.skills.find(skill => skill.term === 'flink')
    expect(flink?.status).not.toBe('matched')
    expect(flink?.coverage).toBe(0)
  })

  it('transforme un niveau non évalué en QUESTION, pas en pénalité', () => {
    const unknownLevel = candidate({
      skills: [
        { term: 'spark', label: 'Spark', level: 'inconnu', source: 'mission', proof: 'mission Orange' },
        { term: 'python', label: 'Python', level: 'inconnu', source: 'mission', proof: 'mission Orange' },
      ],
    })
    const result = evaluateCandidate(NEED, unknownLevel, { now: NOW })
    expect(result.questionsToValidate).toContain('niveau réel sur Spark')
    expect(result.axes.find(item => item.axis === 'must_have')?.score).toBe(100)
  })

  it('affiche le libellé ÉCRIT et non le canonique', () => {
    const written = candidate({
      skills: [
        { term: 'sql', label: 'PostgreSQL', level: 'expert', source: 'mission', proof: 'x' },
        { term: 'python', label: 'Python', level: 'expert', source: 'mission', proof: 'x' },
      ],
    })
    const result = evaluateCandidate(
      { ...NEED, skills: [{ term: 'sql', label: 'SQL', required: true, level: null }] },
      written,
      {
        now: NOW,
      },
    )
    expect(result.skills[0]?.label).toBe('PostgreSQL')
  })

  it('nomme les manques, repris tels quels par le dossier de compétences', () => {
    const result = evaluateCandidate(NEED, candidate(), { now: NOW })
    expect(result.gaps.some(gap => gap.startsWith('databricks'))).toBe(true)
  })

  it('#2328.24 (second volet) — une compétence must-have seulement extraite ne compte JAMAIS comme matched', () => {
    const inferredSpark = candidate({
      skills: [
        { term: 'spark', label: 'Spark', level: 'inconnu', source: 'derived', proof: null, inferred: true },
        { term: 'python', label: 'Python', level: 'confirme', source: 'mission', proof: 'mission Orange' },
      ],
    })
    const result = evaluateCandidate(NEED, inferredSpark, { now: NOW })
    const spark = result.skills.find(skill => skill.term === 'spark')
    expect(spark?.status).toBe('unverified')
    expect(spark?.coverage).toBe(0)
    // Un seul must-have sur deux réellement couvert (python) : jamais 100.
    expect(result.axes.find(item => item.axis === 'must_have')?.score).toBe(45)
  })

  it('#2328.24 — une compétence extraite sur un NICE-to-have reste comptée (la règle ne vise que le must-have)', () => {
    const inferredDatabricks = candidate({
      skills: [
        { term: 'databricks', label: 'Databricks', level: 'inconnu', source: 'derived', proof: null, inferred: true },
      ],
    })
    const result = evaluateCandidate(NEED, inferredDatabricks, { now: NOW })
    const databricks = result.skills.find(skill => skill.term === 'databricks')
    expect(databricks?.status).toBe('matched')
  })
})

describe('l’axe risks (#2176.21) — signaux gradués, jamais un binaire', () => {
  it('note 100 un profil sans aucun signal en cours', () => {
    const result = evaluateCandidate(NEED, candidate(), { now: NOW })
    const risks = result.axes.find(item => item.axis === 'risks')
    expect(risks?.score).toBe(100)
    expect(risks?.detail).toBe('aucun signal de risque en cours')
  })

  it('n’est jamais null — les signaux viennent du profil seul, jamais du besoin', () => {
    const result = evaluateCandidate(NEED, candidate(), { now: NOW })
    expect(result.axes.find(item => item.axis === 'risks')?.score).not.toBeNull()
  })

  it('descend sur un consentement bientôt échu, sans devenir bloquant', () => {
    const result = evaluateCandidate(NEED, candidate({ consentState: 'expiring' }), { now: NOW })
    const risks = result.axes.find(item => item.axis === 'risks')
    expect(risks?.score).toBe(85)
    expect(risks?.detail).toContain('consentement bientôt échu')
  })

  it('descend davantage sur une absence totale de consentement', () => {
    const result = evaluateCandidate(NEED, candidate({ consentState: 'none' }), { now: NOW })
    expect(result.axes.find(item => item.axis === 'risks')?.score).toBe(75)
  })

  it('descend sur une disponibilité non revalidée depuis plus de 60 jours', () => {
    const stale = candidate({ availabilityCheckedAt: '2026-06-01T09:00:00Z' })
    const result = evaluateCandidate(NEED, stale, { now: NOW })
    const risks = result.axes.find(item => item.axis === 'risks')
    expect(risks?.score).toBe(85)
    expect(risks?.detail).toContain('disponibilité non revalidée')
  })

  it('descend, plafonné, avec des positionnements concurrents en cours', () => {
    const result = evaluateCandidate(NEED, candidate({ activeSubmissionsElsewhere: 5 }), { now: NOW })
    const risks = result.axes.find(item => item.axis === 'risks')
    expect(risks?.score).toBe(70) // 100 - min(30, 5*10)
    expect(risks?.detail).toContain('5 positionnement(s) en cours ailleurs')
  })

  it('cumule les signaux sans jamais rendre un score négatif', () => {
    const result = evaluateCandidate(
      NEED,
      candidate({
        consentState: 'none',
        availabilityCheckedAt: '2026-01-01T09:00:00Z',
        activeSubmissionsElsewhere: 5,
        preferenceWarnings: ['ne veut plus de déplacement'],
      }),
      { now: NOW },
    )
    const risks = result.axes.find(item => item.axis === 'risks')
    expect(risks?.score).toBe(20) // 100 - 25 (none) - 15 (stale) - 30 (5 positionnements, plafonné) - 10 (1 préférence)
    expect(risks?.detail).toContain('aucun consentement recueilli')
    expect(risks?.detail).toContain('ne veut plus de déplacement')
  })

  it('reste DISTINCT de client_constraints — un refus client ne pèse pas ici', () => {
    const result = evaluateCandidate(NEED, candidate({ clientHistoryFlag: 'rejected' }), { now: NOW })
    const risks = result.axes.find(item => item.axis === 'risks')
    const constraints = result.axes.find(item => item.axis === 'client_constraints')
    expect(risks?.score).toBe(100)
    expect(constraints?.score).toBe(0)
  })
})

describe('weightedScore', () => {
  it('sort un axe non évaluable du dénominateur au lieu de le compter zéro', () => {
    const withNull = weightedScore([
      { axis: 'must_have', score: 100, weight: 25, detail: '', evidence: [] },
      { axis: 'language', score: null, weight: 5, detail: '', evidence: [] },
    ])
    expect(withNull).toBe(100)
  })

  it('rend zéro quand aucun axe n’est évaluable, sans diviser par zéro', () => {
    expect(weightedScore([{ axis: 'language', score: null, weight: 5, detail: '', evidence: [] }])).toBe(0)
  })
})

describe('pré-filtrage', () => {
  it('laisse passer tout le monde tant que le vivier reste lisible', () => {
    const small = Array.from({ length: 10 }, (_, index) => candidate({ consultantId: id(index + 1) }))
    expect(prefilter(NEED, small).dropped).toEqual([])
  })

  it('écarte au-delà du seuil, toujours AVEC un code de motif', () => {
    const large = Array.from({ length: PREFILTER_ABOVE + 5 }, (_, index) =>
      candidate({
        consultantId: id(index + 1),
        skills: [{ term: 'cobol', label: 'COBOL', level: 'expert', source: 'mission', proof: 'x' }],
      }),
    )
    const outcome = prefilter(NEED, large)
    expect(outcome.dropped.length).toBe(large.length)
    expect(outcome.dropped.every(verdict => verdict.reason === 'missing_required_skill')).toBe(true)
    expect(outcome.dropped.every(verdict => verdict.detail.length > 0)).toBe(true)
  })
})

function id(n: number): string {
  return `3333333${n % 10}-3333-4333-8333-33333333333${n % 10}`.slice(0, 36)
}
