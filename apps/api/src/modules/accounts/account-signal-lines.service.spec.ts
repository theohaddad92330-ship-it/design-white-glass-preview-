import { workspaceSignalHistorySchema } from '@bellum/contracts'
import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import { AccountSignalLinesService } from './account-signal-lines.service'
import { analysisCandidates, lineTypeOfKind, refineLineType } from './account-signal-lines.sources'

const WS = '11111111-1111-4111-8111-111111111111'
const ACCOUNT = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-10-31T12:00:00Z')

type Call = { sql: string; params: unknown[] }
type Tables = Partial<Record<string, unknown[]>>

const TABLE_OF: ReadonlyArray<[RegExp, string]> = [
  [/FROM accounts a/, 'accounts'],
  [/FROM signal_history/, 'signal_history'],
  [/FROM opportunities/, 'opportunities'],
  [/FROM project_needs/, 'project_needs'],
  [/FROM crm_deal_facts f\s+WHERE f\.workspace_id = \$1 AND f\.account_id/, 'crm_deal_facts'],
  [/FROM canonical_trigger_events/, 'canonical_trigger_events'],
  [/FROM crm_deals d/, 'crm_deals'],
  [/FROM dataforge_accounts/, 'dataforge_accounts'],
  [/FROM dataforge_needs/, 'dataforge_needs'],
]

type Row = Record<string, unknown>

/**
 * Une base en mémoire qui RESPECTE les filtres de compte : une ligne sans `account_id` (ou sans SIREN, sans fiche)
 * appartient au compte par défaut ; une requête ne rend que les lignes des comptes (ou des SIREN, des fiches) qu'elle demande.
 */
function filterRows(table: string, rowsOfTable: unknown[], params: unknown[]): unknown[] {
  const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value])
  const [firstKey] = asList(params[0])
  return (rowsOfTable as Row[])
    .map(row => {
      if (table === 'dataforge_accounts') return { siren: firstKey, ...row }
      if (table === 'dataforge_needs') return { account_source_id: firstKey, ...row }
      return table === 'accounts' ? { id: ACCOUNT, ...row } : { account_id: ACCOUNT, ...row }
    })
    .filter(row => {
      if (table === 'dataforge_accounts') return asList(params[0]).includes(row['siren'])
      if (table === 'dataforge_needs') return asList(params[0]).includes(row['account_source_id'])
      // La lecture des comptes de l'espace porte le PÉRIMÈTRE en `$2`, pas des comptes : elle rend tout.
      if (table === 'accounts') return typeof params[1] !== 'string' || row['id'] === params[1]
      return asList(params[1]).includes(row['account_id'])
    })
}

type BuilderCall = { method: string; args: unknown[] }

function service(tables: Tables, failing?: RegExp) {
  const calls: Call[] = []
  const builders: BuilderCall[][] = []
  const query = jest.fn(async (sql: string, params: unknown[]) => {
    calls.push({ sql, params })
    if (failing?.test(sql)) throw new Error('lecture en panne')
    const table = TABLE_OF.find(([pattern]) => pattern.test(sql))?.[1]
    if (!table) throw new Error(`requête inattendue : ${sql}`)
    return filterRows(table, tables[table] ?? [], params)
  })
  // Lot 768 — les contacts se lisent par ContactEntity (GA-405) : un constructeur de requête factice enregistre l'appel.
  const builder = (): Record<string, unknown> => {
    const record: BuilderCall[] = []
    builders.push(record)
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'addSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy']) {
      chain[method] = (...args: unknown[]) => {
        record.push({ method, args })
        return chain
      }
    }
    chain['getRawMany'] = async () => {
      if (failing?.test('FROM contacts c')) throw new Error('lecture en panne')
      const ids = record.flatMap(call => call.args).flatMap(arg => (arg as { accountIds?: string[] })?.accountIds ?? [])
      return (tables['contacts'] ?? []).filter(row => ids.includes((row as Row)['account_id'] as string))
    }
    return chain
  }
  const repo = { manager: { query, createQueryBuilder: builder } } as unknown as Repository<AccountEntity>
  return { svc: new AccountSignalLinesService(repo), calls, builders }
}

const ACCOUNT_ROW = {
  recent_signals: [],
  raw_analysis: {},
  siren: '552120222',
  group_head_siren: null,
  signals_collected_at: '2026-10-24T08:00:00Z',
}

