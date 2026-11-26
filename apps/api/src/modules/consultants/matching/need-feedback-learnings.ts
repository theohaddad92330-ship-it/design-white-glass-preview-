import { FEEDBACK_AXES, type FeedbackAxis, type SubmissionFeedback } from '@bellum/contracts'

/**
 * #2178.33/.34 — CE QUE LES REFUS CLIENT DÉJÀ ENREGISTRÉS DISENT SUR CE BESOIN.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE MODULE EST — ET N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────
 * L'issue #2178 demande deux choses du feedback client (§FEEDBACK) : qu'il
 * mette à jour « la compréhension du besoin » (.33) et « la future
 * comparaison » (.34). Le registre du 25/09 a balayé les deux comme
 * `retenu` : `submission_feedback` (onze axes, #2178.29 livré) reste attaché
 * au POSITIONNEMENT — rien ne le reporte sur le BESOIN, et le moteur de
 * matching (`axes.ts`) ne le lit jamais.
 *
 * Ce module ferme la moitié LECTURE de ce manque, SANS toucher au classement
 * lui-même :
 *  - `needFeedbackLearnings` est une fonction PURE qui compte, par axe, les
 *    verdicts `below` déjà enregistrés sur CE besoin — « la compréhension »
 *    (.33) se lit dans ce décompte, affiché tel quel (`MatchDrawer.tsx`,
 *    web) ;
 *  - CE décompte ne réordonne PAS `nextBestMoveOptions` (`next-best-move.ts`,
 *    déjà testé et livré #2178.21/.38 sur son tri actuel, motifs d'exclusion
 *    du run en cours). Le mélanger à un historique de refus subjectifs
 *    risquerait de faire dépendre un classement DÉTERMINISTE d'un signal
 *    humain, sujet à interprétation — la doctrine du dépôt refuse justement
 *    toute PROBABILITÉ ou pondération opaque affichée comme un fait. « La
 *    future comparaison » (.34) se satisfait ici en rendant le signal VISIBLE
 *    au moment où l'utilisateur choisit lui-même son prochain geste, plutôt
 *    qu'en le noyant dans un ré-ordonnancement automatique qu'il ne verrait
 *    pas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE FAIT JAMAIS
 * ─────────────────────────────────────────────────────────────────────────
 * Ni supprime ni falsifie une preuve du consultant (§FEEDBACK de l'issue) :
 * il ne lit QUE `submission_feedback`, jamais les preuves de compétence. Il
 * ne fabrique aucune donnée : `[]` si aucun feedback n'existe encore sur ce
 * besoin — jamais un décompte à zéro affiché comme un fait (GA-18/19, « une
 * valeur absente ne s'affiche jamais 0 »).
 */
export interface NeedFeedbackLearning {
  axis: FeedbackAxis
  belowCount: number
}

export function needFeedbackLearnings(
  feedbacks: readonly Pick<SubmissionFeedback, FeedbackAxis>[],
): NeedFeedbackLearning[] {
  const counts = new Map<FeedbackAxis, number>()
  for (const feedback of feedbacks) {
    for (const axis of FEEDBACK_AXES) {
      if (feedback[axis] === 'below') counts.set(axis, (counts.get(axis) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([axis, belowCount]) => ({ axis, belowCount }))
    .sort((a, b) => b.belowCount - a.belowCount || a.axis.localeCompare(b.axis))
}
