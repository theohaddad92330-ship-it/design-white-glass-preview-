import { z } from 'zod'
import type { EmployeeCostOrigin, MissionCostBreakdown, MissionCostSource } from './mission-cost-source.js'
import { missionMargin, type MissionChannel } from './staffing.js'

/**
 * #2420 — LE MOTEUR DE MARGE DE MISSION (LAU-FINAL-134, 17/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL AJOUTE AU NOYAU, ET CE QU'IL NE REMPLACE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `missionMargin` (`staffing.ts`) reste LE noyau : la marge commerciale d'une
 * ligne sans source déclarée est, au centime et à la décimale, celle qu'il rend
 * — la liste, le board, les alertes de seuil et la fiche continuent de dire le
 * même nombre (D43, GA-26). Le moteur l'APPELLE et construit autour :
 *
 *  · TROIS NIVEAUX — commerciale (revenu moins coût direct du consultant),
 *    brute (moins les coûts directs configurés), contribution (moins les
 *    allocations internes, seulement si l'espace en a configuré). La
 *    contribution n'est JAMAIS un résultat net, et aucune clé de la réponse
 *    ne porte ce mot (#2420.5) ;
 *  · QUATRE SOURCES DE COÛT — freelance, salarié, partenaire, forfait ;
 *  · NEUF IDENTIFIANTS par calcul (#2420.11) — formule versionnée, période,
 *    revenus utilisés, coûts utilisés, hypothèses, exclusions, source, devise,
 *    confiance ;
 *  · TROIS ÉTATS d'affichage (#2420.12) — `measured`, `partial`,
 *    `not_measured`. C'est la « confiance » : un ÉTAT nommé, jamais un
 *    pourcentage — aucune probabilité ne s'affiche (arbitrage n°4) ;
 *  · SEPT ALERTES (#2420.15), un DIAGNOSTIC (#2420.17) et SIX SCÉNARIOS
 *    (#2420.14).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS RÈGLES QUI NE SE DISCUTENT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. Un coût absent rend la marge ABSENTE — jamais 0 %, jamais un coût moyen,
 *     jamais un coût salarial reconstruit (#2420.8, #2420.13). Il n'existe
 *     d'ailleurs aucune entrée « salaire » : on ne peut pas reconstruire ce
 *     qu'on ne reçoit pas.
 *  2. Deux devises différentes ne se soustraient pas sans taux de change — et
 *     le moteur n'en invente aucun : la marge devient non mesurée.
 *  3. La marge n'est pas du cash : les délais de paiement et l'état de
 *     facturation sont TOUJOURS dans les exclusions, écrits, pour que la
 *     phrase « elle n'inclut pas les délais de paiement » ne dépende pas de la
 *     mémoire de l'écran.
 */

/**
 * La version de la formule. Elle change quand un calcul change — jamais pour
 * un libellé. Un chiffre relu plus tard se compare à la formule qui l'a
 * produit, pas à celle du jour.
 */
export const MISSION_MARGIN_FORMULA_VERSION = 'mission-margin-2026-09-17' as const

/** Les trois états d'affichage — la « confiance » du calcul. */
export const MISSION_MARGIN_CONFIDENCES = ['measured', 'partial', 'not_measured'] as const
export type MissionMarginConfidence = (typeof MISSION_MARGIN_CONFIDENCES)[number]

export const MISSION_MARGIN_ALERT_KINDS = [
  'below_threshold',
  'cost_missing',
  'rate_changed',
  'unvalidated_days',
  'unrebilled_expenses',
  'partner_missing',
  'currency_mismatch',
] as const
export type MissionMarginAlertKind = (typeof MISSION_MARGIN_ALERT_KINDS)[number]

export const MISSION_MARGIN_SCENARIO_KINDS = [
  'current_rate',
  'renewed_rate',
  'future_cost',
  'extension',
  'expected_days',
  'different_volume',
] as const
export type MissionMarginScenarioKind = (typeof MISSION_MARGIN_SCENARIO_KINDS)[number]

