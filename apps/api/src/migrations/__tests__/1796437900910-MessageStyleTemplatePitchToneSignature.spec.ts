import type { QueryRunner } from 'typeorm'
import { MessageStyleTemplatePitchToneSignature1796437900910 } from '../1796437900910-MessageStyleTemplatePitchToneSignature'

/**
 * #2947 (#2204.60/.61/.63) — trois colonnes NULLABLES (non déclaré = NULL,
 * jamais un défaut), bornées en base à la même longueur que le contrat.
 */
async function run(): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new MessageStyleTemplatePitchToneSignature1796437900910().up(runner)
  return queries
}

describe('MessageStyleTemplatePitchToneSignature1796437900910', () => {
  it('ajoute pitch, tone et signature sans défaut (NULL = non déclaré)', async () => {
    const add = (await run()).find(q => q.includes('ADD COLUMN IF NOT EXISTS pitch'))
    expect(add).toBeDefined()
    for (const column of ['pitch', 'tone', 'signature']) {
      expect(add).toContain(`ADD COLUMN IF NOT EXISTS ${column} text`)
    }
    expect(add).not.toContain('DEFAULT')
  })

  it('borne chaque colonne en base, comme le contrat', async () => {
    const sql = await run()
    for (const [column, max] of [
      ['pitch', 500],
      ['tone', 200],
      ['signature', 500],
    ] as const) {
      expect(sql).toContainEqual(
        expect.stringContaining(`CHECK (${column} IS NULL OR char_length(${column}) BETWEEN 1 AND ${max})`),
      )
    }
  })
})
