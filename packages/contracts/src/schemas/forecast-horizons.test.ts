import { describe, expect, it } from 'vitest'
import {
  FORECAST_COMPONENTS,
  FORECAST_DECISIONS,
  FORECAST_HORIZONS,
  FORECAST_RECETTE_SCENARIOS,
  FORECAST_SCENARIOS,
  MANAGER_VIEW_LIMIT,
  computeHorizonForecast,
  horizonWindow,
  managerView,
  weekdaysBetween,
  type ForecastItem,
  type HorizonForecast,
} from './forecast-horizons.js'

const NOW = new Date('2026-09-23T10:00:00Z')

function item(partial: Partial<ForecastItem> & Pick<ForecastItem, 'key' | 'component'>): ForecastItem {
  return {
    amountCents: 100_000,
    declaredAmountCents: null,
    currency: 'EUR',
    becameKey: null,
    declaredBlocked: false,
    renewalOpen: false,
    ...partial,
  }
}

function compute(items: ForecastItem[], capacity: Parameters<typeof computeHorizonForecast>[0]['capacity'] = null) {
  return computeHorizonForecast({ horizon: 'month', now: NOW, items, capacity })
}

function scenario(result: HorizonForecast, id: (typeof FORECAST_SCENARIOS)[number]) {
  const found = result.scenarios.find(entry => entry.scenario === id)
  if (!found) throw new Error(`scénario ${id} absent`)
  return found
}

function component(result: HorizonForecast, id: (typeof FORECAST_COMPONENTS)[number]) {
  const found = result.components.find(entry => entry.component === id)
  if (!found) throw new Error(`composante ${id} absente`)
  return found
}

