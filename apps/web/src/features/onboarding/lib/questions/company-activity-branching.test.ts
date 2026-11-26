import { describe, expect, it } from 'vitest'
import type { EsnAnswers } from '@bellum/contracts'
import { firstPendingSubStep } from '@/features/onboarding/lib/pending-steps'
import { ESN_ACTIVITY_IN_CREATION, hasNoCommercialHistory } from './maturite'
import { TEMPS1_QUESTION_KEYS, TEMPS1_STAGES, TEMPS1_SUBSTEPS, stageQuestions } from './index'
import { questionsMatchingConditions } from './visibility'

/**
 * #2548.1 — Ludovic (call bêta 17/09) : « zéro client, zéro mission, aucun
 * consultant en poste », et le questionnaire lui posait quand même des
 * questions qui supposent un passé commercial. `esn_maturity_situation`
 * (`maturite.ts`) porte le signal « activité en création » ; les sous-étapes
 * qui supposent un historique le lisent via `when` (`hasNoCommercialHistory`)
 * pour ne plus jamais être POSÉES à ce profil.
 *
 * Trois choses à prouver, même patron que `adaptive-branching.test.ts`
 * (#2023.5) : le mécanisme sait dire NON, il LIT un corpus non vide, et il
 * n'attrape pas ce qu'il ne vise pas.
 */

const LIST_KEYS: readonly string[] = ['expertise_areas', 'target_sectors', 'target_company_types', 'geo_zones']

function answers(over: Partial<EsnAnswers> = {}): EsnAnswers {
  const blank = Object.fromEntries(TEMPS1_QUESTION_KEYS.map(key => [key, LIST_KEYS.includes(key) ? [] : null]))
  return { ...blank, ...over } as EsnAnswers
}

const ALL_QUESTIONS = TEMPS1_STAGES.flatMap(stageQuestions)

// Une des questions retirées de chacune des huit sous-étapes concernées —
// pas les 30, mais assez pour prouver que le mécanisme couvre bien chacune.
const SAMPLE_HIDDEN_KEYS = [
  'active_clients_band',
  'revenue_recurrence',
  'client_concentration_risk',
  'client_base_missions_ongoing_band',
  'client_base_rex_band',
  'client_base_followup_regularity',
  'client_base_followup_owner',
  'case_study_results',
  'client_testimonials',
] as const

describe('#2548.1 — une activité en création n’a pas de passé commercial à décrire', () => {
  it('hasNoCommercialHistory sait dire NON : faux pour toute autre situation, y compris absente', () => {
    expect(hasNoCommercialHistory(answers())).toBe(false)
    expect(hasNoCommercialHistory(answers({ esn_maturity_situation: 'Premiers clients' }))).toBe(false)
    expect(hasNoCommercialHistory(answers({ esn_maturity_situation: ESN_ACTIVITY_IN_CREATION }))).toBe(true)
  })

  it('LIT un corpus non vide : au moins treize questions réelles portent cette condition', () => {
    const branchees = ALL_QUESTIONS.filter(q => typeof q.when === 'function')
    for (const key of SAMPLE_HIDDEN_KEYS) {
      expect(
        branchees.map(q => q.key),
        `"${key}" devrait être branchée`,
      ).toContain(key)
    }
  })

  it('sait dire NON : les questions supposant un passé disparaissent pour une activité en création', () => {
    const enCreation = answers({ esn_maturity_situation: ESN_ACTIVITY_IN_CREATION })
    for (const key of SAMPLE_HIDDEN_KEYS) {
      const question = ALL_QUESTIONS.find(q => q.key === key)
      expect(question, `question "${key}" introuvable`).toBeDefined()
      expect(questionsMatchingConditions([question!], enCreation), `"${key}" devrait être masquée`).toHaveLength(0)
    }
  })

  it('LE TÉMOIN — les mêmes questions restent posées à une activité qui a déjà des clients', () => {
    const premiersClients = answers({ esn_maturity_situation: 'Premiers clients' })
    for (const key of SAMPLE_HIDDEN_KEYS) {
      const question = ALL_QUESTIONS.find(q => q.key === key)!
      expect(questionsMatchingConditions([question], premiersClients), `"${key}" devrait rester posée`).toHaveLength(1)
    }
    // Et une question SANS condition n'est jamais masquée par ce mécanisme.
    const sansCondition = ALL_QUESTIONS.filter(q => q.when === undefined)
    expect(sansCondition.length).toBeGreaterThan(50)
    expect(
      questionsMatchingConditions(sansCondition, answers({ esn_maturity_situation: ESN_ACTIVITY_IN_CREATION })),
    ).toHaveLength(sansCondition.length)
  })

  it('une sous-étape entièrement masquée ne bloque pas la reprise (elle n’est pas « en attente »)', () => {
    // Toutes les questions répondues SAUF le bloc `base-clients-*` et
    // `esn_maturity_situation` (qui décide justement le branchement).
    const hiddenSlugs = new Set([
      'base-clients-activite',
      'base-clients-capitalisation',
      'base-clients-suivi',
      'sante-activite',
      'credibilite-preuves',
    ])
    const hiddenKeys = new Set(
      TEMPS1_SUBSTEPS.filter(s => hiddenSlugs.has(s.slug)).flatMap(s => s.questions.map(q => q.key)),
    )
    const tout = Object.fromEntries(
      TEMPS1_QUESTION_KEYS.filter(k => k !== 'esn_maturity_situation' && !hiddenKeys.has(k)).map(key => [
        key,
        LIST_KEYS.includes(key) ? ['rempli'] : 'rempli',
      ]),
    ) as Partial<EsnAnswers>
    const complet = answers({ ...tout, esn_maturity_situation: ESN_ACTIVITY_IN_CREATION })
    expect(firstPendingSubStep(complet, [])).toBeNull()
  })
})

