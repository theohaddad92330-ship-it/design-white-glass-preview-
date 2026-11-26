import { describe, expect, it } from 'vitest'
import {
  MISSION_MARGIN_FORMULA_VERSION,
  MISSION_MARGIN_SCENARIO_KINDS,
  computeMissionMargin,
  missionMarginScenarioSchema,
  simulateMissionMarginScenario,
  type MissionMarginEngineInput,
} from './mission-margin-engine.js'
import { missionCostBreakdownSchema } from './mission-cost-source.js'
import { missionMargin } from './staffing.js'

/** Une mission en régie « directe », sans source de coût déclarée — la forme
 *  de toutes les lignes écrites avant le moteur. */
function input(over: Partial<MissionMarginEngineInput> = {}): MissionMarginEngineInput {
  return {
    channel: 'direct',
    costSource: null,
    currency: 'EUR',
    costCurrency: null,
    dailyRateCents: 72_000,
    loadedDailyCostCents: 60_000,
    partnerCommissionDailyCents: null,
    breakdown: {},
    fixedPriceRevenueCents: null,
    expensesTotalCents: 0,
    supplierInvoicesTotalCents: 0,
    elapsedDays: 30,
    period: '2026-09',
    validatedDays: 18,
    unvalidatedDays: 0,
    thresholdPercent: null,
    costRecordedRateCents: null,
    ...over,
  }
}

describe('computeMissionMargin — les neuf identifiants (#2420.11)', () => {
  it('chaque calcul porte formule versionnée, période, revenus, coûts, hypothèses, exclusions, source, devise, confiance', () => {
    const result = computeMissionMargin(input())
    expect(result.formulaVersion).toBe(MISSION_MARGIN_FORMULA_VERSION)
    expect(result.period?.month).toBe('2026-09')
    expect(result.revenuesUsed).toEqual([{ key: 'daily_rate', amountCents: 72_000 }])
    expect(result.costsUsed).toEqual([{ key: 'loaded_daily_cost', amountCents: 60_000, level: 'commercial' }])
    expect(Array.isArray(result.assumptions)).toBe(true)
    expect(result.exclusions).toContain('payment_delays')
    expect(result.source).toEqual({ costSource: 'unspecified', costOrigin: null, table: 'mission_commercial_terms' })
    expect(result.currency).toBe('EUR')
    expect(result.confidence).toBe('measured')
  })

  it("l'exemple du chapitre : 720 € / 600 € / 18 jours validés → 16,7 % et le montant de la période", () => {
    const result = computeMissionMargin(input())
    expect(result.commercial).toEqual({ amountCents: 12_000, percent: 16.7 })
    expect(result.period).toEqual({
      month: '2026-09',
      validatedDays: 18,
      unvalidatedDays: 0,
      commercialAmountCents: 216_000,
      grossAmountCents: 216_000,
    })
  })

  it('la marge commerciale est EXACTEMENT le noyau `missionMargin` sur une ligne sans source déclarée', () => {
    const result = computeMissionMargin(input({ dailyRateCents: 65_000, loadedDailyCostCents: 43_210 }))
    expect(result.commercial).toEqual(missionMargin({ dailyRateCents: 65_000, loadedDailyCostCents: 43_210 }))
  })
})

describe('computeMissionMargin — trois niveaux (#2420.3, #2420.4, #2420.5)', () => {
  it('la marge brute retire commission partenaire, frais amortis, coûts spécifiques et autres coûts validés', () => {
    const result = computeMissionMargin(
      input({
        channel: 'partner',
        partnerCommissionDailyCents: 3_000,
        expensesTotalCents: 30_000,
        breakdown: { specificDailyCostCents: 500, otherValidatedDailyCostCents: 500 },
      }),
    )
    // 12 000 − 3 000 − 1 000 (300 € sur 30 jours) − 500 − 500 = 7 000
    expect(result.gross).toEqual({ amountCents: 7_000, percent: 9.7 })
    expect(result.costsUsed.filter(cost => cost.level === 'gross').map(cost => cost.key)).toEqual([
      'partner_fee',
      'amortized_expenses',
      'specific_costs',
      'other_validated_costs',
    ])
    expect(result.assumptions).toContain('expenses_counted_as_not_rebilled')
  })

  it('la contribution n’existe que si des allocations internes sont configurées, et se retire de la marge brute', () => {
    expect(computeMissionMargin(input()).contribution).toBeNull()
    expect(computeMissionMargin(input()).exclusions).toContain('internal_allocations')
    const withPolicy = computeMissionMargin(input({ breakdown: { internalAllocationDailyCents: 2_000 } }))
    expect(withPolicy.contribution).toEqual({ amountCents: 10_000, percent: 13.9 })
    expect(withPolicy.exclusions).not.toContain('internal_allocations')
  })

  it('rien dans la réponse ne s’appelle « net » — la contribution n’est pas un résultat net', () => {
    const result = computeMissionMargin(input({ breakdown: { internalAllocationDailyCents: 2_000 } }))
    expect(JSON.stringify(result)).not.toMatch(/net/i)
  })
})

