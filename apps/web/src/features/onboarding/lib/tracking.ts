/**
 * #2085 — les identifiants de mesure du parcours d'onboarding (questionnaire
 * Temps 1), partagés entre `OnboardingWizard.tsx`, `useOnboardingNavigation.ts`
 * et `SubStepQuestions.tsx`.
 *
 * ⚠️ Un seul endroit, à dessein : `trackActionStarted` et `trackActionCompleted`
 * ne se rejoignent (`product-tracker.ts`, `actionKey`) que si l'ACTION et
 * l'ÉCRAN sont des chaînes IDENTIQUES à l'émission des deux — une constante
 * recopiée dans deux fichiers est exactement l'endroit où un lot suivant
 * change l'une des deux copies et casse l'appariement sans qu'aucun test ne le
 * voie (l'écran a bien un test de contenu, mais rien ne compare les DEUX
 * fichiers entre eux).
 *
 * `ONBOARDING_QUESTION_SCREEN` reprend le motif de route du catalogue
 * (`product-screens-catalog.ts`, `@bellum/contracts`) : `/onboarding/$id/$stage/$slug`.
 */
export const ONBOARDING_QUESTION_SCREEN = '/onboarding/$id/$stage/$slug'

/** #2085.7 — le motif de route de l'écran de génération dédié (catalogue :
 *  `product-screens-catalog.ts`), pour `trackOnboardingAuditGenerated`. */
export const ONBOARDING_GENERATING_SCREEN = '/onboarding/$id/generating'

/** #2085.6 — le motif de route de l'écran de relecture (catalogue :
 *  `product-screens-catalog.ts`), pour `trackContradictionResolved`. */
export const ONBOARDING_REVIEW_SCREEN = '/onboarding/$id/review'

/** Le NOM du geste, jamais sa cible — même règle que le reste du traceur. */
export const ONBOARDING_QUESTIONNAIRE_ACTION = 'onboarding_questionnaire'

/** #2085 — le motif de route de la page 0 (`product-screens-catalog.ts`). */
export const ONBOARDING_WELCOME_SCREEN = '/onboarding'

/**
 * #2022.8 — LA REPRISE EST UN GESTE À PART, pas un second départ.
 *
 * Émettre `ONBOARDING_QUESTIONNAIRE_ACTION` une deuxième fois sur une reprise
 * casserait le couple `action_started` / `action_completed` du traceur
 * (`product-tracker.ts`, `actionKey`) : deux départs pour une arrivée, et le
 * taux de complétion du questionnaire se mettrait à mentir sur tout le monde.
 * La reprise a donc son propre nom d'action, et le « taux de reprise » se lit
 * au-dessus du plancher de 5 sessions distinctes, comme toute autre métrique.
 *
 * ⚠️ Ce qui sort reste un NOM DE GESTE et un MOTIF DE ROUTE. Rien sur la
 * personne, rien sur ce qu'elle a répondu, rien sur son espace.
 */
export const ONBOARDING_RESUME_ACTION = 'onboarding_resume'

/** #2085.18 — codes d'erreur FERMÉS, jamais le message brut d'exception (qui
 *  peut porter un fragment de réponse serveur, donc potentiellement du
 *  contenu). */
export const ONBOARDING_CONTINUE_ERROR_CODE = 'onboarding_continue_failed'
export const ONBOARDING_BACK_ERROR_CODE = 'onboarding_back_failed'
