import { CrmDealAccountLinker } from './crm-deal-account-linker'

type QueryStub = jest.Mock<Promise<unknown[]>, [string, unknown[]?]>

/** Une base en mémoire minimale : la requête est reconnue à sa table. */
function stubQuery(data: { deals: unknown[]; links: unknown[]; accounts: unknown[] }): QueryStub {
  return jest.fn(async (sql: string) => {
    if (sql.includes('UPDATE crm_deal_facts')) return []
    if (sql.includes('FROM sync_links')) return data.links
    if (sql.includes('FROM accounts')) return data.accounts
    if (sql.includes('FROM crm_deal_facts')) return data.deals
    return []
  })
}

function updates(query: QueryStub): unknown[][] {
  return query.mock.calls.filter(([sql]) => sql.includes('UPDATE crm_deal_facts')).map(([, params]) => params ?? [])
}

const deal = (overrides: Record<string, unknown>) => ({
  id: 'f-1',
  workspace_id: 'ws-1',
  provider: 'hubspot',
  name: 'Sopra Steria — TMA',
  company_external_id: null,
  company_siren: null,
  company_domain: null,
  account_id: null,
  account_link_basis: null,
  ...overrides,
})

describe('#3918.a — CrmDealAccountLinker', () => {
  it("rattache par l'id société du fournisseur, lu dans sync_links de CE fournisseur et de CET espace", async () => {
    const query = stubQuery({
      deals: [deal({ company_external_id: 'hs-1' })],
      links: [{ workspace_id: 'ws-1', provider: 'hubspot', external_id: 'hs-1', internal_id: 'acc-1' }],
      accounts: [],
    })
    const linked = await new CrmDealAccountLinker({ manager: { query } } as never).link()
    expect(linked).toBe(1)
    expect(updates(query)).toEqual([['f-1', 'acc-1', 'crm_company_id']])
    // Le lien est cherché AVEC le fournisseur : le même id chez deux CRM ne désigne pas la même société.
    const linksSql = query.mock.calls.find(([sql]) => sql.includes('FROM sync_links'))?.[0] ?? ''
    expect(linksSql).toContain("entity_type = 'account'")
  })

  it("HOMONYME — même nom de compte dans l'espace, autre SIREN : le deal reste NON rattaché", async () => {
    const query = stubQuery({
      deals: [deal({ company_siren: '999999999', company_domain: 'autre-sopra.example' })],
      links: [],
      accounts: [
        {
          id: 'acc-sopra',
          workspace_id: 'ws-1',
          company_name: 'Sopra Steria',
          siren: '326820065',
          website: 'soprasteria.com',
        },
      ],
    })
    expect(await new CrmDealAccountLinker({ manager: { query } } as never).link()).toBe(0)
    expect(updates(query)).toEqual([])
  })

  it("un compte d'un AUTRE espace ne rattache jamais, même SIREN identique", async () => {
    const query = stubQuery({
      deals: [deal({ company_siren: '326820065' })],
      links: [],
      accounts: [{ id: 'acc-x', workspace_id: 'ws-2', company_name: 'Sopra', siren: '326820065', website: null }],
    })
    expect(await new CrmDealAccountLinker({ manager: { query } } as never).link()).toBe(0)
  })

  it("n'écrit rien quand le rattachement n'a pas changé", async () => {
    const query = stubQuery({
      deals: [deal({ company_siren: '326820065', account_id: 'acc-sopra', account_link_basis: 'siren' })],
      links: [],
      accounts: [{ id: 'acc-sopra', workspace_id: 'ws-1', siren: '326820065', website: null }],
    })
    await new CrmDealAccountLinker({ manager: { query } } as never).link()
    expect(updates(query)).toEqual([])
  })

  it('délie un deal dont la clé ne joint plus (compte fusionné, SIREN corrigé)', async () => {
    const query = stubQuery({
      deals: [deal({ company_siren: '326820065', account_id: 'acc-old', account_link_basis: 'siren' })],
      links: [],
      accounts: [],
    })
    await new CrmDealAccountLinker({ manager: { query } } as never).link()
    expect(updates(query)).toEqual([['f-1', null, null]])
  })

  it('borne la lecture à un espace quand on le lui demande (après une synchronisation)', async () => {
    const query = stubQuery({ deals: [], links: [], accounts: [] })
    await new CrmDealAccountLinker({ manager: { query } } as never).link('ws-9')
    const [sql, params] = query.mock.calls[0] ?? ['', []]
    expect(sql).toContain('f.workspace_id = $1')
    expect(params).toEqual(['ws-9'])
  })
})
