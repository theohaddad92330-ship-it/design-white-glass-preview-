import { describe, expect, it } from 'vitest'
import { comparePriority, normalizeContactPriority, priorityTone, sortByPriority } from './contactPriority'

type Row = { full_name: string; priority: number | null }

const rows = (...values: Array<[string, number | null]>): Row[] =>
  values.map(([full_name, priority]) => ({ full_name, priority }))

describe('normalizeContactPriority', () => {
  it('keeps a rank inside the 1-5 contract range', () => {
    expect(normalizeContactPriority(1)).toBe(1)
    expect(normalizeContactPriority(5)).toBe(5)
  })

  it('rejects anything outside the scale rather than clamping it to a wrong rank', () => {
    expect(normalizeContactPriority(0)).toBeNull()
    expect(normalizeContactPriority(6)).toBeNull()
    expect(normalizeContactPriority(2.5)).toBeNull()
    expect(normalizeContactPriority(null)).toBeNull()
    expect(normalizeContactPriority(undefined)).toBeNull()
  })
})

describe('comparePriority', () => {
  it('ranks 1 ahead of 5 — 1 is the HIGHEST priority, not the lowest', () => {
    expect(comparePriority(1, 5)).toBeLessThan(0)
    expect(comparePriority(5, 1)).toBeGreaterThan(0)
    expect(comparePriority(3, 3)).toBe(0)
  })

  it('puts an unranked contact last instead of first', () => {
    expect(comparePriority(null, 5)).toBeGreaterThan(0)
    expect(comparePriority(5, null)).toBeLessThan(0)
  })
})

describe('sortByPriority', () => {
  it('orders the EDF priority path best-first (regression: it was worst-first)', () => {
    const contacts = rows(['Vincent Niebel', 5], ['Patrick Charignon', 4], ['Olivier Ligneul', 2], ['Franck Michon', 1])
    expect(sortByPriority(contacts).map(c => c.full_name)).toEqual([
      'Franck Michon',
      'Olivier Ligneul',
      'Patrick Charignon',
      'Vincent Niebel',
    ])
  })

  it('does not mutate the input array', () => {
    const contacts = rows(['a', 5], ['b', 1])
    sortByPriority(contacts)
    expect(contacts.map(c => c.full_name)).toEqual(['a', 'b'])
  })

  it('keeps unranked contacts at the end', () => {
    const contacts = rows(['none', null], ['best', 1])
    expect(sortByPriority(contacts).map(c => c.full_name)).toEqual(['best', 'none'])
  })
})

describe('priorityTone', () => {
  it('treats rank 1 as the strongest and rank 5 as the weakest', () => {
    expect(priorityTone(1)).toBe('strong')
    expect(priorityTone(2)).toBe('strong')
    expect(priorityTone(3)).toBe('medium')
    expect(priorityTone(4)).toBe('weak')
    expect(priorityTone(5)).toBe('weak')
  })
})
