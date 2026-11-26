import type { QueryRunner } from 'typeorm'
import { EffectifObservedAt1795702848586 } from '../1795702848586-EffectifObservedAt'

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

// #2035.8 — QUAND chaque bande d'effectif a été répondue.
describe('EffectifObservedAt1795702848586', () => {
  it('ajoute la colonne jsonb, NOT NULL avec un défaut vide (jamais NULL, jamais rétro-rempli)', async () => {
    const { runner, queries } = createRunner()
    await new EffectifObservedAt1795702848586().up(runner)
    const sql = normalize(queries.join(' '))

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS effectif_observed_at jsonb NOT NULL DEFAULT '{}'::jsonb")
  })

  it('est rejouable : passe par IF NOT EXISTS', async () => {
    const { runner, queries } = createRunner()
    await new EffectifObservedAt1795702848586().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    for (const statement of statements) {
      expect(statement).toContain('IF NOT EXISTS')
    }
  })

  it('sait redescendre', async () => {
    const { runner, queries } = createRunner()
    await new EffectifObservedAt1795702848586().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS effectif_observed_at')
  })
})