/** Les clés que l'écran traduit. Des LISTES fermées : un libellé libre ne se traduit pas. */
export const MISSION_MARGIN_REVENUE_KEYS = ['daily_rate', 'partner_sale_price', 'fixed_price_amount'] as const
type RevenueKey = (typeof MISSION_MARGIN_REVENUE_KEYS)[number]

export const MISSION_MARGIN_COST_KEYS = [
  'loaded_daily_cost',
  'supplier_daily_rate',
  'supplier_commission',
  'supplier_taxes',
  'standard_daily_cost',
  'period_cost',
  'hourly_cost',
  'partner_purchase_price',
  'partner_fee',
  'partner_split',
  'amortized_expenses',
  'amortized_supplier_invoices',
  'specific_costs',
  'other_validated_costs',
  'internal_allocations',
  'team_time',
  'subcontracting',
  'mission_expenses',
  'supplier_invoices',
] as const
type CostKey = (typeof MISSION_MARGIN_COST_KEYS)[number]

export const MISSION_MARGIN_ASSUMPTIONS = [
  'standard_cost_is_an_estimate',
  'period_cost_spread_over_worked_days',
  'hourly_cost_times_hours_per_day',
  'expenses_amortized_over_elapsed_days',
  'expenses_counted_as_not_rebilled',
  'at_completion_uses_remaining_work_estimate',
  'currency_not_specified_eur_by_default',
  'scenario_simulation',
] as const
type MarginAssumption = (typeof MISSION_MARGIN_ASSUMPTIONS)[number]

export const MISSION_MARGIN_EXCLUSIONS = [
  'payment_delays',
  'invoicing_status',
  'internal_allocations',
  'expenses_not_amortizable',
  'supplier_invoices_covered_by_supplier_rate',
  'supplier_taxes',
  'unvalidated_days',
] as const
type MarginExclusion = (typeof MISSION_MARGIN_EXCLUSIONS)[number]

export const MISSION_MARGIN_MISSING = [
  'revenue',
  'direct_cost',
  'exchange_rate',
  'supplier_commission',
  'partner_terms',
  'fixed_price_subcontracting',
  'expenses_start_date',
] as const
type MarginMissing = (typeof MISSION_MARGIN_MISSING)[number]

export type MissionMarginEngineInput = {
  channel: MissionChannel
  costSource: MissionCostSource | null
  /** Devise du TJM et du contrat. `null` = non renseignée (lignes historiques, en euros). */
  currency: string | null
  /** Devise du coût, quand elle diffère. `null` = la même que `currency`. */
  costCurrency: string | null
  dailyRateCents: number | null
  loadedDailyCostCents: number | null
  partnerCommissionDailyCents: number | null
  breakdown: MissionCostBreakdown
  /** Montant du contrat au forfait (le bon de commande). */
  fixedPriceRevenueCents: number | null
  expensesTotalCents: number
  supplierInvoicesTotalCents: number
  elapsedDays: number | null
  /** `AAAA-MM` — la période dont on compte les jours. */
  period: string | null
  validatedDays: number | null
  unvalidatedDays: number | null
  thresholdPercent: number | null
  /** Le TJM en vigueur quand le coût a été saisi — ce qui permet de dire « tarif changé ». */
  costRecordedRateCents: number | null
}

type MarginFigure = { amountCents: number; percent: number }

export type MissionMarginAlert = { kind: MissionMarginAlertKind; values: Record<string, number | string> }

export type MissionMarginDiagnostic = {
  /** Laura PROPOSE ; personne n'est relancé, rien n'est renégocié (#2420.16). */
  proposedBy: 'laura'
  automaticAction: 'none'
  thresholdPercent: number
  directCostSharePercent: number
  deductions: Array<{ key: CostKey; sharePercent: number }>
  /** Le TJM qui atteindrait le seuil au coût actuel. `null` si le seuil est ≥ 100 %. */
  rateForThresholdCents: number | null
  /** Le coût direct maximal qui tient le seuil au TJM actuel. */
  costCeilingForThresholdCents: number
}

