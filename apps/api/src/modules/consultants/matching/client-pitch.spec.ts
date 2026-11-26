import type { MatchNeed, MatchResult } from '@bellum/contracts'
import { clientMessageBody, clientMessageSubject, topStrengths, unprovenFromMatch } from './client-pitch'

const NEED: MatchNeed = {
  needId: '11111111-1111-4111-8111-111111111111',
  role: 'Data Engineer',
  accountName: 'EDF DSI',
  accountSector: 'énergie',
  projectSectors: [],
  skills: [],
  minYears: null,
  seniorityBand: null,
  environment: [],
  languages: [],
  clearances: [],
  location: null,
  remote: null,
  startOn: null,
  targetRateCents: null,
  contractKind: null,
}

const PROFILE = {
  displayName: 'Sophie M.',
  title: 'Data Engineer',
  availability: 'disponible le 2026-09-15',
  strengths: ['Spark', 'Python'],
  dailyRateCents: 68000,
}

describe('le message de push (D21)', () => {
  it('ne porte PAS le TJM par défaut', () => {
    const body = clientMessageBody(NEED, [PROFILE], { showRate: false, signature: null })
    expect(body).not.toContain('680')
    // Et surtout pas un « à discuter » : écrire « à discuter » invite à discuter.
    expect(body).not.toMatch(/discuter|sur demande/i)
  })

  it('le porte quand l’espace l’a décidé', () => {
    const body = clientMessageBody(NEED, [PROFILE], { showRate: true, signature: null })
    expect(body).toContain('TJM 680 €')
  })

  it('n’écrit aucun TJM quand il n’est pas renseigné, même réglage activé', () => {
    const body = clientMessageBody(NEED, [{ ...PROFILE, dailyRateCents: null }], { showRate: true, signature: null })
    expect(body).not.toContain('TJM')
  })

  it('accorde son objet au nombre de profils', () => {
    expect(clientMessageSubject(NEED, 1)).toBe('Un profil pour Data Engineer')
    expect(clientMessageSubject(NEED, 3)).toBe('3 profils pour Data Engineer')
  })

  it('ajoute la signature quand il y en a une, et rien quand il n’y en a pas', () => {
    expect(clientMessageBody(NEED, [PROFILE], { showRate: false, signature: 'Louis' })).toContain('Louis')
    const unsigned = clientMessageBody(NEED, [PROFILE], { showRate: false, signature: null })
    expect(unsigned.trimEnd().endsWith('je cale un créneau.')).toBe(true)
  })
})

function skill(over: Partial<MatchResult['skills'][number]>): MatchResult['skills'][number] {
  return {
    term: 'spark',
    label: 'Spark',
    required: true,
    status: 'matched',
    coverage: 1,
    level: 'expert',
    source: 'mission',
    proof: 'mission Orange',
    levelUnknown: false,
    ...over,
  }
}

function result(skills: MatchResult['skills']): MatchResult {
  return {
    consultantId: '22222222-2222-4222-8222-222222222222',
    axes: [],
    correspondenceScore: 80,
    pushableScore: 70,
    bucket: 'recommended',
    exclusions: [],
    skills,
    gaps: [],
    adjacency: [],
    questionsToValidate: [],
    flags: [],
  }
}

describe('ce que le dossier ne prouve pas', () => {
  it('nomme une compétence obligatoire manquante et une compétence souhaitée', () => {
    const unproven = unprovenFromMatch(
      result([
        skill({
          term: 'databricks',
          label: 'Databricks',
          required: false,
          status: 'missing',
          source: null,
          proof: null,
        }),
        skill({ term: 'flink', label: 'Flink', required: true, status: 'missing', source: null, proof: null }),
      ]),
    )
    expect(unproven).toEqual([
      { term: 'databricks', reason: 'souhaitée par le besoin — non prouvée' },
      { term: 'flink', reason: 'demandée par le besoin — non prouvée' },
    ])
  })

  it('dit qu’une compétence adjacente n’est PAS la compétence demandée', () => {
    const [entry] = unprovenFromMatch(
      result([skill({ term: 'spark streaming', label: 'Flink', status: 'adjacent', proof: null })]),
    )
    expect(entry?.reason).toContain('en approche')
  })

  it('ne mentionne rien pour une compétence prouvée', () => {
    expect(unprovenFromMatch(result([skill({})]))).toEqual([])
  })
})

describe('les trois compétences les plus fortes', () => {
  it('font passer la preuve avant la note', () => {
    const strengths = topStrengths(
      result([
        skill({ term: 'python', label: 'Python', source: 'declared', coverage: 1 }),
        skill({ term: 'spark', label: 'Spark', source: 'mission', coverage: 0.6 }),
      ]),
    )
    // Une compétence prouvée en mission passe devant une compétence mieux notée
    // mais seulement déclarée : c'est ce qui rend la synthèse défendable.
    expect(strengths[0]).toBe('Spark')
  })

  it('n’en retient que trois', () => {
    const many = ['a', 'b', 'c', 'd'].map(label => skill({ term: label, label }))
    expect(topStrengths(result(many))).toHaveLength(3)
  })
})
