import { describe, expect, it } from 'vitest'
import {
  ANSWER_BRANCH_REASONS,
  ANSWER_KNOWLEDGE_BASES,
  ANSWER_STATUSES,
  answerMetaSchema,
  answerProvenanceSchema,
  answerStatusSchema,
  computeAnswerCompleteness,
  deriveAnswerProvenanceForModel,
  hasAnyConfirmedAnswer,
  PRODUCT_CONSUMER_AREAS,
  resolveAnswerBranchReason,
  resolveAnswerKnowledgeBasis,
  resolveAnswerStatus,
  type AnswerMetaMap,
} from './onboarding-answer-contract.js'
import { esnAnswersSchema, PREFILL_SOURCES, type EsnAnswers } from './onboarding.js'

const EMPTY_ANSWERS = Object.fromEntries(
  Object.keys(esnAnswersSchema.shape).map(key => [key, null]),
) as unknown as EsnAnswers

/**
 * #2006.2 → .11 — le contrat d'une réponse d'onboarding porte désormais la
 * question, sa source, sa confiance, sa date, son auteur, son statut, la
 * version du questionnaire, le motif de branchement et ses consommateurs
 * produit — pas seulement la valeur nue d'`EsnAnswers`.
 */
describe('answerStatusSchema — #2006.8 le statut', () => {
  it('porte les quatre états dans l’ordre demandé par l’issue', () => {
    expect(ANSWER_STATUSES).toEqual(['proposed', 'confirmed', 'corrected', 'unknown'])
  })

  it('refuse un cinquième état inventé', () => {
    expect(answerStatusSchema.safeParse('validated').success).toBe(false)
  })
})

describe('resolveAnswerStatus — #2006.22 la migration ne présente jamais une réponse comme confirmée', () => {
  it('rend `proposed` pour une réponse historique sans meta (avant ce lot)', () => {
    expect(resolveAnswerStatus(undefined)).toBe('proposed')
    expect(resolveAnswerStatus(null)).toBe('proposed')
  })

  it('ne rétrograde jamais un statut réellement enregistré', () => {
    expect(resolveAnswerStatus({ status: 'confirmed' })).toBe('confirmed')
    expect(resolveAnswerStatus({ status: 'corrected' })).toBe('corrected')
  })
})

describe('answerProvenanceSchema — #2006.4/.5/.6/.7 réutilise PrefillSource/PrefillConfidence', () => {
  it('accepte les quatre sources historiques de PrefillSource', () => {
    for (const source of PREFILL_SOURCES) {
      const parsed = answerProvenanceSchema.safeParse({
        source,
        confidence: 'medium',
        observedAt: null,
        actorId: null,
      })
      expect(parsed.success, `source ${source} devrait être acceptée`).toBe(true)
    }
  })

  it('#2006.4 — GA-08 : `user` et `connector` sont AJOUTÉS EN FIN, jamais retirés ni réordonnés', () => {
    expect(PREFILL_SOURCES.slice(0, 4)).toEqual(['registry', 'pappers', 'website', 'inference'])
    expect(PREFILL_SOURCES).toContain('user')
    expect(PREFILL_SOURCES).toContain('connector')
    expect(PREFILL_SOURCES.indexOf('user')).toBeGreaterThan(PREFILL_SOURCES.indexOf('inference'))
  })

  it('#2006.5 — la confiance est un palier NOMMÉ, jamais un nombre nu', () => {
    expect(
      answerProvenanceSchema.safeParse({ source: 'user', confidence: 0.8, observedAt: null, actorId: null }).success,
    ).toBe(false)
    expect(
      answerProvenanceSchema.safeParse({ source: 'user', confidence: 'high', observedAt: null, actorId: null }).success,
    ).toBe(true)
  })

  it('#2006.6 — la date peut être absente (source qui ne date pas), jamais devinée', () => {
    const parsed = answerProvenanceSchema.parse({
      source: 'inference',
      confidence: 'low',
      observedAt: null,
      actorId: null,
    })
    expect(parsed.observedAt).toBeNull()
  })

  it('#2006.7 — un auteur automatique reste `null`, jamais un id inventé', () => {
    const parsed = answerProvenanceSchema.parse({
      source: 'connector',
      confidence: 'high',
      observedAt: '2026-09-16',
      actorId: null,
    })
    expect(parsed.actorId).toBeNull()
  })
})

