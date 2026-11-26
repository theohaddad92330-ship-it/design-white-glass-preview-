import { describe, expect, it } from 'vitest'
import {
  milestonesDueInMonthCents,
  missionBillingReadSchema,
  placementGuarantee,
  prorateRetainerCents,
  workingDaysBetween,
} from './billing-declarations.js'
import { assessInvoiceReadiness } from './invoice-readiness.js'

// #2415.9 — le CONTRAT partagé de `GET /delivery/missions/:id/billing` : la
// forme que `MissionBillingService.read` (API) construit et que
// `MissionBillingSection` (web) affiche, à un seul endroit (GA-26).
describe('#2415.9 — le contrat de lecture de la facturation d’une mission', () => {
  const read = {
    milestones: [{ id: 'm1', label: 'Livraison V1', dueOn: '2026-10-01', amountCents: 500_000, source: 'manual' }],
    retainerMonthlyCents: null,
    retainerThisMonthCents: null,
    placementFeeCents: null,
    placementGuaranteeDays: null,
    placementGuarantee: null,
    source: 'manual',
  }

  it('accepte un forfait avec ses jalons DÉCLARÉS', () => {
    expect(missionBillingReadSchema.parse(read)).toEqual(read)
  })

  it('refuse un champ inconnu — un contrat `.strict()`, pas une forme qui dérive en silence', () => {
    expect(() => missionBillingReadSchema.parse({ ...read, extra: true })).toThrow()
  })
})

// Tranché par Louis 22/09 soir (decisions §8) : jalon, prorata, garantie DÉCLARATIFS.
describe('#2417.3 — le forfait au JALON : la somme des jalons DÉCLARÉS du mois', () => {
  const milestones = [
    { dueOn: '2026-08-10', amountCents: 500_000 },
    { dueOn: '2026-08-31', amountCents: 250_000 },
    { dueOn: '2026-09-01', amountCents: 999_999 },
  ]

  it('additionne les jalons échus dans le mois, et eux seuls', () => {
    expect(milestonesDueInMonthCents(milestones, '2026-08-01')).toBe(750_000)
  })

  it('un mois SANS jalon rend `null`, jamais 0 — rien n’est dû, rien n’est inventé', () => {
    expect(milestonesDueInMonthCents(milestones, '2026-07-01')).toBeNull()
  })
})

describe('#2417.4 — le RETAINER au prorata des jours OUVRÉS de la période', () => {
  it('compte les jours ouvrés (lundi-vendredi) bornes incluses', () => {
    // Août 2026 : 1er = samedi → 21 jours ouvrés.
    expect(workingDaysBetween('2026-08-01', '2026-08-31')).toBe(21)
    expect(workingDaysBetween('2026-08-15', '2026-08-16')).toBe(0)
  })

  it('un mois PLEIN rend le montant mensuel déclaré, sans arrondi parasite', () => {
    expect(prorateRetainerCents(1_000_000, '2026-08-01', '2026-01-01', null)).toBe(1_000_000)
  })

  it('une mission qui DÉMARRE en cours de mois : jours ouvrés couverts / jours ouvrés du mois', () => {
    // Du lundi 17 au lundi 31 août : 11 jours ouvrés sur 21.
    expect(prorateRetainerCents(2_100_000, '2026-08-01', '2026-08-17', null)).toBe(1_100_000)
  })

  it('une mission qui FINIT en cours de mois est proratisée aussi', () => {
    // Du samedi 1er au vendredi 14 août : 10 jours ouvrés sur 21.
    expect(prorateRetainerCents(2_100_000, '2026-08-01', '2026-06-01', '2026-08-14')).toBe(1_000_000)
  })

  it('sans montant déclaré, `null` — le prorata ne devine pas un retainer', () => {
    expect(prorateRetainerCents(null, '2026-08-01', '2026-08-17', null)).toBeNull()
  })
})

describe('#2417.5 — le PLACEMENT : la garantie DÉCLARÉE en jours', () => {
  it('la fin de garantie = démarrage + durée déclarée ; le fee n’est acquis qu’une fois la garantie échue', () => {
    expect(placementGuarantee('2026-09-01', 90, '2026-09-22')).toEqual({ endsOn: '2026-11-30', secured: false })
    expect(placementGuarantee('2026-09-01', 90, '2026-12-01')).toEqual({ endsOn: '2026-11-30', secured: true })
  })

  it('sans durée ou sans démarrage déclaré, `null` — aucune garantie devinée', () => {
    expect(placementGuarantee(null, 90, '2026-09-22')).toBeNull()
    expect(placementGuarantee('2026-09-01', null, '2026-09-22')).toBeNull()
  })
})

describe('#2417.3/.4 — le montant DÉCLARÉ fait la préparation du mois', () => {
  const base = {
    timesheet: null,
    dailyRateCents: null,
    requiresPo: false,
    poNumber: null,
    invoicedAt: null,
    expectsTimesheet: false,
  } as const

  it('un jalon échu ce mois rend un forfait au jalon DÛ, pour le montant du jalon', () => {
    const assessed = assessInvoiceReadiness({ ...base, billingCadence: 'milestone', declaredAmountCents: 750_000 })
    expect(assessed.state).toBe('ready')
    expect(assessed.preparedAmountCents).toBe(750_000)
  })

  it('sans montant déclaré, un forfait au jalon reste « non dû » et sans montant', () => {
    const assessed = assessInvoiceReadiness({ ...base, billingCadence: 'milestone', declaredAmountCents: null })
    expect(assessed.state).toBe('not_due')
    expect(assessed.preparedAmountCents).toBeNull()
  })
})
