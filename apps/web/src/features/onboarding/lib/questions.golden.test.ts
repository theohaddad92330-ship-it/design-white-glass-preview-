import { describe, expect, it } from 'vitest'
import { ESN_ANSWER_OPTIONS, PROFILE_QUESTION_OPTIONS } from '@bellum/contracts'
import { TEMPS1_STAGES, type Question } from '@/features/onboarding/lib/questions'

/**
 * GOLDEN — anti-drift guard between the UI's choice catalog (`questions.ts`)
 * and the contract's closed value catalog (`ESN_ANSWER_OPTIONS`).
 *
 * Why it matters: the prefill pipeline validates its proposals against
 * `ESN_ANSWER_OPTIONS` server-side. If the two lists drift, the prefill can
 * propose a value the wizard cannot display (an invisible "answer" the user can
 * never see nor un-select), or the UI can offer a value the prefill will never
 * produce. Both are silent — hence this test.
 *
 * Out of scope by design: questions whose choices carry a `labelKey` (machine
 * codes such as `offer_domain`, whose values are enum codes owned by their own
 * contract enum, not free-text French labels).
 *
 * #2018.2 / #2018.4 — `user_role`, `role_tenure`, `industry_tenure`,
 * `individual_goal`, `monthly_target` are PERSONAL keys, not company facts:
 * the prefill can never guess them (same reasoning as `TEMPS2_ANSWER_OPTIONS`,
 * "deliberately NOT merged into `ESN_ANSWER_OPTIONS`", `onboarding.ts:358`).
 * `onboarding.ts` cannot import `PROFILE_QUESTION_OPTIONS`
 * (`profile-questionnaire.ts` already imports the other way — a cycle), so
 * they stay out of `ESN_ANSWER_OPTIONS` and are checked against
 * `PROFILE_QUESTION_OPTIONS` instead, by the same reciprocal logic: the
 * wizard's Temps-1 `role`/`goals` stages ask the SAME question the progressive
 * profile already asks (a second entry point, not a second catalog).
 */
const PERSONAL_KEYS_VALIDATED_AGAINST_PROFILE_QUESTIONS = [
  'user_role',
  'role_tenure',
  'industry_tenure',
  'individual_goal',
  'monthly_target',
  // #2018.3 — le portefeuille, posé dans la même étape `role`.
  'portfolio_size',
  // #2058.2 / #2058.10 — les moments acceptés et le niveau de détail,
  // posés par `preferences-echanges.ts` (sous-étape de `role`) en réutilisant
  // verbatim le catalogue du profil progressif — même raison que ci-dessus.
  'contact_windows',
  'detail_level',
] as const satisfies readonly (keyof typeof PROFILE_QUESTION_OPTIONS)[]

const personalKeySet = new Set<string>(PERSONAL_KEYS_VALIDATED_AGAINST_PROFILE_QUESTIONS)

type CatalogKey = keyof typeof ESN_ANSWER_OPTIONS

const ALL_QUESTIONS: Question[] = TEMPS1_STAGES.flatMap(stage => stage.steps.flatMap(step => step.questions))

/** Every value the wizard can display for a question, groups flattened. */
function choiceValues(question: Question): string[] {
  if (question.kind === 'multi-grouped') return question.groups.flatMap(group => group.choices.map(c => c.value))
  if (question.kind === 'single' || question.kind === 'multi') return question.choices.map(c => c.value)
  return []
}

/** A choice question whose values are verbatim persisted French labels (i.e.
 *  everything but the machine-coded `labelKey` questions). */
function isCatalogQuestion(question: Question): boolean {
  if (question.kind === 'text') return false
  return choiceValues(question).length > 0 && !hasLabelKeys(question)
}

function hasLabelKeys(question: Question): boolean {
  if (question.kind === 'multi-grouped') return question.groups.some(g => g.choices.some(c => c.labelKey != null))
  if (question.kind === 'single' || question.kind === 'multi') return question.choices.some(c => c.labelKey != null)
  return false
}

const catalogKeys = Object.keys(ESN_ANSWER_OPTIONS) as CatalogKey[]

describe('questions.ts ↔ ESN_ANSWER_OPTIONS (golden)', () => {
  it('covers every contract key with exactly one wizard question', () => {
    for (const key of catalogKeys) {
      const matching = ALL_QUESTIONS.filter(q => q.key === key)
      expect(matching, `no wizard question for contract key "${key}"`).toHaveLength(1)
    }
  })

  it.each(catalogKeys)('question "%s" offers exactly the contract values, in order', key => {
    const question = ALL_QUESTIONS.find(q => q.key === key)
    expect(question, `missing question ${key}`).toBeDefined()
    expect(choiceValues(question as Question)).toEqual([...ESN_ANSWER_OPTIONS[key]])
  })

  it('never offers a choice value the contract does not know (reciprocal)', () => {
    const unknown: string[] = []
    for (const question of ALL_QUESTIONS.filter(isCatalogQuestion)) {
      if (personalKeySet.has(question.key)) continue // checked against PROFILE_QUESTION_OPTIONS below
      const allowed = new Set<string>(ESN_ANSWER_OPTIONS[question.key as CatalogKey] ?? [])
      for (const value of choiceValues(question)) {
        if (!allowed.has(value)) unknown.push(`${question.key}: ${value}`)
      }
    }
    expect(unknown, 'choice values missing from ESN_ANSWER_OPTIONS').toEqual([])
  })

  it('has no choice question outside the contract catalog', () => {
    const orphans = ALL_QUESTIONS.filter(isCatalogQuestion)
      .map(q => q.key)
      .filter(key => !(catalogKeys as string[]).includes(key) && !personalKeySet.has(key))
    expect(orphans, 'questions with verbatim choices absent from ESN_ANSWER_OPTIONS').toEqual([])
  })
})

describe('questions.ts ↔ PROFILE_QUESTION_OPTIONS (golden — #2018.2 / #2018.4 personal keys)', () => {
  it.each(PERSONAL_KEYS_VALIDATED_AGAINST_PROFILE_QUESTIONS)(
    'question "%s" offers exactly the progressive profile\'s values, in order',
    key => {
      const question = ALL_QUESTIONS.find(q => q.key === key)
      expect(question, `missing wizard question ${key}`).toBeDefined()
      expect(choiceValues(question as Question)).toEqual([...PROFILE_QUESTION_OPTIONS[key]])
    },
  )

  it('sait dire NON : une valeur ajoutée ici sans l’ajouter au catalogue partagé fait rougir le test au-dessus', () => {
    const question = ALL_QUESTIONS.find(q => q.key === 'user_role') as Question & { kind: 'single' }
    const tampered = { ...question, choices: [...question.choices, { value: 'Valeur inventée' }] }
    expect(choiceValues(tampered)).not.toEqual([...PROFILE_QUESTION_OPTIONS.user_role])
  })
})