/**
 * #2548.2 (#2027.1 — décision Louis 17/09 au soir) : les questions de
 * CHIFFRES portent le choix « inconnu / non applicable ». `available_consultants_band`
 * l'avait déjà (#2035.9) ; ce lot l'étend au panier visé et au TJM du vivier.
 * `consultants_managed_by_user_band` (effectif-reel.ts) reste HORS de cette
 * liste à dessein — sa question a déjà un zéro honnête (« Aucun consultant
 * géré directement »), et `effectif-reel` rend les deux questions sur le
 * même écran (`SubStepQuestions.test.tsx`).
 */
// Théo O onboarding-couverture.R3 (22/10/2026) — V23 : « vivier accessible dès la création ; historique de société non requis ».
describe('V23 — le vivier est posé dès la création, historique de société non requis', () => {
  const VIVIER_KEYS = ALL_QUESTIONS.filter(q => q.key.startsWith('talent_pool_')).map(q => q.key)

  it('LIT un corpus non vide : les quatorze questions du vivier', () => {
    expect(VIVIER_KEYS).toHaveLength(14)
  })

  it('aucune n’est masquée pour une activité en création', () => {
    const enCreation = answers({ esn_maturity_situation: ESN_ACTIVITY_IN_CREATION })
    for (const key of VIVIER_KEYS) {
      const question = ALL_QUESTIONS.find(q => q.key === key)!
      expect(question.when, `"${key}" ne doit plus porter de condition d'historique`).toBeUndefined()
      expect(questionsMatchingConditions([question], enCreation), `"${key}" doit rester posée`).toHaveLength(1)
    }
  })
})

describe('#2548.2 — les questions de chiffres portent les quatre états d’incertitude', () => {
  it.each(['ideal_client_min_deal_size', 'talent_pool_avg_tjm_band'])('"%s" porte allowUnknown', key => {
    const question = ALL_QUESTIONS.find(q => q.key === key)
    expect(question, `question "${key}" introuvable`).toBeDefined()
    expect(question!.allowUnknown).toBe(true)
  })

  it('consultants_managed_by_user_band ne porte PAS allowUnknown — il a déjà son zéro honnête', () => {
    const question = ALL_QUESTIONS.find(q => q.key === 'consultants_managed_by_user_band')
    expect(question?.allowUnknown).toBeUndefined()
  })
})

/**
 * #2548.3 — même patron que #2539 (`offre-prestations.ts`) : un terme de
 * notre vocabulaire s'explique là où il est demandé, via `exampleKey`
 * (#2087.9, choix COURT en carte).
 */
describe('#2548.3 — le vocabulaire métier est expliqué', () => {
  it('« Plusieurs agences / BU » et « transformation d’un modèle existant » portent un exampleKey', () => {
    const question = ALL_QUESTIONS.find(q => q.key === 'esn_maturity_situation')
    expect(question).toBeDefined()
    expect(question!.kind).toBe('single')
    const choices = question!.kind === 'single' ? question!.choices : []
    const bu = choices.find(c => c.value === 'Plusieurs agences / BU')
    const transformation = choices.find(c => c.value === "Transformation d'un modèle existant")
    expect(bu?.exampleKey).toBe('questions.esnMaturitySituationChoices.buExample')
    expect(transformation?.exampleKey).toBe('questions.esnMaturitySituationChoices.transformationExample')
  })
})