export type MissionMarginComputation = {
  formulaVersion: typeof MISSION_MARGIN_FORMULA_VERSION
  /** `daily` : des centimes par jour. `mission_total` : le forfait, en entier. */
  basis: 'daily' | 'mission_total'
  period: {
    month: string
    validatedDays: number | null
    unvalidatedDays: number | null
    commercialAmountCents: number | null
    grossAmountCents: number | null
  } | null
  currency: string
  source: {
    costSource: MissionCostSource | 'unspecified'
    costOrigin: EmployeeCostOrigin | null
    table: 'mission_commercial_terms'
  }
  confidence: MissionMarginConfidence
  revenuesUsed: Array<{ key: RevenueKey; amountCents: number }>
  costsUsed: Array<{ key: CostKey; amountCents: number; level: 'commercial' | 'gross' | 'contribution' }>
  assumptions: MarginAssumption[]
  exclusions: MarginExclusion[]
  missing: MarginMissing[]
  commercial: MarginFigure | null
  gross: MarginFigure | null
  contribution: MarginFigure | null
  /** Forfait seulement : revenu moins budget consommé moins reste à faire. Une ESTIMATION. */
  atCompletion: MarginFigure | null
  alerts: MissionMarginAlert[]
  diagnostic: MissionMarginDiagnostic | null
}

const isKnown = (value: number | null | undefined): value is number =>
  value !== null && value !== undefined && Number.isFinite(value)

const percentOf = (amountCents: number, revenueCents: number): number =>
  Math.round((amountCents / revenueCents) * 1000) / 10

type DirectCost = {
  costs: Array<{ key: CostKey; amountCents: number }>
  origin: EmployeeCostOrigin | null
  assumptions: MarginAssumption[]
  missing: MarginMissing[]
  exclusions: MarginExclusion[]
  /** Le TJM fournisseur est déclaré : les factures du fournisseur le recoupent. */
  coversSupplierInvoices: boolean
}

