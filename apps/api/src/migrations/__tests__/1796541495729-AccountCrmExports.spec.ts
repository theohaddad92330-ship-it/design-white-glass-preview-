import type { QueryRunner } from 'typeorm'
import { CRM_PROVIDERS } from '@bellum/contracts'
import { AccountCrmExports1796541495729 } from '../1796541495729-AccountCrmExports'

function run(): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  return new AccountCrmExports1796541495729().up(runner).then(() => queries)
}

describe('AccountCrmExports1796541495729 (#4188)', () => {
  it('la contrainte des contacts exportés connaît Odoo — et n’en retire aucun (GA-08)', async () => {
    const add = (await run()).find(q => q.includes('ADD CONSTRAINT contact_crm_exports_provider_check'))
    for (const provider of ['hubspot', 'salesforce', 'pipedrive', 'attio', 'odoo'])
      expect(add).toContain(`'${provider}'`)
  })

  it('la table des comptes envoyés porte la référence externe, une ligne par (compte, CRM)', async () => {
    const create = (await run()).find(q => q.includes('CREATE TABLE IF NOT EXISTS account_crm_exports'))
    expect(create).toContain('crm_record_id text NOT NULL')
    expect(create).toContain('UNIQUE (account_id, provider)')
    expect(create).toContain('REFERENCES accounts(id) ON DELETE CASCADE')
  })

  // Zoho (#4187) est élargi par `CrmFournisseursZoho` juste après (son propre spec le prouve) : ici, le contrat MOINS lui.
  it('les deux contraintes de fournisseur suivent EXACTEMENT les CRM du contrat de l’adaptateur, Zoho près (élargi ensuite)', async () => {
    const queries = await run()
    for (const name of ['contact_crm_exports_provider_check', 'account_crm_exports_provider_check']) {
      const sql = queries.find(q => q.includes(name) && q.includes('CHECK')) ?? ''
      const values = [...(sql.match(/IN \(([^)]*)\)/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1])
      expect(values.sort()).toEqual(CRM_PROVIDERS.filter(p => p !== 'zoho').sort())
    }
  })
})