describe('computeMissionMargin — sources de coût (#2420.6, #2420.7, #2420.9, #2420.10)', () => {
  it('freelance : TJM fournisseur + commission + taxes forment le coût direct', () => {
    const result = computeMissionMargin(
      input({
        costSource: 'freelance',
        loadedDailyCostCents: null,
        breakdown: {
          supplierDailyRateCents: 55_000,
          supplierCommissionDailyCents: 2_000,
          supplierTaxesDailyCents: 1_000,
        },
      }),
    )
    expect(result.commercial).toEqual({ amountCents: 14_000, percent: 19.4 })
    expect(result.costsUsed.map(cost => cost.key)).toEqual([
      'supplier_daily_rate',
      'supplier_commission',
      'supplier_taxes',
    ])
    expect(result.confidence).toBe('measured')
  })

  it('freelance : une commission non renseignée rend la marge PARTIELLE, jamais une commission à zéro', () => {
    const result = computeMissionMargin(
      input({ costSource: 'freelance', loadedDailyCostCents: null, breakdown: { supplierDailyRateCents: 55_000 } }),
    )
    expect(result.commercial).toEqual({ amountCents: 17_000, percent: 23.6 })
    expect(result.missing).toContain('supplier_commission')
    expect(result.confidence).toBe('partial')
  })

  it('freelance : les factures fournisseur ne se comptent pas deux fois quand le TJM fournisseur est déclaré', () => {
    const result = computeMissionMargin(
      input({
        costSource: 'freelance',
        breakdown: { supplierDailyRateCents: 55_000, supplierCommissionDailyCents: 0 },
        supplierInvoicesTotalCents: 900_000,
      }),
    )
    expect(result.gross?.amountCents).toBe(17_000)
    expect(result.exclusions).toContain('supplier_invoices_covered_by_supplier_rate')
  })

  it('salarié : coût chargé fourni → mesurée ; coût standard VALIDÉ → partielle (une estimation)', () => {
    const provided = computeMissionMargin(
      input({ costSource: 'employee', breakdown: { employeeCostOrigin: 'imported' } }),
    )
    expect(provided.confidence).toBe('measured')
    expect(provided.source.costOrigin).toBe('imported')

    const standard = computeMissionMargin(
      input({
        costSource: 'employee',
        loadedDailyCostCents: null,
        breakdown: { standardDailyCostCents: 50_000, standardCostValidatedOn: '2026-09-01' },
      }),
    )
    expect(standard.commercial).toEqual({ amountCents: 22_000, percent: 30.6 })
    expect(standard.assumptions).toContain('standard_cost_is_an_estimate')
    expect(standard.confidence).toBe('partial')
  })

  it('salarié : un coût standard NON validé ne sert pas, et aucun coût n’est reconstruit (#2420.8)', () => {
    const result = computeMissionMargin(
      input({ costSource: 'employee', loadedDailyCostCents: null, breakdown: { standardDailyCostCents: 50_000 } }),
    )
    expect(result.commercial).toBeNull()
    expect(result.confidence).toBe('not_measured')
    expect(result.missing).toContain('direct_cost')
  })

  it('salarié : coût de période réparti sur les jours travaillés, ou coût horaire × heures par jour', () => {
    const period = computeMissionMargin(
      input({
        costSource: 'employee',
        loadedDailyCostCents: null,
        breakdown: { periodCostCents: 1_000_000, periodWorkedDays: 20 },
      }),
    )
    expect(period.costsUsed[0]).toEqual({ key: 'period_cost', amountCents: 50_000, level: 'commercial' })
    expect(period.assumptions).toContain('period_cost_spread_over_worked_days')

    const hourly = computeMissionMargin(
      input({
        costSource: 'employee',
        loadedDailyCostCents: null,
        breakdown: { hourlyCostCents: 7_000, hoursPerDay: 7 },
      }),
    )
    expect(hourly.costsUsed[0]).toEqual({ key: 'hourly_cost', amountCents: 49_000, level: 'commercial' })
    expect(hourly.assumptions).toContain('hourly_cost_times_hours_per_day')
  })

  it('partenaire : prix d’achat, prix de vente, part du partenaire et fee', () => {
    const result = computeMissionMargin(
      input({
        channel: 'partner',
        costSource: 'partner',
        loadedDailyCostCents: null,
        partnerCommissionDailyCents: 1_000,
        breakdown: { partnerPurchaseDailyCents: 60_000, partnerSaleDailyCents: 75_000, partnerSplitPercent: 20 },
      }),
    )
    expect(result.revenuesUsed).toEqual([{ key: 'partner_sale_price', amountCents: 75_000 }])
    expect(result.commercial).toEqual({ amountCents: 15_000, percent: 20 })
    // 15 000 − 1 000 (fee) − 3 000 (20 % de la marge) = 11 000
    expect(result.gross).toEqual({ amountCents: 11_000, percent: 14.7 })
    expect(result.confidence).toBe('measured')
  })

  it('forfait : marge sur le montant du contrat, sous-traitance et frais en brut, projection à terminaison', () => {
    const result = computeMissionMargin(
      input({
        costSource: 'fixed_price',
        loadedDailyCostCents: null,
        fixedPriceRevenueCents: 10_000_000,
        expensesTotalCents: 200_000,
        breakdown: {
          fixedPriceTeamTimeCostCents: 6_000_000,
          fixedPriceSubcontractingCostCents: 1_000_000,
          fixedPriceBudgetConsumedCents: 5_000_000,
          fixedPriceRemainingWorkCents: 3_500_000,
        },
      }),
    )
    expect(result.basis).toBe('mission_total')
    expect(result.commercial).toEqual({ amountCents: 4_000_000, percent: 40 })
    expect(result.gross).toEqual({ amountCents: 2_800_000, percent: 28 })
    expect(result.atCompletion).toEqual({ amountCents: 1_500_000, percent: 15 })
    expect(result.assumptions).toContain('at_completion_uses_remaining_work_estimate')
    // Une marge de forfait ne se multiplie pas par des jours validés.
    expect(result.period?.commercialAmountCents).toBeNull()
  })
})

