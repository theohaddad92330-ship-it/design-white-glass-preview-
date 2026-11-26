import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Lot B2 ci/1-caches — les caches `turbo-build-*`, `tsc-incremental-*` et `turbo-quick-*` doivent être ÉCRITS
 * depuis `main` : GitHub ne laisse lire à une PR que les caches de la branche par défaut et de sa propre ref.
 * Tant que `Build`/`quick` ne tournent que sur `pull_request`, ces clés n'existent jamais sur main.
 */
const ci = readFileSync(resolve(__dirname, '../../../../.github/workflows/ci.yml'), 'utf8')

const jobBlock = (id: string): string => {
  const start = ci.indexOf(`\n  ${id}:\n`)
  expect(start, `le job ${id} existe`).toBeGreaterThan(-1)
  const next = ci.slice(start + 1).search(/\n {2}[a-z][a-z0-9-]*:\n/)
  return ci.slice(start, next === -1 ? undefined : start + 1 + next)
}

describe('warm-cache : les caches de build sont écrits depuis main', () => {
  const warm = jobBlock('warm-cache')

  it('tourne sur push, jamais réservé aux pull requests, avec un interrupteur et un plafond', () => {
    expect(warm).toMatch(/if: .*github\.event_name == 'push'/)
    expect(warm).not.toMatch(/if: .*github\.event_name == 'pull_request'/)
    expect(warm).toContain('vars.CI_WARM_CACHE')
    expect(warm).toMatch(/timeout-minutes: \d+/)
  })

  it('sauvegarde chacune des trois familles de clés que les PR restaurent par préfixe', () => {
    for (const family of ['turbo-build', 'turbo-quick', 'tsc-incremental']) {
      expect(warm, `${family} sauvegardé`).toMatch(
        new RegExp(
          `actions/cache/save@v\\d+[\\s\\S]*?key: ${family}-\\$\\{\\{ runner\\.os \\}\\}-\\$\\{\\{ github\\.sha \\}\\}`,
        ),
      )
    }
  })

  it('utilise les MÊMES clés et restore-keys que Build et quick (sinon la PR ne le retrouve pas)', () => {
    const build = jobBlock('build')
    const quick = jobBlock('quick')
    expect(build).toContain('key: turbo-build-${{ runner.os }}-${{ github.sha }}')
    expect(build).toContain('key: tsc-incremental-${{ runner.os }}-${{ github.sha }}')
    expect(quick).toContain('key: turbo-quick-${{ runner.os }}-${{ github.sha }}')
    expect(warm).toContain('restore-keys: tsc-incremental-${{ runner.os }}-')
  })

  it('est dans les needs de l’alarme main (sinon il rougit sans que personne le sache)', () => {
    expect(jobBlock('suite-complete-rouge')).toMatch(/needs: \[[^\]]*warm-cache[^\]]*\]/)
  })
})

describe('cache distant turbo : préparé, no-op sans clé', () => {
  it('Build et warm-cache passent par l’action, qui n’écrit rien sans TURBO_TOKEN/TURBO_TEAM', () => {
    expect(jobBlock('build')).toContain('./.github/actions/turbo-remote')
    expect(jobBlock('warm-cache')).toContain('./.github/actions/turbo-remote')
    const action = readFileSync(resolve(__dirname, '../../../../.github/actions/turbo-remote/action.yml'), 'utf8')
    expect(action).toMatch(/if \[ -z "\$TOKEN" \] \|\| \[ -z "\$TEAM" \]/)
    expect(action).toContain('exit 0')
  })
})
