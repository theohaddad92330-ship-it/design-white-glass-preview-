import type { QueryRunner } from 'typeorm'
import { CRM_PROVIDERS, SYNC_PROVIDERS } from '@bellum/contracts'
import { CrmFournisseursZoho1796541540046 } from '../1796541540046-CrmFournisseursZoho'

function run(): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  return new CrmFournisseursZoho1796541540046().up(runner).then(() => queries)
}

const valuesOf = (sql: string): string[] =>
  [...(sql.match(/IN \(([^)]*)\)/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1] as string)

describe('CrmFournisseursZoho1796541540046 (#4187, #4189)', () => {
  it('élargit les trois contraintes de fournisseur AVANT le code qui écrit « zoho » (GA-11/12) — sans rien retirer', async () => {
    const queries = await run()
    for (const name of ['contact_crm_exports_provider_check', 'account_crm_exports_provider_check']) {
      const sql = queries.find(q => q.includes(`ADD CONSTRAINT ${name}`)) ?? ''
      expect(valuesOf(sql).sort()).toEqual([...CRM_PROVIDERS].sort())
    }
    const links = queries.find(q => q.includes('ADD CONSTRAINT sync_links_provider_check')) ?? ''
    expect(valuesOf(links).sort()).toEqual([...SYNC_PROVIDERS].sort())
  })

  it('la synchro incrémentale garde son curseur par (espace, fournisseur, objet) — une ligne, jamais deux', async () => {
    const create = (await run()).find(q => q.includes('CREATE TABLE IF NOT EXISTS crm_sync_cursors')) ?? ''
    expect(create).toContain('cursor_at timestamptz NULL')
    expect(create).toContain('UNIQUE (workspace_id, provider, entity_type)')
    expect(create).toContain('last_error text NULL')
  })

  it('un conflit (modifié des deux côtés) a un compteur visible sur la trace d’exécution', async () => {
    const alter = (await run()).find(q => q.includes('ALTER TABLE sync_runs')) ?? ''
    expect(alter).toContain('conflict_count integer NOT NULL DEFAULT 0')
  })
})
