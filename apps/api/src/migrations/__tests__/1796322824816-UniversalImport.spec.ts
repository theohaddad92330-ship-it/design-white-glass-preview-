import type { QueryRunner } from 'typeorm'
import { UNIVERSAL_IMPORT_ISSUE_KINDS, UNIVERSAL_IMPORT_STATUSES, UNIVERSAL_IMPORT_TYPES } from '@bellum/contracts'
import { UniversalImport1796322824816 } from '../1796322824816-UniversalImport'

/**
 * Import universel (Louis 27/09/2026) — les contraintes COUVRENT les
 * énumérations du contrat AVANT le code qui écrit (GA-11/GA-12), et `extra`
 * est posée sur les deux tables cibles. Aucune base : on lit ce que la
 * migration DIT.
 */
async function runUp(): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new UniversalImport1796322824816().up(runner)
  return queries
}

const valuesOf = (sql: string | undefined): string[] => [...(sql ?? '').matchAll(/'([^']*)'/g)].map(m => m[1] as string)

describe('UniversalImport1796322824816', () => {
  it('pose `extra jsonb NOT NULL DEFAULT {}` sur chaque table cible écrite', async () => {
    const sql = await runUp()
    for (const table of ['contacts', 'accounts', 'consultants', 'project_needs']) {
      expect(sql).toContain(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb`)
    }
    // Et elle dit NON à une table cible qu'elle ne vise pas.
    expect(sql.some(q => q.startsWith('ALTER TABLE missions ADD COLUMN'))).toBe(false)
  })

  it.each([
    ['universal_import_jobs_type_check', UNIVERSAL_IMPORT_TYPES],
    ['universal_import_jobs_status_check', UNIVERSAL_IMPORT_STATUSES],
    // #4051.2 — la liste d'ORIGINE : `to_reconcile` arrive par `1796452718394` (élargissement seul).
    ['universal_import_issues_kind_check', UNIVERSAL_IMPORT_ISSUE_KINDS.filter(kind => kind !== 'to_reconcile')],
  ])('%s couvre exactement son énumération', async (name, expected) => {
    const sql = await runUp()
    const add = sql.find(q => q.includes(`ADD CONSTRAINT ${name}`))
    expect(valuesOf(add)).toEqual([...expected])
  })

  it('les deux tables portent workspace_id NOT NULL — jamais une lecture par identifiant seul', async () => {
    const sql = await runUp()
    const creates = sql.filter(q => q.startsWith('CREATE TABLE IF NOT EXISTS universal_import_'))
    expect(creates).toHaveLength(2)
    for (const create of creates) expect(create).toContain('workspace_id uuid NOT NULL')
  })
})