/** Le coût DIRECT du consultant, par source (#2420.6, #2420.7, #2420.9). `costs` vide = inconnu. */
function resolveDirectCost(input: MissionMarginEngineInput, overrideCents: number | null): DirectCost {
  const b = input.breakdown
  const empty: DirectCost = {
    costs: [],
    origin: null,
    assumptions: [],
    missing: ['direct_cost'],
    exclusions: [],
    coversSupplierInvoices: false,
  }
  if (overrideCents !== null) {
    return { ...empty, costs: [{ key: 'loaded_daily_cost', amountCents: overrideCents }], missing: [] }
  }

  switch (input.costSource) {
    case 'freelance': {
      const rate = isKnown(b.supplierDailyRateCents) ? b.supplierDailyRateCents : null
      const base = rate ?? (isKnown(input.loadedDailyCostCents) ? input.loadedDailyCostCents : null)
      if (base === null) return empty
      const costs: DirectCost['costs'] = [
        { key: rate !== null ? 'supplier_daily_rate' : 'loaded_daily_cost', amountCents: base },
      ]
      const missing: MarginMissing[] = []
      const exclusions: MarginExclusion[] = []
      if (isKnown(b.supplierCommissionDailyCents)) {
        costs.push({ key: 'supplier_commission', amountCents: b.supplierCommissionDailyCents })
      } else {
        missing.push('supplier_commission')
      }
      // « Taxes selon source » : une taxe récupérable n'est pas un coût. Absente,
      // elle n'abaisse pas la confiance — elle est NOMMÉE comme non comptée.
      if (isKnown(b.supplierTaxesDailyCents)) {
        costs.push({ key: 'supplier_taxes', amountCents: b.supplierTaxesDailyCents })
      } else {
        exclusions.push('supplier_taxes')
      }
      return { costs, origin: null, assumptions: [], missing, exclusions, coversSupplierInvoices: rate !== null }
    }
    case 'employee': {
      // #2420.8 — l'ordre est celui de la donnée AUTORISÉE : le coût fourni ou
      // importé, puis un coût de période ou horaire fourni, puis un standard
      // VALIDÉ. Rien au-delà : aucune formule ne reconstruit un salaire.
      if (isKnown(input.loadedDailyCostCents)) {
        const origin = b.employeeCostOrigin === 'imported' ? 'imported' : 'provided'
        return {
          ...empty,
          costs: [{ key: 'loaded_daily_cost', amountCents: input.loadedDailyCostCents }],
          origin,
          missing: [],
        }
      }
      if (isKnown(b.periodCostCents) && isKnown(b.periodWorkedDays) && b.periodWorkedDays > 0) {
        return {
          ...empty,
          costs: [{ key: 'period_cost', amountCents: Math.round(b.periodCostCents / b.periodWorkedDays) }],
          origin: b.employeeCostOrigin === 'imported' ? 'imported' : 'provided',
          assumptions: ['period_cost_spread_over_worked_days'],
          missing: [],
        }
      }
      if (isKnown(b.hourlyCostCents) && isKnown(b.hoursPerDay) && b.hoursPerDay > 0) {
        return {
          ...empty,
          costs: [{ key: 'hourly_cost', amountCents: Math.round(b.hourlyCostCents * b.hoursPerDay) }],
          origin: b.employeeCostOrigin === 'imported' ? 'imported' : 'provided',
          assumptions: ['hourly_cost_times_hours_per_day'],
          missing: [],
        }
      }
      if (isKnown(b.standardDailyCostCents) && b.standardCostValidatedOn) {
        return {
          ...empty,
          costs: [{ key: 'standard_daily_cost', amountCents: b.standardDailyCostCents }],
          origin: 'validated_standard',
          assumptions: ['standard_cost_is_an_estimate'],
          missing: [],
        }
      }
      return empty
    }
    case 'partner': {
      const purchase = isKnown(b.partnerPurchaseDailyCents) ? b.partnerPurchaseDailyCents : null
      const base = purchase ?? (isKnown(input.loadedDailyCostCents) ? input.loadedDailyCostCents : null)
      if (base === null) return empty
      return {
        ...empty,
        costs: [{ key: purchase !== null ? 'partner_purchase_price' : 'loaded_daily_cost', amountCents: base }],
        missing: [],
      }
    }
    default: {
      if (!isKnown(input.loadedDailyCostCents)) return empty
      return { ...empty, costs: [{ key: 'loaded_daily_cost', amountCents: input.loadedDailyCostCents }], missing: [] }
    }
  }
}

const sum = (costs: ReadonlyArray<{ amountCents: number }>) =>
  costs.reduce((total, cost) => total + cost.amountCents, 0)

type EngineOverrides = { rateCents?: number | null; directCostCents?: number | null; scenario?: boolean }

