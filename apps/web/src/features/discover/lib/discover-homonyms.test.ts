import { describe, expect, it } from 'vitest'
import type { DiscoverCandidate } from './discover-types'
import { homonymSirensBySiren, maskHomonymSignals } from './discover-homonyms'

// #3819.11 / #3901.9 — deux sociétés privées au même nom normalisé, SIREN différents : l'ambiguïté se nomme.
describe('homonymSirensBySiren', () => {
  const rows = [
    { siren: '552032534', name: 'Prévoir SAS' },
    { siren: '440123456', name: 'PREVOIR' },
    { siren: '123456789', name: 'Autre société' },
  ]

  it('nomme chaque homonyme par son SIREN, sans choisir', () => {
    const map = homonymSirensBySiren(rows)
    expect(map.get('552032534')).toEqual(['440123456'])
    expect(map.get('440123456')).toEqual(['552032534'])
  })

  it('une société sans homonyme n’a aucune entrée (une absence ne fait aucune ligne)', () => {
    expect(homonymSirensBySiren(rows).has('123456789')).toBe(false)
  })

  it('le même SIREN deux fois n’est pas un homonyme', () => {
    expect(homonymSirensBySiren([rows[0], { ...rows[0] }]).size).toBe(0)
  })

  it('un nom vide une fois normalisé ne rapproche personne', () => {
    expect(
      homonymSirensBySiren([
        { siren: '1', name: 'SAS' },
        { siren: '2', name: 'SA' },
      ]).size,
    ).toBe(0)
  })
})

// #3819.11 / #3901.9 (18/10, décision Louis) — sans source pour départager deux homonymes, le signal est
// MASQUÉ sur les DEUX : aucune ligne, jamais rattaché au hasard, jamais « sans signal » (non-mesure ≠ 0).
describe('maskHomonymSignals', () => {
  const signal = { kind: 'hiring', label: 'Recrute un RSSI' } as unknown as DiscoverCandidate['signals'][number]
  const base = (siren: string, name: string, signals = [signal]) =>
    ({ siren, name, signals, signalsSearched: true }) as unknown as DiscoverCandidate

  it('deux homonymes : le signal n’apparaît sur aucun des deux', () => {
    const masked = maskHomonymSignals([base('552032534', 'Prévoir SAS'), base('440123456', 'PREVOIR')])
    expect(masked.map(row => row.signals)).toEqual([[], []])
    expect(masked.map(row => row.signalsSearched)).toEqual([false, false])
  })

  it('NON : une société sans homonyme garde ses signaux (même objet, rien réécrit)', () => {
    const alone = base('123456789', 'Autre société')
    const masked = maskHomonymSignals([alone, base('552032534', 'Prévoir SAS'), base('440123456', 'PREVOIR')])
    expect(masked[0]).toBe(alone)
    expect(masked[0]!.signals).toEqual([signal])
  })
})