describe('computeMissionMargin — affichage en trois états (#2420.12, #2420.13)', () => {
  it('coût absent : non mesurée, et aucun nombre — jamais 0 %', () => {
    const result = computeMissionMargin(input({ loadedDailyCostCents: null }))
    expect(result.confidence).toBe('not_measured')
    expect(result.commercial).toBeNull()
    expect(result.gross).toBeNull()
    expect(result.period?.commercialAmountCents).toBeNull()
  })

  it('canal partenaire sans fee ni part : partielle', () => {
    const result = computeMissionMargin(input({ channel: 'partner' }))
    expect(result.missing).toContain('partner_terms')
    expect(result.confidence).toBe('partial')
  })

  it('frais saisis sans date de début : partielle, et les frais sont nommés comme exclus', () => {
    const result = computeMissionMargin(input({ expensesTotalCents: 10_000, elapsedDays: null }))
    expect(result.exclusions).toContain('expenses_not_amortizable')
    expect(result.confidence).toBe('partial')
  })

  it('jours validés inconnus : la période ne vaut pas 0, elle vaut null', () => {
    const result = computeMissionMargin(input({ validatedDays: null }))
    expect(result.period?.commercialAmountCents).toBeNull()
  })
})

describe('computeMissionMargin — alertes (#2420.15)', () => {
  const kinds = (over: Partial<MissionMarginEngineInput>) => computeMissionMargin(input(over)).alerts.map(a => a.kind)

  it('les sept alertes, chacune sur sa condition', () => {
    expect(kinds({ thresholdPercent: 20 })).toEqual(['below_threshold'])
    expect(kinds({ loadedDailyCostCents: null })).toEqual(['cost_missing'])
    expect(kinds({ costRecordedRateCents: 70_000 })).toEqual(['rate_changed'])
    expect(kinds({ unvalidatedDays: 2 })).toEqual(['unvalidated_days'])
    expect(kinds({ expensesTotalCents: 3_000 })).toEqual(['unrebilled_expenses'])
    expect(kinds({ channel: 'subcontracting' })).toEqual(['partner_missing'])
    expect(kinds({ costCurrency: 'USD' })).toEqual(['currency_mismatch'])
  })

  it('aucune alerte sur une mission complète au-dessus du seuil', () => {
    expect(kinds({ thresholdPercent: 10, costRecordedRateCents: 72_000 })).toEqual([])
  })

  it('un seuil ne se compare jamais à une marge non mesurée', () => {
    expect(kinds({ thresholdPercent: 20, loadedDailyCostCents: null })).toEqual(['cost_missing'])
  })
})

