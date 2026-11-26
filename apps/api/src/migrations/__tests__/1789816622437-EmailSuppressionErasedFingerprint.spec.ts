import type { QueryRunner } from 'typeorm'
import { EmailSuppressionErasedFingerprint1789816622437 } from '../1789816622437-EmailSuppressionErasedFingerprint'

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

async function run(direction: 'up' | 'down' = 'up'): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new EmailSuppressionErasedFingerprint1789816622437()[direction](runner)
  return queries.map(normalize)
}

/**
 * #2297.51 — l'opposition d'une personne effacée est GARDÉE, mais son adresse
 * n'y figure plus qu'en empreinte. La migration vient AVANT le code qui écrit
 * cette nouvelle forme (GA-11/12), et la base elle-même refuse qu'une ligne
 * marquée « effacée » garde une adresse en clair.
 */
describe('EmailSuppressionErasedFingerprint1789816622437', () => {
  it('ajoute `erased_at`, nullable : les oppositions existantes restent en clair, à l’identique', async () => {
    expect(await run()).toContain('ALTER TABLE email_suppressions ADD COLUMN IF NOT EXISTS erased_at timestamptz NULL')
  })

  it('la base refuse une ligne effacée qui garderait une adresse en clair', async () => {
    const queries = await run()
    expect(queries).toContain(
      "ALTER TABLE email_suppressions ADD CONSTRAINT email_suppressions_erased_form_check CHECK (erased_at IS NULL OR email ~ '^[0-9a-f]{64}$')",
    )
    // Rejouable : la contrainte est retirée avant d'être posée.
    const drop = queries.indexOf(
      'ALTER TABLE email_suppressions DROP CONSTRAINT IF EXISTS email_suppressions_erased_form_check',
    )
    const add = queries.findIndex(q => q.includes('ADD CONSTRAINT email_suppressions_erased_form_check'))
    expect(drop).toBeGreaterThanOrEqual(0)
    expect(drop).toBeLessThan(add)
  })

  it('sait dire NON : aucune donnée existante n’est réécrite ni supprimée', async () => {
    for (const query of await run()) {
      expect(query).not.toMatch(/^(UPDATE|DELETE)\b/i)
      expect(query).not.toMatch(/DROP (TABLE|COLUMN)/i)
    }
  })

  it('down retire la contrainte puis la colonne', async () => {
    expect(await run('down')).toEqual([
      'ALTER TABLE email_suppressions DROP CONSTRAINT IF EXISTS email_suppressions_erased_form_check',
      'ALTER TABLE email_suppressions DROP COLUMN IF EXISTS erased_at',
    ])
  })
})
