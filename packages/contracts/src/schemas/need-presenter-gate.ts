import { z } from 'zod'

/**
 * #2323.18 / #2323.19-.21 / #2323.22 / #2323.23 — la porte PRÉSENTER, EN UN
 * SEUL ENDROIT (LAU-FINAL-064, § « POUR PRÉSENTER »), même correction que
 * `need-matcher-gate.ts` pour MATCHER : cinq critères existaient, chacun
 * lisible depuis un endroit différent (`contact_id`, `constraints`,
 * `budget_cents`/`target_tjm_cents`, `needHasConsultantAgreement`), sans
 * qu'aucune fonction ne les lise ENSEMBLE — rien ne pouvait dire « ce besoin
 * est présentable » ni nommer ce qu'il manque encore.
 *
 * ⚠️ Aucun des cinq n'est un NO-GO — contrairement à MATCHER (les
 * compétences), l'issue ne nomme aucun critère décisif pour PRÉSENTER. Les
 * cinq restent des SIGNAUX : doctrine UNKNOWN ≠ ZERO, une inconnue se nomme,
 * elle ne bloque jamais (#2323.29/.30/.31).
 *
 * ⚠️ L'accord de type de profil (#2323.18) fait EXCEPTION à une seule chose :
 * un refus explicite (`not_agreed`) n'est PAS une absence — c'est une réponse
 * négative reçue du client, la même distinction que `staffable-gate.ts` fait
 * entre `unknown` et `no`. Elle se nomme à part (`profileTypeDisagreement`),
 * jamais fondue dans les critères manquants — la confondre avec « pas encore
 * demandé » effacerait un vrai désaccord client.
 *
 * ⚠️ #2323.22 (le processus) reste un TEXTE LIBRE, jamais une énumération —
 * décision du 25/09/2026 (voir le registre #2323.22) : fixer À L'AVANCE le
 * nombre et le nom des étapes d'un processus de recrutement est une décision
 * produit qu'aucune spec ne donne, et l'inventer ferait la donnée fictive que
 * la doctrine interdit. Ce fichier ne lit donc jamais LE CONTENU du texte, il
 * lit seulement sa PRÉSENCE.
 */

/** #2323.18 — trois issues, même famille que `staffable-gate.ts`
 *  (`STAFFABLE_VERDICTS`) : `unknown` est une RÉPONSE (« pas encore demandé
 *  au client »), pas un défaut à combler. */
export const PROFILE_TYPE_AGREEMENTS = ['unknown', 'agreed', 'not_agreed'] as const
export const profileTypeAgreementSchema = z.enum(PROFILE_TYPE_AGREEMENTS)
export type ProfileTypeAgreement = (typeof PROFILE_TYPE_AGREEMENTS)[number]

/** Le corps de la porte dédiée `PATCH /projects/needs/:needId/profile-type-agreement`
 *  — même patron que {@link crossStaffableGateSchema}, sans motif : aucune
 *  issue de l'issue #2323 n'exige de justification pour ce geste, contrairement
 *  au refus de staffabilité (§7.6, qui produit un KPI par cause). */
export const crossProfileTypeAgreementGateSchema = z.object({
  agreement: profileTypeAgreementSchema,
})
export type CrossProfileTypeAgreementGate = z.infer<typeof crossProfileTypeAgreementGateSchema>

/** Les cinq critères SIGNAL — absents, ils se nomment, ils ne bloquent jamais. */
export const NEED_PRESENTER_ADVISORY_CRITERIA = [
  'recipient',
  'conditions',
  'budget',
  'process',
  'consultantAgreement',
  'profileTypeAgreement',
] as const
export type NeedPresenterAdvisoryCriterion = (typeof NEED_PRESENTER_ADVISORY_CRITERIA)[number]

export interface NeedPresenterGate {
  /** Ce qui n'a pas pu être lu, NOMMÉ — jamais un compte muet. */
  missingAdvisory: readonly NeedPresenterAdvisoryCriterion[]
  /** Un accord de type de profil explicitement REFUSÉ — une réponse reçue,
   *  jamais une absence. Distinct de `missingAdvisory` à dessein. */
  profileTypeDisagreement: boolean
}

/** Entrée volontairement minimale : cette porte se calcule aussi bien depuis
 *  `ProjectNeed` que depuis une projection qui porte ces mêmes champs. */
export interface NeedPresenterGateInput {
  contact_id: string | null
  constraints: string | null
  budget_cents: number | null
  target_tjm_cents: number | null
  presentation_process: string | null
  profile_type_agreement: ProfileTypeAgreement | null | undefined
  /** #2323.23 — {@link needHasConsultantAgreement} (`need-submission-gate.ts`),
   *  agrégée par l'appelant sur les positionnements du besoin : cette porte ne
   *  lit jamais `Submission[]` elle-même (GA-26, un seul endroit). */
  hasConsultantAgreement: boolean
}

export function needPresenterGate(need: NeedPresenterGateInput): NeedPresenterGate {
  const missingAdvisory: NeedPresenterAdvisoryCriterion[] = []
  if (!need.contact_id) missingAdvisory.push('recipient')
  if (!need.constraints) missingAdvisory.push('conditions')
  if (need.budget_cents == null && need.target_tjm_cents == null) missingAdvisory.push('budget')
  if (!need.presentation_process) missingAdvisory.push('process')
  if (!need.hasConsultantAgreement) missingAdvisory.push('consultantAgreement')

  const agreement = need.profile_type_agreement ?? 'unknown'
  if (agreement === 'unknown') missingAdvisory.push('profileTypeAgreement')

  return { missingAdvisory, profileTypeDisagreement: agreement === 'not_agreed' }
}
