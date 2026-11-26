import { describe, expect, it } from 'vitest'
import { DEFAULT_QUESTION_CONTEXT } from '@bellum/contracts'
import en from '@/i18n/locales/en/onboarding.json'
import fr from '@/i18n/locales/fr/onboarding.json'
import { buildProfileSteps } from './profile-questions'

/**
 * #2053.6 — « Expliquer pourquoi », phrase EXACTE de l'issue.
 *
 * `target_margin` (profil progressif, bloc `offer`) est la question la plus
 * proche de « marge par consultant » (#2053.1, déjà une question réelle et
 * atteignable via `ProfileQuestionnaireDialog`). L'issue #2053 exige que la
 * raison d'être des questions financières soit dite avec CETTE phrase, pas une
 * paraphrase : « Cela permet à BellumAI de recommander le bon nombre de
 * dossiers actifs et de ne pas confondre volume et rentabilité. » — reprise
 * mot pour mot, `BellumAI` remplacé par `{{brand}}` (nos fournisseurs et notre
 * propre nom ne s'écrivent jamais en dur dans un libellé, même convention que
 * toutes les autres phrases de ce fichier, ex. `intros.offer` ci-dessus).
 */
describe('#2053.6 — la question de marge porte la phrase exacte de l’issue', () => {
  it('FR : le sous-titre de `target_margin` reprend le texte mot pour mot', () => {
    const items = fr.profileQuestions.items as Record<string, { label: string; subtitle: string }>
    expect(items.target_margin.subtitle).toBe(
      'Cela permet à {{brand}} de recommander le bon nombre de dossiers actifs et de ne pas confondre volume et rentabilité.',
    )
  })

  it('EN : un sous-titre traduit existe (pas un texte vide, pas la clé brute)', () => {
    const items = en.profileQuestions.items as Record<string, { label: string; subtitle: string }>
    expect(items.target_margin.subtitle).toBeTruthy()
    expect(items.target_margin.subtitle).not.toBe('profileQuestions.items.target_margin.subtitle')
  })
})

/**
 * #2018.5 — « demander les outils personnels autorisés ET les notifications ».
 *
 * `tooling` (les outils personnels utilisés) est déjà une question du
 * catalogue, déjà classée PERSONNELLE (`onboarding.ts`, `PROFILE_PERSONAL_ANSWER_KEYS`).
 * Ce qui manquait était la demande de notifications — hors `EsnAnswers`
 * (elle vit dans `notification_preferences`, pas `esn_profiles`), donc hors du
 * catalogue partagé : une étape à part, juste avant la synthèse, jamais une
 * clé `EsnAnswers` de plus qui dupliquerait la donnée (GA-26).
 */
describe('#2018.5 — une étape « notifications » juste avant la synthèse', () => {
  it('le parcours se termine par notifications puis summary, dans cet ordre', () => {
    const steps = buildProfileSteps({}, DEFAULT_QUESTION_CONTEXT)
    const last = steps.at(-1)
    const beforeLast = steps.at(-2)
    expect(last).toEqual({ kind: 'summary' })
    expect(beforeLast).toEqual({ kind: 'notifications' })
  })

  it('une seule étape notifications, quelles que soient les réponses déjà données', () => {
    const steps = buildProfileSteps({ user_role: 'Business Manager', tooling: ['Gmail'] }, DEFAULT_QUESTION_CONTEXT)
    expect(steps.filter(step => step.kind === 'notifications')).toHaveLength(1)
  })
})
