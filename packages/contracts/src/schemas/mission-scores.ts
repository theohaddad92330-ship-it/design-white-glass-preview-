import { z } from 'zod'
import { MEASURABILITY_THRESHOLDS, measurability, measurabilitySchema } from './measurability.js'

/**
 * Les deux scores d'une mission (PDF 5 §5) — risque et opportunité.
 *
 * La règle qui gouverne le fichier vient de la même famille que le matching :
 * **moins de trois axes évaluables ⇒ pas de score.** Un score calculé sur un
 * seul axe n'est pas un score, c'est cet axe déguisé — et il se présente avec
 * l'autorité d'une synthèse. Un « 40/100 » qui ne mesure que la marge fait
 * abandonner une mission dont on ne savait rien d'autre.
 *
 * Deux scores et jamais un seul, pour la même raison que la correspondance et
 * le poussable du PDF 4 : « risque élevé, opportunité élevée » est un compte à
 * travailler d'urgence, « risque élevé, opportunité faible » est un compte à
 * laisser partir. Un chiffre unique dirait la même chose pour les deux.
 *
 * Ce n'est PAS une probabilité (arbitrage n°4 du 16/08, déjà refusé trois
 * fois) : aucun de ces axes n'est calibré contre un résultat observé, et
 * afficher « 68 % de chances » ferait prendre une somme de signaux pour une
 * prédiction.
 */

export const RISK_AXES = [
  /** La fin approche et rien n'est engagé. */
  'renewal',
  /** Des relevés manquent ou sont contestés. */
  'timesheets',
  /** La marge est faible ou négative. */
  'margin',
  /** Le client paie en retard. */
  'payment',
  /** Un seul consultant porte toute la mission. */
  'concentration',
] as const
export type RiskAxis = (typeof RISK_AXES)[number]

export const OPPORTUNITY_AXES = [
  /** La mission dure et se renouvelle. */
  'longevity',
  /** La marge est confortable. */
  'margin',
  /** D'autres besoins existent chez ce client. */
  'expansion',
  /** Le compte a déjà plusieurs missions. */
  'footprint',
] as const
export type OpportunityAxis = (typeof OPPORTUNITY_AXES)[number]

/** Sous ce nombre d'axes, on ne rend PAS de score. */
export const MIN_AXES_FOR_SCORE = 3

export const missionScoreSchema = z.object({
  /** 0-100, ou `null` quand moins de trois axes sont évaluables. */
  score: z.number().min(0).max(100).nullable(),
  /** Les axes qui ont pu être évalués, avec leur note. */
  evaluated: z.array(z.object({ axis: z.string(), value: z.number().min(0).max(100) })),
  /** Ceux qui n'ont pas pu l'être, NOMMÉS. Un axe non évaluable qui
   *  disparaîtrait ferait croire qu'il valait zéro. */
  notEvaluable: z.array(z.string()),
})
export type MissionScore = z.infer<typeof missionScoreSchema>

/**
 * Moyenne des axes évaluables, ou `null`.
 *
 * Le dénominateur est le nombre d'axes RÉELLEMENT évalués, jamais le nombre
 * total : diviser par cinq quand trois ont répondu ferait mesurer la complétude
 * de nos données au lieu de la mission.
 */
export function scoreFromAxes(axes: ReadonlyArray<{ axis: string; value: number | null }>): MissionScore {
  const evaluated = axes.flatMap(entry =>
    entry.value === null ? [] : [{ axis: entry.axis, value: Math.max(0, Math.min(100, entry.value)) }],
  )
  const notEvaluable = axes.filter(entry => entry.value === null).map(entry => entry.axis)

  if (evaluated.length < MIN_AXES_FOR_SCORE) return { score: null, evaluated, notEvaluable }
  const total = evaluated.reduce((sum, entry) => sum + entry.value, 0)
  return { score: Math.round(total / evaluated.length), evaluated, notEvaluable }
}

/**
 * Le prévisionnel — en trois lignes, et SANS pondération (§11).
 *
 * Le refus de la pondération est déjà la règle du dépôt : multiplier un montant
 * par une « probabilité » produit un chiffre qui n'existera jamais, que
 * personne ne peut vérifier, et sur lequel on construit un budget.
 *
 * Les trois lignes disent trois choses différentes, et c'est ce qui remplace
 * utilement le chiffre pondéré :
 *  - **acquis** : les missions en cours, jusqu'à leur date de fin connue ;
 *  - **probable** : les renouvellements engagés — un geste a eu lieu ;
 *  - **espéré** : le pipe commercial, à son montant NOMINAL.
 *
 * Personne ne les additionne à la place du lecteur.
 */
