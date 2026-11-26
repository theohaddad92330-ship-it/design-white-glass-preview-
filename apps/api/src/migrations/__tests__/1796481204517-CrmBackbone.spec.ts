import type { QueryRunner } from 'typeorm'
import { CrmBackbone1796481204517 } from '../1796481204517-CrmBackbone'

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

// #4192 (épopée #4191, lot L1) — la colonne vertébrale CRM/ATS représentable en base.
describe('CrmBackbone1796481204517', () => {
  async function up(): Promise<string> {
    const { runner, queries } = createRunner()
    await new CrmBackbone1796481204517().up(runner)
    return queries.map(normalize).join(' ; ')
  }

  it('ajoute jours et coût, nullables, avec CHECK (jamais 0 deviné)', async () => {
    const flat = await up()
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS planned_days integer NULL')
    expect(flat).toContain('CHECK (planned_days IS NULL OR planned_days > 0)')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS daily_cost_cents bigint NULL')
    expect(flat).toContain('CHECK (daily_cost_cents IS NULL OR daily_cost_cents >= 0)')
  })

  it('remplace l’unicité par affaire : une mission PAR positionnement, une seule sans positionnement', async () => {
    const flat = await up()
    expect(flat).toContain('DROP INDEX IF EXISTS missions_opportunity_uniq')
    // 2 missions / même affaire / 2 positionnements → OK : l'index est sur le couple.
    expect(flat).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS missions_opportunity_submission_uniq ON missions \(opportunity_id, submission_id\) WHERE opportunity_id IS NOT NULL AND submission_id IS NOT NULL/,
    )
    // 2 missions sans positionnement sur la même affaire → refusé.
    expect(flat).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS missions_opportunity_nosub_uniq ON missions \(opportunity_id\) WHERE opportunity_id IS NOT NULL AND submission_id IS NULL/,
    )
    expect(flat.indexOf('DROP INDEX IF EXISTS missions_opportunity_uniq')).toBeLessThan(
      flat.indexOf('missions_opportunity_submission_uniq'),
    )
  })

  it('détache les orphelins (avec NOTICE) AVANT de poser la FK ON DELETE SET NULL : mission gardée à la suppression', async () => {
    const flat = await up()
    expect(flat).toContain('RAISE NOTICE')
    expect(flat).toContain('SET opportunity_id = NULL')
    expect(flat).toContain(
      'ADD CONSTRAINT missions_opportunity_fk FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL',
    )
    expect(flat.indexOf('SET opportunity_id = NULL')).toBeLessThan(flat.indexOf('missions_opportunity_fk FOREIGN'))
  })

  it('recrée la FK missions.submission_id en ON DELETE SET NULL', async () => {
    const flat = await up()
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS missions_submission_id_fkey')
    expect(flat).toContain('FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE SET NULL')
  })

  it('down retire les deux index et la FK, et ne recrée l’index d’origine que sans doublon', async () => {
    const { runner, queries } = createRunner()
    await new CrmBackbone1796481204517().down(runner)
    const flat = queries.map(normalize).join(' ; ')
    expect(flat).toContain('DROP INDEX IF EXISTS missions_opportunity_submission_uniq')
    expect(flat).toContain('DROP INDEX IF EXISTS missions_opportunity_nosub_uniq')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS missions_opportunity_fk')
    expect(flat).toContain('RAISE WARNING')
    expect(flat).toContain('CREATE UNIQUE INDEX IF NOT EXISTS missions_opportunity_uniq')
  })
})