/** Une ligne par famille, chacune avec un intitulé qui ne ressemble à aucun autre. */
const ALL_FAMILIES: Tables = {
  accounts: [
    {
      ...ACCOUNT_ROW,
      recent_signals: [{ signal: 'Nomination directeur alpha', type: 'nomination', date: '2026-09-02' }],
      raw_analysis: {
        it_job_signals: [{ title: 'Développeur Kotlin bravo', date: '2026-10-10', city: 'Lille', url: 'https://o/1' }],
        public_tenders: [{ title: 'Marché infogérance charlie', published_date: '2026-08-01', buyer: 'Ville' }],
        awarded_contracts: [{ title: 'Accord-cadre delta', notified_date: '2025-02-01', winner: 'Concurrent' }],
        legal_signals: [{ label: 'Augmentation capital echo', date: '2026-03-03' }],
        signal_layers: { historical: [{ signal: 'Programme foxtrot', date: '2023-05' }] },
        historical_needs: {
          total: 1,
          items: [{ label: 'Offre golf ancienne', date: '2024-02-02', source: 'job_offer' }],
        },
      },
    },
  ],
  signal_history: [
    {
      id: 'h1',
      label: 'Rachat hotel',
      signal_type: 'acquisition',
      signal_date: '2022-06-01',
      first_detected_at: new Date('2022-06-02'),
    },
  ],
  opportunities: [
    {
      id: 'lead-1',
      label: 'Projet india possible',
      stage: 'potential',
      kind: 'besoin',
      outcome: null,
      closed_at: null,
      stage_entered_at: new Date('2026-10-01'),
      first_detected_at: new Date('2026-10-01'),
      detail: null,
      management: 'DSI',
    },
    {
      id: 'p-won',
      label: 'Mission juliett close',
      stage: 'won',
      kind: 'besoin',
      outcome: 'won',
      closed_at: new Date('2025-01-10'),
      stage_entered_at: new Date('2025-01-10'),
      first_detected_at: new Date('2024-11-01'),
      detail: null,
      management: null,
    },
    {
      id: 'p-open',
      label: 'Affaire en cours',
      stage: 'qualified',
      kind: 'besoin',
      outcome: null,
      closed_at: null,
      stage_entered_at: new Date('2026-10-01'),
      first_detected_at: new Date('2026-10-01'),
      detail: null,
      management: null,
    },
  ],
  project_needs: [
    {
      id: 'n1',
      title: 'Besoin kilo perdu',
      status: 'lost',
      status_changed_at: new Date('2024-09-01'),
      detected_at: null,
      target_tjm_cents: '62000',
      skills: [{ term: 'Java' }],
      location: null,
      contact_id: 'c-1',
    },
  ],
  crm_deal_facts: [
    {
      provider: 'hubspot',
      deal_id: '42',
      name: 'Affaire lima',
      is_closed: true,
      is_won: false,
      closed_at: new Date('2025-06-01'),
      last_activity_at: null,
      deal_created_at: null,
    },
  ],
  canonical_trigger_events: [
    { id: 'e1', kind: 'affaire_dormante', evidence: 'Affaire mike en sommeil', occurred_at: new Date('2026-07-15') },
  ],
  crm_deals: [
    {
      provider: 'pipedrive',
      external_id: '7',
      title: 'Affaire november miroir',
      status: 'won',
      closed_at: new Date('2023-03-01'),
      crm_created_at: null,
      crm_url: null,
    },
  ],
  dataforge_accounts: [{ source_id: 'SRC-1', cluster_id: null, is_cluster_primary: false }],
  dataforge_needs: [
    {
      id: 'd1',
      title: 'Besoin oscar historique',
      status: 'GAGNE',
      need_date: '2021-04-01',
      tjm_eur: 580,
      technologies: ['SAP'],
      prescriber_name: 'Jeanne Martin',
      prescriber_title: 'DSI',
      location: 'Lyon',
    },
    {
      id: 'd2',
      title: 'Besoin papa sans date',
      status: 'PERDU',
      need_date: null,
      starts_on: null,
      tjm_eur: null,
      technologies: [],
      prescriber_name: null,
      prescriber_title: null,
      location: null,
    },
    {
      id: 'd3',
      title: 'Besoin sierra daté par son début',
      status: 'PERDU',
      need_date: null,
      starts_on: '2022-05-02',
      tjm_eur: null,
      technologies: ['Java'],
      prescriber_name: null,
      prescriber_title: null,
      location: null,
    },
  ],
}

