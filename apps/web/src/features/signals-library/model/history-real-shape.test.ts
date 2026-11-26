import { beforeAll, describe, expect, it } from 'vitest'
import type { WorkspaceSignalHistory } from '@bellum/contracts'
import { historyItemsOf } from './account-history'
import { EMPTY_HISTORY_FILTERS, applyHistoryFilters, historyFacets } from './history-filters'
import { loadPlaceRegions } from '@/lib/zones/place-region'

const NOW = Date.parse('2026-11-01T10:00:00Z')

const line = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id,
  title,
  date: '2026-06-10',
  date_precision: 'day' as const,
  period: 'past' as const,
  type: 'recrutement' as const,
  detail: null,
  url: null,
  people_hints: { names: [], roles: [], location: null },
  ...over,
})

const HISTORY = {
  accounts: [
    {
      account_id: 'a1',
      company_name: 'Viveris',
      sector: 'Conseil',
      logo_url: null,
      website: null,
      headquarters: null,
      lines: [
        line('l1', 'Une offre de Product Owner a été publiée à Paris.'),
        line(
          'l2',
          'Viveris publie une offre CDI de Développeur Java senior pour le secteur bancaire à Villeurbanne/Lyon.',
        ),
        line('l3', 'Offre de data analyst', { detail: 'Reporting sous PowerBI et SQL.', technologies: ['Power BI'] }),
        line('l4', 'Offre de data analyst', { detail: null, technologies: ['Microsoft Power-BI'] }),
      ],
    },
  ],
} as unknown as WorkspaceSignalHistory

const found = (query: string) =>
  applyHistoryFilters(historyItemsOf(HISTORY), { ...EMPTY_HISTORY_FILTERS, query }, NOW).matchNeeds

describe('lot 772 (b) — la recherche sur la forme réelle des lignes de l’Historique', () => {
  it.each([
    ['po', 1],
    ['java', 1],
    ['power bi', 2],
    ['product', 1],
  ])('« %s » trouve %i besoin(s)', (query, expected) => {
    expect(found(query)).toBe(expected)
  })
})

describe('lot 772 c) — la zone d’un besoin passé : lieu de la ligne, puis lieu de l’intitulé, puis siège du compte', () => {
  beforeAll(async () => {
    await loadPlaceRegions()
  })

  const history = {
    accounts: [
      {
        account_id: 'lille',
        company_name: 'Alpha',
        sector: null,
        logo_url: null,
        website: null,
        headquarters: 'Lille',
        lines: [line('z1', 'Une offre de Data Engineer a été publiée.')],
      },
      {
        account_id: 'lyon',
        company_name: 'Viveris',
        sector: null,
        logo_url: null,
        website: null,
        headquarters: 'Paris',
        lines: [
          line(
            'z2',
            'Viveris publie une offre CDI de Développeur Java senior pour le secteur bancaire à Villeurbanne/Lyon.',
          ),
        ],
      },
      {
        account_id: 'adresse',
        company_name: 'Gamma',
        sector: null,
        logo_url: null,
        website: null,
        headquarters: null,
        address: '12 rue de la République, 13001 Marseille',
        lines: [line('z3', 'Une offre de DevOps a été publiée.')],
      },
      {
        account_id: 'inconnu',
        company_name: 'Delta',
        sector: null,
        logo_url: null,
        website: null,
        headquarters: null,
        lines: [line('z4', 'Une offre de DevOps a été publiée.')],
      },
    ],
  } as unknown as WorkspaceSignalHistory

  const accountsIn = (zone: string) =>
    applyHistoryFilters(historyItemsOf(history), { ...EMPTY_HISTORY_FILTERS, zone }, NOW).rows.map(row => row.accountId)

  it('un compte au siège lillois → Hauts-de-France ; « à Villeurbanne/Lyon » → Auvergne-Rhône-Alpes (avant le siège parisien)', () => {
    expect(accountsIn('32')).toEqual(['lille'])
    expect(accountsIn('84')).toEqual(['lyon'])
    expect(accountsIn('93')).toEqual(['adresse'])
    expect(accountsIn('11')).toEqual([])
  })

  it('un besoin sans aucun lieu lisible n’est dans aucune zone (jamais deviné) et les facettes ne le comptent pas', () => {
    const zones = historyFacets(historyItemsOf(history)).zones
    expect(Object.fromEntries(zones.map(zone => [zone.value, zone.count]))).toEqual({ '32': 1, '84': 1, '93': 1 })
  })
})
