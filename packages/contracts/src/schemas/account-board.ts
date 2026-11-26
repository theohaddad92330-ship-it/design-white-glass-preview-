import { z } from 'zod'

/**
 * L'état d'un compte tel qu'il se LIT dans la liste (recette finale §20).
 *
 * Le rapport demande sept statuts métier là où le produit en stocke cinq. La
 * tentation serait d'ajouter deux valeurs à l'énumération — et ce serait une
 * faute, parce que les deux qui manquent ne sont pas des choix de l'utilisateur.
 *
 * « À analyser » est un FAIT : ce compte n'a pas de dossier. « À relancer » en
 * est un autre : la dernière action est échue. Les rendre choisissables laisse
 * l'affichage dériver de la réalité — un compte marqué « à relancer » à la main
 * le reste après la relance, et un compte analysé garde « à analyser » parce que
 * personne n'a pensé à changer la case. Le produit se met alors à mentir sur son
 * propre état, ce qui est pire que de ne rien dire.
 *
 * On garde donc cinq valeurs STOCKÉES — ce que le commercial décide — et on
 * DÉRIVE l'affichage en y ajoutant ce que la base sait déjà.
 */

/** Ce que le commercial décide, et qui est persisté. */
export const commercialStatusSchema = z.enum(['inbox', 'watching', 'opportunity', 'customer', 'archived'])
export type CommercialStatus = z.infer<typeof commercialStatusSchema>

/** Ce que la liste AFFICHE — les sept statuts du §20. */
export const BOARD_STATUSES = [
  /** Aucun dossier : le compte existe, rien n'a encore été analysé. */
  'to_analyse',
  /** Analysé, pas encore engagé — la porte est identifiée, personne n'a frappé. */
  'to_open',
  /** Engagé : au moins une action est partie et le compte avance. */
  'in_progress',
  /** Engagé, mais une échéance est passée. */
  'to_follow_up',
  /** Client, ou compte déjà ouvert par l'ESN. */
  'customer',
  /** Suivi sans action prévue. */
  'watching',
  /** Écarté volontairement. */
  'discarded',
] as const
export type BoardStatus = (typeof BOARD_STATUSES)[number]

/** Ce qu'il faut savoir d'un compte pour lire son état. */
export type AccountBoardInput = {
  commercialStatus?: CommercialStatus | string | null
  /** Le compte a-t-il un dossier livré ? */
  hasAnalysis?: boolean
  /** Échéance de la prochaine action (ISO), si elle existe. */
  nextActionDueAt?: string | null
  now?: Date
}

/**
 * L'état affiché d'un compte.
 *
 * L'ordre des règles est la logique métier. « À analyser » passe en premier :
 * un compte sans dossier n'est ni à ouvrir ni à relancer, quoi qu'en dise sa
 * colonne — proposer de relancer un compte qu'on n'a jamais analysé enverrait
 * un commercial parler sans rien savoir.
 *
 * « À relancer » passe avant « en cours » pour la raison inverse : une échéance
 * dépassée est l'information la plus actionnable de la liste, et la noyer dans
 * « en cours » revient à ne pas la donner.
 */
export function resolveBoardStatus(input: AccountBoardInput): BoardStatus {
  const stored = input.commercialStatus

  // Écarté et client sont des décisions fermes : elles priment sur tout, y
  // compris sur l'absence de dossier. Un client sans analyse reste un client.
  if (stored === 'archived') return 'discarded'
  if (stored === 'customer') return 'customer'

  if (input.hasAnalysis !== true) return 'to_analyse'

  if (stored === 'opportunity') {
    return isOverdue(input.nextActionDueAt, input.now) ? 'to_follow_up' : 'in_progress'
  }
  if (stored === 'watching') return 'watching'

  // `inbox` ou valeur inconnue sur un compte analysé : le dossier existe et
  // personne n'a encore décidé quoi en faire — c'est très exactement « à ouvrir ».
  return 'to_open'
}

/** Une échéance est-elle passée ? Une date absente ou illisible n'est PAS un
 *  retard : on ne reproche pas à quelqu'un un rendez-vous qu'on n'a pas noté. */
function isOverdue(dueAt: string | null | undefined, now?: Date): boolean {
  if (!dueAt) return false
  const due = new Date(dueAt).getTime()
  if (Number.isNaN(due)) return false
  return due < (now ?? new Date()).getTime()
}

/** Les statuts qui appellent une action du commercial — ce que la liste met en
 *  tête quand elle est triée par urgence. */
export const ACTIONABLE_BOARD_STATUSES: readonly BoardStatus[] = ['to_follow_up', 'to_open', 'to_analyse']

/** Ce statut demande-t-il quelque chose ? */
export function isActionable(status: BoardStatus): boolean {
  return ACTIONABLE_BOARD_STATUSES.includes(status)
}

/**
 * Une recommandation de « compte proche » est-elle affichable ?
 *
 * Le §19 est catégorique : « les comptes proches sont désormais plus cohérents,
 * mais la recommandation doit afficher le motif précis et le niveau de
 * confiance ». Une suggestion sans motif se lit comme du hasard, et le §20
 * précise le seuil : même secteur, même taille, même signal ou même technologie
 * — pas « proposé à partir du secteur de vos comptes récents », qui décrit un
 * algorithme et non une raison.
 */
export function isSimilarityExplainable(reasons: readonly string[] | undefined | null): boolean {
  return Array.isArray(reasons) && reasons.some(reason => reason.trim().length > 0)
}
