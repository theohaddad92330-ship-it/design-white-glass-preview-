import { describe, expect, it } from 'vitest'
import {
  MEETING_BRIEF_LIMITS,
  MEETING_BRIEF_READING_BUDGET_MINUTES,
  MEETING_PREP_IMMINENT_MINUTES,
  deriveAnsweredFamilies,
  deriveMeetingBriefLimits,
  deriveMeetingBriefToVerify,
  estimateMeetingBriefReadingMinutes,
  isMeetingImminent,
} from './meeting-brief-content.js'
import {
  MEETING_BRIEF_BLOCKS,
  MEETING_BRIEF_MAX_LINES_PER_BLOCK,
  MEETING_BRIEF_QUESTION_COUNT,
  MEETING_TYPES,
  buildMeetingBrief,
  deriveMeetingObjective,
  deriveMeetingQuestions,
  deriveMeetingType,
  type MeetingBriefBlockInput,
} from './meeting-brief.js'
import { DISCOVERY_QUESTIONS } from './meeting-questions.js'
import { relationshipStateSchema } from './sales-context.js'

/**
 * #2319 — le brief d'avant rendez-vous, ce qu'il a appris : treize rubriques,
 * cinq questions, deux types de rendez-vous en plus, et la personnalisation.
 */

const sourced = { kind: 'sourced', sources: ['crm'], observedAt: '2026-09-01T00:00:00.000Z' } as const

function block(
  overrides: Partial<MeetingBriefBlockInput> & { key: MeetingBriefBlockInput['key'] },
): MeetingBriefBlockInput {
  return { lines: [`une ligne ${overrides.key}`], note: null, ground: sourced, ...overrides }
}

