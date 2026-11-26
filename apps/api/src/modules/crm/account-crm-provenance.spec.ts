import { loadAccountCrmProvenance } from './account-crm-provenance'

const ACCOUNT = '7a0c2f8e-4b8b-4f2a-9a55-0d0f2d6e1c11'
const WORKSPACE = 'b1f4c2a0-0000-4000-8000-000000000001'

/** Un double de l'exécuteur SQL : la première requête lit le compte, la seconde ses contacts. */
function runner(account: unknown[], contacts: unknown[]) {
  const calls: Array<{ sql: string; params: unknown[] }> = []
  return {
    calls,
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      return /FROM accounts/.test(sql) ? account : contacts
    },
  }
}

// #4459.2 — la provenance par contact, lue là où elle est DÉJÀ écrite (aucune colonne neuve).
describe('loadAccountCrmProvenance', () => {
  it('compte inconnu de l’espace → null (jamais une provenance devinée)', async () => {
    const db = runner([], [])
    expect(await loadAccountCrmProvenance(db, ACCOUNT, WORKSPACE)).toBeNull()
    expect(db.calls[0]?.params).toEqual([ACCOUNT, WORKSPACE])
  })

  it('classe chaque contact : source d’import ou trace d’import = CRM, analyse = apporté, saisie = rien', async () => {
    const db = runner(
      [{ status: 'completed', import_marked: true }],
      [
        { id: 'c-import', source: 'import', import_marked: false, pushed: false },
        { id: 'c-rapproche', source: 'apollo', import_marked: true, pushed: false },
        { id: 'c-apporte', source: 'apollo', import_marked: false, pushed: false },
        { id: 'c-pousse', source: 'linkedin', import_marked: false, pushed: true },
        { id: 'c-main', source: 'manual', import_marked: false, pushed: false },
      ],
    )
    const result = await loadAccountCrmProvenance(db, ACCOUNT, WORKSPACE)
    expect(result).toEqual({
      accountFromCrm: true,
      contacts: [
        { contactId: 'c-import', origin: 'crm', pushed: false },
        { contactId: 'c-rapproche', origin: 'crm', pushed: false },
        { contactId: 'c-apporte', origin: 'bellum', pushed: false },
        { contactId: 'c-pousse', origin: 'bellum', pushed: true },
      ],
      // #4680 — un seul contact de PROVENANCE connue (`source = import`) ; la date n'est pas tracée → null.
      knownContacts: { count: 1, importedAt: null },
    })
    // Bornée à l'espace de l'appelant, contacts actifs seulement.
    const contactsSql = db.calls[1]?.sql ?? ''
    expect(contactsSql).toMatch(/workspace_id = \$2/)
    expect(contactsSql).toMatch(/deleted_at IS NULL/)
    expect(contactsSql).toMatch(/record_import_marks/)
    expect(contactsSql).toMatch(/contact_crm_exports/)
  })

  // #4459.2 (recette prod 23/10, Thales/HubSpot) — la synchro CRM relie une fiche DÉJÀ trouvée par Bellum à son
  // enregistrement HubSpot (`sync_links`) sans poser de trace d'import ni toucher `source` : elle restait muette.
  it('un contact relié à un enregistrement du CRM (sync_links) est « dans ton CRM », même sans trace ni source d’import', async () => {
    const db = runner(
      [{ status: 'completed', import_marked: false, linked: true }],
      [
        { id: 'c-relie', source: 'apollo', import_marked: false, linked: true, pushed: false },
        { id: 'c-relie-sans-source', source: null, import_marked: false, linked: true, pushed: false },
        { id: 'c-apporte', source: 'apollo', import_marked: false, linked: false, pushed: false },
        { id: 'c-sans-info', source: null, import_marked: false, linked: false, pushed: false },
      ],
    )
    const result = await loadAccountCrmProvenance(db, ACCOUNT, WORKSPACE)
    expect(result).toEqual({
      accountFromCrm: true,
      contacts: [
        { contactId: 'c-relie', origin: 'crm', pushed: false },
        { contactId: 'c-relie-sans-source', origin: 'crm', pushed: false },
        { contactId: 'c-apporte', origin: 'bellum', pushed: false },
      ],
    })
    // Lecture bornée à l'espace, sur le lien d'IMPORT (la poussée de Bellum n'en écrit aucun).
    for (const call of db.calls) expect(call.sql).toMatch(/sync_links/)
    expect(db.calls[1]?.sql).toMatch(/s\.entity_type = 'contact'/)
    expect(db.calls[1]?.sql).toMatch(/s\.workspace_id = \$2/)
  })

  it('un compte encore `imported` vient du CRM même sans trace d’import', async () => {
    const db = runner([{ status: 'imported', import_marked: false }], [])
    expect(await loadAccountCrmProvenance(db, ACCOUNT, WORKSPACE)).toEqual({ accountFromCrm: true, contacts: [] })
  })

  it('un compte analysé sans trace d’import ne vient pas du CRM', async () => {
    const db = runner([{ status: 'completed', import_marked: false }], [])
    expect(await loadAccountCrmProvenance(db, ACCOUNT, WORKSPACE)).toEqual({ accountFromCrm: false, contacts: [] })
  })

  // #4459.2 — THALES (HubSpot) : fiches rapprochées par le CRM branché, sans trace d'import (reprise
  // antérieure à #4051 ou fiche déjà existante côté Bellum) — le lien `sync_links` dit « dans ton CRM ».
  // (Fusion PR10 ↔ R23-FIX-RECETTE-L : la colonne lue est `linked`, l'alias de main — même comportement.)
  it('un lien CRM (sync_links) sans trace d’import vaut « déjà dans ton CRM », compte compris', async () => {
    const db = runner(
      [{ status: 'completed', import_marked: false, linked: true }],
      [
        { id: 'c-lie', source: 'apollo', import_marked: false, linked: true, pushed: false },
        { id: 'c-apporte', source: 'apollo', import_marked: false, linked: false, pushed: false },
      ],
    )
    const result = await loadAccountCrmProvenance(db, ACCOUNT, WORKSPACE)
    expect(result).toEqual({
      accountFromCrm: true,
      contacts: [
        { contactId: 'c-lie', origin: 'crm', pushed: false },
        { contactId: 'c-apporte', origin: 'bellum', pushed: false },
      ],
    })
    expect(db.calls[0]?.sql).toMatch(/sync_links/)
    expect(db.calls[1]?.sql).toMatch(/sync_links/)
  })
})

