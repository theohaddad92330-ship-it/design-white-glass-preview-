import type { QueryRunner } from 'typeorm'
import { NotificationSource1795995841046 } from '../1795995841046-NotificationSource'

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

// #2404.7 — GA-11/GA-12 : la colonne précède le code qui écrit `source`.
describe('NotificationSource1795995841046', () => {
  it('ajoute `notifications.source`, texte libre, NULLABLE, sans défaut deviné', async () => {
    const { runner, queries } = createRunner()
    await new NotificationSource1795995841046().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS source text')
    expect(sql).not.toContain('DEFAULT')
    expect(sql).not.toContain('NOT NULL')
  })

  it('AJOUT SEULEMENT : la montée ne touche à aucune autre colonne', async () => {
    const { runner, queries } = createRunner()
    await new NotificationSource1795995841046().up(runner)
    const sql = normalize(queries.join(' '))
    for (const column of ['priority', 'origin', 'suppressed_at', 'type', 'level']) {
      expect(sql).not.toContain(`DROP COLUMN IF EXISTS ${column}`)
    }
  })

  it('sait redescendre, et ne redescend QUE sa propre colonne', async () => {
    const { runner, queries } = createRunner()
    await new NotificationSource1795995841046().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS source')
    expect(sql).not.toContain('priority')
  })
})