describe('computeMissionMargin — diagnostic de Laura (#2420.16, #2420.17)', () => {
  it('sous le seuil : la part du coût, le TJM qui atteint le seuil, le coût plafond — et aucune action automatique', () => {
    const result = computeMissionMargin(
      input({ thresholdPercent: 20, partnerCommissionDailyCents: 0, channel: 'partner' }),
    )
    expect(result.diagnostic).toEqual({
      proposedBy: 'laura',
      automaticAction: 'none',
      thresholdPercent: 20,
      directCostSharePercent: 83.3,
      deductions: [{ key: 'partner_fee', sharePercent: 0 }],
      rateForThresholdCents: 75_000,
      costCeilingForThresholdCents: 57_600,
    })
  })

  it('pas de diagnostic au-dessus du seuil, ni sans seuil, ni sur une marge non mesurée', () => {
    expect(computeMissionMargin(input({ thresholdPercent: 10 })).diagnostic).toBeNull()
    expect(computeMissionMargin(input()).diagnostic).toBeNull()
    expect(computeMissionMargin(input({ thresholdPercent: 20, loadedDailyCostCents: null })).diagnostic).toBeNull()
  })
})

describe('simulateMissionMarginScenario — six scénarios (#2420.14)', () => {
  it('tarif actuel, renouvelé, coût futur, prolongation, jours attendus, volume différent', () => {
    const base = input()
    expect(simulateMissionMarginScenario(base, { kind: 'current_rate', days: 10 }).commercialTotalCents).toBe(120_000)
    const renewed = simulateMissionMarginScenario(base, { kind: 'renewed_rate', rateCents: 75_000, days: 10 })
    expect(renewed.computation.commercial).toEqual({ amountCents: 15_000, percent: 20 })
    expect(renewed.commercialTotalCents).toBe(150_000)
    const future = simulateMissionMarginScenario(base, { kind: 'future_cost', costCents: 63_000, days: 5 })
    expect(future.computation.commercial?.amountCents).toBe(9_000)
    expect(simulateMissionMarginScenario(base, { kind: 'extension', days: 40 }).commercialTotalCents).toBe(480_000)
    expect(simulateMissionMarginScenario(base, { kind: 'expected_days', days: 18 }).commercialTotalCents).toBe(216_000)
    expect(simulateMissionMarginScenario(base, { kind: 'different_volume', days: 100 }).commercialTotalCents).toBe(
      1_200_000,
    )
    expect(renewed.computation.assumptions).toContain('scenario_simulation')
  })

  it('#2783 — le revenu total suit le MÊME TJM que le scénario retenu, jamais recalculé', () => {
    const base = input()
    expect(simulateMissionMarginScenario(base, { kind: 'current_rate', days: 10 }).revenueTotalCents).toBe(720_000)
    const renewed = simulateMissionMarginScenario(base, { kind: 'renewed_rate', rateCents: 75_000, days: 10 })
    expect(renewed.revenueTotalCents).toBe(750_000)
  })

  it('#2783 — un revenu non mesurable rend un total de revenu inconnu, jamais zéro', () => {
    const noRate = simulateMissionMarginScenario(input({ dailyRateCents: null }), { kind: 'current_rate', days: 10 })
    expect(noRate.revenueTotalCents).toBeNull()
    expect(simulateMissionMarginScenario(input(), { kind: 'current_rate', days: null }).revenueTotalCents).toBeNull()
  })

  it('un scénario sans jours rend des totaux inconnus, et un coût absent reste absent', () => {
    expect(simulateMissionMarginScenario(input(), { kind: 'current_rate', days: null }).commercialTotalCents).toBeNull()
    const noCost = simulateMissionMarginScenario(input({ loadedDailyCostCents: null }), {
      kind: 'renewed_rate',
      rateCents: 80_000,
      days: 10,
    })
    expect(noCost.commercialTotalCents).toBeNull()
    expect(noCost.computation.confidence).toBe('not_measured')
  })

  it('un forfait ne se simule pas en jours', () => {
    const result = simulateMissionMarginScenario(
      input({ costSource: 'fixed_price', fixedPriceRevenueCents: 100_000 }),
      { kind: 'extension', days: 10 },
    )
    expect(result.applicable).toBe(false)
    expect(result.commercialTotalCents).toBeNull()
  })
})

