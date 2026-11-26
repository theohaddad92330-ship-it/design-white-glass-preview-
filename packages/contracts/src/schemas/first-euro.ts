import { z } from 'zod'
import { MEASURABILITY_THRESHOLDS, measurability, measurabilitySchema, type Measurability } from './measurability.js'

/**
 * LA DISTANCE AU PREMIER EURO — PDF 2 §7.4, ticket `BEL-ACC-107` PR4.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'EXIGENCE, MOT POUR MOT
 * ─────────────────────────────────────────────────────────────────────────────
 * « Problème : on classe par intérêt ou par accessibilité. Aucun des deux ne dit
 * combien d'étapes restent avant une facture. »
 * « Un compte à 3 étapes bat un compte à 8, même moins intéressant. C'est un tri
 * qui n'existe nulle part et qui change la journée d'un commercial. »
 * « Règle d'honnêteté : `estimatedDays` est null tant que l'espace n'a pas 10
 * missions closes. On ne devine pas un délai médian sur 2 observations. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE N'EST PAS UNE PROBABILITÉ, ET ÇA NE LE DEVIENDRA PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le dépôt refuse toute probabilité affichée — six fois, dont l'arbitrage n°4 du
 * 16/08 et `c26_probabilite` au registre de doctrine. Ce qui est calculé ici est
 * de nature différente, et la distinction se tient en une phrase :
 *
 *   un COMPTE d'étapes restantes, et une SOMME de délais médians OBSERVÉS sur
 *   des missions réellement closes.
 *
 * Deux faits mesurés, additionnés. Aucun n'est multiplié par une chance, aucun
 * ne prétend dire si ça aboutira. « Il reste 3 étapes, historiquement 48 jours »
 * n'affirme rien sur l'issue — c'est la longueur du chemin, pas le pari sur son
 * bout. Le jour où quelqu'un proposera de pondérer ce délai par un taux de
 * transformation, la réponse est non : ce serait exactement le prévisionnel
 * pondéré refusé six fois.
 */

/**
 * LES HUIT ÉTAPES, dans l'ordre de la source :
 * « contact identifié → réponse obtenue → besoin exprimé → profil envoyé
 *   → entretien → accord → mission démarrée → première facture ».
 */
export const FIRST_EURO_STEPS = [
  /** Quelqu'un de nommé, chez le client. */
  'contact_identified',
  /** Il a répondu — c'est le premier fait qui ne dépend pas de nous. */
  'reply_obtained',
  /** Un besoin est formulé, par lui ou par nous et confirmé. */
  'need_expressed',
  /** Un profil est parti. */
  'profile_sent',
  /** Le client a rencontré ce profil. */
  'interview',
  /** L'affaire est gagnée. */
  'agreement',
  /** La mission a réellement commencé. */
  'mission_started',
  /** La première facture est émise — LE premier euro. */
  'first_invoice',
] as const

export const firstEuroStepSchema = z.enum(FIRST_EURO_STEPS)
export type FirstEuroStep = (typeof FIRST_EURO_STEPS)[number]

export type DistanceToFirstEuroInput = {
  /** Les étapes DÉJÀ franchies sur ce compte. L'ordre n'est pas supposé. */
  reached: readonly FirstEuroStep[]
  /**
   * Le délai médian OBSERVÉ, par étape, sur CET espace. Une étape absente (ou
   * illisible) n'a pas de médiane — et c'est une information, pas un zéro.
   */
  medianDaysByStep: Partial<Record<FirstEuroStep, number>>
  /** Combien de missions closes l'espace a réellement produites. */
  closedMissions: number
}

export const distanceToFirstEuroSchema = z.object({
  /** Combien d'étapes restent. Toujours mesurable : il ne dépend d'aucune médiane. */
  steps: z.number().int().min(0).max(FIRST_EURO_STEPS.length),
  /**
   * La somme des délais médians des étapes restantes, en jours.
   *
   * `null` = pas estimable, et l'écran écrit « pas assez d'historique pour
   * estimer ». JAMAIS `0` sous le seuil : un zéro se lirait « la facture part
   * demain », ce qui est le contraire de ce qu'on sait.
   */
  estimatedDays: z.number().nonnegative().nullable(),
  /** La prochaine étape à franchir. `null` quand il n'en reste aucune. */
  nextStep: firstEuroStepSchema.nullable(),
  /**
   * Les étapes restantes dont on n'a AUCUNE médiane. Nommées : « ce qui n'a pas
   * pu être évalué est NOMMÉ » — sans quoi l'utilisateur ne sait pas ce qui
   * manque, ni quoi faire pour que ça vienne.
   */
  unmeasuredSteps: z.array(firstEuroStepSchema),
  /** Combien d'observations on a, combien il en faut, combien il en manque. */
  measurability: measurabilitySchema,
})
export type DistanceToFirstEuro = z.infer<typeof distanceToFirstEuroSchema>

/** Une médiane utilisable : un nombre fini et positif ou nul. Rien d'autre. */
function usableMedian(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value) || value < 0) return null
  return value
}

/**
 * La distance d'un compte à sa première facture.
 *
 * PURE : elle ne lit ni base ni horloge. Ce qui la rend testable en 3 ms et
 * partageable entre l'API, l'écran et le copilote — la raison même pour
 * laquelle le PDF 1 §3 demande d'extraire ces quatorze fonctions.
 *
 * ⚠️ Elle ne « rattrape » AUCUNE étape. Un besoin qui arrive par un partenaire
 * avant qu'on ait parlé à quiconque laisse `contact_identified` non franchie, et
 * elle reste comptée : la déduire raccourcirait la distance sur la foi d'un
 * raisonnement plutôt que d'un fait, et le raisonnement serait faux ce jour-là.
 */
export function distanceToFirstEuro(input: DistanceToFirstEuroInput): DistanceToFirstEuro {
  const reached = new Set(input.reached)
  const remaining = FIRST_EURO_STEPS.filter(step => !reached.has(step))
  const nextStep = remaining[0] ?? null

  const unmeasuredSteps = remaining.filter(step => usableMedian(input.medianDaysByStep[step]) === null)
  const history = measurability(input.closedMissions, MEASURABILITY_THRESHOLDS.firstEuroDelay)

  return {
    steps: remaining.length,
    // Trois refus, et un seul accord :
    //  - pas assez de missions closes → on ne devine pas une médiane ;
    //  - une étape restante sans médiane → sommer le reste SOUS-ESTIMERAIT le
    //    délai, et un délai sous-estimé fait promettre une date à un client ;
    //  - sinon, la somme des médianes observées, qui est un fait.
    // Le cas « plus rien à franchir » donne 0, et ce zéro-là est VRAI.
    estimatedDays:
      !history.measurable || unmeasuredSteps.length > 0
        ? null
        : remaining.reduce((total, step) => total + (usableMedian(input.medianDaysByStep[step]) ?? 0), 0),
    nextStep,
    unmeasuredSteps,
    measurability: history,
  }
}

/** Réexporté pour les appelants qui affichent le seuil sans réimporter le module. */
export type FirstEuroMeasurability = Measurability
