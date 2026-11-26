import { describe, expect, it } from 'vitest'
import { signalDateMs } from './account.js'

// #4716 — miroir TypeScript de apps/ia/app/services/signal_freshness.py (#4647). Mêmes cas des deux côtés.
const MONTHS = [
  ['janvier', 0],
  ['février', 1],
  ['mars', 2],
  ['avril', 3],
  ['mai', 4],
  ['juin', 5],
  ['juillet', 6],
  ['août', 7],
  ['septembre', 8],
  ['octobre', 9],
  ['novembre', 10],
  ['décembre', 11],
] as const

describe('#4716 — signalDateMs lit les mois en toutes lettres', () => {
  it.each(MONTHS)('« 23 %s 2026 » rend le 23 de ce mois', (name, index) => {
    expect(signalDateMs(`23 ${name} 2026`)).toBe(Date.UTC(2026, index, 23))
  })

  it('« 23 octobre 2026 » ne rend pas le 1er janvier', () => {
    expect(signalDateMs('23 octobre 2026')).toBe(Date.UTC(2026, 9, 23))
    expect(signalDateMs('23 octobre 2026')).not.toBe(Date.UTC(2026, 0, 1))
  })

  it('lit un mois seul, une abréviation, un « 1er » et les majuscules', () => {
    // #4832 — un mois sans jour vaut son DERNIER jour (miroir de `read_signal_date`).
    expect(signalDateMs('octobre 2026')).toBe(Date.UTC(2026, 9, 31))
    expect(signalDateMs('OCTOBRE 2026')).toBe(Date.UTC(2026, 9, 31))
    // Un jour EXPLICITE reste ce jour-là, « 1er » compris.
    expect(signalDateMs('1er octobre 2026')).toBe(Date.UTC(2026, 9, 1))
    expect(signalDateMs('1 janv. 2026')).toBe(Date.UTC(2026, 0, 1))
  })

  it('lit toujours les deux formats numériques', () => {
    expect(signalDateMs('2026-10-23')).toBe(Date.UTC(2026, 9, 23))
    expect(signalDateMs('2026/10/23')).toBe(Date.UTC(2026, 9, 23))
    expect(signalDateMs('2026-10')).toBe(Date.UTC(2026, 9, 31))
  })

  it('garde la règle d’ancrage : la première année gagne, jamais une date postérieure entre parenthèses', () => {
    // L'année qui ANCRE reste 2024 ; #4832 la borne au 31/12, jamais au 1er janvier.
    expect(signalDateMs('2024 (comptes déposés 2025-11)')).toBe(Date.UTC(2024, 11, 31))
    expect(signalDateMs('2024 (full year accounts filed novembre 2025)')).toBe(Date.UTC(2024, 11, 31))
    expect(signalDateMs('2024 (comptes déposés le 3 novembre 2025)')).toBe(Date.UTC(2024, 11, 31))
  })

  it('rend null sans année et ne lit pas un mot qui n’est pas un mois', () => {
    expect(signalDateMs('Non daté précisément')).toBeNull()
    expect(signalDateMs(null)).toBeNull()
    expect(signalDateMs('23 foobar 2026')).toBe(Date.UTC(2026, 11, 31))
  })
})
