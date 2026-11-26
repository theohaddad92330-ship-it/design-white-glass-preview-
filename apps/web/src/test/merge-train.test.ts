import { describe, expect, it } from 'vitest'

import { forcesFullSuite, decideCiSelection } from '../../../../tools/ci/test-changed.mjs'
import {
  decideStep,
  ejectionComment,
  failedJobs,
  latestStatus,
  orderQueue,
  runTrain,
} from '../../../../tools/ci/merge-train.mjs'

/** La file de fusion (`tools/ci/merge-train.mjs`) : choix de la PR de tête et décision, appels REST injectés. */
const pr = (n: number, over: Record<string, unknown> = {}) => ({
  number: n,
  state: 'open',
  draft: false,
  labels: ['ci:train'],
  labeledAt: `2026-10-31T10:0${n}:00Z`,
  ...over,
})
const status = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'CI Status',
  status: 'completed',
  conclusion: 'success',
  started_at: '2026-10-31T11:00:00Z',
  ...over,
})
const base = { behind: false, mergeable: true, labeledAt: '2026-10-31T10:00:00Z' }

describe('merge-train — qui passe en premier', () => {
  it('ordre de pose du label, puis numéro', () => {
    const q = orderQueue([
      pr(3, { labeledAt: '2026-10-31T09:00:00Z' }),
      pr(1),
      pr(2, { labeledAt: '2026-10-31T09:00:00Z' }),
    ])
    expect(q.map(p => p.number)).toEqual([2, 3, 1])
  })
  it('ignore brouillons, fermées et PR sans label ; --all prend toutes les prêtes', () => {
    const prs = [pr(1, { draft: true }), pr(2, { state: 'closed' }), pr(3, { labels: [] }), pr(4)]
    expect(orderQueue(prs).map(p => p.number)).toEqual([4])
    expect(orderQueue(prs, { all: true }).map(p => p.number)).toEqual([3, 4])
  })
})

describe('merge-train — décision', () => {
  const d = (over: Record<string, unknown>, st: unknown = status(), canUpdate = true) =>
    decideStep({ pr: { ...base, ...over }, status: st, canUpdate }).action

  it('vert, à jour : fusion', () => expect(d({})).toBe('merge'))
  it('en retard sur main : mise à jour (sans jeton déclencheur : on laisse la main)', () => {
    expect(d({ behind: true })).toBe('update')
    expect(decideStep({ pr: { ...base, behind: true }, status: status(), canUpdate: false }).action).toBe('skip')
  })
  it('conflit : éjection', () => expect(d({ mergeable: false })).toBe('eject'))
  it('CI rouge : éjection, jamais de fusion', () => {
    expect(d({}, status({ conclusion: 'failure' }))).toBe('eject')
    expect(d({}, status({ conclusion: 'failure' }))).not.toBe('merge')
  })
  it('CI absente ou en cours : on attend', () => {
    expect(d({}, null)).toBe('wait')
    expect(d({}, status({ status: 'in_progress', conclusion: null }))).toBe('wait')
  })
  it('CI annulée : on attend un run neuf, on n’éjecte pas sur un faux rouge', () => {
    expect(d({}, status({ conclusion: 'cancelled' }))).toBe('wait')
  })
  it('CI lancée avant le label (suite partielle) : jamais fusionnée telle quelle', () => {
    const old = status({ started_at: '2026-10-31T09:00:00Z' })
    expect(d({}, old)).toBe('reopen')
    expect(decideStep({ pr: base, status: old, canUpdate: false }).action).toBe('skip')
  })
})

describe('merge-train — lecture des jobs rouges', () => {
  it('garde le dernier CI Status et nomme les jobs rouges', () => {
    const runs = [
      status({ id: 1, conclusion: 'failure' }),
      status({ id: 9 }),
      { id: 5, name: 'Test (API)', conclusion: 'failure' },
      { id: 6, name: 'Build', conclusion: 'success' },
    ]
    expect(latestStatus(runs)?.id).toBe(9)
    expect(failedJobs(runs)).toEqual(['Test (API)'])
    expect(ejectionComment({ reason: 'CI Status failure', failed: ['Test (API)'] })).toContain('`Test (API)`')
  })
})

