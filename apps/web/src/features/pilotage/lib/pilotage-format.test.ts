import { describe, expect, it } from 'vitest'
import { buildSynthesisCsv, formatKiloEuros } from './pilotage-format'

// Théo D pilotage.R3 — les tuiles parlent en k€, la valeur absente n'est jamais « 0 ».
describe('formatKiloEuros', () => {
  it('écrit les milliers en k€', () => {
    expect(formatKiloEuros(417_000, 'fr')).toBe('417 k€')
    expect(formatKiloEuros(15_800, 'fr')).toBe('15,8 k€')
    expect(formatKiloEuros(71_000, 'fr')).toBe('71 k€')
  })
  it('garde un petit montant en euros plutôt que « 0 k€ »', () => {
    expect(formatKiloEuros(640, 'fr')).toMatch(/640\s?€/)
  })
  it('une valeur absente reste absente', () => {
    expect(formatKiloEuros(null, 'fr')).toBeNull()
  })
})

// Théo D pilotage.N4 — « Exporter la synthèse » : ce que la page montre, sans rien inventer.
describe('buildSynthesisCsv', () => {
  it('une ligne par indicateur lu ; un indicateur non mesuré est écrit « Non mesuré », jamais 0', () => {
    const csv = buildSynthesisCsv({
      month: 'octobre 2026',
      notMeasured: 'Non mesuré',
      rows: [
        { label: 'Pipe ouvert (non pondéré)', value: '417 k€' },
        { label: 'Profils disponibles', value: null },
      ],
    })
    expect(csv.split('\n')).toEqual([
      'Indicateur;Valeur;Période',
      'Pipe ouvert (non pondéré);417 k€;octobre 2026',
      'Profils disponibles;Non mesuré;octobre 2026',
    ])
  })
  it('protège les séparateurs et les guillemets', () => {
    const csv = buildSynthesisCsv({
      month: 'octobre 2026',
      notMeasured: '—',
      rows: [{ label: 'A; "B"', value: '1' }],
    })
    expect(csv.split('\n')[1]).toBe('"A; ""B""";1;octobre 2026')
  })
})