describe('AccountSignalLinesService — les quatre familles, un tableau', () => {
  it('REFUS cross-espace : un compte hors de l’espace rend null et rien d’autre n’est lu', async () => {
    const { svc, calls } = service({ accounts: [] })
    await expect(svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW })).resolves.toBeNull()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.sql).toMatch(/a\.workspace_id = \$1 AND a\.id = \$2/)
    expect(calls[0]!.params).toEqual([WS, ACCOUNT])
  })

  it('chaque requête d’espace est filtrée par l’espace ET le compte, jamais par un id seul', async () => {
    const { svc, calls } = service(ALL_FAMILIES)
    await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW })
    const scoped = calls.filter(call => !/dataforge_/.test(call.sql))
    expect(scoped.length).toBeGreaterThanOrEqual(7)
    for (const call of scoped) {
      expect(call.sql).toMatch(/workspace_id = \$1/)
      expect(call.params.slice(0, 2)).toEqual(/FROM accounts a/.test(call.sql) ? [WS, ACCOUNT] : [WS, [ACCOUNT]])
    }
    // Aucune coupe silencieuse sur l’historique d’un compte.
    expect(scoped.filter(call => !/FROM accounts a/.test(call.sql)).every(call => !/LIMIT/.test(call.sql))).toBe(true)
  })

  it('une ligne arrive de CHAQUE famille, dans sa période', async () => {
    const { svc } = service(ALL_FAMILIES)
    const result = (await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW }))!
    const byTitle = new Map(result.lines.map(line => [line.title, line]))
    const expected: Array<[string, string, string]> = [
      ['Nomination directeur alpha', 'equipe', 'now'], // accounts.recent_signals
      ['Développeur Kotlin bravo', 'recrutement', 'now'], // it_job_signals
      ['Marché infogérance charlie', 'marche_public', 'now'], // public_tenders
      ['Accord-cadre delta', 'marche_public', 'past'], // awarded_contracts
      ['Augmentation capital echo', 'annonce_legale', 'past'], // legal_signals
      ['Programme foxtrot', 'projet', 'past'], // signal_layers.historical
      ['Offre golf ancienne', 'recrutement', 'past'], // historical_needs
      ['Rachat hotel', 'projet', 'past'], // signal_history
      ['Projet india possible', 'projet', 'now'], // opportunities (projet possible)
      ['Mission juliett close', 'besoin_passe', 'past'], // opportunities (clos)
      ['Besoin kilo perdu', 'besoin_passe', 'past'], // project_needs
      ['Affaire lima', 'affaire', 'past'], // crm_deal_facts
      ['Affaire mike en sommeil', 'affaire', 'now'], // signaux CRM
      ['Affaire november miroir', 'affaire', 'past'], // miroir crm_deals
      ['Besoin oscar historique', 'besoin_passe', 'past'], // base commune
    ]
    for (const [title, type, period] of expected) {
      expect({
        title,
        line: byTitle.get(title) && { type: byTitle.get(title)!.type, period: byTitle.get(title)!.period },
      }).toEqual({
        title,
        line: { type, period },
      })
    }
    expect(byTitle.get('Projet india possible')!.lead_id).toBe('lead-1')
    expect(byTitle.get('Mission juliett close')!.outcome).toBe('won')
    expect(byTitle.get('Besoin kilo perdu')).toMatchObject({ outcome: 'lost', tjm_eur: 620, contact_ids: ['c-1'] })
    expect(byTitle.get('Besoin oscar historique')).toMatchObject({
      outcome: 'won',
      tjm_eur: 580,
      people_hints: { names: [], roles: ['DSI'], location: 'Lyon' },
    })
    expect(byTitle.get('Affaire november miroir')!.outcome).toBe('won')
    expect(result).toMatchObject({ verified_at: '2026-10-24T08:00:00.000Z', open_deals: 1 })
  })

  it('un besoin de la base commune sans date de besoin est daté par le DÉBUT de sa mission (pack ORION 24)', async () => {
    const { svc } = service(ALL_FAMILIES)
    const result = (await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW }))!
    expect(result.lines.find(line => line.title === 'Besoin sierra daté par son début')).toMatchObject({
      type: 'besoin_passe',
      period: 'past',
    })
  })

  it('une ligne sans date n’existe pas', async () => {
    const { svc } = service(ALL_FAMILIES)
    const result = (await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW }))!
    expect(result.lines.some(line => line.title === 'Besoin papa sans date')).toBe(false)
  })

  it('aucune ligne ne nomme sa source (ni la base commune, ni le CRM)', async () => {
    const { svc } = service(ALL_FAMILIES)
    const result = (await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW }))!
    const json = JSON.stringify(result)
    expect(json).not.toMatch(/dataforge|orion|hubspot|pipedrive|base commune|"source"/i)
  })

  it('le miroir CRM est dédoublonné contre les faits d’affaires, et le même sujet lu deux fois fait UNE ligne', async () => {
    const { svc, calls } = service({
      accounts: [
        {
          ...ACCOUNT_ROW,
          recent_signals: [{ signal: 'Data engineer — plateforme risques', type: 'recrutement', date: '2026-10-05' }],
          raw_analysis: {
            recent_signals: [{ signal: 'Data engineer — plateforme risques', type: 'recrutement', date: '2026-10-05' }],
          },
        },
      ],
    })
    const result = (await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW }))!
    expect(result.lines).toHaveLength(1)
    expect(calls.find(call => /FROM crm_deals d/.test(call.sql))!.sql).toMatch(/NOT EXISTS[\s\S]*crm_deal_facts/)
  })

  it('base commune : un SIREN porté par plusieurs fiches sans rattachement univoque ne fait AUCUNE ligne', async () => {
    const { svc, calls } = service({
      ...ALL_FAMILIES,
      dataforge_accounts: [
        { source_id: 'A', cluster_id: 'k1', is_cluster_primary: false },
        { source_id: 'B', cluster_id: 'k2', is_cluster_primary: false },
      ],
    })
    const result = (await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW }))!
    expect(result.lines.some(line => line.title === 'Besoin oscar historique')).toBe(false)
    expect(calls.some(call => /FROM dataforge_needs/.test(call.sql))).toBe(false)
  })

  describe('lot 773 e) — la base commune se lit PAR GRAPPE, jamais en silence', () => {
    const need = (id: string, source: string, title: string) => ({
      id,
      account_source_id: source,
      title,
      status: 'GAGNE',
      need_date: '2024-03-01',
      tjm_eur: null,
      technologies: [],
      prescriber_name: null,
      prescriber_title: null,
      location: null,
    })
    const group = (accounts: unknown[], dfNeeds: unknown[]): Tables => ({
      accounts: [{ ...ACCOUNT_ROW, company_name: 'Groupe Martin' }],
      dataforge_accounts: accounts,
      dataforge_needs: dfNeeds,
    })

    it('un SIREN à 2 fiches du MÊME cluster, sans primaire : les besoins des 2, en UNE requête, l’entité nommée', async () => {
      const { svc, calls } = service(
        group(
          [
            {
              source_id: 'DF-14',
              name: 'Groupe Martin',
              group_name: 'Groupe Martin',
              cluster_id: 'k1',
              is_cluster_primary: false,
            },
            {
              source_id: 'DF-415',
              name: 'Martin Belaysoud Expansion',
              group_name: 'Groupe Martin',
              cluster_id: 'k1',
              is_cluster_primary: false,
            },
          ],
          [need('n1', 'DF-14', 'Renfort SAP siège'), need('n2', 'DF-415', 'Migration ERP filiale')],
        ),
      )
      const result = (await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW }))!
      const titles = result.lines.map(line => line.title).sort()
      expect(titles).toEqual(['Migration ERP filiale', 'Renfort SAP siège'])
      expect(calls.filter(call => /FROM dataforge_needs/.test(call.sql))).toHaveLength(1)
      const sibling = result.lines.find(line => line.title === 'Migration ERP filiale')!
      expect(sibling.entity).toBe('Martin Belaysoud Expansion')
      // Même entité que le compte : aucun libellé d'entité.
      expect(result.lines.find(line => line.title === 'Renfort SAP siège')!.entity).toBeUndefined()
      expect(JSON.stringify(result)).not.toMatch(/DF-14|DF-415|dataforge/i)
    })

    it('même cluster AVEC une primaire : les besoins de TOUTES les fiches de la grappe, pas seulement la primaire', async () => {
      const { svc } = service(
        group(
          [
            { source_id: 'A', name: 'Groupe Martin', group_name: null, cluster_id: 'k1', is_cluster_primary: true },
            { source_id: 'B', name: 'Martin Sud', group_name: null, cluster_id: 'k1', is_cluster_primary: false },
          ],
          [need('n1', 'A', 'Besoin du siège'), need('n2', 'B', 'Besoin du Sud')],
        ),
      )
      const result = (await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW }))!
      expect(result.lines).toHaveLength(2)
    })

    it('sans cluster commun mais le MÊME groupe (nom normalisé) sur toutes les fiches : la grappe se lit par le groupe', async () => {
      const { svc } = service(
        group(
          [
            {
              source_id: 'A',
              name: 'Martin Nord',
              group_name: 'Groupe  MARTIN',
              cluster_id: null,
              is_cluster_primary: false,
            },
            {
              source_id: 'B',
              name: 'Martin Sud',
              group_name: 'groupe martin',
              cluster_id: null,
              is_cluster_primary: false,
            },
          ],
          [need('n1', 'A', 'Besoin Nord'), need('n2', 'B', 'Besoin Sud')],
        ),
      )
      const result = (await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW }))!
      expect(result.lines.map(line => line.title).sort()).toEqual(['Besoin Nord', 'Besoin Sud'])
    })

    it('2 fiches de groupes DIFFÉRENTS sur un même SIREN : rien n’est rendu, mais une TRACE (sans donnée perso)', async () => {
      const { svc, calls } = service(
        group(
          [
            {
              source_id: 'A',
              name: 'Alpha SA',
              group_name: 'Groupe Alpha',
              cluster_id: null,
              is_cluster_primary: false,
            },
            { source_id: 'B', name: 'Beta SA', group_name: 'Groupe Beta', cluster_id: null, is_cluster_primary: false },
          ],
          [need('n1', 'A', 'Besoin Alpha'), need('n2', 'B', 'Besoin Beta')],
        ),
      )
      const warn = jest.spyOn((svc as unknown as { logger: { warn: () => void } }).logger, 'warn').mockImplementation()
      const result = (await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW }))!
      expect(result.lines).toHaveLength(0)
      expect(calls.some(call => /FROM dataforge_needs/.test(call.sql))).toBe(false)
      expect(warn).toHaveBeenCalledTimes(1)
      const trace = String((warn.mock.calls[0] as unknown[])[0])
      expect(trace).toMatch(/ambig/i)
      expect(trace).not.toMatch(/Alpha|Beta|552120222/)
    })
  })

  it('une famille en panne n’efface pas les autres', async () => {
    const { svc } = service({ ...ALL_FAMILIES, signal_history: undefined })
    const failing = svc as unknown as { accounts: { manager: { query: jest.Mock } } }
    const original = failing.accounts.manager.query.getMockImplementation()!
    failing.accounts.manager.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (/FROM signal_history/.test(sql)) throw new Error('panne')
      return original(sql, params)
    })
    const result = (await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW }))!
    expect(result.lines.some(line => line.title === 'Rachat hotel')).toBe(false)
    expect(result.lines.some(line => line.title === 'Affaire lima')).toBe(true)
  })

  it('lot 769 — une offre d’emploi reste une offre même si l’analyse l’a étiquetée autrement ; une nomination reste équipe', () => {
    const offer = 'Développeur Java senior - secteur bancaire H/F'
    expect(refineLineType('projet', offer)).toBe('recrutement')
    expect(refineLineType('fait', offer)).toBe('recrutement')
    expect(refineLineType('fait', 'Ingénieur DevOps (F/H) en CDI')).toBe('recrutement')
    expect(refineLineType('projet', 'Stage data analyst à Lille')).toBe('recrutement')
    expect(refineLineType('fait', 'Viveris recrute 20 consultants')).toBe('recrutement')
    expect(refineLineType('fait', 'Offre d’emploi : architecte cloud')).toBe('recrutement')
    expect(refineLineType('fait', 'Alpha a recruté Marie Durand comme DSI')).toBe('equipe')
    expect(refineLineType('projet', 'Paul Martin nommé directeur technique')).toBe('equipe')
    // Ce qui n'est pas une offre, ni une nomination, ne bouge pas ; les autres familles non plus.
    expect(refineLineType('projet', 'Refonte du portail fournisseurs')).toBe('projet')
    expect(refineLineType('fait', 'Siège social à Lille')).toBe('fait')
    expect(refineLineType('marche_public', 'Marché TMA H/F')).toBe('marche_public')
    expect(refineLineType('affaire', 'Affaire CDI')).toBe('affaire')
    expect(refineLineType('fait', null)).toBe('fait')
  })

  it('lot 769 — un signal de l’analyse dont le titre est une offre sort en recrutement, avec son lieu', () => {
    const [signal, memory] = analysisCandidates(
      {
        recent_signals: [
          { type: 'projet', signal: 'Développeur Java senior - secteur bancaire H/F', location: 'Lille (59)' },
        ],
        historical_needs: { items: [{ label: 'Besoin data', date: '2024-05', source: 'market', location: 'Lyon' }] },
      },
      [],
    )
    expect(signal).toMatchObject({ type: 'recrutement', location: 'Lille (59)' })
    expect(memory).toMatchObject({ type: 'projet', location: 'Lyon' })
  })

  it('lot 771 — une description de l’IDENTITÉ ou des CHIFFRES de l’entreprise est un FAIT, jamais un projet', () => {
    const facts = [
      'Activité de SEMA FRANCE : EURL immatriculée à Lyon, capital de 10 000 €',
      'CA 2025 : 3,1 M€ pour SEMA FRANCE',
      'Comptes 2,52 M€ déposés au greffe',
      'Le rapport RSE 2024 de Viveris est référencé et publié en avril 2025.',
      'Le siège social est situé à Lyon, effectif de 12 personnes',
    ]
    for (const title of facts) {
      expect(refineLineType('projet', title)).toBe('fait')
      expect(refineLineType('fait', title)).toBe('fait')
    }
    // Les VRAIS projets restent des projets : l'implication d'un besoin gagne sur le vocabulaire des chiffres.
    for (const title of [
      'Alpha lance la migration de son SI vers le cloud',
      'Programme de transformation numérique 2025-2027',
      'Refonte du portail fournisseurs, budget de 2 M€',
      'Déploiement d’un nouvel ERP : appel d’offres en cours, CA 2025 en hausse',
    ]) {
      expect(refineLineType('projet', title)).toBe('projet')
    }
    // Une offre d'emploi ou un marché ne devient jamais un fait.
    expect(refineLineType('recrutement', 'Comptable H/F, CA 2025')).toBe('recrutement')
    expect(refineLineType('marche_public', 'Comptes annuels : marché de tierce maintenance')).toBe('marche_public')
  })

  it('lot 771 — un signal d’analyse « fait d’identité » étiqueté projet, même avec une implication, sort en fait', () => {
    const [signal] = analysisCandidates(null, [
      {
        signal: 'Le rapport RSE 2024 de Viveris est référencé et publié en avril 2025.',
        type: 'projet',
        date: '2025-04-15',
        sales_implication: 'Peut révéler des enjeux de conformité',
      },
    ])
    expect(signal!.type).toBe('fait')
  })

  it('lot 771 — une offre rangée en couche historique garde son lien, ses compétences et son TJM', () => {
    const candidates = analysisCandidates(
      {
        signal_layers: {
          jobOffers: {
            historical: [
              {
                title: 'Architecte cloud AWS',
                date: '2026-05-12',
                url: 'https://offres.example/1',
                skills: ['AWS', 'Terraform'],
                tjm_eur: 650,
                type: 'recrutement',
              },
            ],
          },
          historical: [{ signal: 'Appel d’offres TMA lancé', date: '2026-04-02', url: 'https://x.example/avis' }],
        },
        historical_needs: {
          items: [
            { label: 'Besoin data', date: '2024-05', source: 'market', technologies: ['Spark', ' '], tjm_eur: 540 },
            { label: 'Rien de plus', date: '2024-06', source: 'market', tjm_eur: 0 },
          ],
        },
      },
      [],
    )
    const offer = candidates.find(c => c.title === 'Architecte cloud AWS')!
    expect(offer).toMatchObject({
      type: 'recrutement',
      url: 'https://offres.example/1',
      technologies: ['AWS', 'Terraform'],
      tjmEur: 650,
      origin: 'offre',
    })
    expect(candidates.find(c => c.title?.startsWith('Appel d’offres TMA'))).toMatchObject({
      url: 'https://x.example/avis',
    })
    expect(candidates.find(c => c.title === 'Besoin data')).toMatchObject({
      technologies: ['Spark'],
      tjmEur: 540,
      origin: 'memoire',
    })
    // Absent = rien : ni lien, ni compétences, ni TJM inventés (0 n'est pas un TJM).
    const bare = candidates.find(c => c.title === 'Rien de plus')!
    expect(bare.url ?? null).toBeNull()
    expect(bare.tjmEur ?? null).toBeNull()
    expect(bare.technologies ?? []).toEqual([])
  })

  it('lot 771 — la ligne dit sa SOURCE générique (jamais un domaine ni un fournisseur)', async () => {
    const { svc } = service({
      accounts: [
        {
          ...ACCOUNT_ROW,
          raw_analysis: {
            it_job_signals: [{ title: 'Développeur Kotlin bravo', date: '2026-10-10', url: 'https://o/1' }],
            public_tenders: [{ title: 'Marché infogérance charlie', published_date: '2026-08-01' }],
            legal_signals: [{ label: 'Modification statutaire', date: '2026-07-01' }],
          },
        },
      ],
    })
    const result = (await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW }))!
    const origins = Object.fromEntries(result.lines.map(line => [line.title, line.origin_kind]))
    expect(origins).toEqual({
      'Développeur Kotlin bravo': 'offre',
      'Marché infogérance charlie': 'marche',
      'Modification statutaire': 'annonce',
    })
    expect(JSON.stringify(result)).not.toMatch(/https?:\/\/[^"]*"origin|"origin":"[^"]*\./)
  })

  it('lot 771 — un projet possible qui décrit un fait d’identité devient un fait, sans « Projet possible »', async () => {
    const { svc } = service({
      accounts: [{ ...ACCOUNT_ROW }],
      opportunities: [
        {
          id: 'o1',
          label: 'Le rapport RSE 2024 de Viveris est référencé et publié en avril 2025.',
          detail: null,
          stage: 'detected',
          kind: 'signal',
          outcome: null,
          closed_at: null,
          stage_entered_at: null,
          first_detected_at: '2026-10-01T00:00:00Z',
          management: null,
        },
        {
          id: 'o2',
          label: 'Migration du SI vers le cloud',
          detail: null,
          stage: 'detected',
          kind: 'signal',
          outcome: null,
          closed_at: null,
          stage_entered_at: null,
          first_detected_at: '2026-10-02T00:00:00Z',
          management: null,
        },
      ],
    })
    const { lines } = (await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW }))!
    const rse = lines.find(line => line.title.startsWith('Le rapport RSE'))!
    const migration = lines.find(line => line.title.startsWith('Migration'))!
    expect(rse.type).toBe('fait')
    expect(rse.lead_id).toBeUndefined()
    expect(migration.type).toBe('projet')
    expect(migration.lead_id).toBe('o2')
  })

  it('lot 772 d) — les titres REFORMULÉS par l’analyse sont reconnus comme offres ; une nomination reste équipe', () => {
    const offers = [
      'Viveris publie une offre CDI de Développeur Java senior pour le secteur bancaire à Villeurbanne/Lyon.',
      'Viveris publie une offre de Développeur Android Java SoftPOS à Montpellier.',
      'Viveris publie une offre d’emploi de chef de projet à Lille.',
      'Alpha publie une offre de stage en data à Nantes.',
      'Alpha publie une offre d’alternance en cybersécurité.',
      'Une offre de Product Owner a été publiée à Paris.',
      'Une offre de poste de DevOps a été publiée par Beta.',
      'Beta recrute un ingénieur DevOps à Toulouse.',
      'Gamma recrute une cheffe de projet SAP.',
      'Gamma ouvre un poste de responsable SI à Rennes.',
    ]
    for (const title of offers) {
      expect([title, refineLineType('projet', title)]).toEqual([title, 'recrutement'])
      expect([title, refineLineType('fait', title)]).toEqual([title, 'recrutement'])
    }
    // Une nomination ou une arrivée reste un fait d’équipe, même quand le poste est nommé.
    expect(refineLineType('fait', 'Alpha a recruté Marie Durand comme chef de projet')).toBe('equipe')
    expect(refineLineType('projet', 'Paul Martin nommé responsable du poste de DSI')).toBe('equipe')
    // Ce qui parle d’un poste sans l’ouvrir ne bouge pas.
    expect(refineLineType('projet', 'Refonte du portail fournisseurs')).toBe('projet')
    expect(refineLineType('fait', 'Alpha publie son rapport annuel')).toBe('fait')
  })

  it('lot 772 d) — un « projet possible » (table opportunities) dont le titre est une offre sort en recrutement', async () => {
    const { svc } = service({
      accounts: [{ ...ACCOUNT_ROW }],
      opportunities: [
        {
          id: 'o9',
          label:
            'Viveris publie une offre CDI de Développeur Java senior pour le secteur bancaire à Villeurbanne/Lyon.',
          detail: null,
          stage: 'detected',
          kind: 'signal',
          outcome: null,
          closed_at: null,
          stage_entered_at: null,
          first_detected_at: '2026-10-01T00:00:00Z',
          management: null,
        },
      ],
    })
    const { lines } = (await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW }))!
    const offer = lines.find(line => line.title.startsWith('Viveris publie'))!
    expect(offer.type).toBe('recrutement')
    expect(offer.lead_id).toBeUndefined()
  })

  it('lot 771 — « Changement de dirigeant enregistré » lu deux fois (jour / mois) fait UNE seule ligne', async () => {
    const { svc } = service({
      accounts: [
        {
          ...ACCOUNT_ROW,
          company_name: 'SEMA FRANCE',
          recent_signals: [
            { signal: 'Changement de dirigeant enregistré pour SEMA FRANCE', type: 'identite', date: '2026-05-12' },
          ],
          raw_analysis: {
            legal_signals: [{ label: 'Changement de dirigeant enregistré pour SEMA FRANCE', date: '2026-05' }],
          },
        },
      ],
    })
    const { lines } = (await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW }))!
    expect(lines.filter(line => line.title.startsWith('Changement de dirigeant'))).toHaveLength(1)
  })

  it('lineTypeOfKind range les natures connues et ne devine pas les autres', () => {
    expect(lineTypeOfKind('recrutement')).toBe('recrutement')
    expect(lineTypeOfKind('appel_offres')).toBe('marche_public')
    expect(lineTypeOfKind('legal')).toBe('annonce_legale')
    expect(lineTypeOfKind('nomination')).toBe('equipe')
    expect(lineTypeOfKind('affaire_perdue')).toBe('affaire')
    expect(lineTypeOfKind('projet')).toBe('projet')
    expect(lineTypeOfKind('levee_fonds')).toBe('projet')
    // Lot 767 — un type inconnu est un FAIT sur l'entreprise, jamais un besoin deviné.
    expect(lineTypeOfKind('presse')).toBe('fait')
    expect(lineTypeOfKind('identite_legale')).toBe('fait')
    expect(lineTypeOfKind(null)).toBe('fait')
  })

  it('un signal d’analyse de nature inconnue n’est un projet que s’il porte une implication commerciale', () => {
    const [bare, implied] = analysisCandidates(null, [
      { signal: 'La société est active, sous forme d’EURL', type: 'identite', date: '2025-11-27' },
      {
        signal: 'Migration ERP annoncée',
        type: 'presse',
        date: '2025-11-27',
        sales_implication: 'Besoin de renfort SAP',
      },
    ])
    expect(bare!.type).toBe('fait')
    expect(implied!.type).toBe('projet')
  })

  it('#5004.2 — une vision / déclaration stratégique ne fait aucune ligne, un vrai signal reste', () => {
    const keys = analysisCandidates(
      {
        recent_signals: [
          { type: 'vision', signal: 'Get your SaaS ready for AI', date: '2026-10-01' },
          { type: 'presse', signal: 'Levée de fonds de 40 M€', date: '2026-10-02' },
        ],
      },
      [{ type: 'strategie', signal: 'Notre ambition 2030', date: '2026-10-03' }],
    ).map(candidate => candidate.title)
    expect(keys).toEqual(['Levée de fonds de 40 M€'])
  })
})

