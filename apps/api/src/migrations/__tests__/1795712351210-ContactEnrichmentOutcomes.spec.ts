import type { QueryRunner } from 'typeorm'
import { ContactEnrichmentOutcomes1795712351210 } from '../1795712351210-ContactEnrichmentOutcomes'

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

// #2120.61 / #2120.64 / #2120.68 / #2120.70 — la contrainte SQL accepte les
// nouvelles valeurs AVANT que le code les écrive (GA-11/GA-12).
describe('ContactEnrichmentOutcomes1795712351210', () => {
  it('élargit contacts_last_enrichment_result_check aux 4 valeurs — matched/no_new_data (déjà écrites) PLUS ambiguous/newer_data_exists (#2120.61/#2120.64)', async () => {
    const { runner, queries } = createRunner()
    await new ContactEnrichmentOutcomes1795712351210().up(runner)
    const sql = normalize(queries.join(' '))

    expect(sql).toContain('DROP CONSTRAINT IF EXISTS contacts_last_enrichment_result_check')
    expect(sql).toContain(
      "ADD CONSTRAINT contacts_last_enrichment_result_check CHECK (last_enrichment_result IS NULL OR last_enrichment_result IN ('matched', 'no_new_data', 'ambiguous', 'newer_data_exists'))",
    )
  })

  it('ajoute email_confidence/phone_confidence bornés à high/medium/low, jamais une probabilité (#2120.68)', async () => {
    const { runner, queries } = createRunner()
    await new ContactEnrichmentOutcomes1795712351210().up(runner)
    const sql = normalize(queries.join(' '))

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS email_confidence text')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS phone_confidence text')
    expect(sql).toContain(
      "ADD CONSTRAINT contacts_email_confidence_check CHECK (email_confidence IS NULL OR email_confidence IN ('high', 'medium', 'low'))",
    )
    expect(sql).toContain(
      "ADD CONSTRAINT contacts_phone_confidence_check CHECK (phone_confidence IS NULL OR phone_confidence IN ('high', 'medium', 'low'))",
    )
  })

  it('ajoute email_cost_credits/phone_cost_credits, nullable (non mesuré ≠ 0, #2120.70)', async () => {
    const { runner, queries } = createRunner()
    await new ContactEnrichmentOutcomes1795712351210().up(runner)
    const sql = normalize(queries.join(' '))

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS email_cost_credits integer')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS phone_cost_credits integer')
    // Pas de DEFAULT 0 : une colonne entière sans défaut est NULL tant que rien
    // n'est écrit — c'est exactement « non mesuré », jamais un coût nul.
    expect(sql).not.toMatch(/cost_credits[^,]*DEFAULT/i)
  })

  it('est rejouable : chaque colonne passe par IF NOT EXISTS, chaque contrainte par un DROP préalable', async () => {
    const { runner, queries } = createRunner()
    await new ContactEnrichmentOutcomes1795712351210().up(runner)
    const statements = normalize(queries.join(' '))
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
    for (const statement of statements) {
      if (statement.startsWith('ALTER TABLE contacts ADD COLUMN')) expect(statement).toContain('IF NOT EXISTS')
      if (statement.startsWith('ALTER TABLE contacts DROP CONSTRAINT')) expect(statement).toContain('IF EXISTS')
    }
  })

  it('ne supporte pas de descente (convention du dépôt pour un CHECK élargi)', async () => {
    await expect(new ContactEnrichmentOutcomes1795712351210().down()).rejects.toThrow(
      'down migrations are not supported',
    )
  })
})