// #4604 — « Ce que dit ton CRM » et la provenance par champ, lus dans le miroir du CRM DU CLIENT.
describe('loadAccountCrmProvenance — ce que dit le CRM (#4604)', () => {
  function crmRunner(rows: Record<string, unknown[]>) {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    return {
      calls,
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })
        if (/FROM accounts a/.test(sql)) return [{ status: 'completed', import_marked: false, linked: true }]
        if (/AS crm_provider/.test(sql)) return rows['provider'] ?? []
        if (/FROM crm_deals d/.test(sql)) return rows['deals'] ?? []
        if (/FROM crm_activities/.test(sql)) return rows['activities'] ?? []
        if (/FROM field_provenance/.test(sql)) return rows['fields'] ?? []
        if (/FROM account_crm_fusions/.test(sql)) return rows['fusion'] ?? []
        return []
      },
    }
  }

  it('rend l’outil branché, les affaires (propriétaire, étape), les activités en métadonnées, les champs et la fusion', async () => {
    const db = crmRunner({
      provider: [{ crm_provider: 'pipedrive' }],
      deals: [
        {
          title: 'Renouvellement',
          stage_label: 'Négociation',
          status: 'open',
          amount: '120000.00',
          currency: 'EUR',
          owner_name: 'Claire Martin',
          updated_at: new Date('2026-10-20T10:00:00Z'),
        },
      ],
      activities: [{ kind: 'meeting', occurred_at: new Date('2026-10-22T09:00:00Z') }],
      fields: [
        { field: 'company_name', source: 'connector' },
        { field: 'siren', source: 'human' },
      ],
      fusion: [{ id: 'f-1', merged_at: new Date('2026-10-26T08:00:00Z'), absorbed_name: 'VEEPEE' }],
    })
    const result = await loadAccountCrmProvenance(db, ACCOUNT, WORKSPACE)
    expect(result?.crm).toEqual({
      provider: 'pipedrive',
      deals: [
        {
          title: 'Renouvellement',
          stage: 'Négociation',
          status: 'open',
          amount: 120000,
          currency: 'EUR',
          ownerName: 'Claire Martin',
          updatedAt: '2026-10-20T10:00:00.000Z',
        },
      ],
      activities: [{ kind: 'meeting', occurredAt: '2026-10-22T09:00:00.000Z' }],
      fields: [
        { field: 'company_name', source: 'crm' },
        { field: 'siren', source: 'human' },
      ],
      fusion: { id: 'f-1', mergedAt: '2026-10-26T08:00:00.000Z', absorbedName: 'VEEPEE' },
    })
  })

  it('chaque lecture est bornée à l’espace ET au compte ; le corps d’une activité ne sort jamais', async () => {
    const db = crmRunner({ provider: [{ crm_provider: 'hubspot' }] })
    await loadAccountCrmProvenance(db, ACCOUNT, WORKSPACE)
    for (const call of db.calls) expect(call.params).toEqual([ACCOUNT, WORKSPACE])
    const activitiesSql = db.calls.find(call => /FROM crm_activities/.test(call.sql))?.sql ?? ''
    expect(activitiesSql).not.toMatch(/\b(body|subject)\b/)
  })

  // #4604 / #4526.1 — « CRM » ne s'écrit que sur preuve du connecteur : le lien posé par un FICHIER (`csv`) ne
  // désigne jamais l'outil, et ne passe pas devant l'affaire d'un vrai connecteur.
  it('#4604 sait dire NON : la recherche de l’outil ignore le lien d’un fichier (csv)', async () => {
    const db = crmRunner({ provider: [{ crm_provider: 'hubspot' }] })
    await loadAccountCrmProvenance(db, ACCOUNT, WORKSPACE)
    const providerSql = db.calls.find(call => /AS crm_provider/.test(call.sql))?.sql ?? ''
    expect(providerSql).toMatch(/s\.provider <> 'csv'/)
  })

  it('un outil inconnu (ou aucun lien CRM) : pas de bloc — jamais un nom deviné', async () => {
    const unknown = await loadAccountCrmProvenance(
      crmRunner({ provider: [{ crm_provider: 'notion' }] }),
      ACCOUNT,
      WORKSPACE,
    )
    expect(unknown).not.toHaveProperty('crm')
    const none = await loadAccountCrmProvenance(crmRunner({}), ACCOUNT, WORKSPACE)
    expect(none).not.toHaveProperty('crm')
  })

  it('une provenance de champ qui n’est ni le CRM ni un humain ne porte AUCUNE étiquette', async () => {
    const db = crmRunner({
      provider: [{ crm_provider: 'hubspot' }],
      fields: [{ field: 'company_name', source: 'pipeline' }],
    })
    expect((await loadAccountCrmProvenance(db, ACCOUNT, WORKSPACE))?.crm?.fields).toEqual([])
  })
})