describe('answerMetaSchema — #2006.2/.9/.10/.11 la question, sa version, le motif, les consommateurs', () => {
  const valid = {
    question: { key: 'esn_name', label: "Nom de l'ESN", version: 1 },
    questionnaireVersion: 1,
    provenance: {
      source: 'user',
      confidence: 'high',
      observedAt: '2026-09-16',
      actorId: '11111111-1111-1111-1111-111111111111',
    },
    status: 'confirmed',
    branchReason: 'always_asked',
    consumerAreas: ['audit'],
  }

  it('accepte une enveloppe complète', () => {
    expect(answerMetaSchema.safeParse(valid).success).toBe(true)
  })

  it('#2006.10 — le motif de branchement est un des cinq réels du parcours', () => {
    expect(ANSWER_BRANCH_REASONS).toEqual([
      'always_asked',
      'company_profile',
      'personal_profile',
      'temps2_after_first_analysis',
      'business_unit_profile',
    ])
    expect(answerMetaSchema.safeParse({ ...valid, branchReason: 'because_yes' }).success).toBe(false)
  })

  it('#2006.3 — la branche BU accepte une réponse réelle, comme les autres branches', () => {
    expect(answerMetaSchema.safeParse({ ...valid, branchReason: 'business_unit_profile' }).success).toBe(true)
  })

  it('#2006.11 — les aires de consommation sont fermées à la liste mesurée', () => {
    expect(PRODUCT_CONSUMER_AREAS).toContain('audit')
    expect(answerMetaSchema.safeParse({ ...valid, consumerAreas: ['made_up_area'] }).success).toBe(false)
  })

  it('#2006.11 — une réponse sans consommateur connu le dit avec un tableau vide, jamais un mensonge', () => {
    expect(answerMetaSchema.safeParse({ ...valid, consumerAreas: [] }).success).toBe(true)
  })
})

describe('resolveAnswerKnowledgeBasis — #2063.2/.3/.4/.5 classer chaque réponse', () => {
  it('porte les six catégories dérivables d’une seule réponse, dans l’ordre écrit', () => {
    expect(ANSWER_KNOWLEDGE_BASES).toEqual([
      'declared',
      'prefilled_confirmed',
      'imported',
      'observed',
      'deduced',
      'unknown',
    ])
  })

  it('rend `unknown` sans meta, ou quand le statut lui-même est `unknown`', () => {
    expect(resolveAnswerKnowledgeBasis(null)).toBe('unknown')
    expect(resolveAnswerKnowledgeBasis(undefined)).toBe('unknown')
    expect(
      resolveAnswerKnowledgeBasis({
        status: 'unknown',
        provenance: { source: 'user', confidence: 'high', observedAt: null, actorId: null },
      }),
    ).toBe('unknown')
  })

  it('#2063.5 — source `inference` → `deduced`', () => {
    expect(
      resolveAnswerKnowledgeBasis({
        status: 'confirmed',
        provenance: { source: 'inference', confidence: 'low', observedAt: null, actorId: null },
      }),
    ).toBe('deduced')
  })

  it('#2063.3 — source `website` → `imported`', () => {
    expect(
      resolveAnswerKnowledgeBasis({
        status: 'proposed',
        provenance: { source: 'website', confidence: 'medium', observedAt: null, actorId: null },
      }),
    ).toBe('imported')
  })

  it('#2063.4 — source `connector` → `observed`', () => {
    expect(
      resolveAnswerKnowledgeBasis({
        status: 'confirmed',
        provenance: { source: 'connector', confidence: 'high', observedAt: '2026-09-20', actorId: null },
      }),
    ).toBe('observed')
  })

  it('#2063.2 — source `registry`/`pappers` CONFIRMÉE → `prefilled_confirmed`', () => {
    expect(
      resolveAnswerKnowledgeBasis({
        status: 'confirmed',
        provenance: { source: 'registry', confidence: 'high', observedAt: '2026-09-10', actorId: '1' },
      }),
    ).toBe('prefilled_confirmed')
    expect(
      resolveAnswerKnowledgeBasis({
        status: 'confirmed',
        provenance: { source: 'pappers', confidence: 'high', observedAt: '2026-09-10', actorId: '1' },
      }),
    ).toBe('prefilled_confirmed')
  })

  it('un préremplissage JAMAIS relu (`proposed`) n’est PAS confondu avec un préremplissage confirmé', () => {
    // Ce test sait dire NON : un statut `proposed` sur une source de
    // préremplissage ne doit jamais rendre `prefilled_confirmed` — la
    // confirmation, précisément, n'a pas eu lieu.
    expect(
      resolveAnswerKnowledgeBasis({
        status: 'proposed',
        provenance: { source: 'registry', confidence: 'high', observedAt: '2026-09-10', actorId: null },
      }),
    ).toBe('unknown')
  })

  it('#2063.1 (déjà là, rendu ici pour la cohérence) — source `user` → `declared`', () => {
    expect(
      resolveAnswerKnowledgeBasis({
        status: 'confirmed',
        provenance: { source: 'user', confidence: 'high', observedAt: '2026-09-20', actorId: '1' },
      }),
    ).toBe('declared')
  })
})

