import { describe, expect, it } from 'vitest'
import { assessPoForMonth } from './invoice-month-preparation.js'

// #2566 / #2563 — le contrôle du bon de commande AVANT de préparer la facture
// d'un mois. Une alerte se VOIT, elle n'empêche jamais de préparer.
const base = {
  requiresPo: true,
  poNumber: 'BC-2026-14',
  validFrom: '2026-01-01',
  validUntil: '2026-12-31',
  volumeDays: 100,
  consumedBeforeDays: 40,
  monthDays: 20,
  periodMonth: '2026-09-01',
}

describe('assessPoForMonth', () => {
  it('ne dit rien quand le bon de commande couvre le mois et le volume', () => {
    const out = assessPoForMonth(base)
    expect(out.alerts).toEqual([])
    expect(out.remainingDays).toBe(60)
    expect(out.remainingAfterDays).toBe(40)
  })

  it('alerte « absent » quand le bon est requis et que le numéro manque', () => {
    expect(assessPoForMonth({ ...base, poNumber: null }).alerts).toContain('po_missing')
  })

  it('ne présume pas un bon absent quand il n’est pas requis et qu’aucun n’est saisi', () => {
    expect(assessPoForMonth({ ...base, requiresPo: false, poNumber: null }).alerts).toEqual([])
  })

  it('alerte « expiré » quand la validité finit avant le mois', () => {
    expect(assessPoForMonth({ ...base, validUntil: '2026-08-31' }).alerts).toEqual(['po_expired'])
  })

  it('alerte « finit en cours de mois » quand la validité tombe dans le mois', () => {
    expect(assessPoForMonth({ ...base, validUntil: '2026-09-15' }).alerts).toEqual(['po_ends_mid_period'])
  })

  it('alerte « pas encore valide » quand la validité commence après le mois', () => {
    expect(assessPoForMonth({ ...base, validFrom: '2026-10-01' }).alerts).toEqual(['po_not_started'])
  })

  it('alerte dépassement quand les jours cumulés dépassent le volume, et nomme le reste', () => {
    const out = assessPoForMonth({ ...base, consumedBeforeDays: 90 })
    expect(out.alerts).toEqual(['po_volume_exceeded'])
    expect(out.remainingDays).toBe(10)
    expect(out.remainingAfterDays).toBe(-10)
  })

  it('ne devine rien sans volume ni consommation : pas de reste', () => {
    const out = assessPoForMonth({ ...base, volumeDays: null })
    expect(out.remainingDays).toBeNull()
    expect(out.remainingAfterDays).toBeNull()
    expect(out.alerts).toEqual([])
    const unknownConsumption = assessPoForMonth({ ...base, consumedBeforeDays: null })
    expect(unknownConsumption.remainingDays).toBeNull()
  })

  it('sans jours à facturer, ne compare pas le volume au mois', () => {
    const out = assessPoForMonth({ ...base, consumedBeforeDays: 100, monthDays: null })
    expect(out.alerts).toEqual([])
    expect(out.remainingDays).toBe(0)
    expect(out.remainingAfterDays).toBeNull()
  })

  it('une échéance inconnue n’est jamais présumée expirée', () => {
    expect(assessPoForMonth({ ...base, validUntil: null, validFrom: null }).alerts).toEqual([])
  })
})
