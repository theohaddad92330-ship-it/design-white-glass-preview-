import { describe, expect, it } from 'vitest'
import { headcountPrecision, latestFieldAudit, pickHeadcount } from './accountHeadcount'

// #3917.9 (Louis 15/10/2026) — l'effectif affiché = la valeur la plus PRÉCISE ; une correction humaine gagne toujours.
describe('headcountPrecision', () => {
  it('chiffre exact > tranche > portée sans chiffre', () => {
    expect(headcountPrecision('5 200')).toBe('exact')
    expect(headcountPrecision('5200 salariés')).toBe('exact')
    expect(headcountPrecision('1 000 à 1 999 salariés')).toBe('range')
    expect(headcountPrecision('Plus de 10 000')).toBe('range')
    expect(headcountPrecision('mondial')).toBe('scope')
  })
})

describe('pickHeadcount', () => {
  const audit = (source: 'human' | 'connector', createdAt = '2026-09-12T10:00:00Z') => ({ source, createdAt })

  it('un chiffre exact externe passe devant une tranche du registre, source et date dites', () => {
    const out = pickHeadcount({ recorded: 'Plus de 10 000', recordedAudit: audit('connector'), estimate: 106000 })
    expect(out).toMatchObject({ precision: 'exact', origin: 'estimate' })
    expect(out?.value).toContain('106')
  })

  it('une tranche ne passe JAMAIS devant un chiffre exact déjà porté par la fiche', () => {
    const out = pickHeadcount({ recorded: '5 200', recordedAudit: audit('connector'), estimate: 5000 })
    expect(out).toMatchObject({ value: '5 200', origin: 'recorded', observedAt: '2026-09-12T10:00:00Z' })
  })

  it('SAIT DIRE NON — une correction HUMAINE gagne même contre un chiffre exact plus précis', () => {
    const out = pickHeadcount({ recorded: '1 000 à 1 999 salariés', recordedAudit: audit('human'), estimate: 1450 })
    expect(out).toMatchObject({ origin: 'recorded', source: 'human', value: '1 000 à 1 999 salariés' })
  })

  it('SAIT DIRE NON — sans valeur lisible, rien (jamais « 0 »)', () => {
    expect(pickHeadcount({ recorded: null, recordedAudit: null, estimate: null })).toBeNull()
    expect(pickHeadcount({ recorded: '  ', recordedAudit: null, estimate: 0 })).toBeNull()
  })

  it('la fiche seule, sans estimation : sa valeur, avec sa date quand le journal la connaît', () => {
    expect(pickHeadcount({ recorded: '200 à 249 salariés', recordedAudit: null, estimate: null })).toMatchObject({
      origin: 'recorded',
      observedAt: null,
    })
  })
})

describe('latestFieldAudit', () => {
  const row = (field: string, source: 'human' | 'connector', createdAt: string) =>
    ({ field, source, createdAt }) as never
  it('rend la dernière écriture DU CHAMP, source et date', () => {
    const items = [
      row('employees', 'connector', '2026-08-01T00:00:00Z'),
      row('employees', 'human', '2026-09-01T00:00:00Z'),
      row('sector', 'human', '2026-10-01T00:00:00Z'),
    ]
    expect(latestFieldAudit(items, 'employees')).toEqual({ source: 'human', createdAt: '2026-09-01T00:00:00Z' })
  })
  it('SAIT DIRE NON — aucun journal, aucune ligne pour ce champ : null', () => {
    expect(latestFieldAudit(undefined, 'employees')).toBeNull()
    expect(latestFieldAudit([row('sector', 'human', '2026-10-01T00:00:00Z')], 'employees')).toBeNull()
  })
})
