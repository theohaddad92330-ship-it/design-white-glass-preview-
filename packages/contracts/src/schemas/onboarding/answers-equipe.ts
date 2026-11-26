import { z } from 'zod'

/**
 * « Qui fait quoi » — #2037.1 / #2037.3 / #2037.4 / #2037.5 / #2037.6 / #2037.11
 * (lot EE, 18/09/2026, registre `registre-2026-09-15-onboarding-questionnaire.md`).
 *
 * `sales_team_size` (`questions/equipe-commerciale.ts`) dit combien l'ESN compte
 * de commerciaux ; rien ne disait combien elle compte d'associés, de recruteurs,
 * de personnes en delivery, de marketing ou d'ops, ni COMMENT cette équipe se
 * coordonne. Six colonnes ADDITIVES, toutes des TRANCHES (décision Louis
 * 18/09 : une tranche est plus honnête qu'un chiffre faussement précis —
 * jamais un champ numérique libre).
 *
 * Ces réponses décrivent l'ENTREPRISE, pas la personne qui répond (comme
 * `sales_team_size` : le nombre de recruteurs de l'ESN n'est pas une opinion
 * personnelle) — pas de classement dans `ESN_PERSONAL_ANSWER_KEYS`.
 */

/** #2037.1 — les associés (au sens capitalistique/dirigeant), pas l'effectif. */
export const ASSOCIATES_COUNT_BAND = ['Aucun associé', '1 associé', '2-3 associés', '4 associés et plus'] as const

/** #2037.3 — les recruteurs, même style de tranche que `sales_team_size`. */
export const RECRUITERS_TEAM_SIZE_BAND = [
  'Aucun recruteur dédié',
  '1 recruteur',
  '2-3 recruteurs',
  '4-8 recruteurs',
  '8+ recruteurs',
] as const

/**
 * #2037.4 — l'effectif de la fonction delivery. DISTINCT de
 * `consultants_on_mission` (`answers-profil.ts`) : celui-ci compte les
 * consultants ACTUELLEMENT en mission, celui-là la fonction delivery dans son
 * ensemble (y compris encadrement et intercontrat).
 */
export const DELIVERY_TEAM_SIZE_BAND = [
  "Pas d'équipe delivery dédiée",
  '1-5 personnes',
  '6-15 personnes',
  '16-40 personnes',
  '40+ personnes',
] as const

/** #2037.5 — le marketing. */
export const MARKETING_TEAM_SIZE_BAND = [
  'Aucune personne dédiée au marketing',
  '1 personne (temps partiel ou plein)',
  '2-3 personnes',
  '4 personnes et plus',
] as const

/** #2037.6 — les ops (administratif, ADV, RH interne…). */
export const OPS_TEAM_SIZE_BAND = [
  'Aucune personne dédiée aux opérations',
  '1 personne',
  '2-3 personnes',
  '4 personnes et plus',
] as const

/**
 * #2037.11 — le MODE de coordination de l'équipe, distinct de `sales_routine`
 * (`profile-questionnaire.ts`) qui décrit la routine INDIVIDUELLE de la
 * personne qui répond (revue CRM, contenu LinkedIn…), pas la façon dont
 * l'équipe entière se synchronise.
 */
export const TEAM_COORDINATION_MODE = [
  'Réunion hebdomadaire formelle',
  'Échanges informels au fil de l’eau',
  'CRM ou outil partagé, sans réunion dédiée',
  'Aucune coordination formalisée',
  'Je ne sais pas',
] as const

export const EQUIPE_ANSWER_FIELDS = {
  associates_count: z.string().nullable().optional(),
  recruiters_team_size: z.string().nullable().optional(),
  delivery_team_size: z.string().nullable().optional(),
  marketing_team_size: z.string().nullable().optional(),
  ops_team_size: z.string().nullable().optional(),
  team_coordination_mode: z.string().nullable().optional(),
}
