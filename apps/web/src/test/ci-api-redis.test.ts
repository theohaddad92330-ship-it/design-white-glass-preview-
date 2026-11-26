import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `Test (API)` n'avait pas de Redis : la connexion BullMQ des modules Nest de l'e2e retentait dans
 * le vide et levait `Unhandled error: Connection is closed`, imputé par jest à un test sans rapport
 * (25/10/2026, run 40176214659). Cette garde lit `ci.yml` : le job doit porter `REDIS_URL` ET
 * démarrer un `redis-server` sur ce port, et le nombre de shards doit être cohérent partout.
 * Un socket qui répond, rien de plus : aucun worker, aucune donnée.
 */
const WORKFLOW = readFileSync(join(__dirname, '..', '..', '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8')

function jobBlock(id: string): string {
  const start = WORKFLOW.indexOf(`\n  ${id}:\n`)
  expect(start, `job ${id} introuvable`).toBeGreaterThan(-1)
  const next = /\n {2}[a-z0-9-]+:\n/.exec(WORKFLOW.slice(start + 5))
  return WORKFLOW.slice(start, next ? start + 5 + next.index : undefined)
}

describe('ci.yml — Test (API) : un Redis qui répond, et des shards cohérents', () => {
  const block = jobBlock('test')

  it('porte REDIS_URL au niveau du job', () => {
    expect(block).toMatch(/\n {4}env:\n {6}REDIS_URL: redis:\/\/localhost:6379\n/)
  })

  it('démarre redis-server sur le port de REDIS_URL, sans services:', () => {
    expect(block).toContain('redis-server --port 6379 --daemonize yes')
    expect(block).not.toMatch(/\n {4}services:/)
  })

  it('la matrice et chaque /N disent le même nombre de shards', () => {
    const m = /shard: \[([0-9, ]+)\]/.exec(block)
    expect(m, 'matrice shard introuvable').not.toBeNull()
    const n = (m?.[1] ?? '').split(',').length
    expect(block).toContain(`--shard=\${{ matrix.shard }}/${n}`)
    expect(block).toContain(`--shard \${{ matrix.shard }}/${n}`)
    expect(block).toContain(`shard \${{ matrix.shard }}/${n}\n`)
  })
})