// #4604 (craft n°9) — en salle de démonstration, le miroir est semé sous le fournisseur `demo` : il se lit comme
// le CRM FICTIF que la salle montre déjà branché, jamais comme un outil réel deviné.
describe('loadAccountCrmProvenance — salle de démonstration', () => {
  function demoRunner() {
    return {
      query: async (sql: string) => {
        if (/FROM accounts a/.test(sql)) return [{ status: 'completed', import_marked: false, linked: false }]
        if (/AS crm_provider/.test(sql)) return [{ crm_provider: 'demo' }]
        if (/FROM crm_deals d/.test(sql))
          return [
            {
              title: 'Renouvellement',
              stage_label: 'Négociation',
              status: 'open',
              amount: null,
              currency: null,
              owner_name: 'Camille',
              updated_at: null,
            },
          ]
        return []
      },
    }
  }

  it('le fournisseur `demo` prend le nom du CRM fictif de la salle quand l’appelant le donne', async () => {
    const result = await loadAccountCrmProvenance(demoRunner(), ACCOUNT, WORKSPACE, { demoTool: 'hubspot' })
    expect(result?.crm?.provider).toBe('hubspot')
  })

  it('hors salle, le fournisseur `demo` n’est pas un CRM : aucun bloc', async () => {
    expect(await loadAccountCrmProvenance(demoRunner(), ACCOUNT, WORKSPACE)).not.toHaveProperty('crm')
  })
})

