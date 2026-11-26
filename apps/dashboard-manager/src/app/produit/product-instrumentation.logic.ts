import type {
  DistinctWorkspaces,
  MedianDuration,
  MesureOuAbsence,
  ProductEventFamily,
  ProductEventName,
  Rate,
} from '@/lib/product-analytics'

/**
 * #1682/#1683-#1688 — CE QUE `/produit` DOIT DIRE AVANT TOUT CHIFFRE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE FICHIER FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré le 09/09/2026 : SEPT des neuf émetteurs du traceur produit
 * (`apps/web/src/lib/product-tracker.ts`) n'ont AUCUN appelant de production —
 * seuls `screen_viewed`/`screen_left` sont câblés (`router.tsx`). Et
 * `VITE_PRODUCT_TRACKER_ENABLED` est éteinte, nulle part armée. Le service de
 * lecture (`product-analytics-read.service.ts`) porte déjà la distinction
 * « jamais instrumenté » (`ProductEventFamily.instrumented`) mais RIEN
 * n'agrégeait ces neuf booléens en un diagnostic lisible par un opérateur —
 * et un tableau vide se lit comme « rien à signaler », pas comme « rien ne le
 * mesure ». C'est le défaut inverse et tout aussi grave que le premier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS, JAMAIS DEUX
 * ─────────────────────────────────────────────────────────────────────────────
 *  · **mesuré** — l'émetteur a un appelant ET l'agrégat a assez de sessions
 *    distinctes pour être publié. Un ZÉRO ici est un ZÉRO VRAI (la mesure a eu
 *    lieu, elle a trouvé zéro cas) — il s'affiche, sans honte, à la manière de
 *    l'entonnoir d'onboarding (« un pourcentage, zéro compris »).
 *  · **pas encore instrumenté** — l'émetteur n'a AUCUN appelant de production :
 *    `ProductEventFamily.instrumented === false`, ou l'un des champs qui en
 *    dépend porte `{ kind: 'not_instrumented' }`. Ce n'est pas une absence de
 *    données, c'est une absence de CAPTEUR — attendre ne rendra jamais ce zéro
 *    vrai.
 *  · **sous le seuil des {@link MIN_DISTINCT_SESSIONS_FOR_A_METRIC} sessions**
 *    — l'émetteur EST instrumenté et a produit des lignes, mais pas assez de
 *    sessions distinctes pour publier une mesure sans désigner quelqu'un
 *    (règle 1 de `c64_analytique_produit`).
 *
 * Aucune fonction de ce fichier ne recalcule le seuil ni la règle
 * d'instrumentation : les deux viennent de `@bellum/contracts` et du champ
 * `families` déjà rendu par les 4 routes internes (GA-26 — un réglage vit à un
 * seul endroit).
 */

// ─────────────────────────────────────────────────────────────────────────────
// L'état de l'instrumentation, la toute première chose que l'écran rend
// ─────────────────────────────────────────────────────────────────────────────

/** Libellés FR des neuf natures — pour NOMMER celles qui manquent, jamais se
 *  contenter d'un compte. */
const LIBELLES_EVENEMENTS: Record<ProductEventName, string> = {
  screen_viewed: 'Écran vu',
  screen_left: 'Écran quitté',
  tab_opened: 'Onglet ouvert',
  action_started: 'Action démarrée',
  action_completed: 'Action terminée',
  action_abandoned: 'Action abandonnée',
  filter_applied: 'Filtre appliqué',
  search_performed: 'Recherche effectuée',
  error_shown: 'Erreur affichée',
}

/** Le libellé FR d'une nature d'événement. Un nom inconnu se rend tel quel
 *  plutôt que de lever — cette fonction est lue au bout d'une chaîne réseau. */
export function libelleEvenement(event: ProductEventName): string {
  return LIBELLES_EVENEMENTS[event] ?? event
}

/**
 * Une nature PRÉCISE est-elle instrumentée ? Sert aux compteurs qui ne
 * passent pas par `MesureOuAbsence` (le total d'écrans avec vue, par exemple) :
 * sans cette question, un compte à `0` parce que `screen_viewed` n'a jamais
 * été écrit se lirait comme un compte à `0` parce que personne n'a rien
 * ouvert — exactement la confusion que cette page existe pour lever.
 */
export function estInstrumente(families: readonly ProductEventFamily[], event: ProductEventName): boolean {
  return families.some(famille => famille.event === event && famille.instrumented)
}

