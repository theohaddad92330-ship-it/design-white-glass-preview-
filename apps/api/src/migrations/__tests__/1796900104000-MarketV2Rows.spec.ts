import type { QueryRunner } from 'typeorm'
import { loadMarketV2Schema } from '../../scripts/market-v2/market-v2-import'
import { MarketV2Rows1796900104000 } from '../1796900104000-MarketV2Rows'

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

async function upSql(): Promise<string> {
  const { runner, queries } = createRunner()
  await new MarketV2Rows1796900104000().up(runner)
  return queries.map(normalize).join('\n')
}

// Lot 783 (#5205) — le pack marché v2.1 en base commune.
describe('MarketV2Rows1796900104000', () => {
  it('la contrainte de dossier accepte CHAQUE dossier du schéma — élargie avant le code qui écrit (GA-11/GA-12)', async () => {
    const all = await upSql()
    const folders = [...new Set(loadMarketV2Schema().tables.map(t => t.folder))]
    expect(folders.length).toBeGreaterThan(3)
    const check = /folder IN \(([^)]*)\)/.exec(all)?.[1] ?? ''
    for (const folder of folders) expect(check).toContain(`'${folder}'`)
  })

  it('rejeu idempotent : une ligne est unique par (version, table, n°) ; le coffre suit sa ligne à l’effacement', async () => {
    const all = await upSql()
    expect(all).toContain('PRIMARY KEY (dataset_version, source_table, row_no)')
    expect(all).toContain('REFERENCES market_v2_rows (dataset_version, source_table, row_no) ON DELETE CASCADE')
  })

  it('les trois tables sont fermées au client (RLS) et ne portent aucune colonne d’espace', async () => {
    const all = await upSql()
    for (const table of ['market_v2_datasets', 'market_v2_rows', 'market_v2_row_identities']) {
      expect(all).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
    }
    expect(all).not.toMatch(/workspace_id|user_id/)
  })
})
