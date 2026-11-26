import { describe, expect, it } from 'vitest'
import type { LauraJobState, LauraJobView } from '@bellum/contracts'
import { jobStatusOf } from './job-status'

// #5045 — le statut V8 se DÉRIVE de l'état réel du job : jamais d'horloge, jamais de durée.
const step = (key: string, status: string) => ({ key, label: `Étape ${key}`, status })
function view(state: LauraJobState, statuses: string[], done = 0): LauraJobView {
  return {
    state,
    brief: { steps: statuses.map((status, i) => step(String(i + 1), status)) },
    progress: { done, total: statuses.length },
  } as unknown as LauraJobView
}

describe('jobStatusOf — #5045', () => {
  it.each([
    ['running', 'running'],
    ['planned', 'running'],
    ['awaiting_approval', 'awaiting'],
    ['done', 'done'],
    ['cancelled', 'interrupted'],
    ['failed', 'failed'],
    ['partial', 'partial'],
    ['unknown', 'unknown'],
  ] as const)('état %s → kicker %s', (state, kicker) => {
    expect(jobStatusOf(view(state, ['done', 'todo'], 1)).kicker).toBe(kicker)
  })

  it.each(['draft', 'to_confirm', 'superseded', 'blocked'] as const)(
    'état %s → aucun kicker, rien n’est parti',
    state => {
      const status = jobStatusOf(view(state, ['todo', 'todo']))
      expect(status.kicker).toBeNull()
      expect(status.started).toBe(false)
    },
  )

  it('l’étape courante est celle que le serveur dit en cours', () => {
    expect(jobStatusOf(view('running', ['done', 'running', 'todo'], 1)).current).toEqual({
      key: '2',
      label: 'Étape 2',
    })
  })

  it('sans étape en cours, la courante est la première à faire', () => {
    expect(jobStatusOf(view('running', ['done', 'todo', 'todo'], 1)).current?.key).toBe('2')
  })

  it('un job fini ou interrompu n’a pas d’étape courante', () => {
    expect(jobStatusOf(view('done', ['done', 'done'], 2)).current).toBeNull()
    expect(jobStatusOf(view('cancelled', ['done', 'todo'], 1)).current).toBeNull()
  })

  it('la progression est celle du serveur, sans durée inventée', () => {
    const status = jobStatusOf(view('running', ['done', 'running', 'todo'], 1))
    expect(status).toMatchObject({ done: 1, total: 3, started: true })
    expect(Object.keys(status).sort()).toEqual(['current', 'done', 'kicker', 'started', 'total'])
  })
})
