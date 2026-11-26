import { z } from 'zod'

/**
 * #3390 — LE MOTEUR DE CHOIX DE MÉTHODE COMMERCIALE, commun à Laura et aux
 * pages produit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER FERME
 * ─────────────────────────────────────────────────────────────────────────
 * La recette bêta du 30/09 pointait `/projects/needs` : la carte « un besoin
 * est ouvert depuis plus de cinq jours… » (`briefing-actions.ts`, #2107.3) ne
 * nommait qu'un FAIT (l'âge du besoin), jamais une méthode — et la recherche
 * sémantique de Laura restait donc seule responsable du choix des mots. Ce
 * fichier ne remplace ni le verdict GO/NO-GO (`need-verdict.ts`, #3389) ni la
 * recherche sémantique : il lit le PREMIER pour produire la méthode, AVANT
 * qu'un message ne soit composé — la seconde reste libre d'illustrer, jamais
 * de décider.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AUCUNE DONNÉE INVENTÉE, MÊME DISCIPLINE QUE `need-verdict.ts`
 * ─────────────────────────────────────────────────────────────────────────
 * L'entrée est un CONTEXTE déjà mesuré ailleurs — les états d'axes du verdict
 * (`relationshipState`, `accessState`, `staffingState`) et un fait binaire
 * (`stale`) fourni par l'appelant à partir de SON propre seuil (GA-26 : le
 * seuil « cinq jours » vit dans `briefing-actions.ts`, il ne se recopie pas
 * ici). Aucun nom, aucune photo, aucun critère protégé ne traverse ce fichier
 * — `usefulPeople` ne nomme que des RÔLES, jamais une personne.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HUIT CHAMPS, TOUJOURS LES HUIT — jamais un score, jamais une probabilité
 * ─────────────────────────────────────────────────────────────────────────
 * Chaque combinaison rend les huit champs demandés par l'issue : le niveau
 * d'effort et l'action suivante sont toujours tranchés (une méthode est une
 * décision, pas une mesure) ; la route d'ouverture et la trajectoire sont
 * `null` exactement quand elles n'ont plus de sens (`pause_sortie` — on ne
 * choisit pas de porte d'entrée pour un dossier qu'on arrête).
 */

export const COMMERCIAL_EFFORT_LEVELS = [
  'focus',
  'sprint_court',
  'qualification_volume',
  'partenaire_rang2',
  'veille',
  'pause_sortie',
] as const
export type CommercialEffortLevel = (typeof COMMERCIAL_EFFORT_LEVELS)[number]

export const COMMERCIAL_OPENING_ROUTES = ['reactivation_chaude', 'approche_directe_ciblee', 'partenaire_rang2'] as const
export type CommercialOpeningRoute = (typeof COMMERCIAL_OPENING_ROUTES)[number]

export const COMMERCIAL_TRAJECTORIES = [
  'par_le_haut',
  'par_le_terrain',
  'manager_intermediaire',
  'parallele_relais_sponsor',
] as const
export type CommercialMethodTrajectory = (typeof COMMERCIAL_TRAJECTORIES)[number]

/** Des RÔLES, jamais une personne — même garde que `needAccessAxis` (aucun nom,
 *  aucune photo, aucun critère protégé ne voyage). */
export const COMMERCIAL_USEFUL_PEOPLE = ['decision_maker', 'current_contact'] as const
export type CommercialUsefulPerson = (typeof COMMERCIAL_USEFUL_PEOPLE)[number]

export const COMMERCIAL_METHOD_PROOFS = ['qualification', 'shortlist', 'client_agreement'] as const
export type CommercialMethodProof = (typeof COMMERCIAL_METHOD_PROOFS)[number]

export const COMMERCIAL_METHOD_ACTIONS = ['qualify', 'build_shortlist', 'widen_sourcing', 'reconsider'] as const
export type CommercialMethodAction = (typeof COMMERCIAL_METHOD_ACTIONS)[number]

export const COMMERCIAL_METHOD_CONDITIONS = [
  'on_qualification_complete',
  'on_shortlist_ready',
  'on_verdict_no_go',
  'on_client_silence',
  'on_human_reopens',
  'already_met',
] as const
export type CommercialMethodCondition = (typeof COMMERCIAL_METHOD_CONDITIONS)[number]

