import { describe, expect, it } from 'vitest'
import type { AccountSignalItem } from '@bellum/contracts'
import { buildWatchlistItems, groupWatchlistByAccount, reconcileRecurrence, signalCountsOf } from './watchlist'

/**
 * #4072 — « 23 signaux ce mois-ci », « +28 autres » et « 16e signal de recrutement en 30 jours » lisent
 * UNE liste : le total de la ligne ⊇ la fenêtre de 30 jours ⊇ les recrutements de cette fenêtre.
 */
const A1 = '11111111-1111-4111-8111-111111111111'
const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10)
const signal = (i: number, type: string, age: number): AccountSignalItem => ({
  id: `s${i}`,
  account_id: A1,
  account_created_at: day(300),
  account_score: 8,
  company_name: 'Orange',
  date: day(age),
  label: `${type} ${i}`,
  sector: 'Telecom',
  source: 'Presse',
  type,
})

const orange = () => {
  const signals = [
    ...Array.from({ length: 4 }, (_, i) => signal(i, 'Recrutement', 2 + i)),
    signal(10, 'Rachat', 5),
    signal(11, 'Recrutement', 90),
    signal(12, 'Recrutement', 120),
  ]
  const [group] = groupWatchlistByAccount(buildWatchlistItems(signals))
  return group!
}

describe('signalCountsOf — une seule liste (#4072)', () => {
  it('total = 1 + autres ; fenêtre = signaux de moins de 30 jours ; recrutements ⊂ fenêtre', () => {
    const counts = signalCountsOf(orange())
    expect(counts.total).toBe(7)
    expect(counts.others).toBe(6)
    expect(counts.thisMonth).toBe(5)
    expect(counts.hiringThisMonth).toBe(4)
  })
})

describe('reconcileRecurrence — le rang vient de la liste, pas d’un autre compteur (#4072)', () => {
  it('recrutement : le rang est celui des recrutements de la fenêtre, même si le serveur en compte plus', () => {
    expect(reconcileRecurrence({ kind: 'hiring', count: 16, windowDays: 30 }, orange())).toEqual({
      kind: 'hiring',
      count: 4,
      windowDays: 30,
    })
  })
  it('autre nature : jamais au-dessus de la fenêtre', () => {
    expect(reconcileRecurrence({ kind: 'signal', count: 40, windowDays: 30 }, orange())?.count).toBe(5)
  })
  it('SAIT DIRE NON : moins de 2 dans la liste → aucune récurrence', () => {
    const [group] = groupWatchlistByAccount(buildWatchlistItems([signal(1, 'Recrutement', 2)]))
    expect(reconcileRecurrence({ kind: 'hiring', count: 3, windowDays: 30 }, group!)).toBeUndefined()
    expect(reconcileRecurrence(undefined, orange())).toBeUndefined()
  })
})
