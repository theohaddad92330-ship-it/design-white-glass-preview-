import { describe, expect, it } from 'vitest'
import type { WorkspaceSignalHistory, WorkspaceSignalHistoryAccount } from '@bellum/contracts'
import type { WatchlistItem } from '@/features/watchlist/model/watchlist'
import { buildAccountHistory, historyItemsOf } from './account-history'
import { applyHistoryFilters, EMPTY_HISTORY_FILTERS, historyFacets } from './history-filters'

const NOW = Date.parse('2026-10-28T10:00:00Z')

const item = (over: Partial<WatchlistItem>): WatchlistItem => ({
  accountId: 'acc-1',
  companyName: 'Norauto',
  id: 'acc-1-signal-0',
  sector: 'Distribution',
  signalDate: '2026-07-20',
  signalLabel: 'Offre : Développeur Java',
  signalSource: 'Page carrières',
  sourceUrl: null,
  sourceKind: null,
  signalType: 'recrutement',
  score: 5,
  status: 'new',
  archived: true,
  firstDetectedAt: null,
  firstDetectionExact: false,
  lastSeenAt: null,
  changeCount: 0,
  resolved: false,
  resolvedAt: null,
  importance: null,
  triggeredActionLabel: null,
  lastVerifiedAt: null,
  temporalStatus: 'STALE',
  salesImplication: null,
  impact: null,
  logoUrl: null,
  website: null,
  ...over,
})

const attached = (skills: string[]): WatchlistItem['offerAttachment'] => ({
  status: 'attached',
  fact_type: 'hiring',
  skills,
  job_family: null,
  extract: null,
})

