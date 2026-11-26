import { loadContactCrmExports, recordContactCrmExport } from './contact-crm-exports'

describe('contact-crm-exports (#3719.4)', () => {
  it('lit les exports bornés au workspace et au contact, du plus récent au plus ancien', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        provider: 'attio',
        crm_record_id: 'rec-1',
        last_action: 'updated',
        destination_label: 'Acme Corp',
        exported_at: new Date('2026-10-06T08:00:00Z'),
        external_account_id: 'acc-1',
        instance_url: null,
      },
    ])
    const items = await loadContactCrmExports({ query }, 'c1', 'w1')
    expect(query.mock.calls[0][0]).toMatch(/workspace_id = \$2/)
    expect(query.mock.calls[0][0]).toMatch(/ORDER BY e\.exported_at DESC/)
    expect(query.mock.calls[0][1]).toEqual(['c1', 'w1'])
    expect(items).toEqual([
      {
        provider: 'attio',
        crm_record_id: 'rec-1',
        last_action: 'updated',
        destination_label: 'Acme Corp',
        exported_at: '2026-10-06T08:00:00.000Z',
        // #3719.5 — Attio n'expose aucune base par-espace vérifiable : jamais de lien deviné.
        record_url: null,
      },
    ])
  })

  it("#3719.5 — joint `crm_connections` (même workspace, même provider) pour composer le lien de l'enregistrement", async () => {
    const query = jest.fn().mockResolvedValue([
      {
        provider: 'salesforce',
        crm_record_id: '003XXX',
        last_action: 'created',
        destination_label: 'Acme Corp',
        exported_at: new Date('2026-10-06T08:00:00Z'),
        external_account_id: null,
        instance_url: 'https://acme.my.salesforce.com',
      },
    ])
    const items = await loadContactCrmExports({ query }, 'c1', 'w1')
    expect(query.mock.calls[0][0]).toMatch(/LEFT JOIN crm_connections/)
    expect(query.mock.calls[0][0]).toMatch(/c\.workspace_id = e\.workspace_id AND c\.provider = e\.provider/)
    expect(items[0]?.record_url).toBe('https://acme.my.salesforce.com/003XXX')
  })

  it('aucun export ⇒ liste vide, jamais un faux zéro ni une ligne inventée', async () => {
    expect(await loadContactCrmExports({ query: jest.fn().mockResolvedValue([]) }, 'c1', 'w1')).toEqual([])
  })

  it('enregistre par UPSERT (une ligne par contact et destination), sans toucher au dernier échange', async () => {
    const query = jest.fn().mockResolvedValue([])
    await recordContactCrmExport(
      { query },
      {
        contactId: 'c1',
        workspaceId: 'w1',
        userId: 'u1',
        provider: 'hubspot',
        crm_record_id: 'hs-9',
        created: false,
        destination_label: null,
      },
    )
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/ON CONFLICT \(contact_id, provider\) DO UPDATE/)
    expect(sql).not.toMatch(/last_contact|activities/)
    // un libellé absent n'efface pas celui déjà connu
    expect(sql).toMatch(/COALESCE\(EXCLUDED\.destination_label/)
    expect(params).toEqual(['w1', 'c1', 'hubspot', 'hs-9', 'updated', null, 'u1'])
  })

  it('created=true ⇒ dernier geste « créé »', async () => {
    const query = jest.fn().mockResolvedValue([])
    await recordContactCrmExport(
      { query },
      { contactId: 'c1', workspaceId: 'w1', userId: 'u1', provider: 'attio', crm_record_id: 'r', created: true },
    )
    expect((query.mock.calls[0][1] as unknown[])[4]).toBe('created')
  })
})