describe('#2319.30-.38 — les cinq rubriques ajoutées au brief', () => {
  it('ajoute les rubriques EN FIN d’énumération — un enum n’insère jamais au milieu', () => {
    expect(MEETING_BRIEF_BLOCKS.slice(0, 8)).toEqual([
      'who',
      'history',
      'moving',
      'stakes',
      'around',
      'positionable',
      'outcome',
      'objections',
    ])
    expect(MEETING_BRIEF_BLOCKS.slice(8, 13)).toEqual(['facts', 'limits', 'linked', 'risks', 'to_verify'])
    // #4424.1 — les blocs du R1, du R2 et du pitch arrivent APRÈS, jamais au milieu.
    expect(MEETING_BRIEF_BLOCKS.slice(13)).toEqual(['rex', 'workshop_proposal', 'pitch', 'r1_recap'])
  })

  it('lit les treize dans l’ordre de la spécification, pas dans l’ordre d’ajout', () => {
    const brief = buildMeetingBrief([...MEETING_BRIEF_BLOCKS.slice(0, 13)].reverse().map(key => block({ key })))
    expect(brief.map(b => b.key)).toEqual([
      'who',
      'history',
      'moving',
      'facts',
      'limits',
      'stakes',
      'around',
      'linked',
      'positionable',
      'risks',
      'objections',
      'to_verify',
      'outcome',
    ])
    expect(brief.map(b => b.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
  })
})

describe('#2319.25 — le brief tient en cinq minutes', () => {
  it('coupe un bloc trop long et DIT combien de lignes restent au dossier', () => {
    const [only] = buildMeetingBrief([block({ key: 'moving', lines: ['a b', 'c d', 'e f', 'g h', 'i j'] })])
    expect(only?.lines).toHaveLength(MEETING_BRIEF_MAX_LINES_PER_BLOCK)
    expect(only?.moreCount).toBe(5 - MEETING_BRIEF_MAX_LINES_PER_BLOCK)
  })

  it('un bloc court ne porte aucun reste', () => {
    const [only] = buildMeetingBrief([block({ key: 'who' })])
    expect(only?.moreCount).toBe(0)
  })

  it('un brief PLEIN — treize blocs au plafond et cinq questions — se lit en cinq minutes au plus', () => {
    const line = 'vingt mots '.repeat(10).trim()
    // Les treize rubriques #2319 — celles de tout brief. Les blocs #4424 ne
    // s'ajoutent qu'à un R1 ou un R2 CHOISI (REX bornés à trois, voir
    // `meeting-r1-r2.test.ts`) : un déroulé d'appel, qui allonge ce brief-là.
    const brief = buildMeetingBrief(
      MEETING_BRIEF_BLOCKS.slice(0, 13).map(key =>
        block({ key, lines: Array.from({ length: 9 }, () => line), note: line }),
      ),
    )
    const questions = Array.from({ length: MEETING_BRIEF_QUESTION_COUNT }, () => line)
    const minutes = estimateMeetingBriefReadingMinutes({ blocks: brief, questions })
    expect(minutes).toBeGreaterThan(0)
    expect(minutes).toBeLessThanOrEqual(MEETING_BRIEF_READING_BUDGET_MINUTES)
  })

  it('l’estimation sait dire NON — un texte deux fois trop long dépasse le budget', () => {
    const words = 'mot '.repeat(MEETING_BRIEF_READING_BUDGET_MINUTES * 2 * 220).trim()
    const minutes = estimateMeetingBriefReadingMinutes({
      blocks: [{ index: 1, key: 'who', lines: [words], note: null, ground: sourced, moreCount: 0 }],
      questions: [],
    })
    expect(minutes).toBeGreaterThan(MEETING_BRIEF_READING_BUDGET_MINUTES)
  })

  it('un brief vide ne se lit pas en « 0 min » : l’estimation est absente', () => {
    expect(estimateMeetingBriefReadingMinutes({ blocks: [], questions: [] })).toBeNull()
  })
})

describe('#2319.31 — les limites du brief sont nommées', () => {
  it('« pas pu lire » et « rien à lire » ne sont pas la même limite', () => {
    expect(
      deriveMeetingBriefLimits({
        activities: 'unread',
        datedSignals: 0,
        relationshipKnown: true,
        relationsKnown: true,
        bench: 'read',
        linked: 'read',
      }),
    ).toEqual(['history_unread', 'no_dated_signal'])
  })

  it('rend une liste vide quand tout a été lu — aucune limite inventée', () => {
    expect(
      deriveMeetingBriefLimits({
        activities: 'read',
        datedSignals: 2,
        relationshipKnown: true,
        relationsKnown: true,
        bench: 'read',
        linked: 'read',
      }),
    ).toEqual([])
  })

  it('nomme chaque trou, dans l’ordre déclaré', () => {
    expect(
      deriveMeetingBriefLimits({
        activities: 'unread',
        datedSignals: null,
        relationshipKnown: false,
        relationsKnown: false,
        bench: 'unread',
        linked: 'unread',
      }),
    ).toEqual([...MEETING_BRIEF_LIMITS])
  })
})

describe('#2319.38 — ce qui reste à vérifier', () => {
  it('rend les rôles LUS, les blocs déduits et le type de rendez-vous inconnu', () => {
    expect(
      deriveMeetingBriefToVerify({
        probableRoles: [{ name: 'Inès Morel', role: 'economic' }],
        blocks: [
          { key: 'stakes', ground: { kind: 'inferred' } },
          { key: 'who', ground: sourced },
          { key: 'around', ground: { ...sourced, kind: 'mixed', probable: ['influence'] } },
        ],
        meetingTypeKnown: false,
      }),
    ).toEqual([
      { kind: 'probable_role', name: 'Inès Morel', role: 'economic' },
      { kind: 'inferred_block', block: 'stakes' },
      { kind: 'inferred_block', block: 'around' },
      { kind: 'meeting_type' },
    ])
  })

  it('un brief entièrement sourcé n’a rien à vérifier — et ne s’invente pas de doute', () => {
    expect(
      deriveMeetingBriefToVerify({
        probableRoles: [],
        blocks: [{ key: 'who', ground: sourced }],
        meetingTypeKnown: true,
      }),
    ).toEqual([])
  })

  it('ne se cite pas lui-même : le bloc « à vérifier » n’entre pas dans sa propre liste', () => {
    expect(
      deriveMeetingBriefToVerify({
        probableRoles: [],
        blocks: [{ key: 'to_verify', ground: { kind: 'inferred' } }],
        meetingTypeKnown: true,
      }),
    ).toEqual([])
  })
})

describe('#2319.35 — cinq questions', () => {
  it('le brief en porte CINQ', () => {
    expect(MEETING_BRIEF_QUESTION_COUNT).toBe(5)
    expect(deriveMeetingQuestions({ meetingType: 'first_contact' })).toHaveLength(5)
  })

  it('toutes viennent de la banque — aucune n’est rédigée ici', () => {
    const bank = new Set(Object.values(DISCOVERY_QUESTIONS).flat())
    for (const question of deriveMeetingQuestions({ meetingType: 'qualification' })) {
      expect(bank.has(question), question).toBe(true)
    }
  })
})

describe('#2319.42-.45 — le brief se personnalise', () => {
  it('.42 — le RÔLE de la personne en face passe en premier : un décideur budgétaire entend parler budget', () => {
    const neutral = deriveMeetingQuestions({ meetingType: 'first_contact' })
    const economic = deriveMeetingQuestions({ meetingType: 'first_contact', attendeeRole: 'economic' })
    expect(economic[0]).toBe(DISCOVERY_QUESTIONS.budget_timing_urgency[0])
    expect(economic).not.toEqual(neutral)
  })

  it('.42 — un rôle inconnu ne change rien', () => {
    expect(deriveMeetingQuestions({ meetingType: 'first_contact', attendeeRole: 'unknown' })).toEqual(
      deriveMeetingQuestions({ meetingType: 'first_contact' }),
    )
  })

  it('.43 — l’objectif choisi change les questions : une qualification ne se prépare pas comme des achats', () => {
    expect(deriveMeetingQuestions({ meetingType: 'qualification' })).not.toEqual(
      deriveMeetingQuestions({ meetingType: 'procurement' }),
    )
  })

  it('.44 — une offre connue ajoute la question qui la relie au projet', () => {
    const without = deriveMeetingQuestions({ meetingType: 'procurement' })
    const withOffer = deriveMeetingQuestions({ meetingType: 'procurement', offerDomain: 'esn_it' })
    expect(without).not.toContain(DISCOVERY_QUESTIONS.project_mission[0])
    expect(withOffer).toContain(DISCOVERY_QUESTIONS.project_mission[0])
  })

  it('.44 — une offre générique n’ajoute rien : elle ne dit pas quoi relier', () => {
    expect(deriveMeetingQuestions({ meetingType: 'procurement', offerDomain: 'generic' })).toEqual(
      deriveMeetingQuestions({ meetingType: 'procurement' }),
    )
  })

  it('.45 — ce que l’utilisateur tient déjà n’est pas redemandé', () => {
    expect(deriveAnsweredFamilies({ exchangesOnAccount: 3, linkedKinds: ['need'] })).toEqual([
      'context',
      'project_mission',
    ])
    const answered = deriveAnsweredFamilies({ exchangesOnAccount: 3, linkedKinds: [] })
    expect(deriveMeetingQuestions({ meetingType: 'first_contact', answeredFamilies: answered })).not.toContain(
      DISCOVERY_QUESTIONS.context[0],
    )
  })

  it('.45 — un historique ILLISIBLE n’est pas un historique vide : rien n’est tenu pour su', () => {
    expect(deriveAnsweredFamilies({ exchangesOnAccount: null, linkedKinds: null })).toEqual([])
    expect(deriveAnsweredFamilies({ exchangesOnAccount: 0, linkedKinds: [] })).toEqual([])
  })

  it('un point interne reste sans question, quel que soit le rôle ou l’offre', () => {
    expect(
      deriveMeetingQuestions({ meetingType: 'internal_meeting', attendeeRole: 'economic', offerDomain: 'esn_it' }),
    ).toEqual([])
  })
})

describe('#2319.48 / .51 — Qualification et Achats', () => {
  it('sont déclarés EN FIN de liste', () => {
    // #4424.1 — R1 et R2 les suivent, ajoutés après eux (GA-08).
    expect(MEETING_TYPES.slice(8, 10)).toEqual(['qualification', 'procurement'])
  })

  it('ne se DÉRIVENT jamais d’un état de relation — ils se choisissent', () => {
    for (const relationship of relationshipStateSchema.options) {
      const type = deriveMeetingType({ hasExternalAttendee: true, relationship })
      expect(type === 'qualification' || type === 'procurement', relationship).toBe(false)
    }
  })

  it('Qualification → préciser problème, budget, timing et décision', () => {
    expect(deriveMeetingObjective({ meetingType: 'qualification' })).toEqual({
      stance: 'qualify_not_assume',
      outcomes: ['clarify_problem', 'clarify_budget_timing', 'confirm_decision_path'],
    })
  })

  it('Achats → circuit et conditions', () => {
    expect(deriveMeetingObjective({ meetingType: 'procurement' })).toEqual({
      stance: 'secure_not_concede',
      outcomes: ['map_purchasing_circuit', 'clarify_conditions'],
    })
  })
})

describe('#2319.21 — le brief proposé à T-1 h', () => {
  const now = new Date('2026-09-17T10:00:00.000Z')

  it('l’horizon vaut une heure', () => {
    expect(MEETING_PREP_IMMINENT_MINUTES).toBe(60)
  })

  it('un rendez-vous dans 30 min est imminent ; dans 90 min, il ne l’est pas', () => {
    expect(isMeetingImminent('2026-09-17T10:30:00.000Z', now)).toBe(true)
    expect(isMeetingImminent('2026-09-17T11:30:00.000Z', now)).toBe(false)
  })

  it('un rendez-vous commencé, sans date ou illisible n’est pas imminent', () => {
    expect(isMeetingImminent('2026-09-17T09:30:00.000Z', now)).toBe(false)
    expect(isMeetingImminent(null, now)).toBe(false)
    expect(isMeetingImminent('pas une date', now)).toBe(false)
  })
})

describe('#4424.2 — une phrase ne se répète pas d’un bloc à l’autre', () => {
  it('la ligne déjà lue dans un bloc précédent (ordre de lecture) disparaît des suivants, casse et ponctuation ignorées', () => {
    const brief = buildMeetingBrief([
      block({ key: 'pitch', lines: ['Industrialiser le dédouanement.', 'Un autre angle'] }),
      block({ key: 'rex', lines: ['industrialiser le dédouanement', 'Un REX précis'] }),
      block({ key: 'workshop_proposal', lines: ['Industrialiser le dédouanement !'] }),
    ])
    expect(brief.map(b => [b.key, b.lines])).toEqual([
      ['pitch', ['Industrialiser le dédouanement.', 'Un autre angle']],
      ['rex', ['Un REX précis']],
    ])
  })

  it('sait dire NON : deux lignes différentes restent, et un doublon DANS un bloc n’est compté qu’une fois', () => {
    const brief = buildMeetingBrief([block({ key: 'who', lines: ['a b', 'a b', 'c d'] })])
    expect(brief[0]?.lines).toEqual(['a b', 'c d'])
    expect(brief[0]?.moreCount).toBe(0)
  })
})
