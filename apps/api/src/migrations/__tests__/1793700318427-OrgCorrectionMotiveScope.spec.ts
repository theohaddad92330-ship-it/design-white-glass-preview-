import { ORG_CORRECTION_MOTIVES, ORG_CORRECTION_SCOPES, ORG_CORRECTION_VISIBILITIES } from '@bellum/contracts'
import type { QueryRunner } from 'typeorm'
import { OrgCorrectionMotiveScope1793700318427 } from '../1793700318427-OrgCorrectionMotiveScope'

/** Capture chaque instruction SQL émise (aucune base réelle n'est nécessaire). */
async function ranQueries(direction: 'up' | 'down' = 'up'): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new OrgCorrectionMotiveScope1793700318427()[direction](runner)
  return queries
}

const inList = (values: readonly string[]) => `IN (${values.map(v => `'${v}'`).join(', ')})`

describe('OrgCorrectionMotiveScope1793700318427 — #2126.36 / .37 / .39 / .44', () => {
  it('ajoute motif, portée et visibilité AVEC des défauts qui relisent les lignes existantes à l’identique', async () => {
    const sql = (await ranQueries()).join('\n')
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS motive text NOT NULL DEFAULT 'corrected'")
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'account'")
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'workspace'")
  })

  it('pose une contrainte qui couvre EXACTEMENT chaque énumération du contrat (GA-12)', async () => {
    const sql = (await ranQueries()).join('\n')
    expect(sql).toContain(
      `CONSTRAINT org_graph_corrections_motive_check CHECK (motive ${inList(ORG_CORRECTION_MOTIVES)})`,
    )
    expect(sql).toContain(`CONSTRAINT org_graph_corrections_scope_check CHECK (scope ${inList(ORG_CORRECTION_SCOPES)})`)
    expect(sql).toContain(
      `CONSTRAINT org_graph_corrections_visibility_check CHECK (visibility ${inList(ORG_CORRECTION_VISIBILITIES)})`,
    )
  })

  it('#2126.44 — en BASE, une ligne personnelle est privée, et une ligne privée est personnelle', async () => {
    const sql = (await ranQueries()).join('\n')
    expect(sql).toContain(
      "CONSTRAINT org_graph_corrections_visibility_follows_scope_check CHECK ((scope = 'personal') = (visibility = 'private'))",
    )
  })

  it('élargit la version : ce qui ne réécrit pas le graphe garde sa version, le reste l’avance toujours', async () => {
    const sql = (await ranQueries()).join('\n')
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS org_graph_corrections_version_advances_check')
    expect(sql).toContain(
      "CHECK ( graph_version_after > graph_version_before OR ( graph_version_after = graph_version_before AND (scope = 'personal' OR motive IN ('confirmed', 'not_relevant', 'unknown', 'source_added')) ) )",
    )
  })

  it('se défait sans perte de ligne : down retire les colonnes et remet la contrainte d’origine', async () => {
    const sql = (await ranQueries('down')).join('\n')
    expect(sql).toContain('DROP COLUMN IF EXISTS motive')
    expect(sql).toContain('CHECK (graph_version_after > graph_version_before)')
    expect(sql).not.toContain('DROP TABLE')
  })
})
