import { CrmDisappearedArchiver } from './crm-disappeared-archiver'

type Page = {
  contacts?: Array<{ id: string }>
  companies?: Array<{ id: string; name: string }>
  nextAfter: string | null
}

function harness(opts: {
  companies: Page
  contacts?: Page
  links: Record<'account' | 'contact', Array<{ external_id: string; internal_id: string }>>
}) {
  const read = {
    companies: jest.fn().mockResolvedValue(opts.companies),
    contacts: jest.fn().mockResolvedValue(opts.contacts ?? { contacts: [], nextAfter: null }),
  }
  const adapters = { get: jest.fn().mockReturnValue({ provider: 'attio', read }) }
  const query = jest.fn(async (sql: string, params: unknown[]) => {
    if (sql.startsWith('SELECT external_id')) return opts.links[params[2] as 'account' | 'contact']
    if (sql.startsWith('UPDATE')) return (params[1] as string[]).map(id => ({ id }))
    return []
  })
  const archiver = new CrmDisappearedArchiver(adapters as never, { query } as never)
  return { archiver, query }
}

const sql = (query: jest.Mock, prefix: string) => query.mock.calls.filter(([text]) => String(text).startsWith(prefix))

describe('SYNC-C.4 — les fiches disparues du CRM sont archivées, jamais supprimées', () => {
  it('archive le compte lié qui n’est plus lu, laisse les autres, et retire son lien', async () => {
    const h = harness({
      companies: { companies: [{ id: 'c1', name: 'A' }], nextAfter: null },
      links: {
        account: [
          { external_id: 'c1', internal_id: 'a1' },
          { external_id: 'c2', internal_id: 'a2' },
        ],
        contact: [],
      },
    })
    const outcome = await h.archiver.archiveMissing('u', 'ws', 'attio')
    expect(outcome.accounts).toBe(1)
    const update = sql(h.query, 'UPDATE')[0]
    expect(update[0]).toContain("commercial_status = 'archived'")
    expect(update[0]).not.toMatch(/DELETE FROM accounts/i)
    expect(update[1]).toEqual(['ws', ['a2']])
    expect(sql(h.query, 'DELETE FROM sync_links')[0][1]).toEqual(['ws', 'attio', 'account', ['c2']])
  })

  it('un contact absent est archivé par la suppression RÉVERSIBLE (deleted_at), jamais effacé', async () => {
    const h = harness({
      companies: { companies: [{ id: 'c1', name: 'A' }], nextAfter: null },
      contacts: { contacts: [{ id: 'p1' }], nextAfter: null },
      links: {
        account: [{ external_id: 'c1', internal_id: 'a1' }],
        contact: [
          { external_id: 'p1', internal_id: 'k1' },
          { external_id: 'p2', internal_id: 'k2' },
        ],
      },
    })
    const outcome = await h.archiver.archiveMissing('u', 'ws', 'attio')
    expect(outcome).toEqual({ accounts: 0, contacts: 1, skipped: [] })
    expect(sql(h.query, 'UPDATE')[0][0]).toContain('SET deleted_at = now()')
  })

  it('sait dire NON — lecture tronquée : rien n’est archivé, et ce saut se dit', async () => {
    const h = harness({
      companies: { companies: [{ id: 'c1', name: 'A' }], nextAfter: 'suite' },
      links: { account: [{ external_id: 'c9', internal_id: 'a9' }], contact: [] },
    })
    // Une page tronquée arrive jusqu'à MAX_PAGES avec un curseur qui avance : on force un curseur figé.
    const outcome = await h.archiver.archiveMissing('u', 'ws', 'attio')
    expect(outcome.accounts).toBe(0)
    expect(sql(h.query, 'UPDATE')).toHaveLength(0)
    expect(outcome.skipped.join()).toMatch(/tronquée/)
  })

  it('sait dire NON — lecture vide alors que des fiches sont liées : droit retiré, pas un ménage, rien archivé', async () => {
    const h = harness({
      companies: { companies: [], nextAfter: null },
      links: { account: [{ external_id: 'c1', internal_id: 'a1' }], contact: [] },
    })
    const outcome = await h.archiver.archiveMissing('u', 'ws', 'attio')
    expect(outcome.accounts).toBe(0)
    expect(sql(h.query, 'UPDATE')).toHaveLength(0)
    expect(outcome.skipped.join()).toMatch(/suspect/)
  })

  it('sait dire NON — plus de la moitié « disparue » sur un grand parc : suspect, rien archivé', async () => {
    const links = Array.from({ length: 20 }, (_, i) => ({ external_id: `c${i}`, internal_id: `a${i}` }))
    const h = harness({
      companies: { companies: [{ id: 'c0', name: 'A' }], nextAfter: null },
      links: { account: links, contact: [] },
    })
    const outcome = await h.archiver.archiveMissing('u', 'ws', 'attio')
    expect(outcome.accounts).toBe(0)
    expect(sql(h.query, 'UPDATE')).toHaveLength(0)
  })

  it('une lecture en erreur n’archive rien et ne lève pas', async () => {
    const adapters = {
      get: jest.fn().mockReturnValue({
        provider: 'attio',
        read: { companies: jest.fn().mockRejectedValue(new Error('401')), contacts: jest.fn() },
      }),
    }
    const query = jest.fn().mockResolvedValue([])
    const archiver = new CrmDisappearedArchiver(adapters as never, { query } as never)
    const outcome = await archiver.archiveMissing('u', 'ws', 'attio')
    expect(outcome.accounts + outcome.contacts).toBe(0)
    expect(outcome.skipped.join()).toContain('401')
  })
})
