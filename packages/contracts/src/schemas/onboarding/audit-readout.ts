import { funnelBreak, type ActivityFunnelInput, type FunnelBreak } from './answers-mesures.js'
import { DOSSIER_CONTINUITY_BREAKS } from './answers-routines.js'

/**
 * CE QUE L'AUDIT SAIT DIRE DES RÉPONSES — cinq dérivations, un seul endroit.
 *
 * Elles ferment cinq points dont la preuve d'existant disait la MÊME chose :
 * « rien », ou « calculé, testé, aucun appelant ». `funnelBreak` (#2049.15) en
 * est l'exemple pur — il existait depuis le 15/09, il n'était lu que par son
 * propre test, et `onboarding.ts` disait lui-même « l'audit qui les lira vit
 * hors de ce paquet ». Il est lu ici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS INTERDITS QUI COMMANDENT CE FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Aucune PROBABILITÉ, aucun pourcentage de conversion.** #2049.15 le dit
 *    en toutes lettres : « l'audit localise la rupture SANS INVENTER de
 *    conversion ». Aucune fonction d'ici ne rend un taux, un score ni une
 *    chance. Ce n'est pas une convention, c'est l'absence de champ : aucun type
 *    de ce fichier n'en porte un.
 * 2. **« Non mesuré » n'est jamais « 0 ».** Chaque dérivation a un état
 *    `not_measured` NOMMÉ, distinct d'un zéro. Et un zéro DÉCLARÉ par la
 *    personne (« Aucune heure dans une semaine ordinaire ») est une valeur
 *    vraie, donc il a lui aussi son état à lui — les confondre ferait dire à
 *    l'audit « tu n'as pas de temps » à quelqu'un qui n'a simplement pas
 *    répondu.
 * 3. **Rien n'écrit tout seul.** Les routines de #2051.16 sont des
 *    PROPOSITIONS : ce fichier rend un nom de routine et la rupture qui la
 *    fonde, jamais un ordre d'écriture. Le geste de création est ailleurs, et
 *    il demande un clic.
 *
 * Tout est PUR : entrée = les réponses déclarées, sortie = une structure. Pas de
 * date, pas d'aléa, pas de lecture d'environnement — donc calculable des deux
 * côtés sans jamais diverger (GA-26).
 */

/* -------------------------------------------------------------------------- */
/*  #2050.14 — peu de temps ⇒ moins de fronts : PAS ICI                        */
/* -------------------------------------------------------------------------- */

// #2067 — décision Louis du 18/09/2026 : `effortSpread` vivait ici, un SECOND
// calcul du nombre de fronts (plafond 3, un front retiré par érosion déclarée)
// à côté de celui de l'audit (jusqu'à 4, l'érosion citée, jamais retranchée).
// Pour un même profil, la relecture d'onboarding et l'audit pouvaient dire 1 et
// 3. Le nombre de L'AUDIT gagne : il est calculé UNE fois, par `frontsBudget`
// (`onboarding/fronts-budget.ts`), que la relecture appelle aussi (GA-26).

/* -------------------------------------------------------------------------- */
/*  #2051.16 — les routines se configurent à partir de ces ruptures           */
/* -------------------------------------------------------------------------- */

/**
 * Chaque rupture de continuité DÉCLARÉE et la routine qui la tiendrait.
 *
 * `routines.ts` (web) écrivait « la rupture … qu'un jour une routine citera »,
 * au futur, et `question-consequences.ts` le confirmait : « la routine qui
 * citerait une rupture (#2051.16) reste à brancher ». Elle la cite ici.
 *
 * ⚠️ « Je ne sais pas encore où ça décroche » ne propose RIEN, et c'est le cœur
 * du point : une rupture inconnue ne configure pas une routine — proposer
 * quelque chose dessus reviendrait à choisir à la place de la personne sur la
 * seule réponse qui dit explicitement qu'elle ne sait pas.
 */
const ROUTINE_FOR_BREAK: Readonly<Record<string, string>> = {
  [DOSSIER_CONTINUITY_BREAKS[0]]: 'watchlist', // Une information connue n'est pas suivie
  [DOSSIER_CONTINUITY_BREAKS[1]]: 'need_qualification', // Un besoin est mal qualifié au départ
  [DOSSIER_CONTINUITY_BREAKS[2]]: 'talent_followup', // Un candidat n'est pas sécurisé à temps
  [DOSSIER_CONTINUITY_BREAKS[3]]: 'next_action', // Un compte reste sans prochaine action
  [DOSSIER_CONTINUITY_BREAKS[4]]: 'activity_check', // Une activité s'interrompt sans qu'on le voie
  [DOSSIER_CONTINUITY_BREAKS[5]]: 'feedback_capture', // Un retour n'est pas capturé
  // DOSSIER_CONTINUITY_BREAKS[6] — « Je ne sais pas encore » : ABSENT à dessein.
}

/** Une PROPOSITION : le nom d'une routine et la rupture déclarée qui la fonde.
 *  Aucun chemin d'écriture ne part d'ici. */
export type RoutineProposal = { routineKey: string; fromBreak: string }

export function routineProposalsFromBreaks(breaks: readonly string[] | null | undefined): RoutineProposal[] {
  return (breaks ?? []).flatMap(declared => {
    const routineKey = ROUTINE_FOR_BREAK[declared]
    return routineKey ? [{ routineKey, fromBreak: declared }] : []
  })
}

/* -------------------------------------------------------------------------- */
/*  #2042.15 — un point de départ qui peut différer de l'ambition             */
/* -------------------------------------------------------------------------- */

