/**
 * CE QU'UNE OFFRE RAPPORTE RÉELLEMENT — pur, sans base, sans horloge (#1656).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI TIENT TOUT LE FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * **Une offre à 0 client n'a AUCUNE colonne dérivée.** Pas « 0 € de MRR », pas
 * « 0 % de marge », pas « 0 % de dépassement » : `null`, avec sa raison nommée.
 * Une marge de 0 % sur une offre que personne n'a prise n'est pas prudente,
 * elle est FAUSSE — et c'est exactement la question que ce dépôt pose à chaque
 * valeur absente : *si elle manque, « 0 » est-il VRAI ?*
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES PRIX NE SE RECOPIENT JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le catalogue entre par le paramètre `catalog`, résolu par
 * `PlanCatalogService` (la table `plan_definitions`, éditable en direct). Une
 * grille recopiée ici diverge le jour où l'opérateur change un tarif, et
 * l'écran se mettrait à mesurer une grille morte. C'est la doctrine déjà écrite
 * dans `business-metrics/module-tokens.ts`, appliquée au même endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LA MARGE N'EST PAS MESURABLE, ET CE FICHIER NE FAIT PAS SEMBLANT
 * ─────────────────────────────────────────────────────────────────────────────
 * La question a déjà été tranchée dans ce dépôt, au niveau GLOBAL, par
 * `measureBellumGrossMargin` (`modules/analytics/manager-kpi.ts`, D436) : le
 * revenu est en EUR (grille des offres), le registre des coûts fournisseurs est
 * en USD (`provider_costs.cost_usd`, tarifé par `PROVIDER_UNIT_COST_*`), et
 * **Bellum ne convertit rien** — « un taux de change appliqué à la volée fait
 * diverger la comptabilité de ce que le client a vu ». La marge GLOBALE rend
 * donc `currency_mismatch` en production.
 *
 * Par offre, c'est strictement plus difficile, et trois obstacles s'ajoutent au
 * premier — écrits ici pour que personne ne les redécouvre :
 *
 *  1. **Devises incomparables.** Le blocage ci-dessus, inchangé. C'est celui
 *     que ce fichier rend, parce que c'est le premier rencontré.
 *  2. **Le registre des coûts n'a pas de dimension « offre ».**
 *     `provider_costs` porte `workspace_id` / `user_id` ; le palier d'un espace
 *     vit sur la ligne d'abonnement de son PROPRIÉTAIRE. Imputer un coût à une
 *     offre demande une jointure `provider_costs → workspaces → subscriptions`
 *     qu'aucun agrégat ne fait aujourd'hui, et l'agrégat existant `byWorkspace`
 *     est borné aux 20 espaces les plus chers — un sous-ensemble, pas un total.
 *  3. **Le coût connu est un PLANCHER.** Les lignes sans prix unitaire sont
 *     exclues des totaux et comptées à part (`untariffed`) : une marge posée
 *     sur ce total serait au mieux une borne haute présentée comme une mesure.
 *
 * Aucun de ces trois obstacles ne se contourne par un calcul. On NOMME donc le
 * trou plutôt que de le masquer — et ce fichier ne lit même pas `provider_costs`,
 * parce qu'un chiffre qu'on ne rendra pas ne se calcule pas.
 */

/** Une offre du catalogue, réduite à ce que l'économie d'une offre lit. */
export interface OfferCatalogEntry {
  key: string
  label: string
  /** Prix mensuel de l'offre, en centimes d'euro. */
  priceCents: number
  /** Prix mensuel d'UN siège au-delà de ceux inclus, en centimes d'euro. */
  seatPriceCents: number
  /** Le plafond de crédits nominal du cycle (`accounts_limit` du catalogue). */
  creditsPerCycle: number
  sortOrder: number
}

/**
 * Une ligne d'abonnement, réduite à ce que ce calcul lit.
 *
 * `capacity` est la capacité DÉPENSABLE du cycle — quota du palier + recharge
 * ponctuelle + report encore valide. Elle est calculée par l'appelant, avec la
 * même formule que `credits.service` (`SPENDABLE_SQL`), et jamais redérivée
 * ici : deux chemins qui refont une dérivation divergent.
 */
