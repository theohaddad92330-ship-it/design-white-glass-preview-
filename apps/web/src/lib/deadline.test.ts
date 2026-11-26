import { describe, expect, it } from 'vitest'
import { deadlineCalendarValue, deadlineStartLocal, formatCalendarDate, formatDeadline } from './deadline'

/** Base FIXE : la date à laquelle le plan a été produit. */
const PLAN_BASE = '2026-08-27T09:12:00.000Z'

describe('formatCalendarDate', () => {
  it('rend une date calendaire ISO', () => {
    expect(formatCalendarDate('2026-08-29')).toBe('29/08/2026')
  })

  it('rend null sur tout ce qui n’est pas une date — jamais 2001, jamais « Invalid Date »', () => {
    // Les quatre formes réellement rencontrées en production.
    expect(formatCalendarDate('Fri Aug 29')).toBeNull()
    expect(formatCalendarDate('J+10')).toBeNull()
    expect(formatCalendarDate('M+3S+2')).toBeNull()
    expect(formatCalendarDate('Semaine 1')).toBeNull()
    expect(formatCalendarDate(null)).toBeNull()
  })
})

describe('deadlineCalendarValue', () => {
  it('laisse passer une date calendaire telle quelle', () => {
    expect(deadlineCalendarValue('2026-08-29', PLAN_BASE)).toBe('2026-08-29')
  })

  it('résout un jeton relatif CONTRE la base du plan', () => {
    expect(deadlineCalendarValue('J+10', PLAN_BASE)).toBe('2026-09-06')
    expect(deadlineCalendarValue('M+3S+2', PLAN_BASE)).toBe('2026-12-11')
  })

  it('sans base, un jeton relatif ne devient JAMAIS une date', () => {
    expect(deadlineCalendarValue('J+10', null)).toBeNull()
    expect(deadlineCalendarValue('J+10', 'pas une date')).toBeNull()
  })

  it('un libellé libre ne devient jamais une date', () => {
    expect(deadlineCalendarValue('Semaine 1', PLAN_BASE)).toBeNull()
  })
})

describe('formatDeadline', () => {
  it('affiche la date quand elle est calculable', () => {
    expect(formatDeadline('J+10', PLAN_BASE)).toBe('06/09/2026')
    expect(formatDeadline('2026-08-29', null)).toBe('29/08/2026')
  })

  it('sans base, DIT l’horizon en clair plutôt que d’inventer une date', () => {
    expect(formatDeadline('J+10', null)).toBe('sous 10 jours')
    expect(formatDeadline('J+1', null)).toBe('sous 1 jour')
    expect(formatDeadline('S+2', null)).toBe('sous 14 jours')
  })

  it('rend le libellé TEL QUEL quand il n’est ni date ni jeton', () => {
    expect(formatDeadline('Semaine 1', PLAN_BASE)).toBe('Semaine 1')
  })

  it('rend null sur une échéance absente — jamais un marque-place', () => {
    expect(formatDeadline(null, PLAN_BASE)).toBeNull()
    expect(formatDeadline('   ', PLAN_BASE)).toBeNull()
  })
})

describe('deadlineStartLocal', () => {
  it('pré-remplit l’événement au jour de l’échéance, à une heure de travail', () => {
    expect(deadlineStartLocal('2026-08-29', null)).toBe('2026-08-29T09:00')
    expect(deadlineStartLocal('J+10', PLAN_BASE)).toBe('2026-09-06T09:00')
  })

  it('ne pré-remplit RIEN plutôt que de proposer un rendez-vous en 2001', () => {
    // Le jeton brut donné à `new Date()` rendait le 1ᵉʳ octobre 2001.
    expect(deadlineStartLocal('J+10', null)).toBeUndefined()
    expect(deadlineStartLocal('M+3S+2', null)).toBeUndefined()
    expect(deadlineStartLocal('Semaine 1', PLAN_BASE)).toBeUndefined()
    expect(deadlineStartLocal(null, PLAN_BASE)).toBeUndefined()
  })
})
