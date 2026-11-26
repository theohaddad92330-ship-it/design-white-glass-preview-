import type { QueryRunner } from 'typeorm'
import { MissionOdooSaleOrder1796437218463 } from '../1796437218463-MissionOdooSaleOrder'

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

describe('MissionOdooSaleOrder1796437218463 (#2561/#2562)', () => {
  it('ajoute odoo_sale_order_id, NULLABLE, sans contrainte CHECK (une référence, pas une énumération)', async () => {
    const { runner, queries } = createRunner()
    await new MissionOdooSaleOrder1796437218463().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS odoo_sale_order_id bigint NULL')
    expect(flat).not.toContain('CHECK')
  })

  it('pose l’index UNIQUE partiel par espace — la reprise est idempotente EN BASE, pas seulement dans le code', async () => {
    const { runner, queries } = createRunner()
    await new MissionOdooSaleOrder1796437218463().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS missions_workspace_odoo_sale_order_uidx ON missions (workspace_id, odoo_sale_order_id) WHERE odoo_sale_order_id IS NOT NULL',
    )
  })

  it('down() retire l’index puis la colonne', async () => {
    const { runner, queries } = createRunner()
    await new MissionOdooSaleOrder1796437218463().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP INDEX IF EXISTS missions_workspace_odoo_sale_order_uidx')
    expect(flat).toContain('DROP COLUMN IF EXISTS odoo_sale_order_id')
  })
})