export interface OfferSubscriptionRow {
  plan: string
  billingMode: 'stripe' | 'manual'
  extraSeats: number
  /** Crédits consommés sur le cycle en cours (`accounts_used`). */
  creditsUsed: number
  capacity: number
  /** Début du cycle, ISO. `null` = ligne héritée sans cycle connu. */
  periodStart: string | null
}

// Les trois raisons ci-dessous ne sont pas exportées : elles ne sont consommées
// que par `OfferEconomics`, dans ce fichier (knip refuse un type exporté qui ne
// sort jamais). La console les redéclare pour son propre contrat HTTP.

/** Pourquoi la consommation médiane n'est pas un chiffre. */
type OfferMedianUnavailable = 'no_customers' | 'too_few_customers'

/** Pourquoi le taux de dépassement n'est pas un chiffre. */
type OfferOverrunUnavailable = 'no_customers' | 'no_cap'

/** Pourquoi la marge n'est pas un chiffre. Voir le docblock de tête. */
type OfferMarginBlockedReason = 'no_customers' | 'currency_mismatch'

/**
 * Ce que la marge de ce dépôt EXCLUT structurellement, offre ou pas.
 *
 * Aucune table de ce dépôt ne porte ces postes. Même liste d'esprit que
 * `FIXED_COST_FAMILIES_UNMEASURED` (`modules/analytics/manager-kpi.ts`),
 * volontairement RECOPIÉE en valeur et non importée : ce module ne dépend pas
 * d'`analytics`, et un import laisserait croire que les deux listes sont la
 * même mesure alors qu'elles ne partagent que leur constat.
 */
export const OFFER_MARGIN_EXCLUDED_COST_FAMILIES = [
  'hébergement',
  'observabilité',
  'outillage interne',
  'frais de paiement',
  'salaires',
] as const

/** Ce que la marge peut dire d'elle-même. `measurable` est un littéral `false` :
 *  aucun chemin de ce fichier ne peut la rendre mesurable, et le type le dit. */
interface OfferMargin {
  measurable: false
  /** `null` toujours — voir {@link OfferMargin.measurable}. */
  rate: null
  blockedReason: OfferMarginBlockedReason
  excludedCostFamilies: typeof OFFER_MARGIN_EXCLUDED_COST_FAMILIES
}

/** Une ligne du catalogue enrichie de ce que l'offre rapporte. */
export interface OfferEconomics {
  key: string
  label: string
  priceCents: number
  creditsPerCycle: number

  /** Combien de lignes d'abonnement portent cette offre, tous modes confondus. */
  customers: number
  /** Combien d'entre elles sont facturées sur facture — elles ne font pas de MRR. */
  manualCustomers: number

  /** MRR généré, en centimes. `null` sans aucun client : « rien n'est mesuré »
   *  n'est pas « zéro euro ». Mesuré à 0 quand l'offre n'a que des clients sur
   *  facture — c'est alors un fait, pas une absence. */
  mrrCents: number | null

  /** Crédits consommés, valeur médiane. `null` sous 3 clients : une médiane sur
   *  deux personnes en DÉSIGNE une, et ne dit rien de l'offre. */
  medianCreditsUsed: number | null
  medianUnavailable: OfferMedianUnavailable | null

  /** Part des clients de l'offre qui ont atteint leur plafond, dans [0, 1]. */
  overrunRate: number | null
  /** Combien l'ont atteint. `null` avec {@link overrunRate}. */
  overrunObserved: number | null
  /** Sur combien — les lignes SANS plafond en sortent. `null` avec le taux. */
  overrunEligible: number | null
  overrunUnavailable: OfferOverrunUnavailable | null
  /**
   * Le taux est-il un PLANCHER ?
   *
   * Vrai dès qu'un client n'a pas encore atteint son plafond ET que son cycle
   * n'est pas refermé : il peut encore l'atteindre. Le taux dit alors « au
   * moins X % », et l'écran doit l'écrire — sinon un taux de 20 % relevé le 3
   * du mois se lit comme un verdict.
   */
  overrunIsFloor: boolean

  margin: OfferMargin
}

/** Le seuil sous lequel une médiane désigne quelqu'un au lieu de décrire un
 *  groupe. Trois, comme le demande l'issue — écrit une fois, ici. */
const MEDIAN_MIN_CUSTOMERS = 3