describe('computeAnswerCompleteness — #2007.9 la complétude transmise au moteur', () => {
  it('rend 0/total quand rien n’a été répondu', () => {
    const result = computeAnswerCompleteness(EMPTY_ANSWERS)
    expect(result.answeredCount).toBe(0)
    expect(result.totalCount).toBe(Object.keys(esnAnswersSchema.shape).length)
  })

  it('compte une clé remplie, jamais une clé vide ou nulle', () => {
    const result = computeAnswerCompleteness({ ...EMPTY_ANSWERS, esn_name: 'DataCraft', expertise_areas: ['Data'] })
    expect(result.answeredCount).toBe(2)
  })

  it('le total ne bouge jamais avec la réponse — les deux nombres voyagent ensemble', () => {
    const empty = computeAnswerCompleteness(EMPTY_ANSWERS)
    const partial = computeAnswerCompleteness({ ...EMPTY_ANSWERS, esn_name: 'DataCraft' })
    expect(partial.totalCount).toBe(empty.totalCount)
  })
})

describe('resolveAnswerBranchReason — #2006.22 le motif suit les classifications réelles du parcours', () => {
  it('rend `temps2_after_first_analysis` pour les cinq clés du complément Temps 2', () => {
    expect(resolveAnswerBranchReason('decision_maker_personas')).toBe('temps2_after_first_analysis')
    expect(resolveAnswerBranchReason('avg_sales_cycle')).toBe('temps2_after_first_analysis')
  })

  it('#2005.4 — `client_references`/`no_go_sectors` restent `temps2_after_first_analysis` malgré leur routage entreprise', () => {
    // Ces deux clés sont routées ENTREPRISE par `splitAnswersByScope`
    // (`isPersonalAnswerKey` rend `false`), mais restent posées au Temps 2 —
    // TEMPS2_ANSWER_KEYS doit primer sur la classification personnel/entreprise.
    expect(resolveAnswerBranchReason('client_references')).toBe('temps2_after_first_analysis')
    expect(resolveAnswerBranchReason('no_go_sectors')).toBe('temps2_after_first_analysis')
  })

  it('rend `personal_profile` pour une clé personnelle', () => {
    expect(resolveAnswerBranchReason('main_sales_pain')).toBe('personal_profile')
    expect(resolveAnswerBranchReason('contact_windows')).toBe('personal_profile')
  })

  it('rend `company_profile` pour une clé entreprise, y compris hors Temps 1', () => {
    expect(resolveAnswerBranchReason('esn_name')).toBe('company_profile')
    // `tooling_crm` n'est pas dans TEMPS1_REQUIRED_KEYS mais n'est pas non plus
    // personnelle : par élimination, c'est une clé entreprise du profil
    // progressif — la même règle vaut pour n'importe quelle clé d'EsnAnswers.
    expect(resolveAnswerBranchReason('tooling_crm')).toBe('company_profile')
  })

  it('ne rend jamais `always_asked` ni `business_unit_profile` — aucune clé n’est classée ainsi par un code vérifiable', () => {
    for (const key of Object.keys(esnAnswersSchema.shape) as (keyof EsnAnswers)[]) {
      const reason = resolveAnswerBranchReason(key)
      expect(reason).not.toBe('always_asked')
      expect(reason).not.toBe('business_unit_profile')
    }
  })
})