function compute(input: MissionMarginEngineInput, overrides: EngineOverrides = {}): MissionMarginComputation {
  const b = input.breakdown
  const assumptions = new Set<MarginAssumption>()
  // #2420.18 — la marge n'est pas du cash : ces deux exclusions sont TOUJOURS écrites.
  const exclusions = new Set<MarginExclusion>(['payment_delays', 'invoicing_status'])
  const missing = new Set<MarginMissing>()
  const revenuesUsed: MissionMarginComputation['revenuesUsed'] = []
  const costsUsed: MissionMarginComputation['costsUsed'] = []
  if (overrides.scenario) assumptions.add('scenario_simulation')

  if (input.currency === null) assumptions.add('currency_not_specified_eur_by_default')
  const currency = input.currency ?? 'EUR'
  const costCurrency = input.costCurrency ?? currency
  const currencyMismatch = costCurrency !== currency
  const isFixedPrice = input.costSource === 'fixed_price'

  let commercial: MarginFigure | null = null
  let gross: MarginFigure | null = null
  let contribution: MarginFigure | null = null
  let atCompletion: MarginFigure | null = null
  let revenueCents: number | null = null
  let directCostCents: number | null = null
  let origin: EmployeeCostOrigin | null = null
  const grossCosts: Array<{ key: CostKey; amountCents: number }> = []

  if (currencyMismatch) {
    // Règle 2 : aucun taux de change inventé.
    missing.add('exchange_rate')
  } else if (isFixedPrice) {
    // #2420.10 — le forfait se lit en montants TOTAUX.
    revenueCents =
      isKnown(input.fixedPriceRevenueCents) && input.fixedPriceRevenueCents > 0 ? input.fixedPriceRevenueCents : null
    const team = isKnown(b.fixedPriceTeamTimeCostCents) ? b.fixedPriceTeamTimeCostCents : null
    if (revenueCents === null) missing.add('revenue')
    if (team === null) missing.add('direct_cost')
    if (revenueCents !== null && team !== null) {
      revenuesUsed.push({ key: 'fixed_price_amount', amountCents: revenueCents })
      costsUsed.push({ key: 'team_time', amountCents: team, level: 'commercial' })
      directCostCents = team
      commercial = { amountCents: revenueCents - team, percent: percentOf(revenueCents - team, revenueCents) }
      if (isKnown(b.fixedPriceSubcontractingCostCents)) {
        grossCosts.push({ key: 'subcontracting', amountCents: b.fixedPriceSubcontractingCostCents })
      } else {
        missing.add('fixed_price_subcontracting')
      }
      if (input.expensesTotalCents > 0) {
        grossCosts.push({ key: 'mission_expenses', amountCents: input.expensesTotalCents })
        assumptions.add('expenses_counted_as_not_rebilled')
      }
      if (input.supplierInvoicesTotalCents > 0) {
        grossCosts.push({ key: 'supplier_invoices', amountCents: input.supplierInvoicesTotalCents })
      }
      if (isKnown(b.fixedPriceBudgetConsumedCents) && isKnown(b.fixedPriceRemainingWorkCents)) {
        const amount = revenueCents - b.fixedPriceBudgetConsumedCents - b.fixedPriceRemainingWorkCents
        atCompletion = { amountCents: amount, percent: percentOf(amount, revenueCents) }
        assumptions.add('at_completion_uses_remaining_work_estimate')
      }
    }
  } else {
    const saleCents =
      input.costSource === 'partner' && isKnown(b.partnerSaleDailyCents) && overrides.rateCents === undefined
        ? b.partnerSaleDailyCents
        : null
    const rate = overrides.rateCents !== undefined ? overrides.rateCents : input.dailyRateCents
    revenueCents = saleCents ?? (isKnown(rate) && rate > 0 ? rate : null)
    const direct = resolveDirectCost(input, overrides.directCostCents ?? null)
    origin = direct.origin
    direct.assumptions.forEach(entry => assumptions.add(entry))
    direct.exclusions.forEach(entry => exclusions.add(entry))
    if (revenueCents === null) missing.add('revenue')
    direct.missing.forEach(entry => missing.add(entry))

    if (revenueCents !== null && direct.costs.length > 0) {
      directCostCents = sum(direct.costs)
      // LE NOYAU — une seule formule de marge commerciale dans le produit.
      commercial = missionMargin({ dailyRateCents: revenueCents, loadedDailyCostCents: directCostCents })
    }
    if (commercial !== null && revenueCents !== null) {
      revenuesUsed.push({ key: saleCents !== null ? 'partner_sale_price' : 'daily_rate', amountCents: revenueCents })
      direct.costs.forEach(cost => costsUsed.push({ ...cost, level: 'commercial' }))

      // #2420.3 — les coûts directs configurés de la marge brute.
      const intermediated =
        input.channel === 'partner' || input.channel === 'subcontracting' || input.costSource === 'partner'
      if (isKnown(input.partnerCommissionDailyCents)) {
        grossCosts.push({ key: 'partner_fee', amountCents: input.partnerCommissionDailyCents })
      }
      if (isKnown(b.partnerSplitPercent)) {
        grossCosts.push({
          key: 'partner_split',
          amountCents: Math.round((Math.max(commercial.amountCents, 0) * b.partnerSplitPercent) / 100),
        })
      }
      if (intermediated && !isKnown(input.partnerCommissionDailyCents) && !isKnown(b.partnerSplitPercent)) {
        missing.add('partner_terms')
      }
      const invoices = direct.coversSupplierInvoices ? 0 : input.supplierInvoicesTotalCents
      if (direct.coversSupplierInvoices && input.supplierInvoicesTotalCents > 0) {
        exclusions.add('supplier_invoices_covered_by_supplier_rate')
      }
      if (input.expensesTotalCents > 0 || invoices > 0) {
        const days = input.elapsedDays
        if (days === null || days <= 0) {
          exclusions.add('expenses_not_amortizable')
          missing.add('expenses_start_date')
        } else {
          assumptions.add('expenses_amortized_over_elapsed_days')
          if (input.expensesTotalCents > 0) {
            assumptions.add('expenses_counted_as_not_rebilled')
            grossCosts.push({ key: 'amortized_expenses', amountCents: Math.round(input.expensesTotalCents / days) })
          }
          if (invoices > 0) {
            grossCosts.push({ key: 'amortized_supplier_invoices', amountCents: Math.round(invoices / days) })
          }
        }
      }
      if (isKnown(b.specificDailyCostCents)) {
        grossCosts.push({ key: 'specific_costs', amountCents: b.specificDailyCostCents })
      }
      if (isKnown(b.otherValidatedDailyCostCents)) {
        grossCosts.push({ key: 'other_validated_costs', amountCents: b.otherValidatedDailyCostCents })
      }
    }
  }

  if (commercial !== null && revenueCents !== null) {
    grossCosts.forEach(cost => costsUsed.push({ ...cost, level: 'gross' }))
    const grossAmount = commercial.amountCents - sum(grossCosts)
    gross = { amountCents: grossAmount, percent: percentOf(grossAmount, revenueCents) }
    // #2420.4 — la contribution suit la POLITIQUE : sans allocation configurée,
    // elle n'existe pas, et l'exclusion le dit.
    if (!isFixedPrice && isKnown(b.internalAllocationDailyCents)) {
      costsUsed.push({
        key: 'internal_allocations',
        amountCents: b.internalAllocationDailyCents,
        level: 'contribution',
      })
      const amount = grossAmount - b.internalAllocationDailyCents
      contribution = { amountCents: amount, percent: percentOf(amount, revenueCents) }
    } else {
      exclusions.add('internal_allocations')
    }
  } else {
    exclusions.add('internal_allocations')
  }

  if (isKnown(input.unvalidatedDays) && input.unvalidatedDays > 0) exclusions.add('unvalidated_days')

  // #2420.12 — trois états.
  const confidence: MissionMarginConfidence =
    commercial === null
      ? 'not_measured'
      : missing.size > 0 ||
          assumptions.has('standard_cost_is_an_estimate') ||
          assumptions.has('at_completion_uses_remaining_work_estimate')
        ? 'partial'
        : 'measured'

  const validatedDays = isKnown(input.validatedDays) ? input.validatedDays : null
  const perDay = !isFixedPrice && validatedDays !== null
  const period = input.period
    ? {
        month: input.period,
        validatedDays,
        unvalidatedDays: isKnown(input.unvalidatedDays) ? input.unvalidatedDays : null,
        commercialAmountCents: perDay && commercial ? Math.round(commercial.amountCents * validatedDays) : null,
        grossAmountCents: perDay && gross ? Math.round(gross.amountCents * validatedDays) : null,
      }
    : null

  const alerts = alertsOf(input, { commercial, missing, currency, costCurrency, overrides })
  const diagnostic =
    commercial !== null && revenueCents !== null && directCostCents !== null
      ? diagnose(input.thresholdPercent, commercial, revenueCents, directCostCents, grossCosts)
      : null

  return {
    formulaVersion: MISSION_MARGIN_FORMULA_VERSION,
    basis: isFixedPrice ? 'mission_total' : 'daily',
    period,
    currency,
    source: {
      costSource: input.costSource ?? 'unspecified',
      costOrigin: origin,
      table: 'mission_commercial_terms',
    },
    confidence,
    revenuesUsed,
    costsUsed,
    assumptions: MISSION_MARGIN_ASSUMPTIONS.filter(key => assumptions.has(key)),
    exclusions: MISSION_MARGIN_EXCLUSIONS.filter(key => exclusions.has(key)),
    missing: MISSION_MARGIN_MISSING.filter(key => missing.has(key)),
    commercial,
    gross,
    contribution,
    atCompletion,
    alerts,
    diagnostic,
  }
}

