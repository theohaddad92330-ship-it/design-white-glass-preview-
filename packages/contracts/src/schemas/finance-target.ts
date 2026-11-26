import { z } from 'zod'

/* ------------------------------------------------------------------ */
/*  L'OBJECTIF MENSUEL DE MARGE — D7 du 26/08, ROUVERT ET LEVÉ         */
/*  par Louis le 31/08/2026                                            */
/* ------------------------------------------------------------------ */

/**
 * Ce fichier est la moitié CALCUL de l'anneau « Taux de réalisation ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI ÉTAIT REFUSÉ, ET CE QUI A CHANGÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Les neuf maquettes Finance du dossier du 26/08 montrent un anneau contre un
 * objectif mensuel de 350 000 €. Le refus d'origine tenait en une phrase, et
 * elle était juste : **« une couleur d'alerte suppose un objectif, et l'objectif
 * n'est pas tranché »** — dessiner le cercle aurait demandé d'inventer la cible,
 * c'est-à-dire de fabriquer une donnée.
 *
 * Louis a levé le refus le **31/08/2026**, dans une forme précise : l'objectif
 * n'est pas une constante du produit, c'est un **RÉGLAGE saisi par l'espace**.
 * Ce qui change tout — la cible cesse d'être notre invention et devient la
 * décision de l'ESN, la seule personne qui puisse la prendre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE REVIREMENT NE LÈVE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **Sans objectif saisi, il n'y a AUCUN pourcentage.** Pas « 0 % », pas un
 *     objectif par défaut, pas une moyenne du secteur. `marginAttainment` rend
 *     `{ measured: false, gap: 'no_target' }` — une branche qui ne PORTE pas de
 *     champ `percent`, exactement comme `metricDelta` : un écran ne peut pas
 *     afficher un zéro qui n'existe pas dans le typage.
 *  2. **Pas d'orange deviné.** Une couleur ne se dérive QUE de l'objectif saisi
 *     (`reached`), jamais d'un seuil que personne n'a choisi.
 *  3. **Un objectif ne rend pas une marge mesurable.** Sous le seuil de
 *     mesurabilité de la marge agrégée, l'anneau se tait
 *     (`gap: 'margin_not_measurable'`) : comparer une marge tirée de deux
 *     missions à un objectif d'espace donnerait à un accident l'autorité d'un
 *     verdict.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN TAUX, ET PAS UN MONTANT
 * ─────────────────────────────────────────────────────────────────────────────
 * La maquette affiche un objectif en EUROS (350 000 €). Le dépôt ne sait pas
 * rendre une marge en euros : `RevenueService.aggregate` rend un `marginPercent`
 * et sa population, et aucune dérivation ne produit un montant de marge —
 * `METRICS_NOT_PHOTOGRAPHED` le dit pour la marge prévisionnelle comme pour la
 * marge réalisée. Un objectif en euros n'aurait donc **rien à comparer** : il
 * aurait fallu inventer le numérateur, c'est-à-dire refaire exactement la faute
 * que le refus d'origine empêchait.
 *
 * L'objectif est donc un **taux de marge visé**, dans l'unité que le produit
 * mesure réellement. C'est une réduction assumée de la maquette, pas un oubli.
 */

/** Le plancher STRICT d'un objectif saisissable. */
export const MARGIN_TARGET_MIN_PERCENT = 0
/** Le plafond d'un objectif saisissable. */
export const MARGIN_TARGET_MAX_PERCENT = 100

/**
 * L'objectif tel qu'il est SERVI — toujours pour un mois nommé.
 *
 * `targetPercent: null` veut dire « personne ne l'a saisi pour ce mois ». Ce
 * n'est pas une erreur, ce n'est pas zéro, et c'est l'état de départ de tout
 * espace.
 */
export const financeMarginTargetSchema = z.object({
  /** Le mois visé, `AAAA-MM`. */
  month: z.string().regex(/^\d{4}-\d{2}$/),
  /**
   * Le taux de marge visé, en pourcentage. `null` = non saisi.
   *
   * ⚠️ STRICTEMENT positif quand il existe : « objectif : 0 % de marge » n'est
   * pas un objectif, et servirait par-dessus le marché de dénominateur à la
   * division du taux de réalisation. Le refuser ICI est ce qui garantit que
   * `marginAttainment` ne peut jamais diviser par zéro.
   */
  targetPercent: z.number().gt(MARGIN_TARGET_MIN_PERCENT).max(MARGIN_TARGET_MAX_PERCENT).nullable(),
  /** Quand il a été saisi, ISO. `null` quand il n'y a pas d'objectif. */
  setAt: z.string().nullable(),
})
export type FinanceMarginTarget = z.infer<typeof financeMarginTargetSchema>

