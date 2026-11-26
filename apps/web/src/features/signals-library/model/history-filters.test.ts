import { describe, expect, it } from 'vitest'
import type { WatchlistItem } from '@/features/watchlist/model/watchlist'
import {
  EMPTY_HISTORY_FILTERS,
  FRANCE_ZONE,
  HISTORY_PERIODS,
  applyHistoryFilters,
  historyFacets,
  type HistoryFilters,
} from './history-filters'

const NOW = Date.parse('2026-10-28T10:00:00Z')

const item = (over: Partial<WatchlistItem>): WatchlistItem => ({
  accountId: 'acc-1',
  companyName: 'Norauto',
  id: 'a',
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

const ITEMS: WatchlistItem[] = [
  item({
    id: 'j-lille',
    accountId: 'A',
    companyName: 'Alpha',
    location: 'Lille (59)',
    offerAttachment: attached(['Java']),
    signalDate: '2026-08-01',
  }),
  item({
    id: 'j-lille-2',
    accountId: 'A',
    companyName: 'Alpha',
    location: 'Lille',
    offerAttachment: attached(['Java', 'Spring']),
    signalDate: '2026-02-10',
  }),
  item({
    id: 'p-lille',
    accountId: 'A',
    companyName: 'Alpha',
    signalLabel: 'Offre : Data analyst',
    location: 'Lille',
    offerAttachment: attached(['Python']),
    signalDate: '2025-01-05',
  }),
  item({
    id: 'j-paris',
    accountId: 'B',
    companyName: 'Beta',
    location: 'Paris (75)',
    offerAttachment: attached(['Java']),
    signalDate: '2026-06-01',
  }),
  item({
    id: 'sap-lyon',
    accountId: 'C',
    companyName: 'Gamma',
    signalLabel: 'Offre : Consultant SAP FI',
    location: 'Lyon',
    offerAttachment: attached([]),
    signalDate: '2024-03-01',
  }),
  item({
    id: 'undated',
    accountId: 'D',
    companyName: 'Delta',
    signalLabel: 'Offre : Dev Java sans date',
    signalDate: 'date inconnue',
    offerAttachment: attached(['Java']),
  }),
]

const run = (over: Partial<HistoryFilters>) => applyHistoryFilters(ITEMS, { ...EMPTY_HISTORY_FILTERS, ...over }, NOW)
const ids = (r: ReturnType<typeof run>) => r.rows.flatMap(row => row.items.map(i => i.id)).sort()

describe('filtres de l’historique — chaque axe prouvé par DEUX valeurs et UN cas vide', () => {
  it('sans filtre : tout le passé, aucune perte', () => {
    expect(run({}).rows).toHaveLength(4)
  })

  it('techno : Java ≠ Python, et une techno inconnue rend l’état vide', () => {
    expect(ids(run({ tech: 'Java' }))).toEqual(['j-lille', 'j-lille-2', 'j-paris', 'undated'])
    expect(ids(run({ tech: 'Python' }))).toEqual(['p-lille'])
    expect(run({ tech: 'Cobol' }).rows).toEqual([])
  })

  it('techno : lue aussi dans l’intitulé quand la collecte n’a posé aucune compétence', () => {
    expect(ids(run({ tech: 'SAP' }))).toEqual(['sap-lyon'])
  })

  it('zone : Hauts-de-France ≠ Île-de-France, et une région sans offre rend l’état vide', () => {
    expect(ids(run({ zone: '32' }))).toEqual(['j-lille', 'j-lille-2', 'p-lille'])
    expect(ids(run({ zone: '11' }))).toEqual(['j-paris'])
    expect(run({ zone: '53' }).rows).toEqual([])
  })

  it('zone : « France » est un palier explicite — toute offre située, pas celle sans lieu', () => {
    expect(ids(run({ zone: FRANCE_ZONE }))).toEqual(['j-lille', 'j-lille-2', 'j-paris', 'p-lille', 'sap-lyon'])
  })

  it('période : chaque tranche rend des offres différentes, et une tranche vide rend l’état vide', () => {
    expect(ids(run({ period: 'under6m' }))).toEqual(['j-lille', 'j-paris'])
    expect(ids(run({ period: '6to12m' }))).toEqual(['j-lille-2'])
    expect(ids(run({ period: '12to24m' }))).toEqual(['p-lille'])
    expect(ids(run({ period: 'over24m' }))).toEqual(['sap-lyon'])
    expect(HISTORY_PERIODS).toHaveLength(4)
    expect(applyHistoryFilters([ITEMS[0]!], { ...EMPTY_HISTORY_FILTERS, period: 'over24m' }, NOW).rows).toEqual([])
  })

  it('période : une offre sans date n’entre dans AUCUNE tranche — elle se compte à part', () => {
    for (const period of HISTORY_PERIODS) expect(ids(run({ period }))).not.toContain('undated')
    expect(run({ period: 'under6m' }).undatedExcluded).toBe(1)
    expect(run({}).undatedExcluded).toBe(0)
  })

  it('#4815 — un signal COURANT sans date n’est pas un besoin passé : il ne se compte pas', () => {
    const current = item({
      id: 'cur',
      accountId: 'E',
      companyName: 'Eps',
      signalDate: 'date inconnue',
      temporalStatus: 'RECENT',
    })
    const dated = ITEMS.filter(i => i.id !== 'undated')
    const result = applyHistoryFilters([...dated, current], { ...EMPTY_HISTORY_FILTERS, period: 'under6m' }, NOW)
    expect(result.undatedExcluded).toBe(0)
  })

  it('volume : au moins 1 ≠ au moins 3, et un palier inatteignable rend l’état vide', () => {
    expect(run({ minVolume: 1 }).rows).toHaveLength(4)
    expect(run({ minVolume: 3 }).rows.map(r => r.companyName)).toEqual(['Alpha'])
    expect(run({ minVolume: 5 }).rows).toEqual([])
  })

  it('texte : l’intitulé se cherche sans accent ni casse ; un mot absent rend l’état vide', () => {
    // Lot 768 — le COMPTE correspond par son meilleur besoin ; dans son dépli, les besoins qui correspondent
    // passent en tête et les autres suivent (ils ne disparaissent pas).
    const dev = run({ query: 'developpeur' })
    expect(dev.rows.map(row => row.companyName)).toEqual(['Alpha', 'Beta'])
    expect(dev.rows[0]!.items.map(i => i.id)).toEqual(['j-lille', 'j-lille-2', 'p-lille'])
    expect(dev.matchNeeds).toBe(3)
    const analyst = run({ query: 'ANALYST' })
    expect(analyst.rows.map(row => row.companyName)).toEqual(['Alpha'])
    expect(analyst.rows[0]!.items[0]!.id).toBe('p-lille')
    expect(analyst.matchNeeds).toBe(1)
    expect(run({ query: 'zzz' }).rows).toEqual([])
  })

  it('lot 768 — « power bi » trouve PowerBI et Power-BI ; « po » trouve Product Owner (variantes métier)', () => {
    const pool = [
      item({ id: 'pbi', accountId: 'P', companyName: 'Pbi SA', signalLabel: 'Consultant PowerBI senior' }),
      item({ id: 'pbi2', accountId: 'Q', companyName: 'Tiret SA', signalLabel: 'Développeur Power-BI' }),
      item({ id: 'po', accountId: 'R', companyName: 'Owner SA', signalLabel: 'Product Owner data' }),
      item({ id: 'x', accountId: 'S', companyName: 'Autre SA', signalLabel: 'Chauffeur au port' }),
    ]
    const run2 = (query: string) => applyHistoryFilters(pool, { ...EMPTY_HISTORY_FILTERS, query }, NOW)
    expect(
      run2('power bi')
        .rows.map(row => row.companyName)
        .sort(),
    ).toEqual(['Pbi SA', 'Tiret SA'])
    expect(run2('po').rows.map(row => row.companyName)).toEqual(['Owner SA'])
  })

  it('lot 768 — les comptes remontent par leur MEILLEUR besoin : le titre passe devant le détail', () => {
    const pool = [
      item({
        id: 'detail',
        accountId: 'D',
        companyName: 'Detail SA',
        signalLabel: 'Consultant reporting',
        salesImplication: 'Refonte des tableaux de bord Power BI',
        signalDate: '2026-10-20',
      }),
      item({
        id: 'title',
        accountId: 'T',
        companyName: 'Title SA',
        signalLabel: 'Consultant Power BI',
        signalDate: '2026-01-05',
      }),
    ]
    const result = applyHistoryFilters(pool, { ...EMPTY_HISTORY_FILTERS, query: 'power bi' }, NOW)
    // Le plus récent est « Detail SA », mais le titre pèse plus : « Title SA » d'abord.
    expect(result.rows.map(row => row.companyName)).toEqual(['Title SA', 'Detail SA'])
    // Sans requête (ou en tri « Récents »), l'ordre par date revient.
    const recent = applyHistoryFilters(pool, { ...EMPTY_HISTORY_FILTERS, query: 'power bi', sort: 'recent' }, NOW)
    expect(recent.rows.map(row => row.companyName)).toEqual(['Detail SA', 'Title SA'])
    expect(applyHistoryFilters(pool, { ...EMPTY_HISTORY_FILTERS, sort: 'relevance' }, NOW).rows[0]!.companyName).toBe(
      'Detail SA',
    )
  })

  it('lot 768 — le volume compte les besoins qui CORRESPONDENT', () => {
    const query = { ...EMPTY_HISTORY_FILTERS, query: 'java', minVolume: 3 as const }
    expect(applyHistoryFilters(ITEMS, query, NOW).rows).toEqual([])
    expect(applyHistoryFilters(ITEMS, { ...query, minVolume: 1 }, NOW).matchNeeds).toBeGreaterThan(0)
  })

  it('les axes se COMBINENT : « Java à Lille » ne rend ni Java à Paris ni Python à Lille', () => {
    expect(ids(run({ tech: 'Java', zone: '32' }))).toEqual(['j-lille', 'j-lille-2'])
    expect(ids(run({ tech: 'Java', zone: '32', period: 'under6m' }))).toEqual(['j-lille'])
    expect(run({ tech: 'Java', zone: '32', minVolume: 3 }).rows).toEqual([])
    expect(run({ tech: 'Java', zone: '53' }).rows).toEqual([])
  })

  it('le compte de résultats est celui des lignes rendues', () => {
    const result = run({ tech: 'Java', zone: '32' })
    expect(result.rows).toHaveLength(1)
    expect(result.needCount).toBe(2)
  })
})

describe('autres axes livrés — famille de métier, secteur, source : deux valeurs et un cas vide chacun', () => {
  const MORE: WatchlistItem[] = [
    item({
      id: 'f1',
      accountId: 'E',
      companyName: 'Epsilon',
      sector: 'Banque',
      sourceUrl: 'https://www.francetravail.fr/o/1',
      offerAttachment: { status: 'attached', fact_type: 'hiring', skills: [], job_family: 'data_ia', extract: null },
    }),
    item({
      id: 'f2',
      accountId: 'F',
      companyName: 'Zeta',
      sector: 'Transport',
      sourceUrl: 'https://apec.fr/o/2',
      offerAttachment: {
        status: 'attached',
        fact_type: 'hiring',
        skills: [],
        job_family: 'developpement',
        extract: null,
      },
    }),
    item({
      id: 'f3',
      accountId: 'G',
      companyName: 'Eta',
      sector: 'Secteur non renseigné',
      offerAttachment: attached([]),
    }),
  ]
  const go = (over: Partial<HistoryFilters>) =>
    ids(applyHistoryFilters(MORE, { ...EMPTY_HISTORY_FILTERS, ...over }, NOW))

  it('famille : data_ia ≠ developpement, une famille absente rend l’état vide', () => {
    expect(go({ family: 'data_ia' })).toEqual(['f1'])
    expect(go({ family: 'developpement' })).toEqual(['f2'])
    expect(go({ family: 'cybersecurite' })).toEqual([])
  })

  it('secteur : Banque ≠ Transport, un secteur absent rend l’état vide ; « non renseigné » n’est pas un secteur', () => {
    expect(go({ sector: 'Banque' })).toEqual(['f1'])
    expect(go({ sector: 'Transport' })).toEqual(['f2'])
    expect(go({ sector: 'Énergie' })).toEqual([])
    expect(historyFacets(MORE).sectors.map(s => s.value)).not.toContain('Secteur non renseigné')
  })

  it('source : francetravail.fr ≠ apec.fr, un site absent rend l’état vide', () => {
    expect(go({ source: 'francetravail.fr' })).toEqual(['f1'])
    expect(go({ source: 'apec.fr' })).toEqual(['f2'])
    expect(go({ source: 'indeed.com' })).toEqual([])
  })

  it('les facettes ne proposent que le vocabulaire connu : un code de famille inconnu ne s’affiche pas', () => {
    const odd = item({
      id: 'o',
      offerAttachment: {
        status: 'attached',
        fact_type: 'hiring',
        skills: [],
        job_family: 'inconnue_xyz',
        extract: null,
      },
    })
    expect(historyFacets([odd]).families).toEqual([])
    expect(
      historyFacets(MORE)
        .families.map(f => f.value)
        .sort(),
    ).toEqual(['data_ia', 'developpement'])
  })
})

describe('facettes — seulement ce que la donnée porte', () => {
  it('les technos et les régions viennent des besoins passés, avec leur effectif ; rien d’inventé', () => {
    const facets = historyFacets(ITEMS)
    expect(facets.techs[0]).toEqual({ value: 'Java', count: 4 })
    expect(facets.techs.map(t => t.value)).toContain('Python')
    expect(facets.zones).toEqual([
      { value: '32', count: 3 },
      { value: '11', count: 1 },
      { value: '84', count: 1 },
    ])
  })

  it('lot 769 — Technos : la facette lit aussi l’intitulé (mot entier) ; « Java » ne prend pas JavaScript ; croisée avec la zone', () => {
    const items = [
      item({
        id: 't1',
        accountId: 'A',
        companyName: 'Alpha',
        signalLabel: 'Développeur Java senior H/F',
        location: 'Lille',
      }),
      item({
        id: 't2',
        accountId: 'B',
        companyName: 'Beta',
        signalLabel: 'Développeur JavaScript React H/F',
        location: 'Lille',
      }),
      item({ id: 't3', accountId: 'C', companyName: 'Gamma', signalLabel: 'Consultant Java H/F', location: 'Paris' }),
      item({
        id: 't4',
        accountId: 'D',
        companyName: 'Delta',
        signalLabel: 'Responsable des achats',
        location: 'Lille',
      }),
    ]
    const techs = historyFacets(items).techs
    expect(techs).toEqual([
      { value: 'Java', count: 2 },
      { value: 'JavaScript', count: 1 },
      { value: 'React', count: 1 },
    ])
    const run = (patch: Partial<HistoryFilters>) =>
      applyHistoryFilters(items, { ...EMPTY_HISTORY_FILTERS, ...patch }, NOW).rows.map(row => row.companyName)
    expect(run({ tech: 'Java' })).toEqual(['Alpha', 'Gamma'])
    expect(run({ tech: 'Java', zone: '32' })).toEqual(['Alpha'])
    expect(run({ tech: 'Java', zone: '32', period: 'under6m' })).toEqual(['Alpha'])
  })
})
