import { z } from 'zod'
import { MEASURABILITY_THRESHOLDS, measurability, measurabilitySchema, type Measurability } from './measurability.js'
import { missionMargin } from './staffing.js'

/**
 * Les QUATRE chiffres d'affaires, et pourquoi ils ne se fondent jamais en un
 * seul (PDF 5 §10).
 *
 * C'est la décision qui porte tout le fichier. Un « CA du mois » unique est le
 * chiffre le plus dangereux d'un outil commercial, parce que chacun croit qu'il
 * parle du sien : le commercial pense au signé, le patron au facturé, le
 * comptable à l'encaissé. Les quatre répondent à des questions différentes, et
 * l'écart ENTRE eux est justement l'information utile — un signé très supérieur
 * au produit dit qu'on vend plus vite qu'on ne livre ; un facturé très
 * supérieur à l'encaissé dit qu'on a un problème de recouvrement.
 *
 * Deux règles d'honnêteté :
 *
 *  - **`null` n'est jamais 0.** Un CA encaissé à `null` veut dire « aucune
 *    source de paiement branchée », pas « personne n'a payé ». Les confondre
 *    ferait chercher une panne commerciale là où il n'y a qu'un connecteur
 *    manquant.
 *  - **Ce qui n'est pas mesurable est COMPTÉ à part.** Une mission sans TJM ne
 *    vaut pas 0 € : elle sort du total et le total dit combien il en a laissé
 *    de côté. Sans ce compteur, un total partiel se lit comme un total.
 */

export const REVENUE_KINDS = [
  /** Ce qui a été SIGNÉ : les missions gagnées sur la période, à leur montant
   *  contractuel. Le chiffre du commercial. */
  'signed',
  /** Ce qui a été PRODUIT : les jours réellement travaillés × le TJM. Le
   *  chiffre du delivery. */
  'produced',
  /** Ce qui a été FACTURÉ : ce qui est sorti vers l'outil comptable. */
  'invoiced',
  /** Ce qui a été ENCAISSÉ : ce que le client a réellement payé. */
  'collected',
] as const
export const revenueKindSchema = z.enum(REVENUE_KINDS)
export type RevenueKind = (typeof REVENUE_KINDS)[number]

export const revenueLineSchema = z.object({
  kind: revenueKindSchema,
  /** En centimes. `null` = pas de source pour ce chiffre — jamais 0. */
  amountCents: z.number().int().nullable(),
  /** Combien de lignes n'ont pas pu être chiffrées. Le total annoncé est alors
   *  un PLANCHER, et il le dit. */
  withoutAmount: z.number().int().nonnegative(),
  /** Pourquoi il n'y a pas de chiffre. Affiché tel quel. */
  unavailableReason: z.string().nullable(),
  /**
   * LE DÉNOMINATEUR — combien de lignes source la requête a vues (01/09/2026).
   *
   * `withoutAmount` disait déjà ce qui MANQUE, mais pas sur quoi. « 3 lignes
   * sans montant » ne se lit pas pareil sur 4 missions et sur 400, et c'est
   * précisément la question à laquelle « Explique-moi ce chiffre » (PDF 6 §5.1)
   * doit répondre : la ligne COMPLÉTUDE est obligatoire, elle a besoin d'un
   * total.
   *
   * Le compte existait déjà dans le SQL (`source_rows`) et n'était pas rendu.
   *
   * ⚠️ `null` par défaut, et surtout pas `0` : le champ est AJOUTÉ à une réponse
   * qui circule déjà, et le web se déploie dix minutes avant l'API. Un `0` par
   * défaut ferait écrire « calculé sur 0 ligne » à un écran servi par l'ancienne
   * API — un chiffre faux. `null` veut dire « je n'ai pas lu le total », et
   * l'écran retire alors le geste plutôt que d'expliquer de travers.
   */
  sourceRows: z.number().int().nonnegative().nullable().default(null),
})
export type RevenueLine = z.infer<typeof revenueLineSchema>

export const revenueBreakdownSchema = z.object({
  periodMonth: z.string(),
  lines: z.array(revenueLineSchema).length(4),
})
export type RevenueBreakdown = z.infer<typeof revenueBreakdownSchema>