describe('hasAnyConfirmedAnswer — #2006.22 (décision Louis 20/09) le badge reste éteint tant que rien n’est confirmé', () => {
  const proposedMeta = {
    question: { key: 'esn_name', label: 'esn_name', version: 1 },
    questionnaireVersion: 1,
    provenance: { source: 'inference', confidence: 'low', observedAt: null, actorId: null },
    status: 'proposed',
    branchReason: 'company_profile',
    consumerAreas: ['audit'],
  } as const

  it('rend `false` sur une map vide — un compte migré, jamais rien de confirmé', () => {
    expect(hasAnyConfirmedAnswer({})).toBe(false)
  })

  it('rend `false` quand toutes les entrées sont `proposed` — c’est exactement l’état réfuté en production', () => {
    const map: AnswerMetaMap = { esn_name: proposedMeta, consultant_size: { ...proposedMeta, status: 'proposed' } }
    expect(hasAnyConfirmedAnswer(map)).toBe(false)
  })

  it('rend `true` dès qu’UNE clé est `confirmed`', () => {
    const map: AnswerMetaMap = { esn_name: proposedMeta, contact_windows: { ...proposedMeta, status: 'confirmed' } }
    expect(hasAnyConfirmedAnswer(map)).toBe(true)
  })

  it('rend `true` pour `corrected` — même grouping que le badge (`confirmedLike`)', () => {
    const map: AnswerMetaMap = { esn_name: { ...proposedMeta, status: 'corrected' } }
    expect(hasAnyConfirmedAnswer(map)).toBe(true)
  })
})

describe('deriveAnswerProvenanceForModel — #2007.6/#2007.7/#2007.10/#2007.12 ce que le moteur reçoit', () => {
  const userConfirmed = {
    question: { key: 'esn_name', label: 'esn_name', version: 1 },
    questionnaireVersion: 1,
    provenance: { source: 'user', confidence: 'high', observedAt: '2026-09-16', actorId: '1' },
    status: 'confirmed',
    branchReason: 'company_profile',
    consumerAreas: ['audit'],
  } as const

  const importedFromRegistry = {
    question: { key: 'target_sectors', label: 'target_sectors', version: 1 },
    questionnaireVersion: 1,
    provenance: { source: 'registry', confidence: 'high', observedAt: '2026-09-10', actorId: null },
    status: 'proposed',
    branchReason: 'company_profile',
    consumerAreas: ['audit'],
  } as const

  const correctedAfterPrefill = {
    question: { key: 'consultant_size', label: 'consultant_size', version: 1 },
    questionnaireVersion: 1,
    provenance: { source: 'user', confidence: 'high', observedAt: '2026-09-18', actorId: '1' },
    status: 'corrected',
    branchReason: 'company_profile',
    consumerAreas: ['audit'],
  } as const

  it('rend trois listes vides sur une map vide — jamais une ligne inventée pour une réponse jamais confirmée/corrigée', () => {
    expect(deriveAnswerProvenanceForModel({})).toEqual({
      answerProvenanceLines: [],
      importedContextKeys: [],
      correctedAnswersLines: [],
    })
  })

  it('#2007.6/#2007.12 — une ligne « source=…, statut=… » par réponse connue, triée par clé', () => {
    const map: AnswerMetaMap = { esn_name: userConfirmed, target_sectors: importedFromRegistry }
    expect(deriveAnswerProvenanceForModel(map).answerProvenanceLines).toEqual([
      'esn_name: source=user, statut=confirmed',
      'target_sectors: source=registry, statut=proposed',
    ])
  })

  it('#2007.7 — une clé dont la source est EXTERNE (registre, pappers, site, déduction, connecteur) est nommée « contexte importé »', () => {
    const map: AnswerMetaMap = { esn_name: userConfirmed, target_sectors: importedFromRegistry }
    expect(deriveAnswerProvenanceForModel(map).importedContextKeys).toEqual(['target_sectors'])
  })

  it('#2007.7 — une réponse tapée par l’utilisateur n’est jamais listée comme importée', () => {
    const map: AnswerMetaMap = { esn_name: userConfirmed }
    expect(deriveAnswerProvenanceForModel(map).importedContextKeys).toEqual([])
  })

  it('#2007.10 — une clé `corrected` porte sa ligne de correction, une clé `confirmed`/`proposed` n’en porte aucune', () => {
    const map: AnswerMetaMap = { esn_name: userConfirmed, consultant_size: correctedAfterPrefill }
    expect(deriveAnswerProvenanceForModel(map).correctedAnswersLines).toEqual([
      'consultant_size: corrigé le 2026-09-18',
    ])
  })
})