/** #2420.15 — sept alertes. Elles se LISENT ; aucune ne déclenche quoi que ce soit (#2420.16). */
function alertsOf(
  input: MissionMarginEngineInput,
  state: {
    commercial: MarginFigure | null
    missing: Set<MarginMissing>
    currency: string
    costCurrency: string
    overrides: EngineOverrides
  },
): MissionMarginAlert[] {
  const alerts: MissionMarginAlert[] = []
  const { commercial } = state
  // Un seuil ne se compare jamais à une marge non mesurée.
  if (commercial !== null && isKnown(input.thresholdPercent) && commercial.percent < input.thresholdPercent) {
    alerts.push({ kind: 'below_threshold', values: { percent: commercial.percent, threshold: input.thresholdPercent } })
  }
  if (state.missing.has('direct_cost')) alerts.push({ kind: 'cost_missing', values: {} })
  const rate = state.overrides.rateCents !== undefined ? state.overrides.rateCents : input.dailyRateCents
  if (isKnown(input.costRecordedRateCents) && isKnown(rate) && input.costRecordedRateCents !== rate) {
    alerts.push({ kind: 'rate_changed', values: { previousRateCents: input.costRecordedRateCents, rateCents: rate } })
  }
  if (isKnown(input.unvalidatedDays) && input.unvalidatedDays > 0) {
    alerts.push({ kind: 'unvalidated_days', values: { days: input.unvalidatedDays } })
  }
  if (input.expensesTotalCents > 0) {
    alerts.push({ kind: 'unrebilled_expenses', values: { amountCents: input.expensesTotalCents } })
  }
  if (state.missing.has('partner_terms')) alerts.push({ kind: 'partner_missing', values: {} })
  if (state.currency !== state.costCurrency) {
    alerts.push({ kind: 'currency_mismatch', values: { currency: state.currency, costCurrency: state.costCurrency } })
  }
  return alerts
}