/**
 * LE CA CONFIRMÉ — l'ENCAISSÉ, moins ce qui est CONTESTÉ (#2900, #2415.10).
 *
 * Ce n'est PAS un cinquième chiffre d'affaires : les quatre lignes de
 * `revenueBreakdownSchema` restent EXACTEMENT quatre (§ ci-dessus). C'est une
 * dérivation SÉPARÉE, pour une question que Laura doit pouvoir répondre et
 * qu'aucune des quatre lignes ne permet de nommer — l'ENCAISSÉ compte
 * aujourd'hui une facture contestée comme n'importe quelle autre, et un jour
 * contesté (`contestedDays`/`correctionDeadline`, `get_timesheets`) ne peut
 * donc pas s'expliquer par « il est exclu du CA confirmé ».
 *
 * Mêmes règles d'honnêteté que les quatre lignes : `null` n'est jamais 0, et
 * ce qui est écarté (`excludedDisputed`) est COMPTÉ et NOMMÉ, jamais fondu
 * dans le total ni tû.
 */
export const confirmedRevenueSchema = z.object({
  periodMonth: z.string(),
  amountCents: z.number().int().nullable(),
  withoutAmount: z.number().int().nonnegative(),
  unavailableReason: z.string().nullable(),
  sourceRows: z.number().int().nonnegative().nullable(),
  /** Combien de lignes encaissées ce mois sont EXCLUES parce que contestées.
   *  `null` = la lecture a échoué, pas « aucune contestée ». */
  excludedDisputed: z.number().int().nonnegative().nullable(),
})
export type ConfirmedRevenue = z.infer<typeof confirmedRevenueSchema>

/**
 * LA MARGE PRÉVISIONNELLE — ce qu'on peut en mesurer sans rien inventer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PROBLÈME, ET POURQUOI IL A TENU SI LONGTEMPS
 * ─────────────────────────────────────────────────────────────────────────────
 * `METRICS_NOT_PHOTOGRAPHED` la portait ainsi depuis le 31/08/2026 : « Aucune
 * dérivation ne la calcule. `forecast` est un prévisionnel de CA, volontairement
 * NON pondéré (doctrine “aucune probabilité”), et aucun `forecastMargin`
 * n’existe. Photographier supposerait de l’inventer — donc d’inventer un
 * chiffre. » Le constat était exact ; la conclusion allait un cran trop loin.
 *
 * Le prévisionnel a TROIS lignes, et elles ne sont pas de même nature :
 *
 *  · **acquis** — des missions déjà signées, en cours, jusqu'à leur fin CONNUE ;
 *  · **probable** — des missions au statut `renewed`, donc un geste a eu lieu ;
 *  · **espéré** — des OPPORTUNITÉS, c'est-à-dire du pipe.
 *
 * Les deux premières portent un TJM et un coût chargé SAISIS
 * (`mission_commercial_terms.loaded_daily_cost_cents`). Leur marge n'est pas une
 * prévision : c'est la marge CONTRACTUELLE de contrats existants, appliquée à du
 * chiffre qui n'est pas encore produit. Rien n'y est deviné.
 *
 * La troisième n'a **aucun coût** — la mission qui le porterait n'existe pas
 * encore. Lui attribuer la marge moyenne des deux autres serait une hypothèse
 * présentée comme une mesure, et la pondérer par une chance de signature est
 * refusé au registre (`c26_probabilite`, refusé six fois). Elle reste donc
 * DEHORS, et le contrat le dit par son nom : `CONTRACTED_FORECAST_LINES`.
 *
 * ⚠️ **Ce n'est donc PAS « la marge prévisionnelle » de la maquette**, qui
 * couvrirait les trois lignes. C'est la moitié qui se mesure, nommée pour ce
 * qu'elle est. La moitié qui ne se mesure pas garde sa raison, à l'écran.
 */
export const CONTRACTED_FORECAST_LINES = ['secured', 'likely'] as const