type ResumeInstrumentation = {
  total: number
  instrumentees: number
  /** Les natures NON instrumentées, dans l'ORDRE où `families` les a rendues —
   *  jamais un compte seul : la doctrine demande la liste NOMMÉE. */
  nonInstrumentees: ProductEventName[]
}

/** Réduit les neuf booléens de `families` à ce qu'un opérateur doit lire
 *  d'abord. `families.length` fait le total — jamais un « 9 » recopié en dur,
 *  qui divergerait le jour où une dixième nature s'ajoute. */
export function resumerInstrumentation(families: readonly ProductEventFamily[]): ResumeInstrumentation {
  const nonInstrumentees = families.filter(famille => !famille.instrumented).map(famille => famille.event)
  return {
    total: families.length,
    instrumentees: families.length - nonInstrumentees.length,
    nonInstrumentees,
  }
}

/** La phrase d'annonce, en tête d'écran. Toujours ce gabarit, jamais recomposé
 *  ailleurs — sinon deux écrans qui comptent le même signal diraient deux
 *  phrases différentes. */
export function libelleInstrumentation(resume: ResumeInstrumentation): string {
  return `${resume.instrumentees} des ${resume.total} natures d’événement sont instrumentées`
}

// ─────────────────────────────────────────────────────────────────────────────
// L'état d'UNE cellule de tableau — la même distinction, appliquée à chaque
// agrégat qui peut être « jamais instrumenté », « sous le seuil » ou « mesuré ».
// ─────────────────────────────────────────────────────────────────────────────

export type EtatCellule<T> =
  | { etat: 'non_instrumente' }
  | { etat: 'sous_le_seuil'; sessions: number; seuil: number }
  | { etat: 'mesure'; sessions: number; valeur: T }

/** Traduit la forme réseau (`MesureOuAbsence<T>`) en l'état que l'écran doit
 *  rendre. Aucune branche ne peut produire un zéro pour une absence : le seul
 *  chemin vers `{ etat: 'mesure' }` porte une VRAIE valeur mesurée. */
export function etatDe<T>(mesure: MesureOuAbsence<T>): EtatCellule<T> {
  if (mesure.kind === 'not_instrumented') return { etat: 'non_instrumente' }
  if (mesure.kind === 'below_threshold') {
    return { etat: 'sous_le_seuil', sessions: mesure.sessions, seuil: mesure.minSessions }
  }
  return { etat: 'mesure', sessions: mesure.sessions, valeur: mesure.value }
}

/**
 * Le texte court d'un état — jamais « 0 », jamais « aucun problème » pour une
 * absence. C'est la phrase qu'un tableau vide doit porter à la place d'une
 * ligne muette.
 */
export function libelleEtat(etat: EtatCellule<unknown>): string {
  if (etat.etat === 'non_instrumente') return 'pas encore instrumenté'
  if (etat.etat === 'sous_le_seuil') return `sous le seuil (${etat.sessions} sur ${etat.seuil} sessions requises)`
  return 'mesuré'
}

// ─────────────────────────────────────────────────────────────────────────────
// La colonne « espaces » — jamais dérivable de ce flux, jamais un zéro,
// jamais un nom d'espace.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le texte de la colonne « espaces ». `trackBehavioral()` écrit `workspace_id`
 * à `null` inconditionnellement (règles 4 et 5 de `c64_analytique_produit') :
 * cette colonne n'a JAMAIS le droit de nommer un espace ni de rendre un
 * compte — même à zéro, un zéro laisserait croire qu'on a compté.
 */
export function libelleEspaces(distinctWorkspaces: DistinctWorkspaces): string {
  switch (distinctWorkspaces.kind) {
    case 'not_derivable':
      return 'non dérivable'
    default:
      return 'non dérivable'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Petits formateurs partagés — un taux, une durée médiane. Jamais un `?? 0`.
// ─────────────────────────────────────────────────────────────────────────────

/** Un taux, avec son dénominateur en toutes lettres — jamais un pourcentage nu. */
export function formaterTaux(rate: Rate): string {
  if (rate.kind === 'unmeasured') return 'non mesuré'
  return `${Math.round(rate.ratio * 100)} % (sur ${rate.over})`
}

/** Une durée médiane — trois issues, jamais un nombre inventé pour les deux
 *  qui n'en sont pas. */
export function formaterDureeMediane(duration: MedianDuration): string {
  if (duration.kind === 'unmeasured') return 'non mesurée'
  if (duration.kind === 'over_30_min') return '> 30 min'
  const secondes = duration.seconds
  return secondes < 60 ? `${Math.round(secondes)} s` : `${Math.round(secondes / 60)} min`
}