describe('merge-train — un passage de bout en bout (REST injecté)', () => {
  function fakeApi(prs: Record<number, { behind?: boolean; conclusion?: string }>) {
    const calls: string[] = []
    const api = async (method: string, path: string) => {
      calls.push(`${method} ${path}`)
      const num = Number(/\/(?:pulls|issues)\/(\d+)/.exec(path)?.[1])
      if (path.startsWith('/pulls?')) {
        const data = Object.keys(prs).map(k => ({
          number: Number(k),
          state: 'open',
          draft: false,
          labels: [{ name: 'ci:train' }],
          base: { ref: 'main' },
          head: { sha: `sha${k}` },
        }))
        return { ok: true, status: 200, data }
      }
      if (/\/events/.test(path))
        return {
          ok: true,
          status: 200,
          data: [{ event: 'labeled', label: { name: 'ci:train' }, created_at: '2026-10-31T10:00:00Z' }],
        }
      if (/^\/pulls\/\d+$/.test(path))
        return { ok: true, status: 200, data: { head: { sha: `sha${num}` }, base: { sha: 'm' }, mergeable: true } }
      if (path.startsWith('/compare/'))
        return { ok: true, status: 200, data: { behind_by: prs[Number(/sha(\d+)/.exec(path)?.[1])]?.behind ? 2 : 0 } }
      if (path.includes('/check-runs')) {
        const n = Number(/sha(\d+)/.exec(path)?.[1])
        return {
          ok: true,
          status: 200,
          data: {
            check_runs: [
              status({ conclusion: prs[n]?.conclusion ?? 'success' }),
              { id: 7, name: 'Test (API)', conclusion: prs[n]?.conclusion === 'failure' ? 'failure' : 'success' },
            ],
          },
        }
      }
      return { ok: true, status: 200, data: {} }
    }
    return { api, calls }
  }
  const run = (prs: Parameters<typeof fakeApi>[0], dryRun = false) => {
    const f = fakeApi(prs)
    return runTrain({
      api: f.api,
      all: false,
      dryRun,
      canUpdate: true,
      dispatch: ['ci.yml'],
      log: () => undefined,
    }).then(() => f.calls)
  }

  it('dry-run : aucune écriture', async () => {
    const calls = await run({ 1: {} }, true)
    expect(calls.filter(c => !c.startsWith('GET'))).toEqual([])
  })
  it('PR verte : fusion (méthode merge) puis déclenchement de ci.yml sur main', async () => {
    const calls = await run({ 1: {} })
    expect(calls).toContain('PUT /pulls/1/merge')
    expect(calls).toContain('POST /actions/workflows/ci.yml/dispatches')
  })
  it('PR rouge : éjectée, commentée, et la suivante prend la tête', async () => {
    const calls = await run({ 1: { conclusion: 'failure' }, 2: {} })
    expect(calls).toContain('DELETE /issues/1/labels/ci%3Atrain')
    expect(calls.some(c => c.startsWith('POST /issues/1/comments'))).toBe(true)
    expect(calls).not.toContain('PUT /pulls/1/merge')
    expect(calls).toContain('PUT /pulls/2/merge')
  })
  it('un seul pas : la PR en retard est mise à jour, la suivante n’est pas touchée', async () => {
    const calls = await run({ 1: { behind: true }, 2: {} })
    expect(calls).toContain('PUT /pulls/1/update-branch')
    expect(calls.some(c => c.includes('/pulls/2/merge'))).toBe(false)
  })
})

describe('label ci:train — suite complète du sélecteur', () => {
  it('ci:train force le mode complet comme ci:suite-complete', () => {
    expect(forcesFullSuite(['ci:train'])).toBe(true)
    expect(forcesFullSuite(['ci:suite-complete'])).toBe(true)
    expect(forcesFullSuite(['bug'])).toBe(false)
    const sel = decideCiSelection({
      changed: ['apps/web/src/a.ts'],
      allTests: ['t1', 't2', 't3'],
      relatedTests: ['t1'],
      alwaysRun: [],
      labels: ['ci:train'],
      planError: null,
    })
    expect(sel.mode).toBe('complet')
    expect(sel.files).toHaveLength(3)
  })
})
