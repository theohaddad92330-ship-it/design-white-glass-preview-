import { describe, expect, it } from 'vitest'
import type { MatchRun } from '@bellum/contracts'
import { noMatchCauses } from './no-match-causes'

/**
 * #2178.1-.6 / #2178.9 — LE DIAGNOSTIC NOMMÉ D'UN ZÉRO RÉSULTAT.
 *
 * `MatchDrawer` groupait déjà les motifs d'exclusion avec leur compteur, mais
 * repliés sous « Écartés » — un bloc qu'il faut dérouler pour voir. Ce test
 * mesure une fonction PURE, séparée du rendu : elle ne doit JAMAIS inventer une
 * cause que la donnée ne porte pas (doctrine « on n'affiche pas ce qu'on n'a
 * pas ») — seulement nommer, en tête, ce que `exclusionCounts` et
 * `notEvaluable` disent déjà.
 */

function run(over: Partial<MatchRun>): MatchRun {
  return {
    runId: '44444444-4444-4444-8444-444444444444',
    need: {
      needId: '11111111-1111-4111-8111-111111111111',
      role: 'Data Engineer',
      accountName: null,
      accountSector: null,
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
    },
    weights: {
      must_have: 25,
      nice_to_have: 8,
      seniority: 10,
      sector: 8,
      environment: 7,
      language: 5,
      location: 8,
      availability: 12,
      contract_status: 4,
      rate: 7,
      evidence_quality: 4,
      client_constraints: 2,
      risks: 5,
      client_history: 3,
      comparable_experience: 0,
    },
    threshold: 60,
    evaluatedCount: 0,
    prefilteredCount: 0,
    truncated: false,
    recommended: [],
    borderline: [],
    notEvaluable: [],
    excluded: [],
    exclusionCounts: [],
    nextBestMove: null,
    feedbackLearnings: [],
    identities: [],
    createdAt: '2026-09-01T10:00:00.000Z',
    ...over,
  }
}

function excludedResult(reason: 'missing_required_skill' | 'no_skills_recorded', consultantId: string) {
  return {
    consultantId,
    axes: [],
    correspondenceScore: 0,
    pushableScore: 0,
    bucket: 'excluded' as const,
    exclusions: [{ reason, severity: 'blocking' as const, detail: 'x' }],
    skills: [],
    gaps: [],
    adjacency: [],
    questionsToValidate: [],
    flags: [],
  }
}

describe('noMatchCauses', () => {
  it('rend un tableau VIDE tant qu’au moins un profil est défendable — la question ne se pose pas', () => {
    expect(noMatchCauses(run({ recommended: [excludedResult('missing_required_skill', 'a')] }))).toEqual([])
  })

  // #2178.2/.4/.5 — chaque motif d'exclusion réel devient une cause NOMMÉE,
  // triée du plus fréquent au moins fréquent (le plus limitant en tête).
  it('nomme les motifs d’exclusion réels, triés par fréquence', () => {
    const causes = noMatchCauses(
      run({
        recommended: [],
        borderline: [],
        exclusionCounts: [
          { reason: 'rate_out_of_range', count: 2 },
          { reason: 'missing_required_skill', count: 5 },
        ],
      }),
    )
    expect(causes.map(cause => cause.reason)).toEqual(['missing_required_skill', 'rate_out_of_range'])
    expect(causes.map(cause => cause.count)).toEqual([5, 2])
  })

  // #2178.6/.9 — « données du vivier incomplètes » et « aucune preuve
  // disponible » sont, dans ce dépôt, LA MÊME réalité : un profil qui n'a pas
  // pu être évalué (`notEvaluable`, sévérité `not_evaluable`) plutôt qu'un
  // profil activement écarté (`excluded`, sévérité `blocking`/`warning`). On
  // ne fabrique PAS deux causes distinctes là où le code n'en connaît qu'une —
  // on nomme celle qui existe, comptée à part de tout écarté.
  it('compte les profils NON ÉVALUABLES séparément des écartés, même motif ou pas', () => {
    const causes = noMatchCauses(
      run({
        recommended: [],
        borderline: [],
        exclusionCounts: [{ reason: 'no_skills_recorded', count: 1 }],
        notEvaluable: [
          {
            ...excludedResult('no_skills_recorded', 'b'),
            bucket: 'not_evaluable',
            exclusions: [{ reason: 'no_skills_recorded', severity: 'not_evaluable', detail: 'aucune preuve' }],
          },
        ],
      }),
    )
    // Un profil ÉCARTÉ et un profil NON ÉVALUABLE partagent ici le même nom de
    // motif — fondre leurs comptes ferait croire à deux écartés quand un seul
    // l'est réellement, l'autre restant simplement invérifiable.
    expect(causes.filter(cause => cause.reason === 'no_skills_recorded')).toHaveLength(2)
    expect(causes.find(cause => cause.source === 'excluded')?.count).toBe(1)
    expect(causes.find(cause => cause.source === 'notEvaluable')?.count).toBe(1)
  })

  it('rend un tableau vide sur un besoin sans aucune donnée d’exclusion (rien à nommer)', () => {
    expect(noMatchCauses(run({ recommended: [], borderline: [] }))).toEqual([])
  })
})
