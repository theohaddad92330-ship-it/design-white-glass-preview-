import { describe, expect, it } from 'vitest'
import type { DayClosureTask } from '@bellum/contracts'
import { dayClosureChanges } from './day-closure-diff'

// #2392.4 / .5 / .9 — le diff de la clôture de journée : une ligne PAR tâche
// décidée, jamais une tâche sans décision, jamais un report de masse.

const TODAY = '2026-09-23'

function task(id: string, overrides: Partial<DayClosureTask> = {}): DayClosureTask {
  return {
    id,
    title: `Tâche ${id}`,
    dueOn: '2026-09-21',
    priority: 'normal',
    ownerId: 'me',
    ownerName: null,
    accountName: null,
    contactName: null,
    resultNote: null,
    ...overrides,
  }
}

describe('dayClosureChanges (#2392)', () => {
  it("une tâche SANS décision ne produit AUCUN changement (rien n'est reporté d'office)", () => {
    expect(dayClosureChanges([task('a'), task('b')], {}, TODAY)).toEqual([])
  })

  it('reporter écrit la NOUVELLE date, et seulement elle', () => {
    const [change] = dayClosureChanges([task('a')], { a: { kind: 'postpone', dueOn: '2026-09-25' } }, TODAY)
    expect(change).toMatchObject({
      taskId: 'a',
      before: '2026-09-21',
      after: '2026-09-25',
      patch: { dueOn: '2026-09-25' },
    })
  })

  it("un report à aujourd'hui ou avant n'est pas un report : aucun changement", () => {
    expect(dayClosureChanges([task('a')], { a: { kind: 'postpone', dueOn: TODAY } }, TODAY)).toEqual([])
  })

  it('déléguer change le propriétaire ; déléguer à soi-même ne change rien', () => {
    expect(dayClosureChanges([task('a')], { a: { kind: 'delegate', ownerId: 'you' } }, TODAY)[0]?.patch).toEqual({
      ownerId: 'you',
    })
    expect(dayClosureChanges([task('a')], { a: { kind: 'delegate', ownerId: 'me' } }, TODAY)).toEqual([])
  })

  it('requalifier change le titre ; un titre vide ou identique ne change rien', () => {
    expect(
      dayClosureChanges([task('a')], { a: { kind: 'requalify', title: '  Appeler plutôt  ' } }, TODAY)[0]?.patch,
    ).toEqual({
      title: 'Appeler plutôt',
    })
    expect(dayClosureChanges([task('a')], { a: { kind: 'requalify', title: '   ' } }, TODAY)).toEqual([])
    expect(dayClosureChanges([task('a')], { a: { kind: 'requalify', title: 'Tâche a' } }, TODAY)).toEqual([])
  })

  it('abandonner ARCHIVE (statut annulé) avec sa raison — jamais une suppression', () => {
    const [change] = dayClosureChanges([task('a')], { a: { kind: 'drop', reason: 'Client parti' } }, TODAY)
    expect(change?.patch).toEqual({ status: 'cancelled', resultNote: 'Client parti' })
  })

  it('marquer faite est un geste déclaratif : statut fait, note facultative', () => {
    const [change] = dayClosureChanges([task('a')], { a: { kind: 'done', note: '' } }, TODAY)
    expect(change?.patch).toEqual({ status: 'done' })
  })

  it("ne touche qu'aux tâches de la clôture, dans leur ordre", () => {
    const changes = dayClosureChanges(
      [task('a'), task('b')],
      { b: { kind: 'drop', reason: '' }, zzz: { kind: 'drop', reason: '' }, a: { kind: 'done', note: 'ok' } },
      TODAY,
    )
    expect(changes.map(change => change.taskId)).toEqual(['a', 'b'])
  })
})