export const forecastLineSchema = z.object({
  kind: z.enum(['secured', 'likely', 'hoped']),
  amountCents: z.number().int().nullable(),
  /** Combien de lignes n'ont pas pu être chiffrées. */
  withoutAmount: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
})
export type ForecastLine = z.infer<typeof forecastLineSchema>

export const forecastSchema = z.object({
  /** Les mois couverts, du plus proche au plus lointain. */
  months: z.array(z.string()),
  lines: z.array(forecastLineSchema).length(3),
})
export type Forecast = z.infer<typeof forecastSchema>

/**
 * Le prévisionnel de CAPACITÉ — combien de jours l'équipe peut vendre.
 *
 * `null` quand aucune affectation n'est lisible : « 0 jour disponible » se lit
 * « tout le monde est staffé », ce qui est l'inverse de « on ne sait pas ».
 */
export const capacityForecastSchema = z.object({
  periodMonth: z.string(),
  /** Jours ouvrés du mois × personnes. `null` si rien n'est mesurable. */
  capacityDays: z.number().nullable(),
  /** Jours déjà engagés sur des missions. */
  committedDays: z.number().nullable(),
  /** Ce qui reste à vendre. `null` dès qu'un des deux manque — jamais une
   *  soustraction avec un terme inventé. */
  availableDays: z.number().nullable(),
  /** Combien de personnes n'ont pas pu être comptées. */
  unmeasured: z.number().int().nonnegative(),
  /**
   * Le taux d'intercontrat, et sa mesurabilité.
   *
   * ⚠️ `MEASURABILITY_THRESHOLDS.benchRate` était déclaré depuis le 21/08 et lu
   * par personne. Un taux d'intercontrat sur trois consultants n'est pas un
   * taux — c'est une fraction que le hasard déplace de 33 points. Sous le
   * seuil, la valeur est `null` et l'écran dit ce qui manque.
   *
   * `.default(...)` : le champ est AJOUTÉ à une réponse qui circule déjà, et le
   * web se déploie dix minutes avant l'API.
   */
  bench: z
    .object({
      /** Consultants sans affectation active ÷ consultants comptés. `null` sous le seuil. */
      rate: z.number().nullable(),
      onBench: z.number().int().nonnegative(),
      measurability: measurabilitySchema,
    })
    .default({
      rate: null,
      onBench: 0,
      measurability: {
        measurable: false,
        observed: 0,
        required: MEASURABILITY_THRESHOLDS.benchRate,
        missing: MEASURABILITY_THRESHOLDS.benchRate,
      },
    }),
})
export type CapacityForecast = z.infer<typeof capacityForecastSchema>

export function computeCapacity(input: {
  workingDays: number | null
  people: number
  committedDays: number | null
  unmeasured: number
  /** Consultants sans la moindre affectation active. */
  onBench?: number
}): CapacityForecast & { periodMonth: string } {
  const capacityDays =
    input.workingDays === null || input.people <= 0 ? null : Number((input.workingDays * input.people).toFixed(2))
  const availableDays =
    capacityDays === null || input.committedDays === null
      ? null
      : Number(Math.max(0, capacityDays - input.committedDays).toFixed(2))
  // Le taux d'intercontrat se calcule sur les consultants COMPTÉS, et il refuse
  // de se prononcer sous le seuil : « 33 % » sur trois personnes est un chiffre
  // que le départ d'une seule fait bouger de trente points.
  const benchState = measurability(input.people, MEASURABILITY_THRESHOLDS.benchRate)
  const onBench = Math.max(0, Math.min(input.onBench ?? 0, input.people))
  return {
    periodMonth: '',
    capacityDays,
    committedDays: input.committedDays,
    availableDays,
    unmeasured: input.unmeasured,
    bench: {
      rate: benchState.measurable && input.people > 0 ? Number((onBench / input.people).toFixed(3)) : null,
      onBench,
      measurability: benchState,
    },
  }
}