// #4604.4 / .7 — les champs personnalisés du CRM, et la version CRM d'une valeur corrigée à la main.
describe('loadAccountCrmProvenance — champs personnalisés et version CRM (#4604)', () => {
  const OTHER_WORKSPACE = 'b1f4c2a0-0000-4000-8000-0000000000ff'

  function db(rows: { deals?: unknown[]; fields?: unknown[]; conflicts?: Record<string, unknown[]> }) {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    return {
      calls,
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })
        if (/FROM accounts a/.test(sql)) return [{ status: 'completed', import_marked: false, linked: true }]
        if (/AS crm_provider/.test(sql)) return [{ crm_provider: 'hubspot' }]
        if (/FROM crm_deals d/.test(sql)) return rows.deals ?? []
        if (/FROM field_provenance/.test(sql)) return rows.fields ?? []
        // Un journal de conflits PAR espace : un autre espace ne lit jamais celui-ci.
        if (/FROM sync_record_events/.test(sql)) return rows.conflicts?.[String(params[1])] ?? []
        return []
      },
    }
  }
  const dealRow = (custom: unknown) => ({
    title: 'Renouvellement',
    stage_label: 'Négociation',
    status: 'open',
    amount: null,
    currency: null,
    owner_name: 'Claire Martin',
    updated_at: new Date('2026-10-20T10:00:00Z'),
    crm_custom_fields: custom,
  })

  it('#4604.4 — les champs personnalisés sortent en texte lisible, triés ; le vide, l’objet, le long texte et le booléen non', async () => {
    const result = await loadAccountCrmProvenance(
      db({
        deals: [
          dealRow({
            segment: ' Grand compte ',
            budget_it: '1,2 M€',
            effectif: 4200,
            vide: '   ',
            nul: null,
            objet: { a: 1 },
            note_longue: 'x'.repeat(300),
            multi: 'ligne un\nligne deux',
            actif: true,
          }),
        ],
      }),
      ACCOUNT,
      WORKSPACE,
    )
    expect(result?.crm?.deals[0]?.customFields).toEqual([
      { key: 'budget_it', value: '1,2 M€' },
      { key: 'effectif', value: '4200' },
      { key: 'segment', value: 'Grand compte' },
    ])
  })

  it('#4604.4 — sait dire NON : une affaire sans champ personnalisé n’en porte pas la clé', async () => {
    for (const custom of [{}, null, undefined, 'pas un objet']) {
      const result = await loadAccountCrmProvenance(db({ deals: [dealRow(custom)] }), ACCOUNT, WORKSPACE)
      expect(result?.crm?.deals[0]).not.toHaveProperty('customFields')
    }
  })

  it('#4604.7 — une valeur corrigée à la main garde sa version CRM consultable (le dernier écart journalisé)', async () => {
    const result = await loadAccountCrmProvenance(
      db({
        fields: [
          { field: 'company_name', source: 'human' },
          { field: 'siren', source: 'connector' },
        ],
        conflicts: {
          [WORKSPACE]: [
            { proposal: { company_name: { bellum: 'Veepee', crm: 'VEEPEE SA' } } },
            { proposal: { company_name: { bellum: 'Veepee', crm: 'ANCIEN NOM' } } },
            { proposal: { siren: { bellum: null, crm: '123456789' } } },
          ],
        },
      }),
      ACCOUNT,
      WORKSPACE,
    )
    expect(result?.crm?.crmValues).toEqual([{ field: 'company_name', value: 'VEEPEE SA' }])
  })

  it('#4604.7 — pas de correction humaine, pas de lecture du journal ; un écart sans valeur CRM ne fait aucune ligne', async () => {
    const noHuman = db({ fields: [{ field: 'company_name', source: 'connector' }] })
    const a = await loadAccountCrmProvenance(noHuman, ACCOUNT, WORKSPACE)
    expect(a?.crm).not.toHaveProperty('crmValues')
    expect(noHuman.calls.some(call => /FROM sync_record_events/.test(call.sql))).toBe(false)

    const emptyCrm = db({
      fields: [{ field: 'company_name', source: 'human' }],
      conflicts: { [WORKSPACE]: [{ proposal: { company_name: { bellum: 'Veepee', crm: null } } }] },
    })
    expect((await loadAccountCrmProvenance(emptyCrm, ACCOUNT, WORKSPACE))?.crm).not.toHaveProperty('crmValues')
  })

  it('#4604.7 — REFUS : la version CRM d’un autre espace n’est jamais lue, et chaque lecture est bornée à l’espace', async () => {
    const source = db({
      fields: [{ field: 'company_name', source: 'human' }],
      conflicts: {
        [OTHER_WORKSPACE]: [{ proposal: { company_name: { bellum: 'X', crm: 'VALEUR D’UN AUTRE ESPACE' } } }],
      },
    })
    const result = await loadAccountCrmProvenance(source, ACCOUNT, WORKSPACE)
    expect(JSON.stringify(result)).not.toContain('AUTRE ESPACE')
    expect(result?.crm).not.toHaveProperty('crmValues')
    const journal = source.calls.find(call => /FROM sync_record_events/.test(call.sql))
    expect(journal?.sql).toMatch(/e\.workspace_id = \$2/)
    expect(journal?.sql).toMatch(/e\.internal_id = \$1/)
    expect(journal?.params).toEqual([ACCOUNT, WORKSPACE])
  })
})