/** #2420.17 — le diagnostic que Laura PROPOSE sur une marge MESURÉE sous le seuil. */
function diagnose(
  thresholdPercent: number | null,
  commercial: MarginFigure,
  revenueCents: number,
  directCostCents: number,
  grossCosts: ReadonlyArray<{ key: CostKey; amountCents: number }>,
): MissionMarginDiagnostic | null {
  if (!isKnown(thresholdPercent) || commercial.percent >= thresholdPercent) return null
  const keep = 1 - thresholdPercent / 100
  return {
    proposedBy: 'laura',
    automaticAction: 'none',
    thresholdPercent,
    directCostSharePercent: percentOf(directCostCents, revenueCents),
    deductions: grossCosts.map(cost => ({ key: cost.key, sharePercent: percentOf(cost.amountCents, revenueCents) })),
    rateForThresholdCents: keep > 0 ? Math.ceil(directCostCents / keep) : null,
    costCeilingForThresholdCents: Math.floor(revenueCents * Math.max(keep, 0)),
  }
}

/** #2420 — le calcul complet d'une mission. Pur : même entrée, même réponse. */
export function computeMissionMargin(input: MissionMarginEngineInput): MissionMarginComputation {
  return compute(input)
}

/**
 * Ce que `POST /delivery/missions/:id/terms/scenario` accepte (#2420.14).
 * Mêmes bornes que le coût chargé : des centimes par jour.
 */
