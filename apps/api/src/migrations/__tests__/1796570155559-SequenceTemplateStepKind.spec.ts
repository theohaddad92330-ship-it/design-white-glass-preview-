import type { QueryRunner } from 'typeorm'
import { SequenceTemplateStepKind1796570155559 } from '../1796570155559-SequenceTemplateStepKind'

/** #4426.7 — ajout seul : une colonne `kind` à défaut `email`, contrainte posée avant le code qui écrit `call_script`. */
describe('SequenceTemplateStepKind1796570155559', () => {
  it('ajoute `kind` (défaut email) puis sa contrainte, rien d’autre', async () => {
    const queries: string[] = []
    const runner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql.replace(/\s+/g, ' ').trim())
        return []
      }),
    } as unknown as QueryRunner
    await new SequenceTemplateStepKind1796570155559().up(runner)
    expect(queries).toHaveLength(3)
    expect(queries[0]).toContain("ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'email'")
    expect(queries[2]).toContain("CHECK (kind IN ('email', 'call_script'))")
    expect(queries.join(' ')).not.toMatch(/DROP TABLE|DELETE|UPDATE /)
  })
})
