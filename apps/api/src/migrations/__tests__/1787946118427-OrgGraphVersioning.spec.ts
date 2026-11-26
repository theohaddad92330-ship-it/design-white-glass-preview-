import type { QueryRunner } from 'typeorm'
import { OrgGraphVersioning1787946118427 } from '../1787946118427-OrgGraphVersioning'

function createRunner(): { runner: QueryRunner; calls: string[] } {
  const calls: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      calls.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  return { runner, calls }
}

describe('OrgGraphVersioning1787946118427', () => {
  it('ajoute les deux colonnes qui doivent survivre au blob raw_analysis', async () => {
    const { runner, calls } = createRunner()
    await new OrgGraphVersioning1787946118427().up(runner)

    expect(calls).toEqual([
      'ALTER TABLE accounts ADD COLUMN IF NOT EXISTS org_graph_version integer NOT NULL DEFAULT 1',
      "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS org_rejected_items jsonb NOT NULL DEFAULT '[]'::jsonb",
    ])
  })

  it("laisse les dossiers antérieurs dans l'état d'avant : version 1, aucune mémoire de rejet", async () => {
    const { runner, calls } = createRunner()
    await new OrgGraphVersioning1787946118427().up(runner)

    expect(calls.join(' ')).toContain('DEFAULT 1')
    expect(calls.join(' ')).toContain("DEFAULT '[]'::jsonb")
    // Aucune réécriture de données : la migration est purement structurelle.
    expect(calls.filter(sql => /\b(UPDATE|DELETE FROM|INSERT INTO)\b/i.test(sql))).toEqual([])
  })

  it('est ré-exécutable sans erreur (IF NOT EXISTS des deux côtés)', async () => {
    const { runner, calls } = createRunner()
    await new OrgGraphVersioning1787946118427().up(runner)
    expect(calls.every(sql => sql.includes('IF NOT EXISTS'))).toBe(true)
  })

  it('sait redescendre — drop des deux colonnes, rien d’autre', async () => {
    const { runner, calls } = createRunner()
    await new OrgGraphVersioning1787946118427().down(runner)

    expect(calls).toEqual([
      'ALTER TABLE accounts DROP COLUMN IF EXISTS org_rejected_items',
      'ALTER TABLE accounts DROP COLUMN IF EXISTS org_graph_version',
    ])
  })
})