/** Le seul constat d'`ideal_client_current_state` qui ne dit RIEN de l'accès :
 *  « ça correspond sur le papier » n'est pas « je peux y aller ». */
const THEORETICAL_MATCH = 'Correspond au profil théorique'
/** La seule réponse d'accessibilité qui déclare un obstacle. */
const COLD_ACCESS = 'Hors réseau actuel, prospection à froid nécessaire'
/** La seule contrainte de référencement qui déclare l'ABSENCE d'obstacle. */
const NO_REFERENCING_CONSTRAINT = 'Aucune contrainte de référencement connue'

type StartingPointInput = {
  ideal_client_current_state?: readonly string[] | null
  ideal_client_accessibility?: string | null
  ideal_client_referencement_constraints?: readonly string[] | null
}

export type AuditStartingPoint =
  /** Rien de déclaré ni sur les appuis ni sur les obstacles : l'audit se tait. */
  | { kind: 'not_measured' }
  /** Des appuis déclarés, aucun obstacle déclaré : partir de l'ambition elle-même. */
  | { kind: 'ambition_is_reachable'; grounds: string[] }
  /** Au moins un obstacle DÉCLARÉ : le point de départ n'est pas l'ambition.
   *  `grounds` peut être vide — c'est honnête, et ça se lit « rien d'immédiat
   *  n'a été déclaré », jamais « il n'y a rien ». */
  | { kind: 'differs'; obstacles: string[]; grounds: string[] }

export function auditStartingPoint(input: StartingPointInput): AuditStartingPoint {
  // Les appuis : ce que la personne observe DÉJÀ, moins la correspondance
  // théorique — qui décrit le profil, pas l'accès.
  const grounds = (input.ideal_client_current_state ?? []).filter(state => state !== THEORETICAL_MATCH)

  const obstacles: string[] = []
  if (input.ideal_client_accessibility === COLD_ACCESS) obstacles.push(COLD_ACCESS)
  for (const constraint of input.ideal_client_referencement_constraints ?? []) {
    if (constraint !== NO_REFERENCING_CONSTRAINT) obstacles.push(constraint)
  }

  if (obstacles.length > 0) return { kind: 'differs', obstacles, grounds: [...grounds] }
  if (grounds.length > 0) return { kind: 'ambition_is_reachable', grounds: [...grounds] }
  return { kind: 'not_measured' }
}

/* -------------------------------------------------------------------------- */
/*  #2043.10 — top-down / bottom-up / multi-thread                            */
/* -------------------------------------------------------------------------- */

const EXECUTIVE_LEVEL = 'Niveau exécutif (COMEX / CODIR)'
const VARIABLE_LEVEL = 'Variable selon le compte'
/** Les deux validateurs de budget qui ne sont PAS l'interlocuteur rencontré. */
const VALIDATOR_ELSEWHERE: readonly string[] = [
  'Un niveau direction générale (COMEX)',
  'Les achats, après validation technique',
]

type AccessStrategyInput = {
  real_response_level?: string | null
  budget_validator?: string | null
  access_orienteur?: string | null
}

/**
 * L'AXE, jamais un score. Trois valeurs nommées, et un quatrième état qui dit
 * qu'on ne sait pas — parce qu'une stratégie « par défaut » serait une
 * recommandation inventée sur le compte de quelqu'un.
 */
export type AccessStrategy =
  | { kind: 'not_measured' }
  | { kind: 'axis'; axis: 'top_down' | 'bottom_up' | 'multi_thread'; basedOn: string[] }

export function accessStrategy(input: AccessStrategyInput): AccessStrategy {
  const level = input.real_response_level?.trim() || null
  // Le niveau auquel les réponses arrivent RÉELLEMENT est le seul fait sans
  // lequel il n'y a pas d'axe : sans lui, les deux autres réponses ne disent
  // pas par où l'on entre.
  if (!level) return { kind: 'not_measured' }

  const basedOn = ['real_response_level']
  const validator = input.budget_validator?.trim() || null
  if (validator) basedOn.push('budget_validator')
  if (input.access_orienteur?.trim()) basedOn.push('access_orienteur')

  // « Variable selon le compte » est déjà, mot pour mot, du multi-thread : la
  // personne déclare que l'entrée n'est pas la même d'un compte à l'autre.
  if (level === VARIABLE_LEVEL) return { kind: 'axis', axis: 'multi_thread', basedOn }

  // Le budget se valide AILLEURS que là où l'on est reçu : une seule porte ne
  // suffit pas, et c'est un FAIT déclaré, pas une supposition sur le compte.
  if (validator && VALIDATOR_ELSEWHERE.includes(validator)) {
    return { kind: 'axis', axis: 'multi_thread', basedOn }
  }

  return { kind: 'axis', axis: level === EXECUTIVE_LEVEL ? 'top_down' : 'bottom_up', basedOn }
}

/* -------------------------------------------------------------------------- */
/*  #2049.15 — la rupture de la chaîne, sans conversion inventée              */
/* -------------------------------------------------------------------------- */

/**
 * Le SEUL appelant de `funnelBreak` hors de son propre test.
 *
 * Il n'ajoute rien au calcul et c'est voulu : la dérivation vit à un seul
 * endroit (`answers-mesures.ts`), ce qui manquait était quelqu'un pour la lire.
 * La ré-exposer ici, dans la lecture d'audit, est ce qui la fait sortir de
 * l'orphelinat sans en écrire une seconde version.
 */
export function auditFunnelBreak(input: ActivityFunnelInput): FunnelBreak {
  return funnelBreak(input)
}
