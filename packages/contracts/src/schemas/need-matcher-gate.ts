/**
 * #2323.13 / #2323.14-.17 / #2323.30 / #2323.47 — la porte MATCHER, EN UN SEUL
 * ENDROIT (LAU-FINAL-064, § « POUR MATCHER »).
 *
 * ⚠️ CE QUE CE FICHIER CORRIGE — trois écrans, une même règle recopiée.
 * `ProjectNeedsPanel`, `NeedDetailPage` et `OpenNeedsTable` désactivaient
 * chacun le bouton « Lancer le matching » avec leur propre
 * `need.skills.length === 0` : trois vérités qui auraient divergé au premier
 * réglage (garde GA-26, « un réglage vit à un seul endroit »).
 *
 * Le § MATCHER de l'issue liste CINQ critères minimum (travail à réaliser,
 * compétences indispensables, séniorité, localisation ou mode de travail,
 * timing). Seul un est DÉCISIF : sans compétence, un matching ne compare rien
 * et rend une liste vide qui se lit « aucun profil disponible » — c'est le
 * NO-GO explicite de l'issue (#2323.47). « Travail à réaliser » (#2323.13) est
 * structurellement acquis : `title` est obligatoire dès la création
 * (`createProjectNeedSchema`), aucun besoin persisté n'en manque.
 *
 * Les trois autres (#2323.14/.15/.16/.17 — séniorité, localisation/mode,
 * timing) restent des SIGNAUX, jamais des portes : doctrine UNKNOWN ≠ ZERO,
 * « une inconnue réduit la confiance, produit une question, ne rend jamais
 * automatiquement le besoin mauvais » (#2323.29/.30/.31). Les bloquer
 * referait exactement l'erreur que la doctrine interdit — décliner un besoin
 * réel parce qu'un champ optionnel n'a pas encore été renseigné.
 */

/** Les critères SIGNAL — absents, ils se nomment, ils ne bloquent jamais. */
export const NEED_MATCHER_ADVISORY_CRITERIA = ['seniority', 'locationOrRemote', 'timing'] as const
export type NeedMatcherAdvisoryCriterion = (typeof NEED_MATCHER_ADVISORY_CRITERIA)[number]

export interface NeedMatcherGate {
  /** Le SEUL critère décisif : au moins une compétence renseignée. */
  canLaunch: boolean
  /** Ce qui n'a pas pu être lu, NOMMÉ — jamais un compte muet. */
  missingAdvisory: readonly NeedMatcherAdvisoryCriterion[]
}

/**
 * Entrée volontairement minimale (pas `ProjectNeed` entier) : cette porte se
 * calcule aussi bien depuis `ProjectNeed` que depuis la projection `OpenNeedRow`
 * — les deux portent ces mêmes champs.
 */
export interface NeedMatcherGateInput {
  skills: readonly { term: string }[]
  seniority: string | null
  location: string | null
  remote?: string | null
  start_on: string | null
}

export function needMatcherGate(need: NeedMatcherGateInput): NeedMatcherGate {
  const missingAdvisory: NeedMatcherAdvisoryCriterion[] = []
  if (!need.seniority) missingAdvisory.push('seniority')
  if (!need.location && !need.remote) missingAdvisory.push('locationOrRemote')
  if (!need.start_on) missingAdvisory.push('timing')
  return { canLaunch: need.skills.length > 0, missingAdvisory }
}
