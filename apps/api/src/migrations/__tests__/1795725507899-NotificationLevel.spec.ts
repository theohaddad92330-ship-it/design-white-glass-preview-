import type { QueryRunner } from 'typeorm'
import { NotificationLevel1795725507899 } from '../1795725507899-NotificationLevel'

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

// #2404.3 — GA-11/GA-12 : la contrainte SQL s'élargit AVANT le code qui écrit `level`.
describe('NotificationLevel1795725507899', () => {
  it('ajoute `notifications.level`, NULLABLE, sans défaut deviné', async () => {
    const { runner, queries } = createRunner()
    await new NotificationLevel1795725507899().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS level text')
    expect(sql).not.toContain('DEFAULT')
    expect(sql).not.toContain('NOT NULL')
  })

  it('pose une contrainte CHECK nommée, limitée aux quatre niveaux — ou NULL', async () => {
    const { runner, queries } = createRunner()
    await new NotificationLevel1795725507899().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain(
      "ADD CONSTRAINT chk_notifications_level CHECK (level IS NULL OR level IN ('information', 'action', 'urgent', 'critical'))",
    )
  })

  it('est rejouable : la contrainte est retirée par son nom avant d’être reposée', async () => {
    const { runner, queries } = createRunner()
    await new NotificationLevel1795725507899().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS chk_notifications_level')
  })

  it('AJOUT SEULEMENT : la montée ne touche à aucune autre colonne', async () => {
    const { runner, queries } = createRunner()
    await new NotificationLevel1795725507899().up(runner)
    const sql = normalize(queries.join(' '))
    for (const column of ['priority', 'origin', 'suppressed_at', 'type']) {
      expect(sql).not.toContain(`DROP COLUMN IF EXISTS ${column}`)
    }
  })

  it('sait redescendre, et ne redescend QUE sa propre colonne', async () => {
    const { runner, queries } = createRunner()
    await new NotificationLevel1795725507899().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS level')
    expect(sql).not.toContain('priority')
  })
})
