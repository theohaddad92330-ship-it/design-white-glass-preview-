import type { PlanWeek } from '../../helpers/plan'

/**
 * #1888 — LA PHASE QUI APPELLE UNE ACTION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE
 * ─────────────────────────────────────────────────────────────────────────────
 * « les phases repliées par défaut, genre la première quand on l'a pas
 * commencée est ouverte, puis c'est la 2 etc, que ce soit aussi organique à
 * l'intérieur ». Le repli n'est donc PAS uniforme : il suit l'avancement.
 * Ouverte = la première phase qui n'est pas finie. Les précédentes sont faites,
 * les suivantes n'ont pas encore leur tour.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENT L'ÉTAT — ET POURQUOI CE N'EST PAS UN RANG
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ « Un indicateur d'AVANCEMENT n'est pas un état » : un ✓ positionnel
 * (`index < indexCourant`) a déjà fait conclure l'inverse du vrai dans ce
 * dépôt. Cette fonction ne connaît donc aucun rang : elle reçoit `isDone`, qui
 * interroge l'état RÉEL de chaque action — `ActionPlanItem.done`, persisté par
 * `usePlanItems` et propriété de l'utilisateur, avec repli sur la case cochée
 * localement quand personne n'est connecté (démo, déconnecté).
 *
 * Conséquence voulue : une phase 3 déjà faite ne fait PAS avancer le curseur
 * au-delà d'une phase 2 inachevée, et une phase seulement ENTAMÉE reste celle
 * qu'on ouvre.
 *
 * ⚠️ L'appelant ne doit PAS l'interroger tant que l'état n'est pas connu : sur
 * une requête encore en vol, `isDone` rend `false` partout et cette fonction
 * désignerait la phase 1 — le « zéro de chargement » pris pour un vrai zéro.
 *
 * @param weeks   Les phases du plan, dans l'ordre où l'écran les rend.
 * @param isDone  L'état d'une action : `(indexDePhase, indexDEtape) => faite ?`.
 * @returns L'index de la phase à ouvrir, ou `null` quand plus rien n'appelle
 *          une action (tout est fait, ou le plan n'a aucune action).
 */
export function firstUnfinishedPhaseIndex(
  weeks: PlanWeek[],
  isDone: (weekIndex: number, stepIndex: number) => boolean,
): number | null {
  for (let index = 0; index < weeks.length; index += 1) {
    const items = weeks[index].items
    // Une phase sans action n'est pas « à faire » : l'ouvrir montrerait un vide.
    if (items.length === 0) continue
    if (items.some((_item, stepIndex) => !isDone(index, stepIndex))) return index
  }
  return null
}