describe('buildAccountHistory — une ligne = un compte, seulement ce qui est passé', () => {
  it('range les besoins passés d’un compte en UNE ligne : offres, compétences, dernier besoin', () => {
    const rows = buildAccountHistory(
      [
        item({ id: 'a', signalDate: '2026-07-20', offerAttachment: attached(['Java', 'Spring']) }),
        item({ id: 'b', signalDate: '2026-03-02', offerAttachment: attached(['Java']) }),
        item({ id: 'c', signalDate: '2026-01-15', offerAttachment: attached(['Python']) }),
      ],
      NOW,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      accountId: 'acc-1',
      companyName: 'Norauto',
      offerCount: 3,
      skills: ['Java', 'Python', 'Spring'],
      lastNeedMs: Date.UTC(2026, 6, 20),
    })
    expect(rows[0]?.items.map(i => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('un signal actuel n’est pas de l’historique : le compte sans passé ne fait AUCUNE ligne', () => {
    expect(buildAccountHistory([item({ temporalStatus: 'RECENT', archived: false })], NOW)).toEqual([])
    expect(buildAccountHistory([], NOW)).toEqual([])
  })

  it('un fait passé qui n’est pas un besoin (cours de bourse) ne fait pas de ligne', () => {
    expect(
      buildAccountHistory([item({ signalType: 'presse', signalLabel: 'Le cours progresse de 2 %' })], NOW),
    ).toEqual([])
  })

  it('un compte sans offre passée ne dit pas « 0 offre » : offerCount vaut 0 et la ligne compte ses besoins', () => {
    const rows = buildAccountHistory(
      [item({ signalType: 'tender', signalLabel: 'Consultation MCO attribuée', temporalStatus: 'HISTORICAL' })],
      NOW,
    )
    expect(rows[0]).toMatchObject({ offerCount: 0, needCount: 1, skills: [] })
  })

  it('une date illisible ne devient pas une date : lastNeedMs est null', () => {
    const rows = buildAccountHistory([item({ signalDate: '' })], NOW)
    expect(rows[0]?.lastNeedMs).toBeNull()
  })

  it('classe les comptes du dernier besoin le plus récent au plus ancien, sans date en dernier', () => {
    const rows = buildAccountHistory(
      [
        item({ accountId: 'x', companyName: 'Xavier', id: 'x1', signalDate: '2025-02-01' }),
        item({ accountId: 'y', companyName: 'Yvon', id: 'y1', signalDate: '' }),
        item({ accountId: 'z', companyName: 'Zélie', id: 'z1', signalDate: '2026-06-01' }),
      ],
      NOW,
    )
    expect(rows.map(r => r.companyName)).toEqual(['Zélie', 'Xavier', 'Yvon'])
  })

  it('une compétence non classée n’est pas nommée', () => {
    const rows = buildAccountHistory(
      [
        item({
          offerAttachment: {
            status: 'unclassified',
            fact_type: null,
            skills: ['Java'],
            job_family: null,
            extract: null,
          },
        }),
      ],
      NOW,
    )
    expect(rows[0]?.skills).toEqual([])
  })
})

/**
 * Lot 764 — la page lit la MÊME lecture que l'onglet « Signaux et besoins » (`GET /accounts/signal-history`) :
 * toutes les familles, et les filtres de la page s'appliquent à ces lignes comme aux autres.
 */
describe('historyItemsOf — l’Historique de l’espace au niveau de l’onglet compte', () => {
  type Line = WorkspaceSignalHistoryAccount['lines'][number]
  const line = (over: Partial<Line> & Pick<Line, 'id' | 'type' | 'title' | 'date'>): Line => ({
    date_precision: 'day',
    period: 'past',
    detail: null,
    url: null,
    people_hints: { names: [], roles: [], location: null },
    ...over,
  })
  const HISTORY: WorkspaceSignalHistory = {
    accounts: [
      {
        account_id: 'sanofi',
        company_name: 'Sanofi',
        sector: 'Pharmacie',
        logo_url: null,
        website: 'sanofi.com',
        // Un compte qui n'a QUE du CRM et un projet clos : avant le lot 764, absent de la page.
        lines: [
          line({
            id: 'crm-deal:x',
            type: 'affaire',
            title: 'Refonte portail fournisseurs',
            date: '2025-02-01',
            outcome: 'won',
            url: 'https://app.crm-du-client.example/deal/9',
          }),
          line({
            id: 'project:p',
            type: 'besoin_passe',
            title: 'TMA SAP finance',
            date: '2024-05-01',
            date_precision: 'month',
            outcome: 'lost',
            technologies: ['SAP'],
            people_hints: { names: [], roles: [], location: 'Lyon (69)' },
          }),
        ],
      },
      {
        account_id: 'sg',
        company_name: 'Société Générale',
        sector: null,
        logo_url: null,
        website: null,
        lines: [
          line({
            id: 'job:1',
            type: 'recrutement',
            title: 'Développeur Java',
            date: '2026-03-02',
            technologies: ['Java'],
          }),
          line({
            id: 'shared-need:d1',
            type: 'besoin_passe',
            title: 'Migration Kafka',
            date: '2023',
            date_precision: 'year',
          }),
        ],
      },
    ],
  }

  it('lot 769 — la zone d’une ligne : son lieu, sinon le siège du compte ; sans l’un ni l’autre, aucune zone', () => {
    const history: WorkspaceSignalHistory = {
      accounts: [
        {
          account_id: 'lille',
          company_name: 'Lilloise SA',
          sector: null,
          logo_url: null,
          website: null,
          headquarters: 'Lille (59)',
          lines: [
            line({ id: 'a', type: 'recrutement', title: 'Dev Java H/F', date: '2026-03-02' }),
            line({
              id: 'b',
              type: 'recrutement',
              title: 'Dev Java H/F',
              date: '2026-03-03',
              people_hints: { names: [], roles: [], location: 'Lyon (69)' },
            }),
          ],
        },
        {
          account_id: 'inconnu',
          company_name: 'Sans siège',
          sector: null,
          logo_url: null,
          website: null,
          headquarters: null,
          lines: [line({ id: 'c', type: 'recrutement', title: 'Dev Java H/F', date: '2026-03-02' })],
        },
      ],
    }
    expect(historyItemsOf(history).map(entry => [entry.id, entry.location ?? null])).toEqual([
      ['lille:a', 'Lille (59)'],
      ['lille:b', 'Lyon (69)'],
      ['inconnu:c', null],
    ])
  })

  it('chaque ligne passée devient un besoin de son compte — TOUTES familles comptées, offres à part', () => {
    const rows = buildAccountHistory(historyItemsOf(HISTORY), NOW)
    expect(rows.map(row => [row.companyName, row.needCount, row.offerCount])).toEqual([
      ['Société Générale', 2, 1],
      ['Sanofi', 2, 0],
    ])
    const sanofi = rows.find(row => row.accountId === 'sanofi')!
    expect(sanofi.items.map(item => item.signalLabel)).toEqual(['Refonte portail fournisseurs', 'TMA SAP finance'])
    // La date garde la précision que la source porte : un mois reste un mois, jamais un « 1er » inventé.
    expect(sanofi.items[1]!.signalDate).toBe('2024-05')
    expect(sanofi.items[0]!.website).toBe('sanofi.com')
  })

  it('les filtres existants mordent sur ces lignes : techno, zone, secteur, source, période', () => {
    const items = historyItemsOf(HISTORY)
    const only = (filters: Partial<typeof EMPTY_HISTORY_FILTERS>) =>
      applyHistoryFilters(items, { ...EMPTY_HISTORY_FILTERS, ...filters }, NOW).rows.map(row => row.companyName)
    expect(only({ tech: 'SAP' })).toEqual(['Sanofi'])
    expect(only({ tech: 'Java' })).toEqual(['Société Générale'])
    expect(only({ zone: '84' })).toEqual(['Sanofi']) // Lyon (69) → Auvergne-Rhône-Alpes
    expect(only({ sector: 'Pharmacie' })).toEqual(['Sanofi'])
    expect(only({ source: 'app.crm-du-client.example' })).toEqual(['Sanofi'])
    expect(only({ period: 'over24m' }).sort()).toEqual(['Sanofi', 'Société Générale'])
    const facets = historyFacets(items)
    // Lot 769 — « Migration Kafka » : la techno que l'intitulé nomme est proposée aussi.
    expect(facets.techs.map(facet => facet.value).sort()).toEqual(['Java', 'Kafka', 'SAP'])
    // Une ligne sans lien ne propose aucune source : rien ne nomme d'où vient la base commune.
    expect(facets.sources.map(facet => facet.value)).toEqual(['app.crm-du-client.example'])
    expect(facets.sectors.map(facet => facet.value)).toEqual(['Pharmacie'])
  })

  it('#5185 — « java » trouve une techno des compétences ou du détail', () => {
    const base = {
      date_precision: 'day' as const,
      period: 'past' as const,
      url: null,
      people_hints: { names: [], roles: [], location: null },
    }
    const history: WorkspaceSignalHistory = {
      accounts: [
        {
          account_id: 'a1',
          company_name: 'Alpha',
          sector: null,
          logo_url: null,
          website: null,
          lines: [
            {
              ...base,
              id: 'k',
              type: 'recrutement',
              title: 'Ingénieur logiciel H/F',
              date: '2024-03-02',
              detail: null,
              technologies: ['Java', 'Spring'],
            },
          ],
        },
        {
          account_id: 'a2',
          company_name: 'Beta',
          sector: null,
          logo_url: null,
          website: null,
          lines: [
            {
              ...base,
              id: 'k',
              type: 'recrutement',
              title: 'Ingénieur logiciel H/F',
              date: '2024-03-02',
              detail: 'Stack Java 17',
            },
          ],
        },
        {
          account_id: 'a3',
          company_name: 'Gamma',
          sector: null,
          logo_url: null,
          website: null,
          lines: [
            {
              ...base,
              id: 'k',
              type: 'recrutement',
              title: 'Ingénieur logiciel H/F',
              date: '2024-03-02',
              detail: 'Stack JavaScript',
              technologies: ['JavaScript'],
            },
          ],
        },
      ],
    }
    const found = applyHistoryFilters(historyItemsOf(history), { ...EMPTY_HISTORY_FILTERS, query: 'java' }, NOW)
    // Ni la techno des compétences ni le détail ne sont aveugles ; les compétences (mot entier) passent en tête.
    const names = found.rows.map(row => row.companyName)
    expect(names).toEqual(expect.arrayContaining(['Alpha', 'Beta']))
    expect(names[0]).toBe('Alpha')
  })

  it('aucun compte, aucune ligne', () => {
    expect(buildAccountHistory(historyItemsOf({ accounts: [] }), NOW)).toEqual([])
  })
})

describe('buildAccountHistory — #5191 les recrutements d’abord, par défaut', () => {
  const line = (id: string, type: 'recrutement' | 'projet', date: string) => ({
    id,
    date,
    date_precision: 'day' as const,
    period: 'past' as const,
    type,
    title: `Besoin ${id}`,
    detail: null,
    url: null,
    people_hints: { names: [], roles: [], location: null },
  })
  const history = (accounts: Array<{ id: string; name: string; lines: ReturnType<typeof line>[] }>) =>
    historyItemsOf({
      accounts: accounts.map(account => ({
        account_id: account.id,
        company_name: account.name,
        sector: null,
        logo_url: null,
        website: null,
        headquarters: null,
        address: null,
        lines: account.lines,
      })),
    } as unknown as Parameters<typeof historyItemsOf>[0])

  it('dans un compte, l’offre précède un projet pourtant plus récent ; les deux restent affichés', () => {
    const [row] = buildAccountHistory(
      history([
        { id: 'a', name: 'Alpha', lines: [line('p', 'projet', '2026-07-01'), line('o', 'recrutement', '2026-03-01')] },
      ]),
      NOW,
    )
    expect(row?.items.map(entry => entry.signalLine?.id)).toEqual(['o', 'p'])
  })

  it('les comptes à offres passent avant les autres, puis la date', () => {
    const rows = buildAccountHistory(
      history([
        { id: 'a', name: 'Alpha', lines: [line('p', 'projet', '2026-07-01')] },
        { id: 'b', name: 'Beta', lines: [line('o', 'recrutement', '2026-02-01')] },
      ]),
      NOW,
    )
    expect(rows.map(row => row.companyName)).toEqual(['Beta', 'Alpha'])
  })
})

describe('lot 790 (#5212/E) — « Decathlon » et « DECATHLON » ne font qu’UNE ligne', () => {
  it('regroupe par nom normalisé (casse, accents, espaces) et cumule les besoins sous le libellé le plus fréquent', () => {
    const rows = buildAccountHistory(
      [
        item({ accountId: 'a1', companyName: 'Decathlon', id: 'a1-0', signalLabel: 'Offre : Java' }),
        item({ accountId: 'a2', companyName: 'DECATHLON', id: 'a2-0', signalLabel: 'Offre : Go' }),
        item({ accountId: 'a2', companyName: 'DECATHLON', id: 'a2-1', signalLabel: 'Offre : Rust' }),
        item({ accountId: 'a3', companyName: ' Décathlon  ', id: 'a3-0', signalLabel: 'Offre : Vue' }),
        item({ accountId: 'b1', companyName: 'Norauto', id: 'b1-0' }),
      ],
      NOW,
    )
    expect(rows).toHaveLength(2)
    const deca = rows.find(r => r.companyName === 'DECATHLON')!
    expect(deca).toBeDefined()
    expect(deca.items).toHaveLength(4)
    expect(deca.offerCount).toBe(4)
  })

  it('deux entreprises au nom différent restent deux lignes', () => {
    const rows = buildAccountHistory(
      [
        item({ accountId: 'a1', companyName: 'Leroy Merlin', id: 'a1-0' }),
        item({ accountId: 'a2', companyName: 'Leroy', id: 'a2-0' }),
      ],
      NOW,
    )
    expect(rows).toHaveLength(2)
  })
})
