import { COHORT_MIN_SPACES, buildCohortGrid, type CohortRow } from '@/app/_components/charts.logic'
import { LANGUE_CONSOLE } from '@/lib/dates'
import type { CohorteRetention } from '@/lib/retention'

/**
 * #1658.1 — CE QUE L'ÉCRAN DE RÉTENTION DÉCIDE, ET CE QU'IL NE DÉCIDE PAS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL NE REFAIT NI LA GRILLE, NI LE SEUIL, NI LE CALCUL
 * ─────────────────────────────────────────────────────────────────────────────
 * · La GRILLE est celle de #1643 (`CohortGrid` / `buildCohortGrid`), livrée et
 *   testée. Elle porte déjà les trois états d'une cellule — mesurée, à venir,
 *   non mesurée — et le seuil d'anonymat.
 * · Le SEUIL est `COHORT_MIN_SPACES` (3), et il vit à UN seul endroit. Le
 *   recopier ici en ferait deux valeurs le jour où l'une change (GA-26).
 * · Le CALCUL (qui est actif, quel mois, combien de mois écoulés) vit côté API :
 *   `maintenant` y est connu, et une seconde dérivation à l'écran divergerait
 *   une nuit sur deux.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL AJOUTE : LA LIGNE MASQUÉE, QUI EST LE TEST DE L'ISSUE
 * ─────────────────────────────────────────────────────────────────────────────
 * `buildCohortGrid` rend `null` à la PLACE d'une cohorte trop petite — la
 * position est gardée, l'étiquette et le compte sont perdus. `CohortGrid`, lui,
 * filtre ces `null` : la ligne disparaît sans rien dire.
 *
 * Or l'issue demande l'inverse, mot pour mot : « cohorte de 2 espaces → **ligne
 * masquée avec "trop peu d'espaces"**, pas une ligne vide ». Une ligne
 * silencieusement absente se lit « ce mois-là, personne ne s'est inscrit », ce
 * qui est faux et se voit dans les chiffres du dessus. Ce module rapproche donc
 * le verdict de la grille et la cohorte d'origine, POSITION PAR POSITION, pour
 * que l'écran puisse dire pourquoi la ligne n'est pas là.
 *
 * ⚠️ Le rapprochement se fait par INDICE et non par étiquette : c'est le contrat
 * de `buildCohortGrid`, qui rend un tableau de MÊME longueur que son entrée. Le
 * rejouer par nom demanderait de refaire son test de seuil ici — c'est-à-dire de
 * recopier le seuil.
 */

/** Une ligne de la grille, telle que l'écran la rend. */
type LigneRetention =
  /** Mesurée : la grille la dessine. */
  | { etat: 'affichee'; cohorte: CohorteRetention; libelle: string }
  /** Sous le seuil d'anonymat : la ligne se dit, elle ne se dessine pas. */
  | { etat: 'masquee'; cohorte: CohorteRetention; libelle: string }

type VueRetention = {
  /** Ce que `CohortGrid` reçoit — les cohortes AFFICHABLES, dans l'ordre. */
  rows: CohortRow[]
  /** Toutes les lignes, masquées comprises, dans l'ordre de la grille. */
  lignes: LigneRetention[]
  /** Combien de cohortes sont masquées. Zéro est ici un VRAI zéro : on a compté. */
  masquees: number
  /** Espaces retenus dans les cohortes masquées — l'opérateur sait ce qu'il ne
   *  voit pas, sans qu'aucune identité ne sorte (un compte ne nomme personne). */
  espacesMasques: number
}

/**
 * Passe une cohorte de l'API à la forme qu'attend la grille de #1643.
 *
 * Le renommage est le seul travail : `cohorte` → `cohortLabel`, `espaces` →
 * `spaceCount`, `retentionParMois` → `retentionByMonth`. Rien n'est recalculé.
 */
export function versLigneDeGrille(cohorte: CohorteRetention): CohortRow {
  return {
    cohortLabel: libelleCohorte(cohorte.cohorte),
    spaceCount: cohorte.espaces,
    retentionByMonth: cohorte.retentionParMois,
  }
}

/**
 * `2026-03` → `mars 2026`.
 *
 * ⚠️ Lu et rendu en **UTC**, comme `jourSeul()` : un mois est un span du
 * calendrier, pas un instant. Lui en donner un le ferait basculer d'un mois près
 * de minuit le 1er, et l'étiquette ne correspondrait plus à la cohorte que
 * l'API a construite — laquelle tronque en UTC, elle aussi.
 */
export function libelleCohorte(etiquette: string): string {
  if (!/^\d{4}-\d{2}$/.test(etiquette)) return etiquette
  const date = new Date(`${etiquette}-01T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return etiquette
  return date.toLocaleDateString(LANGUE_CONSOLE, { timeZone: 'UTC', month: 'long', year: 'numeric' })
}

/**
 * La vue complète : ce que la grille dessine, et ce qu'elle tait.
 *
 * `buildCohortGrid` est appelé ICI et une seule fois — `CohortGrid` le rappellera
 * sur les mêmes `rows`, avec le même verdict, parce que c'est une fonction pure
 * du même seuil. On ne lui passe donc que les lignes affichables : lui donner
 * aussi les masquées la ferait recompter des `null` qu'elle jetterait.
 */
export function construireVueRetention(cohortes: readonly CohorteRetention[]): VueRetention {
  const toutes = cohortes.map(versLigneDeGrille)
  // `monthsElapsed` vient de l'API : c'est elle qui connaît l'heure de lecture.
  const verdicts = buildCohortGrid(toutes, row => moisEcoulesDe(cohortes, row))

  const lignes: LigneRetention[] = cohortes.map((cohorte, index) => ({
    etat: verdicts[index] === null ? ('masquee' as const) : ('affichee' as const),
    cohorte,
    libelle: libelleCohorte(cohorte.cohorte),
  }))

  const affichees = lignes.filter(ligne => ligne.etat === 'affichee')
  const masquees = lignes.filter(ligne => ligne.etat === 'masquee')

  return {
    rows: affichees.map(ligne => versLigneDeGrille(ligne.cohorte)),
    lignes,
    masquees: masquees.length,
    espacesMasques: masquees.reduce((somme, ligne) => somme + ligne.cohorte.espaces, 0),
  }
}

/**
 * Les mois écoulés d'une ligne de grille, retrouvés dans la cohorte d'origine.
 *
 * ⚠️ La correspondance se fait sur l'étiquette AFFICHÉE, celle que
 * {@link versLigneDeGrille} vient d'écrire — c'est le seul champ que
 * `CohortRow` conserve. Une cohorte introuvable rend `-1`, qui met la ligne
 * entière « à venir » : visiblement vide plutôt que faussement mesurée. Ce cas
 * n'arrive pas (les deux tableaux viennent de la même liste), et il est écrit
 * pour que le jour où il arriverait, la grille se taise au lieu de mentir.
 */
function moisEcoulesDe(cohortes: readonly CohorteRetention[], row: CohortRow): number {
  const trouvee = cohortes.find(cohorte => libelleCohorte(cohorte.cohorte) === row.cohortLabel)
  return trouvee ? trouvee.moisEcoules : -1
}

/** Le seuil, RÉEXPORTÉ et non recopié — l'écran doit pouvoir le nommer dans sa
 *  phrase (« moins de 3 espaces ») sans en faire une seconde valeur. */
export { COHORT_MIN_SPACES }