export const commercialMethodChoiceSchema = z.object({
  effortLevel: z.enum(COMMERCIAL_EFFORT_LEVELS),
  /** `null` uniquement pour `pause_sortie` : il n'y a plus de porte d'entrée
   *  à choisir sur un dossier qu'on arrête. */
  openingRoute: z.enum(COMMERCIAL_OPENING_ROUTES).nullable(),
  trajectory: z.enum(COMMERCIAL_TRAJECTORIES).nullable(),
  usefulPeople: z.array(z.enum(COMMERCIAL_USEFUL_PEOPLE)),
  requiredProof: z.enum(COMMERCIAL_METHOD_PROOFS).nullable(),
  nextStep: z.enum(COMMERCIAL_METHOD_ACTIONS),
  switchCondition: z.enum(COMMERCIAL_METHOD_CONDITIONS),
  stopCondition: z.enum(COMMERCIAL_METHOD_CONDITIONS),
})
export type CommercialMethodChoice = z.infer<typeof commercialMethodChoiceSchema>

/**
 * Le contexte, entièrement dérivé d'un `NeedVerdict` déjà calculé
 * (`need-verdict.ts`) — jamais recalculé ici (GA-26).
 */
export interface CommercialMethodContext {
  verdict: {
    verdict: 'go' | 'no_go' | 'insufficient_data'
    blockingAxes: readonly string[]
    unmeasuredDecisiveAxes: readonly string[]
  }
  /** L'état de l'axe `relationship` du verdict. `null` = non mesuré (pas de
   *  compte rattaché) — traité comme un logo neuf : on ne sait pas, donc on
   *  approche comme si c'en était un. */
  relationshipState: 'positive' | 'attention' | null
  /** L'état de l'axe `access`. `positive` = décideur identifié. */
  accessState: 'positive' | 'attention' | null
  /** L'état de l'axe `staffing_capacity`. */
  staffingState: 'positive' | 'attention' | 'blocking' | null
  /** Le besoin stagne-t-il ? Calculé par l'APPELANT depuis SON seuil (le
   *  « cinq jours sans shortlist » de `briefing-actions.ts`) — ce fichier ne
   *  porte pas un second seuil. */
  stale: boolean
}

/**
 * LA DÉCISION — dans l'ordre : NO-GO d'abord (rien d'autre ne compte), puis
 * À QUALIFIER (l'effort va chercher la donnée manquante, jamais le message),
 * puis GO (la capacité à staffer avant la stagnation — savoir qu'on ne peut
 * présenter personne prime sur le nombre de jours écoulés).
 */
export function chooseCommercialMethod(context: CommercialMethodContext): CommercialMethodChoice {
  const { verdict, relationshipState, accessState, staffingState, stale } = context
  const decisionMakerKnown = accessState === 'positive'
  const knownClient = relationshipState === 'positive'

  if (verdict.verdict === 'no_go') {
    return {
      effortLevel: 'pause_sortie',
      openingRoute: null,
      trajectory: null,
      usefulPeople: [],
      requiredProof: null,
      nextStep: 'reconsider',
      switchCondition: 'on_human_reopens',
      stopCondition: 'already_met',
    }
  }

  const openingRoute: CommercialOpeningRoute = knownClient ? 'reactivation_chaude' : 'approche_directe_ciblee'
  const trajectory: CommercialMethodTrajectory = decisionMakerKnown
    ? 'par_le_haut'
    : accessState === 'attention'
      ? 'par_le_terrain'
      : 'manager_intermediaire'
  const usefulPeople: CommercialUsefulPerson[] = decisionMakerKnown
    ? ['decision_maker']
    : accessState === 'attention'
      ? ['current_contact', 'decision_maker']
      : ['current_contact']

  if (verdict.verdict === 'insufficient_data') {
    return {
      effortLevel: 'qualification_volume',
      openingRoute,
      trajectory,
      usefulPeople,
      requiredProof: 'qualification',
      nextStep: 'qualify',
      switchCondition: 'on_qualification_complete',
      stopCondition: 'on_verdict_no_go',
    }
  }

  // verdict.verdict === 'go'
  if (staffingState === 'blocking') {
    return {
      effortLevel: 'sprint_court',
      openingRoute,
      trajectory,
      usefulPeople,
      requiredProof: 'shortlist',
      nextStep: 'widen_sourcing',
      switchCondition: 'on_shortlist_ready',
      stopCondition: 'on_verdict_no_go',
    }
  }

  return {
    effortLevel: stale ? 'focus' : 'sprint_court',
    openingRoute,
    trajectory,
    usefulPeople,
    requiredProof: 'client_agreement',
    nextStep: 'build_shortlist',
    switchCondition: 'on_shortlist_ready',
    stopCondition: 'on_client_silence',
  }
}
