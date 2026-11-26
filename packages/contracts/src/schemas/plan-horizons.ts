/**
 * Les horizons d'un plan d'action (recette finale §30 — P0-09).
 *
 * Le rapport montre un écran vide : « Aucune action dans le plan. Créez une
 * première action concrète pour rendre le plan explorable. » Le plan EST généré
 * — les phases existent — mais les actions qui en dérivaient arrivaient sans
 * échéance, et une action sans date n'est pas une action : c'est une intention.
 * L'écran demandait donc au commercial d'écrire lui-même ce que Bellum promet
 * de produire.
 *
 * Les quatre horizons viennent du rapport : aujourd'hui, 7 jours, 30 jours,
 * 60-90 jours. Ils sont DÉTERMINISTES — dérivés de la position de la phase dans
 * le plan, pas demandés au modèle. Une date d'échéance inventée par un modèle
 * serait à la fois invérifiable et instable d'un run à l'autre.
 */

/** Les quatre horizons, dans l'ordre du plan. */
export const PLAN_HORIZONS = ['today', 'week', 'month', 'quarter'] as const
export type PlanHorizon = (typeof PLAN_HORIZONS)[number]

/** Jours à ajouter à la date du plan pour chaque horizon. */
const HORIZON_OFFSET_DAYS: Record<PlanHorizon, number> = {
  today: 0,
  week: 7,
  month: 30,
  quarter: 75,
}

/**
 * L'horizon d'une phase, depuis son rang dans le plan.
 *
 * Au-delà de la quatrième phase, tout retombe sur `quarter` plutôt que de
 * déborder : un plan à six phases n'a pas six horizons, il a quatre horizons et
 * plus d'actions dans le dernier.
 */
export function horizonForPhase(phaseIndex: number): PlanHorizon {
  if (!Number.isFinite(phaseIndex) || phaseIndex < 0) return 'today'
  return PLAN_HORIZONS[Math.min(phaseIndex, PLAN_HORIZONS.length - 1)] as PlanHorizon
}

/**
 * L'échéance d'une action, depuis son horizon et la date du plan.
 *
 * Rend une date à minuit UTC : une échéance de plan se compte en jours, et
 * garder l'heure du run ferait apparaître « dans 6 jours et 3 heures » à
 * l'écran d'un commercial qui ne raisonne qu'en jours ouvrés.
 */
export function dueDateForHorizon(horizon: PlanHorizon, planDate: Date): Date {
  const due = new Date(planDate)
  due.setUTCHours(0, 0, 0, 0)
  due.setUTCDate(due.getUTCDate() + HORIZON_OFFSET_DAYS[horizon])
  return due
}

/** Raccourci : l'échéance d'une action de la phase `phaseIndex`. */
export function dueDateForPhase(phaseIndex: number, planDate: Date): Date {
  return dueDateForHorizon(horizonForPhase(phaseIndex), planDate)
}
