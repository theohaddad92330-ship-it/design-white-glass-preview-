import { computeMissionMargin, missionCostBreakdownSchema, type MissionMarginConfidence } from '@bellum/contracts'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * #2420 — PARITÉ DÉMO DU MOTEUR DE MARGE (craft rule n°9).
 *
 * La fiche mission affiche l'état du calcul — mesurée, partielle, non mesurée —
 * et ses sources. Une salle où toutes les missions tomberaient dans le même
 * état ne montrerait qu'un tiers de la capacité. Recompté ici avec la MÊME
 * fonction que le serveur, sur les missions semées.
 */
function confidenceOf(mission: (typeof DEMO_DELIVERY_CLIENT.missions)[number]): MissionMarginConfidence {
  return computeMissionMargin({
    channel: mission.channel,
    costSource: mission.cost_source ?? null,
    currency: mission.currency ?? null,
    costCurrency: null,
    dailyRateCents: mission.daily_rate === null ? null : Math.round(mission.daily_rate * 100),
    loadedDailyCostCents: mission.loaded_daily_cost_cents,
    partnerCommissionDailyCents: mission.partner_commission_daily_cents,
    breakdown: missionCostBreakdownSchema.parse(mission.cost_breakdown ?? {}),
    fixedPriceRevenueCents: mission.po_amount_cents ?? null,
    expensesTotalCents: 0,
    supplierInvoicesTotalCents: 0,
    elapsedDays: 30,
    period: null,
    validatedDays: null,
    unvalidatedDays: null,
    thresholdPercent: null,
    costRecordedRateCents: mission.cost_recorded_rate_cents ?? null,
  }).confidence
}

describe('parité démo — le moteur de marge (#2420)', () => {
  it('la garde LIT quelque chose — la salle porte plusieurs missions', () => {
    expect(DEMO_DELIVERY_CLIENT.missions.length).toBeGreaterThan(5)
  })

  it('chaque décomposition semée passe le schéma que le serveur applique', () => {
    const seeded = DEMO_DELIVERY_CLIENT.missions.filter(mission => mission.cost_breakdown !== undefined)
    expect(seeded.length).toBeGreaterThanOrEqual(3)
    for (const mission of seeded) {
      expect(missionCostBreakdownSchema.safeParse(mission.cost_breakdown).success).toBe(true)
    }
  })

  it('les TROIS états se voient dans la salle', () => {
    const states = new Set(DEMO_DELIVERY_CLIENT.missions.map(confidenceOf))
    expect([...states].sort()).toEqual(['measured', 'not_measured', 'partial'])
  })

  it('quatre sources de coût déclarées sur quatre, et une mission montre « tarif changé »', () => {
    const sources = new Set(DEMO_DELIVERY_CLIENT.missions.map(mission => mission.cost_source).filter(Boolean))
    expect([...sources].sort()).toEqual(['employee', 'fixed_price', 'freelance', 'partner'])
    const changed = DEMO_DELIVERY_CLIENT.missions.filter(
      mission =>
        mission.cost_recorded_rate_cents != null &&
        mission.daily_rate !== null &&
        mission.cost_recorded_rate_cents !== Math.round(mission.daily_rate * 100),
    )
    expect(changed.length).toBeGreaterThan(0)
  })
})