/**
 * La fin du cycle ouvert à `periodStart` : un mois plus tard, exactement comme
 * la borne du cron de reset (`period_start` + 1 mois). `null` quand la date est
 * absente ou illisible — « on ne sait pas », qui n'est pas « c'est fini ».
 */
function cycleEnd(periodStart: string | null): number | null {
  if (!periodStart) return null
  const start = Date.parse(periodStart)
  if (!Number.isFinite(start)) return null
  const date = new Date(start)
  date.setUTCMonth(date.getUTCMonth() + 1)
  return date.getTime()
}

/** La médiane d'un échantillon non vide. Les deux du milieu se moyennent. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] as number
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
}

/**
 * L'économie de chaque offre du catalogue.
 *
 * `today` est un PARAMÈTRE, jamais `new Date()` : il ne sert qu'à savoir si un
 * cycle est refermé, et un test qui lirait l'horloge passerait à Paris pour
 * échouer en CI (UTC).
 */
export function computeOfferEconomics(input: {
  catalog: readonly OfferCatalogEntry[]
  subscriptions: readonly OfferSubscriptionRow[]
  today: Date
}): OfferEconomics[] {
  const now = input.today.getTime()
  const byPlan = new Map<string, OfferSubscriptionRow[]>()
  for (const entry of input.catalog) byPlan.set(entry.key, [])
  for (const row of input.subscriptions) {
    // Une ligne dont le plan a quitté le catalogue n'est rattachée à personne :
    // la recoller sur une offre voisine inventerait des clients.
    byPlan.get(row.plan)?.push(row)
  }

  return [...input.catalog]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(entry => {
      const rows = byPlan.get(entry.key) ?? []
      const base = {
        key: entry.key,
        label: entry.label,
        priceCents: entry.priceCents,
        creditsPerCycle: entry.creditsPerCycle,
        customers: rows.length,
        manualCustomers: rows.filter(row => row.billingMode === 'manual').length,
      }

      if (rows.length === 0) {
        return {
          ...base,
          mrrCents: null,
          medianCreditsUsed: null,
          medianUnavailable: 'no_customers' as const,
          overrunRate: null,
          overrunObserved: null,
          overrunEligible: null,
          overrunUnavailable: 'no_customers' as const,
          overrunIsFloor: false,
          margin: {
            measurable: false as const,
            rate: null,
            blockedReason: 'no_customers' as const,
            excludedCostFamilies: OFFER_MARGIN_EXCLUDED_COST_FAMILIES,
          },
        }
      }

      // #1645 — le MRR n'inclut QUE le récurrent. Un client sur facture reste
      // un client de l'offre, mais son engagement n'est pas du MRR.
      const mrrCents = rows
        .filter(row => row.billingMode === 'stripe')
        .reduce((sum, row) => sum + entry.priceCents + Math.max(0, row.extraSeats) * entry.seatPriceCents, 0)

      const enoughForMedian = rows.length >= MEDIAN_MIN_CUSTOMERS

      // Une ligne sans plafond n'a rien à dépasser : elle sort du DÉNOMINATEUR,
      // sinon `used >= 0` la compterait en dépassement permanent.
      const withCap = rows.filter(row => row.capacity > 0)
      const reached = withCap.filter(row => row.creditsUsed >= row.capacity)
      const stillOpen = withCap.some(row => {
        if (row.creditsUsed >= row.capacity) return false
        const end = cycleEnd(row.periodStart)
        return end === null || end > now
      })

      return {
        ...base,
        mrrCents,
        medianCreditsUsed: enoughForMedian ? median(rows.map(row => row.creditsUsed)) : null,
        medianUnavailable: enoughForMedian ? null : ('too_few_customers' as const),
        overrunRate: withCap.length > 0 ? reached.length / withCap.length : null,
        overrunObserved: withCap.length > 0 ? reached.length : null,
        overrunEligible: withCap.length > 0 ? withCap.length : null,
        overrunUnavailable: withCap.length > 0 ? null : ('no_cap' as const),
        overrunIsFloor: stillOpen,
        margin: {
          measurable: false as const,
          rate: null,
          blockedReason: 'currency_mismatch' as const,
          excludedCostFamilies: OFFER_MARGIN_EXCLUDED_COST_FAMILIES,
        },
      }
    })
}
