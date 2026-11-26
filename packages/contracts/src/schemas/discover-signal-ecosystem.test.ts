import { describe, expect, it } from 'vitest'
import { discoverSignalTypeOfKind } from './discover-call-list.js'
import { discoverSignalSchema, discoverSignalSourceSchema, discoverSignalTypeSchema } from './discover.js'
import { signalKindSchema } from './analysis/primitives.js'
import { readRecentSignals } from './recent-signals-reader.js'

/**
 * #4734 — l'annuaire de l'écosystème startup émet un signal `ecosystem` (un label n'est pas une levée).
 * Zod le rejetait à la frontière : la contrainte s'élargit AVANT le code qui écrit la valeur (GA-11 / GA-12).
 */
describe('discoverSignalTypeSchema — ecosystem (#4734)', () => {
  it('accepte la nature « ecosystem » et la garde sur un signal rendu', () => {
    expect(discoverSignalTypeSchema.safeParse('ecosystem').success).toBe(true)
    expect(
      discoverSignalSchema.safeParse({ type: 'ecosystem', label: 'Membre · 2025', date: '2025-06-01' }).success,
    ).toBe(true)
  })

  it('reste une NATURE : ce n’est pas une source que l’appelant peut cocher', () => {
    expect(discoverSignalSourceSchema.safeParse('ecosystem').success).toBe(false)
  })
})

/**
 * F2 — `ecosystem` est une nature de signal JUSQU'AU BOUT : un signal écrit puis relu depuis l'HISTORIQUE d'un
 * compte (`signal_history.signal_type` → `signalKindSchema.safeParse`) garde sa nature. Avant : il retombait sur
 * `business`, donc la même appartenance changeait de nature selon qu'elle était fraîche ou archivée.
 */
describe('signalKindSchema — ecosystem relu depuis l’historique (F2)', () => {
  it('une appartenance écrite puis relue garde sa nature', () => {
    const written = { type: 'ecosystem', label: 'Membre · 2025', date: '2025-06-01' }
    const [read] = readRecentSignals([
      { id: 's1', signal: written.label, type: written.type, source: 'Annuaire', date: written.date },
    ])
    expect(read).toMatchObject({ type: 'ecosystem', label: 'Membre · 2025' })
    const kind = signalKindSchema.safeParse(written.type)
    expect(kind.success).toBe(true)
    expect(discoverSignalTypeOfKind(kind.success ? kind.data : null)).toBe('ecosystem')
  })

  it('contrôle négatif synthétique : une nature inconnue ou absente reste une actualité, jamais « ecosystem »', () => {
    expect(signalKindSchema.safeParse('annuaire_inventé').success).toBe(false)
    expect(discoverSignalTypeOfKind(null)).toBe('business')
    expect(discoverSignalTypeOfKind('projet')).toBe('business')
  })
})