describe('recette #2420.18 — les dix scénarios', () => {
  it('multi-devise : aucun taux de change inventé — la marge n’est pas calculée', () => {
    const result = computeMissionMargin(input({ currency: 'CHF', costCurrency: 'EUR' }))
    expect(result.commercial).toBeNull()
    expect(result.missing).toContain('exchange_rate')
    expect(result.confidence).toBe('not_measured')
  })

  it('devise non renseignée : euro, et l’hypothèse est nommée', () => {
    const result = computeMissionMargin(input({ currency: null }))
    expect(result.currency).toBe('EUR')
    expect(result.assumptions).toContain('currency_not_specified_eur_by_default')
  })

  it('changement de TJM : la marge suit le TJM actuel et l’alerte le dit', () => {
    const result = computeMissionMargin(input({ dailyRateCents: 80_000, costRecordedRateCents: 72_000 }))
    expect(result.commercial?.amountCents).toBe(20_000)
    expect(result.alerts.map(alert => alert.kind)).toContain('rate_changed')
  })

  it('paiement en retard et facture non émise : la marge ne les lit pas, et le dit (marge ≠ cash)', () => {
    const result = computeMissionMargin(input())
    expect(result.exclusions).toEqual(expect.arrayContaining(['payment_delays', 'invoicing_status']))
    expect(Object.keys(input())).not.toContain('paidAmountCents')
  })

  it('marge par période : jours validés seulement, les jours non validés exclus et nommés', () => {
    const result = computeMissionMargin(input({ validatedDays: 10, unvalidatedDays: 3 }))
    expect(result.period?.commercialAmountCents).toBe(120_000)
    expect(result.exclusions).toContain('unvalidated_days')
  })
})

describe('missionCostBreakdownSchema', () => {
  it('refuse un champ inconnu, un pourcentage de part hors bornes et une date mal formée', () => {
    expect(() => missionCostBreakdownSchema.parse({ salaryCents: 1 })).toThrow()
    expect(() => missionCostBreakdownSchema.parse({ partnerSplitPercent: 120 })).toThrow()
    expect(() => missionCostBreakdownSchema.parse({ standardCostValidatedOn: '01/09/2026' })).toThrow()
    expect(missionCostBreakdownSchema.parse({ supplierCommissionDailyCents: 0 })).toEqual({
      supplierCommissionDailyCents: 0,
    })
  })
})

describe('missionMarginScenarioSchema (#2420.14)', () => {
  it('accepte les six scénarios et refuse un champ inconnu ou un TJM négatif', () => {
    for (const kind of MISSION_MARGIN_SCENARIO_KINDS) {
      expect(missionMarginScenarioSchema.parse({ kind, days: 10 }).kind).toBe(kind)
    }
    expect(() => missionMarginScenarioSchema.parse({ kind: 'renewed_rate', rateCents: -1, days: 1 })).toThrow()
    expect(() => missionMarginScenarioSchema.parse({ kind: 'extension', days: 1, write: true })).toThrow()
  })
})