// #4680 — l'import compte comme présence, lu EN BASE (aucun connecteur live).
describe('loadAccountCrmProvenance — contacts connus et trace d’import (#4680)', () => {
  it('compte les contacts de provenance connue (import, crm) et dit la date de l’import la plus récente', async () => {
    const db = runner(
      [{ status: 'imported', import_marked: true, import_kind: 'file', import_at: new Date('2026-10-20T08:00:00Z') }],
      [
        {
          id: 'c1',
          source: 'import',
          import_marked: true,
          pushed: false,
          imported_at: new Date('2026-10-20T08:00:00Z'),
        },
        { id: 'c2', source: 'crm', import_marked: false, pushed: false, imported_at: '2026-10-25T09:00:00.000Z' },
        { id: 'c3', source: 'apollo', import_marked: false, pushed: false },
      ],
    )
    const result = await loadAccountCrmProvenance(db, ACCOUNT, WORKSPACE)
    expect(result?.knownContacts).toEqual({ count: 2, importedAt: '2026-10-25T09:00:00.000Z' })
    expect(result?.accountImport).toEqual({ kind: 'file', importedAt: '2026-10-20T08:00:00.000Z' })
  })

  it('SAIT DIRE NON — aucun contact connu : aucune clé `knownContacts` (la réponse d’avant ne change pas)', async () => {
    const db = runner(
      [{ status: 'completed', import_marked: false }],
      [{ id: 'c3', source: 'apollo', import_marked: false, pushed: false }],
    )
    const result = await loadAccountCrmProvenance(db, ACCOUNT, WORKSPACE)
    expect(result).not.toHaveProperty('knownContacts')
    expect(result).not.toHaveProperty('accountImport')
  })

  it('SAIT DIRE NON — une saisie à la main ou un rendez-vous ne sont pas des contacts connus', async () => {
    const db = runner(
      [{ status: 'completed', import_marked: false }],
      [
        { id: 'a', source: 'manual', import_marked: false, pushed: false },
        { id: 'b', source: 'meeting', import_marked: false, pushed: false },
      ],
    )
    expect(await loadAccountCrmProvenance(db, ACCOUNT, WORKSPACE)).not.toHaveProperty('knownContacts')
  })

  it('la date de l’import reste lue en base : requêtes bornées à l’espace', async () => {
    const db = runner([{ status: 'imported', import_marked: true, import_kind: 'tool' }], [])
    const result = await loadAccountCrmProvenance(db, ACCOUNT, WORKSPACE)
    expect(result?.accountImport).toEqual({ kind: 'tool', importedAt: null })
    expect(db.calls[0]?.sql).toMatch(/record_import_marks/)
    expect(db.calls[0]?.sql).toMatch(/workspace_id = \$2/)
  })
})
