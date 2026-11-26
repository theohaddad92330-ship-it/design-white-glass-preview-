import { describe, expect, it } from 'vitest'
import type { TodayItem } from './todayQueue'
import { staleActionIds } from './todayStale'

/** #4485 — quelles relances le bandeau « Proposer de les clore » propose de clore. */
const NOW = new Date(2026, 9, 24, 10, 0, 0)
const item = (overrides: Partial<TodayItem>): TodayItem =>
  ({ id: 'plan_item:x', kind: 'plan_item', nativeId: 'x', dueAt: null, ...overrides }) as TodayItem

describe('staleActionIds', () => {
  it('prend les relances du plan en retard de plus de 30 jours', () => {
    const ids = staleActionIds(
      [
        item({ nativeId: 'juillet', dueAt: '2026-07-14' }),
        item({ nativeId: 'pile-30', dueAt: '2026-09-24' }),
        item({ nativeId: '31-jours', dueAt: '2026-09-23' }),
      ],
      NOW,
    )
    expect(ids).toEqual(['juillet', '31-jours'])
  })

  it('sait dire NON : ni récente, ni sans échéance, ni d’une autre maison, ni virtuelle', () => {
    const ids = staleActionIds(
      [
        item({ nativeId: 'recente', dueAt: '2026-10-10' }),
        item({ nativeId: 'sans-date', dueAt: null }),
        item({ nativeId: 'tache', kind: 'task', dueAt: '2026-07-01' }),
        item({ nativeId: 'plan:acc:2026-W30:1', dueAt: '2026-07-01' }),
        item({ nativeId: 'illisible', dueAt: 'bientôt' }),
      ],
      NOW,
    )
    expect(ids).toEqual([])
  })
})
