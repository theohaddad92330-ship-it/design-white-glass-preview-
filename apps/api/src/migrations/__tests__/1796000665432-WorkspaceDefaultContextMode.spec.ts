import type { QueryRunner } from 'typeorm'
import { WorkspaceDefaultContextMode1796000665432 } from '../1796000665432-WorkspaceDefaultContextMode'

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

async function upQueries(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new WorkspaceDefaultContextMode1796000665432().up(runner)
  return queries.map(normalize)
}

/**
 * #2451.9 — LE MODE DE CONTEXTE PAR DÉFAUT DE L'ESPACE — la colonne.
 *
 * ADDITIVE et idempotente : une colonne `NOT NULL DEFAULT 'my_activity'` — la
 * valeur de repli d'AVANT ce lot, au bit près (`DEFAULT_LAURA_CONTEXT_MODE`) —
 * et une contrainte CHECK sur les trois valeurs de l'enum (GA-11/GA-12 : la
 * contrainte SQL arrive ÉLARGIE avant le code qui écrit, pas après).
 */
describe('WorkspaceDefaultContextMode1796000665432', () => {
  it('ajoute `default_context_mode` sur `workspaces`, NOT NULL, défaut « my_activity »', async () => {
    const sql = await upQueries()
    expect(sql).toContain(
      `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS default_context_mode text NOT NULL DEFAULT 'my_activity'`,
    )
  })

  it('pose une contrainte CHECK sur les trois modes canoniques, jamais un mode deviné', async () => {
    const sql = await upQueries()
    const check = sql.find(q => /CHECK/i.test(q))
    expect(check).toBeDefined()
    expect(check).toContain("'my_activity'")
    expect(check).toContain("'one_off_mission'")
    expect(check).toContain("'neutral'")
  })

  it('ne réécrit ni ne supprime aucune ligne existante', async () => {
    const sql = await upQueries()
    expect(sql.some(q => q.startsWith('UPDATE '))).toBe(false)
    expect(sql.some(q => q.includes('DELETE FROM') || q.includes('DROP COLUMN'))).toBe(false)
  })

  it('redescend en retirant la contrainte puis la colonne qu’elle a ajoutées', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceDefaultContextMode1796000665432().down(runner)
    const sql = queries.map(normalize)
    expect(sql.some(q => /DROP CONSTRAINT IF EXISTS/i.test(q))).toBe(true)
    expect(sql).toContain('ALTER TABLE workspaces DROP COLUMN IF EXISTS default_context_mode')
  })
})