/**
 * La marge des lignes contractualisées du prévisionnel.
 *
 * Même forme que l'agrégat mensuel (`aggregateMargin`) parce que c'est la MÊME
 * dérivation, sur une autre population : une seconde formule de marge dans ce
 * dépôt serait le défaut que GA-26 existe pour interdire.
 *
 * `marginPercent: null` = aucune des missions contractualisées ne porte à la
 * fois un TJM et un coût. Jamais `0` : « marge nulle » ferait renégocier,
 * « on ne connaît pas le coût » fait remplir une fiche.
 */
export const contractedForecastMarginSchema = z.object({
  marginPercent: z.number().nullable(),
  measured: z.number().int().nonnegative(),
  unmeasured: z.number().int().nonnegative(),
  measurability: measurabilitySchema,
})
export type ContractedForecastMargin = z.infer<typeof contractedForecastMarginSchema>

/**
 * La marge d'une mission, en pourcentage.
 *
 * `null` dès qu'un terme manque, et surtout pas 0 : « marge nulle » et « on ne
 * connaît pas le coût » mènent à deux décisions opposées — la première fait
 * renégocier, la seconde fait remplir une fiche.
 *
 * Un TJM à 0 rend `null` lui aussi : diviser par zéro produirait `Infinity`,
 * qui s'affiche « ∞ % » et fait rire en réunion.
 */
export function marginPercent(dailyRateCents: number | null, dailyCostCents: number | null): number | null {
  // Un seul noyau (GA-26, D43). Cette fonction ne refait pas le calcul : elle
  // n'est plus qu'un appel positionnel, gardé pour ses appelants historiques.
  // Le coût attendu est celui des conditions commerciales, en centimes.
  return missionMargin({ dailyRateCents, loadedDailyCostCents: dailyCostCents })?.percent ?? null
}

/**
 * Une marge doit-elle alerter ?
 *
 * `null` ne se compare pas : une mission dont on ignore le coût n'est ni
 * au-dessus ni en dessous du seuil, et l'alerter enverrait un responsable
 * renégocier un TJM sur la foi d'une fiche incomplète.
 *
 * Un seuil absent = pas d'alerte. Le réglage est éteint par défaut : une alerte
 * de marge qui se déclenche seule le premier jour apprend surtout à ignorer les
 * alertes.
 */
export function marginBelowThreshold(margin: number | null, thresholdPercent: number | null): boolean {
  if (margin === null || thresholdPercent === null) return false
  return margin < thresholdPercent
}

/**
 * Agrège une marge sur plusieurs missions, PONDÉRÉE par les jours.
 *
 * Une moyenne simple traiterait une mission d'un jour comme une mission d'un
 * an. Et une mission dont un terme manque sort du calcul ET du dénominateur —
 * la compter à 0 % effondrerait la moyenne, la compter au TJM plein la
 * gonflerait ; ni l'un ni l'autre n'est vrai.
 */
export function aggregateMargin(
  rows: readonly { dailyRateCents: number | null; dailyCostCents: number | null; days: number | null }[],
): { marginPercent: number | null; measured: number; unmeasured: number; measurability: Measurability } {
  let revenue = 0
  let cost = 0
  let measured = 0
  let unmeasured = 0

  for (const row of rows) {
    if (row.dailyRateCents === null || row.dailyCostCents === null || row.days === null || row.days <= 0) {
      unmeasured += 1
      continue
    }
    revenue += row.dailyRateCents * row.days
    cost += row.dailyCostCents * row.days
    measured += 1
  }

  /**
   * ⚠️ La MESURABILITÉ, et non seulement le nombre de missions comptées.
   *
   * `MEASURABILITY_THRESHOLDS.averageMargin` était déclaré depuis le 21/08 et
   * lu par personne : une marge calculée sur deux missions s'affichait comme
   * une marge d'espace, avec toute l'autorité d'un pourcentage. Sous le seuil,
   * le chiffre reste calculé — mais l'écran sait désormais qu'il ne doit pas
   * décider dessus, et il peut dire combien d'observations manquent.
   */
  const state = measurability(measured, MEASURABILITY_THRESHOLDS.averageMargin)
  if (measured === 0 || revenue <= 0) return { marginPercent: null, measured, unmeasured, measurability: state }
  return {
    marginPercent: Number((((revenue - cost) / revenue) * 100).toFixed(1)),
    measured,
    unmeasured,
    measurability: state,
  }
}
