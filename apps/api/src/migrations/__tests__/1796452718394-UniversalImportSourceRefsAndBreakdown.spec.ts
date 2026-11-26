import type { QueryRunner } from 'typeorm'
import { UNIVERSAL_IMPORT_ISSUE_KINDS } from '@bellum/contracts'
import { UniversalImportSourceRefsAndBreakdown1796452718394 } from '../1796452718394-UniversalImportSourceRefsAndBreakdown'

/** #4051 / #4052 — la contrainte s'élargit AVANT le code qui écrit `to_reconcile` (GA-11/GA-12). */
async function runUp(): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new UniversalImportSourceRefsAndBreakdown1796452718394().up(runner)
  return queries
}

const valuesOf = (sql: string | undefined): string[] => [...(sql ?? '').matchAll(/'([^']*)'/g)].map(m => m[1] as string)

describe('UniversalImportSourceRefsAndBreakdown1796452718394', () => {
  it('universal_import_issues_kind_check couvre exactement son énumération, `to_reconcile` compris', async () => {
    const sql = await runUp()
    const add = sql.find(q => q.includes('ADD CONSTRAINT universal_import_issues_kind_check'))
    expect(valuesOf(add)).toEqual([...UNIVERSAL_IMPORT_ISSUE_KINDS])
    expect(UNIVERSAL_IMPORT_ISSUE_KINDS).toContain('to_reconcile')
  })

  it('ajoute la source, le bilan par famille et le compteur — sans toucher aux comptes ni aux contacts', async () => {
    const sql = await runUp()
    expect(sql).toContain('ALTER TABLE universal_import_jobs ADD COLUMN IF NOT EXISTS source_system text')
    expect(sql).toContain(
      "ALTER TABLE universal_import_jobs ADD COLUMN IF NOT EXISTS breakdown jsonb NOT NULL DEFAULT '{}'::jsonb",
    )
    expect(sql.some(q => /ALTER TABLE (contacts|accounts)\b/.test(q))).toBe(false)
  })
})
