import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { declaredJobs, jobsWithoutSuccess } from '../../../../tools/ci/jobs-sans-succes.mjs'

// #4873 — la routine qui nomme un job de ci.yml sans aucun success sur la fenêtre des runs.
const run = (...jobs: [string, string | null][]) => ({ jobs: jobs.map(([name, conclusion]) => ({ name, conclusion })) })

describe('declaredJobs', () => {
  it('lit les jobs RÉELS de ci.yml, avec leur nom affiché', () => {
    const real = readFileSync(resolve(__dirname, '../../../../.github/workflows/ci.yml'), 'utf8')
    const jobs: { id: string; name: string }[] = declaredJobs(real)
    expect(jobs.map(j => j.id)).toEqual(expect.arrayContaining(['test', 'test-ia', 'dette-formatage', 'ci-status']))
    expect(jobs.length).toBeGreaterThan(8)
  })

  it('prend le nom affiché quand le job en porte un, l’identifiant sinon', () => {
    const yml = [
      'name: CI',
      'jobs:',
      '  alpha:',
      '    name: Test (Alpha)',
      '    runs-on: x',
      '  beta:',
      '    runs-on: x',
    ].join('\n')
    expect(declaredJobs(yml)).toEqual([
      { id: 'alpha', name: 'Test (Alpha)' },
      { id: 'beta', name: 'beta' },
    ])
  })
})

describe('jobsWithoutSuccess', () => {
  const declared = [
    { id: 'dette-formatage', name: 'dette-formatage' },
    { id: 'test-web', name: 'Test (Web)' },
    { id: 'quick', name: 'quick' },
    { id: 'promptfoo', name: 'promptfoo' },
  ]

  it('NOMME un job rouge sur toute la fenêtre (le cas dette-formatage, #4829)', () => {
    const { never } = jobsWithoutSuccess(declared, [
      run(['dette-formatage', 'failure'], ['quick', 'success']),
      run(['dette-formatage', 'failure'], ['quick', 'success']),
    ])
    expect(never).toEqual(['dette-formatage'])
  })

  it('ne nomme pas un job qui a rendu success au moins une fois', () => {
    const { never } = jobsWithoutSuccess(declared, [run(['quick', 'failure']), run(['quick', 'success'])])
    expect(never).not.toContain('quick')
  })

  it('compte les jobs de matrice sous le nom du job : « Test (Web) (2) »', () => {
    const { never } = jobsWithoutSuccess(declared, [run(['Test (Web) (2)', 'success'])])
    expect(never).not.toContain('test-web')
  })

  it('un job seulement skipped est listé à part, jamais nommé (portée sélective)', () => {
    const result = jobsWithoutSuccess(declared, [run(['promptfoo', 'skipped'])])
    expect(result.never).not.toContain('promptfoo')
    expect(result.unobserved).toContain('promptfoo')
  })

  it('un job cancelled sans success est nommé : c’est un résultat réel, pas une portée', () => {
    expect(jobsWithoutSuccess(declared, [run(['promptfoo', 'cancelled'])]).never).toContain('promptfoo')
  })
})
