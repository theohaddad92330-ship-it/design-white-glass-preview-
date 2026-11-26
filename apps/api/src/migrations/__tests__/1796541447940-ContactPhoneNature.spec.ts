import type { QueryRunner } from 'typeorm'
import { ContactPhoneNature1796541447940 } from '../1796541447940-ContactPhoneNature'

function createRunner(): { runner: QueryRunner; sql: () => string } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (q: string) => {
      queries.push(q)
      return []
    }),
  } as unknown as QueryRunner
  return { runner, sql: () => queries.join(' ').replace(/\s+/g, ' ').trim() }
}

// #4178.1 — la nature du téléphone : contrainte SQL AVANT le code (GA-11/12),
// backfill ciblé qui ne touche jamais une correction humaine.
describe('ContactPhoneNature1796541447940', () => {
  it('ajoute phone_nature et sa source, bornées, NULL = jamais qualifié', async () => {
    const { runner, sql } = createRunner()
    await new ContactPhoneNature1796541447940().up(runner)
    expect(sql()).toContain('ADD COLUMN IF NOT EXISTS phone_nature text')
    expect(sql()).toContain('ADD COLUMN IF NOT EXISTS phone_nature_source text')
    expect(sql()).toContain(
      "CHECK (phone_nature IS NULL OR phone_nature IN ('professional_verified', 'professional_declared', 'personal', 'unknown'))",
    )
    expect(sql()).toContain("CHECK (phone_nature_source IS NULL OR phone_nature_source IN ('provider', 'human'))")
  })

  it('rattrape l’existant : un numéro non qualifié devient « inconnue », sans toucher une correction humaine', async () => {
    const { runner, sql } = createRunner()
    await new ContactPhoneNature1796541447940().up(runner)
    expect(sql()).toMatch(
      /UPDATE contacts SET phone_nature = 'unknown', phone_nature_source = 'provider' WHERE phone IS NOT NULL AND phone <> '' AND phone_nature IS NULL AND phone_nature_source IS DISTINCT FROM 'human'/,
    )
  })

  it('est rejouable : IF NOT EXISTS, DROP préalable, backfill gardé par IS NULL', async () => {
    const { runner, sql } = createRunner()
    await new ContactPhoneNature1796541447940().up(runner)
    expect(sql()).toContain('DROP CONSTRAINT IF EXISTS contacts_phone_nature_check')
    expect(sql()).toContain('DROP CONSTRAINT IF EXISTS contacts_phone_nature_source_check')
  })
})
