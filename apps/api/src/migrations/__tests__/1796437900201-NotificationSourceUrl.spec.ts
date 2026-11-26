import type { QueryRunner } from 'typeorm'
import { NotificationSourceUrl1796437900201 } from '../1796437900201-NotificationSourceUrl'

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

// #3922.n — GA-11/GA-12 : les colonnes précèdent le code qui écrit le lien de la notification.
describe('NotificationSourceUrl1796437900201', () => {
  it('ajoute `source_url` et `source_kind`, texte NULLABLE, sans défaut deviné', async () => {
    const { runner, queries } = createRunner()
    await new NotificationSourceUrl1796437900201().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS source_url text')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS source_kind text')
    expect(sql).not.toContain('DEFAULT')
    expect(sql).not.toContain('NOT NULL')
  })

  it('sait redescendre, et ne redescend QUE ses propres colonnes', async () => {
    const { runner, queries } = createRunner()
    await new NotificationSourceUrl1796437900201().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS source_url')
    expect(sql).toContain('DROP COLUMN IF EXISTS source_kind')
    expect(sql).not.toContain('DROP COLUMN IF EXISTS source ')
  })
})