/**
 * Lot 764 — L'HISTORIQUE DE TOUT L'ESPACE : la MÊME lecture que l'onglet d'un compte, pour tous les comptes
 * visibles, en un nombre de requêtes qui ne dépend PAS du nombre de comptes (jamais une boucle de N appels).
 */
describe('AccountSignalLinesService.forWorkspace — l’Historique de l’espace au niveau de l’onglet compte', () => {
  const B = '33333333-3333-4333-8333-333333333333'
  const EMPTY = '44444444-4444-4444-8444-444444444444'
  const accountRow = (id: string, company_name: string, over: Row = {}) => ({
    ...ACCOUNT_ROW,
    id,
    company_name,
    sector: 'Banque',
    logo_url: null,
    website: null,
    ...over,
  })
  const accountIdOf = (index: number) => `55555555-5555-4555-8555-${String(index).padStart(12, '0')}`

  /** Le compte A porte toutes les familles ; B n'a QUE du CRM et un projet clos ; EMPTY n'a rien de passé. */
  const SPACE: Tables = {
    ...ALL_FAMILIES,
    accounts: [
      { ...(ALL_FAMILIES.accounts![0] as Row), id: ACCOUNT, company_name: 'Société Générale', sector: 'Banque' },
      accountRow(B, 'Sanofi', { siren: null, sector: null }),
      accountRow(EMPTY, 'Compte muet', { siren: null }),
    ],
    crm_deal_facts: [
      ...(ALL_FAMILIES.crm_deal_facts ?? []),
      {
        account_id: B,
        provider: 'hubspot',
        deal_id: '99',
        name: 'Affaire quebec close',
        is_closed: true,
        is_won: true,
        closed_at: new Date('2025-02-01'),
        last_activity_at: null,
        deal_created_at: null,
      },
    ],
    opportunities: [
      ...(ALL_FAMILIES.opportunities ?? []),
      {
        account_id: B,
        id: 'p-b',
        label: 'Mission romeo perdue',
        stage: 'lost',
        kind: 'besoin',
        outcome: 'lost',
        closed_at: new Date('2024-05-01'),
        stage_entered_at: new Date('2024-05-01'),
        first_detected_at: new Date('2024-01-01'),
        detail: null,
        management: null,
      },
      {
        account_id: EMPTY,
        id: 'p-now',
        label: 'Projet sierra récent',
        stage: 'potential',
        kind: 'besoin',
        outcome: null,
        closed_at: null,
        stage_entered_at: new Date('2026-10-20'),
        first_detected_at: new Date('2026-10-20'),
        detail: null,
        management: null,
      },
    ],
  }

  it('chaque compte reçoit EXACTEMENT les lignes passées de son onglet, toutes familles ; un compte sans passé ne fait aucune ligne', async () => {
    const { svc } = service(SPACE)
    const result = workspaceSignalHistorySchema.parse(await svc.forWorkspace({ workspaceId: WS, now: NOW }))
    expect(result.accounts.map(account => account.company_name).sort()).toEqual(['Sanofi', 'Société Générale'])
    for (const id of [ACCOUNT, B]) {
      const tab = (await service(SPACE).svc.forAccount({ workspaceId: WS, accountId: id, now: NOW }))!
      const global = result.accounts.find(account => account.account_id === id)!
      expect(global.lines).toEqual(tab.lines.filter(line => line.period === 'past'))
    }
    const sanofi = result.accounts.find(account => account.account_id === B)!
    // Un compte qui n'a QUE du CRM et un projet clos apparaît (avant le lot 764 : absent).
    expect(sanofi.lines.map(line => line.title).sort()).toEqual(['Affaire quebec close', 'Mission romeo perdue'])
    expect(sanofi.sector).toBeNull()
    const sg = result.accounts.find(account => account.account_id === ACCOUNT)!
    expect(sg.lines.some(line => line.title === 'Besoin oscar historique')).toBe(true) // base commune
    expect(sg.lines.some(line => line.title === 'Affaire november miroir')).toBe(true) // miroir CRM
    expect(JSON.stringify(result)).not.toMatch(/hubspot|pipedrive|dataforge|SRC-1/i)
  })

  it('lot 769 — le siège du compte voyage avec lui (la zone quand la ligne n’en porte pas) ; absent = null', async () => {
    const { svc } = service({
      ...SPACE,
      accounts: [
        {
          ...(ALL_FAMILIES.accounts![0] as Row),
          id: ACCOUNT,
          company_name: 'Société Générale',
          headquarters: 'Lille (59)',
          address: '12 rue Nationale, 59000 Lille',
        },
        accountRow(B, 'Sanofi', { siren: null }),
      ],
    })
    const result = workspaceSignalHistorySchema.parse(await svc.forWorkspace({ workspaceId: WS, now: NOW }))
    expect(result.accounts.find(account => account.account_id === ACCOUNT)?.headquarters).toBe('Lille (59)')
    // Lot 772 — l'adresse du compte voyage aussi (dernier recours de la zone) ; absente = null.
    expect(result.accounts.find(account => account.account_id === ACCOUNT)?.address).toBe(
      '12 rue Nationale, 59000 Lille',
    )
    expect(result.accounts.find(account => account.account_id === B)?.address).toBeNull()
    expect(result.accounts.find(account => account.account_id === B)?.headquarters).toBeNull()
  })

  it('PERF : le nombre de requêtes est CONSTANT — 1 compte ou 60 comptes, même nombre, aucune requête par compte', async () => {
    const countFor = async (size: number) => {
      const accounts = Array.from({ length: size }, (_, index) =>
        accountRow(accountIdOf(index), `Compte ${index}`, { siren: String(552120000 + index) }),
      )
      const { svc, calls } = service({
        ...SPACE,
        accounts,
        dataforge_accounts: accounts.map(account => ({
          siren: account.siren,
          source_id: `S-${account.siren}`,
          cluster_id: null,
          is_cluster_primary: false,
        })),
        dataforge_needs: accounts.map(account => ({
          account_source_id: `S-${account.siren}`,
          id: `d-${account.siren}`,
          title: `Besoin passé ${account.siren}`,
          status: 'PERDU',
          need_date: '2023-01-01',
          tjm_eur: null,
          technologies: [],
          prescriber_name: null,
          prescriber_title: null,
          location: null,
        })),
      })
      const result = await svc.forWorkspace({ workspaceId: WS, now: NOW })
      return { calls, accounts: result.accounts.length }
    }
    const one = await countFor(1)
    const many = await countFor(60)
    expect(many.accounts).toBe(60)
    expect(many.calls).toHaveLength(one.calls.length)
    expect(one.calls.length).toBeLessThanOrEqual(9)
    for (const call of many.calls.filter(c => !/FROM accounts a/.test(c.sql) && !/FROM dataforge_/.test(c.sql))) {
      expect(call.sql).toMatch(/= ANY\(\$2::(uuid|text)\[\]\)/)
      expect(call.params[1]).toHaveLength(60)
    }
  })

  it('cloisonnement : l’espace sur chaque requête, le périmètre de business unit sur la lecture des comptes', async () => {
    const { svc, calls } = service(SPACE)
    await svc.forWorkspace({
      workspaceId: WS,
      businessUnitScope: { businessUnitIds: ['bu-1'], includeUnassigned: true },
      now: NOW,
    })
    const [first] = calls
    expect(first!.sql).toMatch(/a\.workspace_id = \$1/)
    expect(first!.sql).toMatch(
      /a\.business_unit_id IN \(SELECT unnest\(\$2::uuid\[\]\)\) OR a\.business_unit_id IS NULL/,
    )
    expect(first!.params).toEqual([WS, ['bu-1']])
    for (const call of calls.filter(c => !/dataforge_/.test(c.sql))) expect(call.sql).toMatch(/workspace_id = \$1/)
  })

  it('aucun compte visible ⇒ une seule lecture, et une liste vide', async () => {
    const { svc, calls } = service({ accounts: [] })
    const result = await svc.forWorkspace({ workspaceId: WS, businessUnitScope: null, now: NOW })
    expect(result).toEqual({ accounts: [] })
    expect(calls).toHaveLength(1)
  })

  describe('lot 785 (#5213) — l’Historique par PAGES de comptes', () => {
    const names = (r: { accounts: Array<{ company_name: string }> }) => r.accounts.map(a => a.company_name)

    it('limit/offset découpent les comptes qui ONT un passé ; le total est celui de la requête entière', async () => {
      const first = await service(SPACE).svc.forWorkspace({ workspaceId: WS, now: NOW, limit: 1, offset: 0 })
      const second = await service(SPACE).svc.forWorkspace({ workspaceId: WS, now: NOW, limit: 1, offset: 1 })
      const beyond = await service(SPACE).svc.forWorkspace({ workspaceId: WS, now: NOW, limit: 1, offset: 2 })
      expect(first.accounts).toHaveLength(1)
      expect(second.accounts).toHaveLength(1)
      expect([...names(first), ...names(second)].sort()).toEqual(['Sanofi', 'Société Générale'])
      // « Compte muet » n'a aucun passé : il ne fait ni ligne ni total.
      expect(first.page).toEqual({ total: 2, offset: 0, limit: 1 })
      expect(second.page).toEqual({ total: 2, offset: 1, limit: 1 })
      expect(beyond.accounts).toEqual([])
      expect(beyond.page).toEqual({ total: 2, offset: 2, limit: 1 })
    })

    it('la recherche est faite côté serveur : le total est celui des comptes qui CORRESPONDENT', async () => {
      const r = await service(SPACE).svc.forWorkspace({ workspaceId: WS, now: NOW, limit: 50, search: 'quebec' })
      expect(names(r)).toEqual(['Sanofi'])
      expect(r.page).toEqual({ total: 1, offset: 0, limit: 50 })
      const none = await service(SPACE).svc.forWorkspace({
        workspaceId: WS,
        now: NOW,
        limit: 50,
        search: 'zzzintrouvable',
      })
      expect(none.accounts).toEqual([])
      expect(none.page?.total).toBe(0)
    })

    it('les contacts ne sont lus QUE pour les comptes de la page', async () => {
      const { svc, builders } = service({ ...SPACE, contacts: [] })
      await svc.forWorkspace({ workspaceId: WS, now: NOW, limit: 1, offset: 0 })
      const conditions = builders[0]!.filter(call => call.method === 'where' || call.method === 'andWhere')
      const ids = conditions
        .map(call => call.args[1] as Record<string, unknown> | undefined)
        .find(p => p?.['accountIds'])!['accountIds'] as string[]
      // Deux comptes ont un passé, la page n'en rend qu'un : UN seul est demandé.
      expect(ids).toHaveLength(1)
    })

    it('sans limit : l’historique entier, sans `page` (appelants internes inchangés)', async () => {
      const r = await service(SPACE).svc.forWorkspace({ workspaceId: WS, now: NOW })
      expect(r.accounts).toHaveLength(2)
      expect(r.page).toBeUndefined()
    })
  })

  describe('lot 768 — les contacts proposables, en UNE requête', () => {
    const CONTACT = {
      account_id: ACCOUNT,
      id: 'c-1',
      full_name: 'Léa Martin',
      title: 'Directrice data',
      location: 'Lyon',
      email_verified: true,
      country: 'France',
      city: 'Lyon',
      organization: null,
    }

    it('chaque compte listé reçoit ses contacts : nom, poste, lieu, e-mail vérifié — jamais l’adresse', async () => {
      const { svc } = service({
        ...SPACE,
        contacts: [
          { ...CONTACT, email: 'lea@acme.fr', phone: '0102030405' },
          {
            ...CONTACT,
            account_id: B,
            id: 'c-2',
            full_name: 'Paul Roy',
            title: null,
            location: null,
            email_verified: false,
            country: null,
            city: null,
          },
        ],
      })
      const result = workspaceSignalHistorySchema.parse(await svc.forWorkspace({ workspaceId: WS, now: NOW }))
      const sg = result.accounts.find(account => account.account_id === ACCOUNT)!
      expect(sg.contacts).toEqual([
        {
          id: 'c-1',
          full_name: 'Léa Martin',
          title: 'Directrice data',
          location: 'Lyon',
          place: { country: 'France', city: 'Lyon', organization: null },
          email_verified: true,
        },
      ])
      const sanofi = result.accounts.find(account => account.account_id === B)!
      expect(sanofi.contacts).toEqual([
        { id: 'c-2', full_name: 'Paul Roy', title: null, location: null, place: null, email_verified: false },
      ])
      expect(JSON.stringify(result)).not.toMatch(/lea@acme|0102030405/)
    })

    it('UNE lecture de contacts pour tous les comptes listés (ContactEntity), cloisonnée par l’espace, sans écartés ni masqués', async () => {
      const { svc, calls, builders } = service({ ...SPACE, contacts: [CONTACT] })
      await svc.forWorkspace({ workspaceId: WS, now: NOW })
      // GA-405 : aucun SQL brut de plus sur `contacts`.
      expect(calls.some(call => /\b(from|join)\s+contacts\b/i.test(call.sql))).toBe(false)
      expect(builders).toHaveLength(1)
      const conditions = builders[0]!.filter(call => call.method === 'where' || call.method === 'andWhere')
      const sql = conditions.map(call => String(call.args[0])).join(' | ')
      expect(sql).toMatch(/c\.workspace_id = :workspaceId/)
      expect(sql).toMatch(/c\.account_id IN \(:\.\.\.accountIds\)/)
      expect(sql).toMatch(/c\.deleted_at IS NULL/)
      expect(sql).toMatch(/c\.hidden = false/)
      expect(sql).toMatch(/c\.excluded_at IS NULL/)
      const params = conditions.map(call => call.args[1] as Record<string, unknown> | undefined)
      expect(params.some(p => p?.['workspaceId'] === WS)).toBe(true)
      // Seuls les comptes LISTÉS (avec un passé) : le compte muet n'est pas demandé.
      const ids = params.find(p => p?.['accountIds'])!['accountIds'] as string[]
      expect(ids).toEqual(expect.arrayContaining([ACCOUNT, B]))
      expect(ids).not.toContain(EMPTY)
    })

    it('aucun contact connu ⇒ liste vide ; une lecture de contacts en panne n’efface pas l’Historique', async () => {
      const quiet = await service(SPACE).svc.forWorkspace({ workspaceId: WS, now: NOW })
      expect(quiet.accounts.every(account => (account.contacts ?? []).length === 0)).toBe(true)
      const { svc } = service({ ...SPACE, contacts: [CONTACT] }, /FROM contacts c/)
      const result = await svc.forWorkspace({ workspaceId: WS, now: NOW })
      expect(result.accounts.map(account => account.company_name).sort()).toEqual(['Sanofi', 'Société Générale'])
      expect(result.accounts.every(account => (account.contacts ?? []).length === 0)).toBe(true)
    })
  })

  describe('lot 776 — la base commune sans identité', () => {
    it('le nom du prescripteur ne sort JAMAIS d’une ligne de besoin (écran, API)', async () => {
      const { svc } = service(ALL_FAMILIES)
      const result = (await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW }))!
      expect(JSON.stringify(result)).not.toContain('Jeanne Martin')
    })

    it('une fiche marquée doublon ne rattache AUCUN besoin, et ses besoins ne sont même pas lus', async () => {
      const { svc, calls } = service({
        ...ALL_FAMILIES,
        dataforge_accounts: [{ source_id: 'SRC-1', cluster_id: null, is_cluster_primary: false, est_doublon: true }],
      })
      const result = (await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW }))!
      expect(result.lines.some(line => line.title === 'Besoin oscar historique')).toBe(false)
      expect(calls.some(call => /FROM dataforge_needs/.test(call.sql))).toBe(false)
    })

    it('une fiche qui n’est pas un doublon garde ses besoins', async () => {
      const { svc } = service({
        ...ALL_FAMILIES,
        dataforge_accounts: [{ source_id: 'SRC-1', cluster_id: null, is_cluster_primary: false, est_doublon: false }],
      })
      const result = (await svc.forAccount({ workspaceId: WS, accountId: ACCOUNT, now: NOW }))!
      expect(result.lines.some(line => line.title === 'Besoin oscar historique')).toBe(true)
    })
  })
})