export const missionMarginScenarioSchema = z
  .object({
    kind: z.enum(MISSION_MARGIN_SCENARIO_KINDS),
    /** `renewed_rate` : le TJM envisagé. */
    rateCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
    /** `future_cost` : le coût direct envisagé. */
    costCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
    /** Les jours couverts par le scénario — la prolongation, les jours attendus, le volume. */
    days: z.number().min(0).max(100_000).nullable(),
  })
  .strict()
export type MissionMarginScenario = z.infer<typeof missionMarginScenarioSchema>

export type MissionMarginScenarioResult = {
  kind: MissionMarginScenarioKind
  /** `false` sur un forfait : un forfait ne se simule pas en jours. */
  applicable: boolean
  days: number | null
  computation: MissionMarginComputation
  commercialTotalCents: number | null
  grossTotalCents: number | null
  /**
   * #2783 — le REVENU total du scénario, sur les mêmes jours que les deux
   * totaux ci-dessus : `revenuesUsed[0]` (le TJM retenu par CE scénario,
   * jamais recalculé) fois `days`. Épopée « simulation impact avenant
   * (revenu/marge/forecast) » — la marge seule ne répond pas à « combien
   * facturé », et un avenant qui change le TJM ou la durée change les deux
   * chiffres différemment. `null` dans les mêmes cas que `commercialTotalCents`
   * (revenu non mesurable, ou jours absents) — jamais une seconde formule.
   *
   * ⚠️ C'EST AUSSI LA « FACTURATION » DE L'ÉPOPÉE — vérifié 26/09/2026. Sur
   * toute mission NON forfait (`applicable`), le revenu du scénario EST le
   * montant qui sera facturé : jours × TJM, sans marge ni coût entre les
   * deux. Construire un second champ `invoicedTotalCents` referait le MÊME
   * calcul sous un second nom (GA-26) — c'est exactement le défaut que ce
   * fichier corrige déjà pour la marge et le revenu eux-mêmes. Le libellé
   * écran (`missions.json`, `finance.engine.scenario.revenueTotal`) le
   * nomme donc explicitement : « Revenu simulé (facturation) ». Seul un
   * FORECAST À L'ÉCHELLE DU PORTEFEUILLE (`ForecastHorizonsService`,
   * agrégé sur TOUTES les missions) reste un système distinct, plus large
   * qu'une mission — non retranché ce tour.
   */
  revenueTotalCents: number | null
}

/**
 * #2420.14 — six scénarios. Une SIMULATION, marquée comme telle
 * (`scenario_simulation`), qui n'écrit rien. Un coût absent reste absent : le
 * scénario « tarif renouvelé » sur une mission sans coût ne rend aucun total.
 */
export function simulateMissionMarginScenario(
  input: MissionMarginEngineInput,
  scenario: MissionMarginScenario,
): MissionMarginScenarioResult {
  const overrides: EngineOverrides = { scenario: true }
  if (scenario.kind === 'renewed_rate' && isKnown(scenario.rateCents)) overrides.rateCents = scenario.rateCents
  if (scenario.kind === 'future_cost' && isKnown(scenario.costCents)) overrides.directCostCents = scenario.costCents
  const computation = compute(input, overrides)
  const applicable = input.costSource !== 'fixed_price'
  const days = isKnown(scenario.days) && scenario.days >= 0 ? scenario.days : null
  const total = (figure: MarginFigure | null) =>
    applicable && days !== null && figure !== null ? Math.round(figure.amountCents * days) : null
  const revenueCents = computation.revenuesUsed[0]?.amountCents ?? null
  return {
    kind: scenario.kind,
    applicable,
    days,
    computation,
    commercialTotalCents: total(computation.commercial),
    grossTotalCents: total(computation.gross),
    revenueTotalCents: applicable && days !== null && revenueCents !== null ? Math.round(revenueCents * days) : null,
  }
}
