import type { QueryRunner } from 'typeorm'
import { HistorySinceLastSeen1788051327419 } from '../1788051327419-HistorySinceLastSeen'

/** Capture every SQL statement the migration issues (no live DB needed). */
function createRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  return { runner, queries }
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

describe('HistorySinceLastSeen1788051327419', () => {
  it('crée user_last_seen (repère « depuis ma dernière connexion »), idempotent', async () => {
    const { runner, queries } = createRunner()
    await new HistorySinceLastSeen1788051327419().up(runner)
    const create = queries.map(normalize).find(q => q.includes('CREATE TABLE IF NOT EXISTS user_last_seen'))
    expect(create).toBeDefined()
    expect(create).toContain('user_id uuid PRIMARY KEY')
    expect(create).toContain('last_seen_at timestamptz NOT NULL DEFAULT now()')
    expect(create).toContain('previous_seen_at timestamptz NULL')
  })

  it('rejoue le CHECK des action_type en incluant les deux événements système §8', async () => {
    const { runner, queries } = createRunner()
    await new HistorySinceLastSeen1788051327419().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('ALTER TABLE user_actions DROP CONSTRAINT IF EXISTS user_actions_action_type_check')
    const add = flat.find(q => q.includes('ADD CONSTRAINT user_actions_action_type_check'))
    expect(add).toBeDefined()
    expect(add).toContain("'account_score_changed'")
    expect(add).toContain("'profile_updated'")
  })

  // La parité avec le contrat zod est vérifiée sur la migration qui définit
  // ACTUELLEMENT la contrainte — aujourd'hui `NeedPlayActionType1788912847316`.
  // La garder ici la ferait tomber à chaque nouvelle valeur, en accusant une
  // migration passée qui, elle, est figée : une migration déjà appliquée ne se
  // réécrit pas.

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new HistorySinceLastSeen1788051327419().down()).rejects.toThrow('down migrations are not supported')
  })
})
