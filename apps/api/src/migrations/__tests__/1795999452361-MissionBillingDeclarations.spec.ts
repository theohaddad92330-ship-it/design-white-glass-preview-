import type { QueryRunner } from 'typeorm'
import { MissionBillingDeclarations1795999452361 } from '../1795999452361-MissionBillingDeclarations'

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
  await new MissionBillingDeclarations1795999452361().up(runner)
  return normalize(queries.join(' '))
}

// #2417.3/.4/.5 — jalon, retainer, placement : DÉCLARATIFS (decisions §8).
describe('MissionBillingDeclarations1795999452361', () => {
  it('#2417.3 — un jalon = libellé + date + montant SAISIS, borné à l’espace, archivé jamais supprimé', async () => {
    const sql = await upSql()
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS mission_milestones')
    expect(sql).toContain('mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE')
    expect(sql).toContain('workspace_id uuid NOT NULL')
    expect(sql).toContain('due_on date NOT NULL')
    expect(sql).toContain('CONSTRAINT mission_milestones_amount_check CHECK (amount_cents > 0)')
    expect(sql).toContain(
      'CONSTRAINT mission_milestones_label_check CHECK (char_length(btrim(label)) BETWEEN 1 AND 200)',
    )
    expect(sql).toContain('archived_at timestamptz NULL')
    expect(sql).toContain("CONSTRAINT mission_milestones_source_check CHECK (source IN ('manual'))")
  })

  it('#2417.4/.5 — retainer, fee et garantie déclarés, un seul endroit par mission', async () => {
    const sql = await upSql()
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS mission_billing_declarations')
    expect(sql).toContain('mission_id uuid PRIMARY KEY REFERENCES missions(id) ON DELETE CASCADE')
    expect(sql).toContain(
      'CONSTRAINT mission_billing_declarations_retainer_check CHECK (retainer_monthly_cents IS NULL OR retainer_monthly_cents > 0)',
    )
    expect(sql).toContain(
      'CONSTRAINT mission_billing_declarations_guarantee_check CHECK (placement_guarantee_days IS NULL OR placement_guarantee_days BETWEEN 1 AND 730)',
    )
    expect(sql).toContain("CONSTRAINT mission_billing_declarations_source_check CHECK (source IN ('manual'))")
  })

  it('RLS sur les deux tables : lues par les membres de l’espace, jamais au-delà', async () => {
    const sql = await upSql()
    expect(sql).toContain('ALTER TABLE mission_milestones ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('ALTER TABLE mission_billing_declarations ENABLE ROW LEVEL SECURITY')
  })

  it('down retire les deux tables', async () => {
    const { runner, queries } = createRunner()
    await new MissionBillingDeclarations1795999452361().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP TABLE IF EXISTS mission_milestones')
    expect(sql).toContain('DROP TABLE IF EXISTS mission_billing_declarations')
  })
})
