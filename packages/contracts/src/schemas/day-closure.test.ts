import { describe, expect, it } from 'vitest'
import { compileDayClosureTasks, DAY_CLOSURE_DECISIONS, dayClosureSchema } from './day-closure.js'
import type { Task } from './task.js'

// #2392 — le compilateur de la clôture de journée : il RANGE des tâches réelles,
// il n'invente rien et ne compte rien.

const TODAY = '2026-09-23'
const TOMORROW = '2026-09-24'
const dayOf = (iso: string) => iso.slice(0, 10)

let seq = 0
function task(overrides: Partial<Task> = {}): Task {
  seq += 1
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    title: `Tâche ${seq}`,
    details: null,
    status: 'todo',
    priority: 'normal',
    dueOn: TODAY,
    ownerId: null,
    ownerName: null,
    createdById: null,
    accountId: null,
    accountName: null,
    contactId: null,
    contactName: null,
    projectId: null,
    projectLabel: null,
    completedAt: null,
    completedById: null,
    completedByName: null,
    resultNote: null,
    channel: null,
    createdAt: '2026-09-20T08:00:00Z',
    updatedAt: '2026-09-20T08:00:00Z',
    ...overrides,
  }
}

function compile(tasks: Task[]) {
  return compileDayClosureTasks({ tasks, today: TODAY, tomorrow: TOMORROW, dayOf })
}

describe('compileDayClosureTasks (#2392)', () => {
  it("range une tâche cochée AUJOURD'HUI dans les résultats, pas celle cochée hier", () => {
    const doneToday = task({ status: 'done', completedAt: `${TODAY}T15:00:00Z`, resultNote: 'Appel passé' })
    const doneYesterday = task({ status: 'done', completedAt: '2026-09-22T15:00:00Z' })
    const closure = compile([doneToday, doneYesterday])
    expect(closure.results.map(t => t.id)).toEqual([doneToday.id])
    expect(closure.results[0]?.resultNote).toBe('Appel passé')
  })

  it("une tâche abandonnée aujourd'hui est un blocage, avec sa raison ou SANS (jamais inventée)", () => {
    const withReason = task({
      status: 'cancelled',
      completedAt: `${TODAY}T10:00:00Z`,
      resultNote: 'Client injoignable',
    })
    const without = task({ status: 'cancelled', completedAt: `${TODAY}T11:00:00Z` })
    const closure = compile([withReason, without])
    expect(closure.blocked.map(t => [t.id, t.resultNote])).toEqual([
      [withReason.id, 'Client injoignable'],
      [without.id, null],
    ])
    expect(closure.results).toEqual([])
  })

  it("les tâches ouvertes dues aujourd'hui ou en retard sont À DÉCIDER, une par une", () => {
    const overdue = task({ dueOn: '2026-09-20' })
    const today = task({ dueOn: TODAY, priority: 'high' })
    const later = task({ dueOn: '2026-10-01' })
    const closure = compile([later, today, overdue])
    expect(closure.toDecide.map(t => t.id)).toEqual([overdue.id, today.id])
  })

  it("un engagement est une tâche créée aujourd'hui, encore ouverte, pour plus tard", () => {
    const promised = task({ createdAt: `${TODAY}T09:00:00Z`, dueOn: '2026-09-26', contactName: 'Camille Martin' })
    const old = task({ createdAt: '2026-09-10T09:00:00Z', dueOn: '2026-09-26' })
    const closure = compile([promised, old])
    expect(closure.commitments.map(t => t.id)).toEqual([promised.id])
  })

  it('la première action de demain est UNE tâche due demain, la prioritaire d’abord', () => {
    const normal = task({ dueOn: TOMORROW, createdAt: '2026-09-01T08:00:00Z' })
    const high = task({ dueOn: TOMORROW, priority: 'high', createdAt: '2026-09-15T08:00:00Z' })
    expect(compile([normal, high]).firstTomorrow?.id).toBe(high.id)
  })

  it('rien de dû demain = AUCUNE première action (jamais une devinée ailleurs)', () => {
    const overdue = task({ dueOn: '2026-09-20' })
    expect(compile([overdue]).firstTomorrow).toBeNull()
  })

  it('ne porte AUCUN compteur : seulement des listes (#2392.7)', () => {
    const closure = compile([task()])
    for (const value of Object.values(closure)) expect(typeof value).not.toBe('number')
  })

  it('le schéma de fil accepte la clôture compilée et refuse une section inconnue', () => {
    const tasks = compile([task({ status: 'done', completedAt: `${TODAY}T15:00:00Z` })])
    const wire = {
      date: TODAY,
      timeZone: 'Europe/Paris',
      tasksState: 'ready',
      tasksReason: null,
      ...tasks,
      waitingOn: { state: 'not_connected', reason: 'Messagerie non connectée.', threads: [] },
      toValidate: { state: 'ready', reason: null, cards: [] },
    }
    expect(dayClosureSchema.safeParse(wire).success).toBe(true)
    expect(dayClosureSchema.safeParse({ ...wire, forecast: 12 }).success).toBe(false)
  })

  it('les décisions offertes ne contiennent NI « tout reporter » NI suppression (#2392.9)', () => {
    expect(DAY_CLOSURE_DECISIONS).toEqual(['postpone', 'delegate', 'requalify', 'drop', 'done'])
  })
})