describe('#2425 — les horizons, les composantes, les scénarios : la forme', () => {
  it('#2425.2 — quatre horizons, dans l’ordre semaine → semestre', () => {
    expect(FORECAST_HORIZONS).toEqual(['week', 'month', 'quarter', 'semester'])
  })

  it('#2425.2 — chaque horizon borne une fenêtre de calendrier qui part d’aujourd’hui', () => {
    expect(horizonWindow('week', NOW)).toEqual({ from: '2026-09-23', until: '2026-09-30' })
    expect(horizonWindow('month', NOW)).toEqual({ from: '2026-09-23', until: '2026-10-23' })
    expect(horizonWindow('quarter', NOW)).toEqual({ from: '2026-09-23', until: '2026-12-23' })
    expect(horizonWindow('semester', NOW)).toEqual({ from: '2026-09-23', until: '2027-03-23' })
  })

  it('compte les jours ouvrés (lundi → vendredi), borne haute exclue', () => {
    // Mercredi 23 → mercredi 30 : mer, jeu, ven, lun, mar = 5.
    expect(weekdaysBetween('2026-09-23', '2026-09-30')).toBe(5)
    expect(weekdaysBetween('2026-09-26', '2026-09-28')).toBe(0)
    expect(weekdaysBetween('2026-09-30', '2026-09-23')).toBe(0)
  })

  it('#2425.3 — sept composantes, du carnet au cash, chacune exposée à part', () => {
    expect(FORECAST_COMPONENTS).toHaveLength(7)
    const result = compute([])
    expect(result.components.map(entry => entry.component)).toEqual([...FORECAST_COMPONENTS])
  })

  it('#2425.4 — quatre scénarios, chacun avec ses hypothèses écrites', () => {
    expect(FORECAST_SCENARIOS).toEqual(['committed', 'baseline', 'upside', 'downside'])
    const result = compute([item({ key: 'mission:a', component: 'backlog' })])
    for (const entry of result.scenarios) expect(entry.hypotheses.length).toBeGreaterThan(0)
  })

  it('#2425.4 / c26 — un scénario est une SOMME de composantes, jamais un montant pondéré', () => {
    const result = compute([
      item({ key: 'mission:a', component: 'backlog', amountCents: 300 }),
      item({ key: 'mission:b', component: 'renewal', amountCents: 50 }),
      item({ key: 'opportunity:c', component: 'pipeline', amountCents: 7 }),
    ])
    expect(scenario(result, 'committed').amounts).toEqual([{ currency: 'EUR', amountCents: 300 }])
    expect(scenario(result, 'baseline').amounts).toEqual([{ currency: 'EUR', amountCents: 350 }])
    expect(scenario(result, 'upside').amounts).toEqual([{ currency: 'EUR', amountCents: 357 }])
    // Aucun champ ne porte un taux, une chance ou un pourcentage.
    expect(JSON.stringify(result)).not.toMatch(/probab|weight|percent|chance/i)
  })

  it('#2425.5 — la confiance nomme ses trois axes (contrat, source, historique), sans pourcentage', () => {
    const result = compute([item({ key: 'mission:a', component: 'backlog' })])
    const backlog = component(result, 'backlog')
    expect(backlog.confidence.basis).toBe('contract')
    expect(backlog.confidence.axes.map(axis => axis.axis)).toEqual(['contract', 'source', 'history'])
    expect(backlog.confidence.axes.find(axis => axis.axis === 'history')?.state).toBe('not_measured')
    expect(component(result, 'pipeline').confidence.axes.find(axis => axis.axis === 'contract')?.state).toBe('no')
  })

  it('#2425.6 — CA prévisionnel, facture prévue et cash prévu : trois montants qui ne se confondent pas', () => {
    const result = compute([
      item({ key: 'mission:a', component: 'backlog', amountCents: 1000 }),
      item({ key: 'invoice:a:2026-08', component: 'toInvoice', amountCents: 400 }),
      item({ key: 'invoice:b:2026-07', component: 'receivable', amountCents: 250 }),
      item({ key: 'invoice:c:2026-06', component: 'overdue', amountCents: 90 }),
    ])
    expect(result.money.revenue.amounts).toEqual([{ currency: 'EUR', amountCents: 1000 }])
    expect(result.money.invoicing.amounts).toEqual([{ currency: 'EUR', amountCents: 400 }])
    // Le retard ne se range pas dans le cash PRÉVU : il est nommé à part.
    expect(result.money.cash.amounts).toEqual([{ currency: 'EUR', amountCents: 250 }])
  })

  it('#2425.8 — l’écart CA / cash est expliqué par des causes CHIFFRÉES, dont le délai de facturation', () => {
    const result = compute([
      item({ key: 'mission:a', component: 'backlog', amountCents: 1000 }),
      item({ key: 'invoice:a:2026-08', component: 'toInvoice', amountCents: 400 }),
      item({ key: 'invoice:c:2026-06', component: 'overdue', amountCents: 90 }),
    ])
    const causes = result.gap.causes.map(cause => cause.cause)
    expect(causes).toEqual(['invoicingDelay', 'notYetInvoiced', 'overdue'])
    expect(result.gap.causes[0]?.amounts).toEqual([{ currency: 'EUR', amountCents: 1000 }])
  })

  it('#2425.9 — sept décisions possibles, chacune née d’une composante', () => {
    expect(FORECAST_DECISIONS).toHaveLength(7)
    const result = compute(
      [
        item({ key: 'mission:a', component: 'backlog', amountCents: 500, renewalOpen: true }),
        item({ key: 'mission:b', component: 'backlog', amountCents: 200, declaredBlocked: true }),
        item({ key: 'invoice:a:2026-08', component: 'toInvoice', amountCents: 400 }),
        item({ key: 'invoice:c:2026-06', component: 'overdue', amountCents: 90 }),
        item({ key: 'invoice:d:2026-06', component: 'disputed', amountCents: 60 }),
        item({ key: 'opportunity:e', component: 'pipeline', amountCents: null }),
      ],
      { reservedDays: 30, availableDays: 12, bench: 2, uncoveredNeeds: 3 },
    )
    expect(result.decisions.map(entry => entry.decision).sort()).toEqual([...FORECAST_DECISIONS].sort())
    // L'ordre : ce qui pèse le plus d'abord.
    expect(result.decisions[0]?.decision).toBe('secureRenewal')
  })

  it('#2425.10 — la vue manager ne rend JAMAIS plus de cinq lignes, et dit combien sont repliées', () => {
    const result = compute(
      [
        item({ key: 'mission:a', component: 'backlog', renewalOpen: true }),
        item({ key: 'mission:b', component: 'backlog', declaredBlocked: true }),
        item({ key: 'invoice:a:2026-08', component: 'toInvoice' }),
        item({ key: 'invoice:c:2026-06', component: 'overdue' }),
        item({ key: 'invoice:d:2026-06', component: 'disputed' }),
        item({ key: 'opportunity:e', component: 'pipeline', amountCents: null }),
      ],
      { reservedDays: 30, availableDays: 12, bench: 2, uncoveredNeeds: 3 },
    )
    const view = managerView(result.decisions)
    expect(MANAGER_VIEW_LIMIT).toBe(5)
    expect(view.shown).toHaveLength(5)
    expect(view.folded).toBe(2)
    // c76 — le rôle change l'ORDRE, jamais le CONTENU : rien n'est perdu.
    expect([...view.shown, ...view.hidden]).toEqual(result.decisions)
  })

  it('#2425.7 — la capacité : disponible, réservée, trous, besoins non couverts', () => {
    const result = compute([], { reservedDays: 30, availableDays: 12, bench: 2, uncoveredNeeds: 3 })
    expect(result.capacity).toEqual({ reservedDays: 30, availableDays: 12, bench: 2, uncoveredNeeds: 3 })
    expect(compute([]).capacity).toBeNull()
  })
})

