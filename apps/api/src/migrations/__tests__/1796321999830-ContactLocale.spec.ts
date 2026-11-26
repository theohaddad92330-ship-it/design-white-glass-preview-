import type { QueryRunner } from 'typeorm'
import { ContactLocale1796321999830 } from '../1796321999830-ContactLocale'

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

// #2861 (#2437.2) — le niveau DESTINATAIRE de langue, stocké sur `contacts`.
describe('ContactLocale1796321999830', () => {
  it('ajoute contacts.locale, NULLABLE — non renseigné reste NULL, jamais deviné', async () => {
    const { runner, queries } = createRunner()
    await new ContactLocale1796321999830().up(runner)
    const sql = normalize(queries.join(' '))

    expect(sql).toContain('ALTER TABLE contacts ADD COLUMN IF NOT EXISTS locale text')
  })

  it('la contrainte contacts_locale_check tient le MÊME catalogue que marketLocaleSchema — fr/en/de ou NULL', async () => {
    const { runner, queries } = createRunner()
    await new ContactLocale1796321999830().up(runner)
    const sql = normalize(queries.join(' '))

    expect(sql).toContain('ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_locale_check')
    expect(sql).toContain(
      "ALTER TABLE contacts ADD CONSTRAINT contacts_locale_check CHECK (locale IS NULL OR locale IN ('fr', 'en', 'de'))",
    )
  })

  it('down retire la contrainte PUIS la colonne', async () => {
    const { runner, queries } = createRunner()
    await new ContactLocale1796321999830().down(runner)
    const sql = normalize(queries.join(' '))

    const constraintIdx = sql.indexOf('DROP CONSTRAINT IF EXISTS contacts_locale_check')
    const columnIdx = sql.indexOf('DROP COLUMN IF EXISTS locale')
    expect(constraintIdx).toBeGreaterThanOrEqual(0)
    expect(columnIdx).toBeGreaterThan(constraintIdx)
  })
})
