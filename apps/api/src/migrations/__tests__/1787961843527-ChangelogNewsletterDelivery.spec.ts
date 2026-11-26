import type { QueryRunner } from 'typeorm'
import { ChangelogNewsletterDelivery1787961843527 } from '../1787961843527-ChangelogNewsletterDelivery'

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

describe('ChangelogNewsletterDelivery1787961843527', () => {
  it('adds the per-user "last entry emailed" marker — the anti-duplicate guard', async () => {
    const { runner, queries } = createRunner()
    await new ChangelogNewsletterDelivery1787961843527().up(runner)
    const alter = queries.map(normalize).find(q => q.includes('ALTER TABLE notification_preferences ADD COLUMN'))
    expect(alter).toBeDefined()
    expect(alter).toContain('ADD COLUMN IF NOT EXISTS newsletter_last_entry_id text')
  })

  it('adds the email language column so an email can leave in the reader’s language', async () => {
    const { runner, queries } = createRunner()
    await new ChangelogNewsletterDelivery1787961843527().up(runner)
    const alter = queries.map(normalize).find(q => q.includes('ALTER TABLE notification_preferences ADD COLUMN'))
    expect(alter).toContain('ADD COLUMN IF NOT EXISTS email_language text')
  })

  it('never back-fills a default: an existing row keeps NULL on both columns', async () => {
    const { runner, queries } = createRunner()
    await new ChangelogNewsletterDelivery1787961843527().up(runner)
    const flat = queries.map(normalize)
    // A DEFAULT would either mass-mail the whole history or invent a language.
    expect(flat.some(q => q.includes('ADD COLUMN') && q.includes('DEFAULT'))).toBe(false)
    expect(flat.some(q => q.startsWith('UPDATE notification_preferences'))).toBe(false)
  })

  it('constrains the language to the two shipped locales, NULL allowed', async () => {
    const { runner, queries } = createRunner()
    await new ChangelogNewsletterDelivery1787961843527().up(runner)
    const check = queries.map(normalize).find(q => q.includes('notification_preferences_email_language_check'))
    expect(check).toBeDefined()
    expect(check).toContain("CHECK (email_language IS NULL OR email_language IN ('fr', 'en'))")
    // Re-runnable: guarded by a pg_constraint lookup, like the RLS policies.
    expect(check).toContain('IF NOT EXISTS (')
  })

  it('is idempotent — every DDL statement is IF NOT EXISTS guarded', async () => {
    const { runner, queries } = createRunner()
    await new ChangelogNewsletterDelivery1787961843527().up(runner)
    for (const sql of queries.map(normalize)) {
      expect(sql).toContain('IF NOT EXISTS')
    }
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new ChangelogNewsletterDelivery1787961843527().down()).rejects.toThrow(
      'down migrations are not supported',
    )
  })
})
