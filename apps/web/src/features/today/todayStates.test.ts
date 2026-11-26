import { describe, expect, it } from 'vitest'
import { buildTodayItems, buildTodayQueue, type TodayItem, type TodaySources } from './todayQueue'
import { stateCounts, todayStateOf } from './todayStates'

const EMPTY: TodaySources = {
  approvals: [],
  crm: [],
  erp: [],
  sends: [],
  messages: [],
  plan: [],
  sequences: [],
  calls: [],
  tasks: [],
}
const NOW = new Date(2026, 9, 22, 10, 0, 0)

const item = (over: Partial<TodayItem>): TodayItem =>
  ({
    id: 'task:1',
    kind: 'task',
    nativeId: '1',
    group: 'task',
    source: 'plan',
    dueAt: null,
    title: 'Relancer',
    draft: null,
    gestures: { validate: false, reject: false, edit: false, done: true, postpone: true },
    status: null,
    ...over,
  }) as TodayItem

// Théo C actions-aujourdhui.N2 — « Non commencées · En cours · À valider » : un état DÉRIVÉ de la file, jamais une colonne.
describe('Théo C actions-aujourdhui.N2 — l’état d’une ligne de la file', () => {
  it('« À valider » : ce qui attend un feu vert (le geste valider, ou le groupe de validation)', () => {
    expect(todayStateOf(item({ group: 'validate' }))).toBe('to_validate')
    expect(
      todayStateOf(item({ gestures: { validate: true, reject: false, edit: false, done: false, postpone: false } })),
    ).toBe('to_validate')
  })

  it('« En cours » : un brouillon est déjà préparé — préparer ne clôture pas, la tâche reste ouverte', () => {
    expect(todayStateOf(item({ draft: { subject: 'Objet', body: 'Corps' } }))).toBe('in_progress')
  })

  it('« Non commencée » : le reste', () => {
    expect(todayStateOf(item({}))).toBe('not_started')
  })

  it('les comptes se lisent sur la file ENTIÈRE, et un état absent ne fait aucune entrée (jamais « 0 »)', () => {
    const counts = stateCounts([item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c', group: 'validate' })])
    expect(counts).toEqual({ not_started: 2, to_validate: 1 })
    expect('in_progress' in counts).toBe(false)
  })

  it('le filtre d’état change ce qu’on VOIT, jamais ce qui est dû (dayCount, unfilteredTotal)', () => {
    const items = buildTodayItems({ ...EMPTY }, NOW)
    expect(items).toEqual([])
    const all = [item({ id: 'a', dueAt: NOW.toISOString() }), item({ id: 'b', group: 'validate' })]
    const filtered = buildTodayQueue(all, { state: 'to_validate' }, NOW)
    expect(filtered.total).toBe(1)
    expect(filtered.unfilteredTotal).toBe(2)
    expect(filtered.dayCount).toBe(2)
  })
})
