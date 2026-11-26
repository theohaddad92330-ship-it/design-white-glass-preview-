import { describe, expect, it } from 'vitest'
import { computeDiscoverSourceAxes, type DiscoverSourceFacts } from '@bellum/contracts'
import { sourceAgeLabel, sourceEvidenceCount, sourceEvidenceKey } from './discover-source-axes'

const NOW = new Date('2026-10-12T00:00:00Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

describe('sourceAgeLabel (#4067 — un signal ancien est DATÉ)', () => {
  it('« il y a 8 mois » pour un signal de 240 jours, jamais « récent »', () => {
    expect(sourceAgeLabel(daysAgo(240), NOW)).toEqual({ key: 'sourceAxes.ago.months', count: 8 })
  })
  it('en jours sous un mois, en années au-delà de deux ans', () => {
    expect(sourceAgeLabel(daysAgo(12), NOW)).toEqual({ key: 'sourceAxes.ago.days', count: 12 })
    expect(sourceAgeLabel(daysAgo(800), NOW)).toEqual({ key: 'sourceAxes.ago.years', count: 2 })
  })
  it('rien de daté ⇒ rien d’écrit', () => {
    expect(sourceAgeLabel(null, NOW)).toBeNull()
    expect(sourceAgeLabel('pas une date', NOW)).toBeNull()
  })
})

describe('sourceEvidenceCount', () => {
  it('compte ce que la preuve nomme : contacts, consultants, sinon n', () => {
    const facts: DiscoverSourceFacts = {
      signalHistory: null,
      crm: { won: 0, lost: 0, open: 0, dormant: 0, contacts: 3, lastActivityAt: null },
      marketMemory: null,
      dataforge: null,
      drive: { documents: 2, latestAt: null },
      missions: { missions: 0, consultants: 1, latestAt: null },
    }
    const axes = computeDiscoverSourceAxes(facts, NOW).axes
    expect(sourceEvidenceCount(axes.find(a => a.key === 'crm')!)).toBe(3)
    expect(sourceEvidenceCount(axes.find(a => a.key === 'drive')!)).toBe(2)
    expect(sourceEvidenceCount(axes.find(a => a.key === 'missions')!)).toBe(1)
  })
})

describe('sourceEvidenceKey (#4067 R17 — une mission à venir n’est pas « passée »)', () => {
  const now = new Date('2026-10-15T12:00:00Z')
  const axis = (latestAt: string | null, label_key = 'missions') =>
    ({ key: 'missions', label_key, label_params: { n: 1 }, latestAt }) as never
  it('Dassault, fin au 30/11/2026 ⇒ en cours', () => {
    expect(sourceEvidenceKey(axis('2026-11-30'), now)).toBe('missions_ongoing')
  })
  it('fin passée ⇒ mission passée', () => {
    expect(sourceEvidenceKey(axis('2026-03-01'), now)).toBe('missions')
  })
  it('sans date ou autre axe ⇒ clé inchangée', () => {
    expect(sourceEvidenceKey(axis(null), now)).toBe('missions')
    expect(sourceEvidenceKey(axis('2026-11-30', 'drive'), now)).toBe('drive')
  })
})