/**
 * La SAISIE. `targetPercent: null` efface l'objectif du mois — et l'effacer est
 * un geste légitime : « on ne se fixe plus de cible ce mois-ci » se dit, et
 * l'anneau redevient muet plutôt que de garder une cible que personne n'assume.
 */
export const setFinanceMarginTargetSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  targetPercent: z.number().gt(MARGIN_TARGET_MIN_PERCENT).max(MARGIN_TARGET_MAX_PERCENT).nullable(),
})
export type SetFinanceMarginTargetInput = z.infer<typeof setFinanceMarginTargetSchema>

/**
 * Pourquoi le taux de réalisation n'a PAS pu être calculé. Toujours NOMMÉ : un
 * anneau muet et un anneau en panne appellent deux gestes différents — saisir
 * un objectif, ou réessayer.
 */
export const MARGIN_ATTAINMENT_GAPS = [
  /** Aucun objectif saisi pour ce mois. **L'état de départ — pas une panne.** */
  'no_target',
  /** La marge agrégée n'a pas pu être calculée du tout. */
  'margin_not_measured',
  /** La marge est calculée mais repose sur trop peu de missions (D45/§13.3). */
  'margin_not_measurable',
] as const
export type MarginAttainmentGap = (typeof MARGIN_ATTAINMENT_GAPS)[number]

/**
 * Le taux de réalisation.
 *
 * ⚠️ La branche NON MESURÉE ne porte NI `percent` NI `reached`. Comme pour
 * `metricDelta`, ce n'est pas une coquetterie de typage : une clé absente ne se
 * recopie pas à l'écran, un `percent: 0` si.
 */
export type MarginAttainment =
  | { measured: false; gap: MarginAttainmentGap }
  | {
      measured: true
      /** La part de l'objectif atteinte, en %. Une décimale, comme les deltas. */
      percent: number
      /** L'objectif saisi, redit pour que l'écran n'ait pas à le rechercher. */
      targetPercent: number
      /** La marge réellement mesurée. */
      marginPercent: number
      /**
       * L'objectif est-il atteint ? **La seule chose dont une couleur ait le
       * droit de se dériver sur cet écran** — et elle vient d'un chiffre saisi
       * par l'ESN, jamais d'un seuil deviné.
       */
      reached: boolean
    }

/** Une décimale — la même que `DELTA_PERCENT_DECIMALS`, et pour la même raison. */
export const ATTAINMENT_PERCENT_DECIMALS = 1

/**
 * LA dérivation du taux de réalisation — pure, sans horloge ni réseau.
 *
 * Elle vit à UN seul endroit (GA-26) : l'anneau, l'export et la démo la
 * partagent. Deux chemins qui referaient cette division divergeraient sur les
 * cas de bord — et les cas de bord sont *tout* ce que cette fonction contient.
 *
 * ⚠️ Un taux de réalisation SUPÉRIEUR à 100 % n'est pas borné. Dépasser son
 * objectif est un fait, et l'écrêter à 100 % effacerait la seule bonne nouvelle
 * que cet écran sache donner.
 */
export function marginAttainment(input: {
  /** La marge agrégée mesurée, en % — `RevenueService.aggregate`. */
  marginPercent: number | null | undefined
  /** `false` quand la marge repose sur trop peu de missions. */
  measurable?: boolean
  /** L'objectif saisi pour le mois, ou `null`. */
  targetPercent: number | null | undefined
}): MarginAttainment {
  const target = input.targetPercent
  // L'ordre compte : « aucun objectif » est l'état de DÉPART, et c'est le
  // message que l'écran doit montrer en priorité — il porte un geste (saisir),
  // là où les deux autres n'en portent aucun.
  if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0) {
    return { measured: false, gap: 'no_target' }
  }
  const margin = input.marginPercent
  if (typeof margin !== 'number' || !Number.isFinite(margin)) {
    return { measured: false, gap: 'margin_not_measured' }
  }
  // ⚠️ `measurable === false` seulement : `undefined` veut dire « le serveur ne
  // porte pas encore le champ », et refuser dans ce cas priverait l'anneau de
  // toute lecture sur un déploiement décalé. Le champ EXISTE et rend `false`
  // quand il faut se taire.
  if (input.measurable === false) return { measured: false, gap: 'margin_not_measurable' }

  const factor = 10 ** ATTAINMENT_PERCENT_DECIMALS
  const raw = (margin / target) * 100
  const percent = Math.round(raw * factor) / factor
  return {
    measured: true,
    percent: percent === 0 ? 0 : percent,
    targetPercent: target,
    marginPercent: margin,
    // ⚠️ Comparé sur les valeurs RÉELLES, jamais sur le pourcentage arrondi :
    // une marge de 24,96 % contre un objectif de 25 % rend « 99,8 % » —
    // l'arrondi à 100 % ferait dire « atteint » à un objectif manqué.
    reached: margin >= target,
  }
}