/**
 * #2425.11 — LES DIX SCÉNARIOS DE RECETTE. Leur liste est un contrat : chacun
 * a SON test ci-dessous, nommé par son identifiant.
 */
describe('#2425.11 — les dix scénarios de recette du prévisionnel', () => {
  it('la liste en compte dix, sans doublon', () => {
    expect(FORECAST_RECETTE_SCENARIOS).toHaveLength(10)
    expect(new Set(FORECAST_RECETTE_SCENARIOS).size).toBe(10)
  })

  it('noData — aucune donnée : aucun montant n’est « 0 », tout est absent', () => {
    const result = compute([])
    for (const entry of result.scenarios) expect(entry.amounts).toBeNull()
    for (const entry of result.components) expect(entry.amounts).toBeNull()
    expect(result.money.revenue.amounts).toBeNull()
    expect(result.gap.causes).toEqual([])
    expect(result.decisions).toEqual([])
  })

  it('multiCurrency — deux devises ne s’additionnent jamais : un montant par devise', () => {
    const result = compute([
      item({ key: 'mission:a', component: 'backlog', amountCents: 100, currency: 'EUR' }),
      item({ key: 'mission:b', component: 'backlog', amountCents: 70, currency: 'CHF' }),
    ])
    expect(scenario(result, 'committed').amounts).toEqual([
      { currency: 'CHF', amountCents: 70 },
      { currency: 'EUR', amountCents: 100 },
    ])
  })

  it('assumedCurrency — une devise absente est lue en euros, et l’hypothèse est écrite', () => {
    const result = compute([item({ key: 'mission:a', component: 'backlog', currency: null })])
    expect(component(result, 'backlog').assumedCurrency).toBe(1)
    expect(scenario(result, 'committed').hypotheses).toContain('currencyAssumedEur')
  })

  it('correction — un montant CORRIGÉ par une personne gagne sur le montant calculé', () => {
    const result = compute([
      item({ key: 'invoice:a:2026-08', component: 'receivable', amountCents: 500, declaredAmountCents: 420 }),
    ])
    expect(component(result, 'receivable').amounts).toEqual([{ currency: 'EUR', amountCents: 420 }])
  })

  it('withoutAmount — une ligne sans montant est COMPTÉE à part, jamais à zéro', () => {
    const result = compute([
      item({ key: 'mission:a', component: 'backlog', amountCents: null }),
      item({ key: 'mission:b', component: 'backlog', amountCents: 100 }),
    ])
    const backlog = component(result, 'backlog')
    expect(backlog.count).toBe(2)
    expect(backlog.withoutAmount).toBe(1)
    expect(backlog.amounts).toEqual([{ currency: 'EUR', amountCents: 100 }])
  })

  it('pipelineBecameMission — une opportunité devenue mission ne compte pas deux fois', () => {
    const result = compute([
      item({ key: 'mission:m1', component: 'backlog', amountCents: 1000 }),
      item({ key: 'opportunity:o1', component: 'pipeline', amountCents: 5000, becameKey: 'mission:m1' }),
    ])
    const upside = scenario(result, 'upside')
    expect(upside.amounts).toEqual([{ currency: 'EUR', amountCents: 1000 }])
    expect(upside.deduplicated).toBe(1)
    expect(upside.hypotheses).toContain('deduplicated')
  })

  it('duplicateLine — la même ligne remontée deux fois n’est comptée qu’une fois', () => {
    const result = compute([
      item({ key: 'mission:a', component: 'backlog', amountCents: 100 }),
      item({ key: 'mission:a', component: 'backlog', amountCents: 100 }),
    ])
    expect(component(result, 'backlog').count).toBe(1)
    expect(scenario(result, 'committed').amounts).toEqual([{ currency: 'EUR', amountCents: 100 }])
  })

  it('blockedMission — le scénario bas retire ce qui est DÉCLARÉ bloqué, et le dit', () => {
    const result = compute([
      item({ key: 'mission:a', component: 'backlog', amountCents: 100 }),
      item({ key: 'mission:b', component: 'backlog', amountCents: 40, declaredBlocked: true }),
    ])
    const downside = scenario(result, 'downside')
    expect(downside.amounts).toEqual([{ currency: 'EUR', amountCents: 100 }])
    expect(downside.excluded).toBe(1)
    expect(downside.hypotheses).toContain('blockedStops')
  })

  it('overdueAndDispute — retard et litige restent hors du cash prévu, nommés comme causes', () => {
    const result = compute([
      item({ key: 'invoice:a:2026-06', component: 'overdue', amountCents: 90 }),
      item({ key: 'invoice:b:2026-06', component: 'disputed', amountCents: 60 }),
    ])
    expect(result.money.cash.amounts).toBeNull()
    expect(result.gap.causes.map(cause => cause.cause)).toEqual(['overdue', 'disputed'])
  })

  it('horizonBounds — la semaine et le semestre bornent des fenêtres différentes', () => {
    const week = computeHorizonForecast({ horizon: 'week', now: NOW, items: [], capacity: null })
    const semester = computeHorizonForecast({ horizon: 'semester', now: NOW, items: [], capacity: null })
    expect(week.window.until < semester.window.until).toBe(true)
    expect(week.horizon).toBe('week')
  })

  it('#2783 — sans avenants fournis, la ligne « dont avenants » est à zéro, jamais absente', () => {
    const result = compute([])
    expect(result.amendments).toEqual({ total: 0, accepted: 0, simulated: 0 })
  })

  it('#2783 — accepté et simulé sont COMPTÉS, jamais fondus l’un dans l’autre', () => {
    const result = computeHorizonForecast({
      horizon: 'month',
      now: NOW,
      items: [],
      capacity: null,
      amendments: { accepted: 2, simulated: 3 },
    })
    expect(result.amendments).toEqual({ total: 5, accepted: 2, simulated: 3 })
  })
})
