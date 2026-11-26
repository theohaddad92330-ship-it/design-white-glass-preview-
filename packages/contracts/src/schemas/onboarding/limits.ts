/**
 * Les plafonds des réponses d'onboarding, à UN seul endroit.
 *
 * Ils vivent ici et non dans `../onboarding.ts` parce que les blocs de réponses
 * les lisent : les garder dans le fichier qui IMPORTE les blocs ferait un cycle
 * d'imports, et un cycle sur un `const` n'est pas une gêne de style — c'est un
 * plantage d'initialisation au chargement du module. `../onboarding.ts` les
 * ré-exporte, donc l'API publique du paquet ne change pas.
 */

/** Max selections allowed on the grouped multi-selects (Q4 expertise, Q6 sectors). */
export const ONBOARDING_MAX_MULTI = 5

/** Max client references the Temps-2 complement collects (free text chips). */
export const TEMPS2_MAX_REFERENCES = 5

/** Plafond des questions à choix multiples du profil progressif (§21-30). */
export const PROFILE_ANSWER_MAX_MULTI = 6
