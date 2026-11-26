import { describe, expect, it } from 'vitest'
import { signalStateKey, type SignalUserState } from '@bellum/contracts'
import type { WatchlistItem } from '@/features/watchlist/model/watchlist'
import {
  buildSignalLibrary,
  natureOfSignal,
  sourceKindOf,
  sourceSiteOf,
  stateKeyOf,
  type LibraryFilters,
} from './signal-library'

const item = (over: Partial<WatchlistItem>): WatchlistItem => ({
  accountId: 'acc-1',
  companyName: 'SNCF',
  id: 'acc-1-signal-0',
  sector: 'Transport',
  signalDate: '2026-10-15',
  signalLabel: 'Projet data annoncé',
  signalSource: 'Communiqué',
  sourceUrl: null,
  sourceKind: null,
  signalType: 'Projet',
  score: 8,
  status: 'new',
  archived: false,
  firstDetectedAt: null,
  firstDetectionExact: false,
  lastSeenAt: null,
  changeCount: 0,
  resolved: false,
  resolvedAt: null,
  importance: null,
  triggeredActionLabel: null,
  lastVerifiedAt: null,
  temporalStatus: null,
  salesImplication: null,
  impact: null,
  logoUrl: null,
  website: null,
  ...over,
})

const NO_FILTERS: LibraryFilters = { tab: 'all', accountIds: new Set(), natures: new Set(), sinceDays: null }
const NOW = Date.parse('2026-10-22T10:00:00Z')

describe('stateKeyOf — le fait désigne le signal, pas son rang dans le flux', () => {
  it('est la clé du contrat appliquée au libellé', () => {
    expect(stateKeyOf(item({ signalLabel: ' Projet  DATA annoncé ' }))).toBe(signalStateKey('Projet data annoncé'))
  })
})

describe('natureOfSignal — dix natures, jamais une nature devinée', () => {
  it('une offre est un recrutement', () => {
    expect(natureOfSignal(item({ signalType: 'hiring', signalLabel: 'Recrute 12 ingénieurs data' }))).toBe('hiring')
  })

  it('un appel d’offres est un appel d’offres', () => {
    expect(natureOfSignal(item({ signalType: 'tender', signalLabel: 'Consultation MCO' }))).toBe('tender')
  })

  it('un type que rien ne classe n’affiche aucune nature', () => {
    expect(natureOfSignal(item({ signalType: 'divers', signalLabel: 'Quelque chose' }))).toBeNull()
  })
})

describe('sourceSiteOf — le site de l’éditeur, jamais inventé', () => {
  it('donne l’hôte de l’URL, sans www', () => {
    expect(sourceSiteOf('https://www.lesechos.fr/tech/article-1')).toBe('lesechos.fr')
  })

  it('rien sans URL exploitable', () => {
    expect(sourceSiteOf(null)).toBeNull()
    expect(sourceSiteOf('pas une url')).toBeNull()
    expect(sourceSiteOf('javascript:alert(1)')).toBeNull()
  })
})

describe('buildSignalLibrary — onglets, filtres, pagination', () => {
  const items = [
    item({ id: 'a', accountId: 'acc-1', signalLabel: 'Fait A', signalDate: '2026-10-20' }),
    item({ id: 'b', accountId: 'acc-2', companyName: 'Orange', signalLabel: 'Fait B', signalDate: '2026-09-01' }),
    item({ id: 'c', accountId: 'acc-1', signalLabel: 'Fait C', signalDate: '2026-10-21', signalType: 'hiring' }),
  ]
  const states = (entries: Array<[string, string, SignalUserState]>) =>
    new Map(entries.map(([accountId, label, state]) => [`${accountId}|${signalStateKey(label)}`, state]))

  it('« Tous » montre ce qui n’a aucun état, du plus récent au plus ancien', () => {
    const view = buildSignalLibrary(items, new Map(), NO_FILTERS, { now: NOW, visible: 12 })
    expect(view.rows.map(row => row.item.id)).toEqual(['c', 'a', 'b'])
    expect(view.total).toBe(3)
  })

  it('un signal enregistré reste dans « Tous » ET dans « Enregistrés » ; un écarté n’est que dans « Écartés »', () => {
    const map = states([
      ['acc-1', 'Fait A', 'saved'],
      ['acc-2', 'Fait B', 'discarded'],
    ])
    const all = buildSignalLibrary(items, map, NO_FILTERS, { now: NOW, visible: 12 })
    expect(all.rows.map(row => row.item.id)).toEqual(['c', 'a'])
    expect(all.counts).toEqual({ all: 2, saved: 1, discarded: 1, trashed: 0 })
    const saved = buildSignalLibrary(items, map, { ...NO_FILTERS, tab: 'saved' }, { now: NOW, visible: 12 })
    expect(saved.rows.map(row => row.item.id)).toEqual(['a'])
    const discarded = buildSignalLibrary(items, map, { ...NO_FILTERS, tab: 'discarded' }, { now: NOW, visible: 12 })
    expect(discarded.rows.map(row => row.item.id)).toEqual(['b'])
  })

  it('la corbeille se lit, rien n’est supprimé', () => {
    const map = states([['acc-1', 'Fait C', 'trashed']])
    const trash = buildSignalLibrary(items, map, { ...NO_FILTERS, tab: 'trashed' }, { now: NOW, visible: 12 })
    expect(trash.rows.map(row => row.item.id)).toEqual(['c'])
  })

  it('filtre par compte, par nature et par date du fait', () => {
    const byAccount = buildSignalLibrary(
      items,
      new Map(),
      { ...NO_FILTERS, accountIds: new Set(['acc-2']) },
      { now: NOW, visible: 12 },
    )
    expect(byAccount.rows.map(row => row.item.id)).toEqual(['b'])
    const byNature = buildSignalLibrary(
      items,
      new Map(),
      { ...NO_FILTERS, natures: new Set(['hiring'] as const) },
      { now: NOW, visible: 12 },
    )
    expect(byNature.rows.map(row => row.item.id)).toEqual(['c'])
    const byDate = buildSignalLibrary(items, new Map(), { ...NO_FILTERS, sinceDays: 30 }, { now: NOW, visible: 12 })
    expect(byDate.rows.map(row => row.item.id)).toEqual(['c', 'a'])
  })

  it('un signal sans date lisible ne passe jamais un filtre de date (pas de date devinée)', () => {
    const undated = [item({ id: 'u', signalDate: 'bientôt' })]
    const view = buildSignalLibrary(undated, new Map(), { ...NO_FILTERS, sinceDays: 90 }, { now: NOW, visible: 12 })
    expect(view.rows).toEqual([])
  })

  it('pagine : les N premiers, et dit combien restent', () => {
    const many = Array.from({ length: 7 }, (_, index) =>
      item({ id: `s${index}`, signalLabel: `Fait ${index}`, signalDate: `2026-10-${10 + index}` }),
    )
    const view = buildSignalLibrary(many, new Map(), NO_FILTERS, { now: NOW, visible: 5 })
    expect(view.rows).toHaveLength(5)
    expect(view.total).toBe(7)
    expect(view.remaining).toBe(2)
  })

  it('les puces de compte viennent des comptes qui ONT un signal, une fois chacun', () => {
    const view = buildSignalLibrary(items, new Map(), NO_FILTERS, { now: NOW, visible: 12 })
    expect(view.accounts).toEqual([
      { accountId: 'acc-1', companyName: 'SNCF', count: 2 },
      { accountId: 'acc-2', companyName: 'Orange', count: 1 },
    ])
  })
})

describe('#4505 — recherche et tri de la barre (maquette V22)', () => {
  const items = [
    item({
      id: 'a',
      accountId: 'acc-1',
      companyName: 'SNCF Réseau',
      signalLabel: 'Projet data annoncé',
      signalDate: '2026-10-15',
    }),
    item({
      id: 'b',
      accountId: 'acc-2',
      companyName: 'Keolis',
      signalLabel: 'Refonte billettique',
      salesImplication: 'Un besoin BI est possible',
      signalDate: '2026-10-01',
    }),
    item({
      id: 'c',
      accountId: 'acc-3',
      companyName: 'EDF',
      signalLabel: 'Direction des données',
      signalDate: '2026-10-20',
    }),
  ]
  const run = (filters: Partial<LibraryFilters>) =>
    buildSignalLibrary(items, new Map(), { ...NO_FILTERS, ...filters }, { now: NOW, visible: 10 }).rows.map(
      row => row.item.id,
    )

  it('« Rechercher une actualité, un compte… » lit le titre, le compte et le résumé, sans accent ni casse', () => {
    expect(run({ query: 'reseau' })).toEqual(['a'])
    expect(run({ query: 'BI est' })).toEqual(['b'])
    expect(run({ query: 'DONNÉES' })).toEqual(['c'])
    expect(run({ query: 'introuvable' })).toEqual([])
    expect(run({ query: '   ' })).toEqual(['c', 'a', 'b'])
  })

  it('« Plus anciens » renverse l’ordre ; « Plus récents » reste le défaut', () => {
    expect(run({})).toEqual(['c', 'a', 'b'])
    expect(run({ sort: 'oldest' })).toEqual(['b', 'a', 'c'])
  })

  it('un fait sans date reste APRÈS les datés, dans les deux sens', () => {
    const undated = item({ id: 'u', signalDate: '' })
    const ids = (sort: 'recent' | 'oldest') =>
      buildSignalLibrary([undated, ...items], new Map(), { ...NO_FILTERS, sort }, { now: NOW, visible: 10 }).rows.map(
        row => row.item.id,
      )
    expect(ids('recent').at(-1)).toBe('u')
    expect(ids('oldest').at(-1)).toBe('u')
  })

  it('« Tous les comptes » filtre réellement, en multi-sélection', () => {
    expect(run({ accountIds: new Set(['acc-2', 'acc-3']) })).toEqual(['c', 'b'])
  })
})

// #4437 — « un intitulé libre est rattaché et VISIBLE DANS LE FILTRE » : la recherche de la bibliothèque lit aussi
// ce que la collecte a rattaché (compétences, famille métier), pas seulement le texte brut de l'intitulé.
describe('buildSignalLibrary — la recherche lit le rattachement d’une offre (#4437)', () => {
  const attached = item({
    id: 'a',
    signalLabel: 'Ninja du pixel recherché',
    offerAttachment: {
      status: 'attached',
      fact_type: 'hiring',
      skills: ['React'],
      job_family: 'développement',
      extract: 'Ninja du pixel',
    },
  })
  const unclassified = item({
    id: 'b',
    signalLabel: 'Un collaborateur',
    offerAttachment: {
      status: 'unclassified',
      fact_type: null,
      skills: [],
      job_family: null,
      extract: 'Un collaborateur',
    },
  })
  const bare = item({ id: 'c', signalLabel: 'Sans rattachement posé' })
  const run = (query: string) =>
    buildSignalLibrary(
      [attached, unclassified, bare],
      new Map(),
      { ...NO_FILTERS, query },
      { now: NOW, visible: 50 },
    ).rows.map(row => row.item.id)

  it('un intitulé libre sort quand on tape la compétence ou la famille rattachée', () => {
    expect(run('react')).toEqual(['a'])
    expect(run('DEVELOPPEMENT')).toEqual(['a'])
  })

  it('sait dire NON : « non classé » et l’absence de rattachement ne font apparaître aucune compétence', () => {
    expect(run('vue')).toEqual([])
    expect(run('classé')).toEqual([])
  })
})

describe('lot 768 — la recherche de l’Actuel range par pertinence', () => {
  const POOL = [
    item({
      id: 'detail',
      signalLabel: 'Programme reporting',
      salesImplication: 'Power BI à déployer',
      signalDate: '2026-10-20',
    }),
    item({ id: 'title', signalLabel: 'Recrute un consultant PowerBI', signalDate: '2026-03-01' }),
    item({ id: 'po', signalLabel: 'Recrutement Product Owner', signalDate: '2026-09-01' }),
    item({ id: 'none', signalLabel: 'Ouverture d’un site', signalDate: '2026-10-21' }),
  ]
  const ids = (filters: Partial<LibraryFilters>) =>
    buildSignalLibrary(POOL, new Map(), { ...NO_FILTERS, ...filters }, { now: NOW, visible: 50 }).rows.map(
      row => row.item.id,
    )

  it('« power bi » trouve PowerBI ; le titre passe devant le détail (malgré une date plus ancienne)', () => {
    expect(ids({ query: 'power bi' })).toEqual(['title', 'detail'])
  })

  it('« po » trouve Product Owner', () => {
    expect(ids({ query: 'po' })).toEqual(['po'])
  })

  it('le tri « Récents » reprend l’ordre par date ; « Pertinence » sans requête retombe sur « Récents »', () => {
    expect(ids({ query: 'power bi', sort: 'recent' })).toEqual(['detail', 'title'])
    expect(ids({ sort: 'relevance' })).toEqual(['none', 'detail', 'po', 'title'])
  })

  it('rien de trouvé ⇒ liste vide', () => {
    expect(ids({ query: 'kubernetes' })).toEqual([])
  })
})

describe('lot 772 f) — sourceKindOf : la source se nomme par sa NATURE, jamais par son domaine', () => {
  const press = (over: Partial<WatchlistItem>) =>
    sourceKindOf(item({ sourceUrl: 'https://www.rhmatin.com/article-1', ...over }))

  it('une offre d’emploi, un marché public, une annonce légale : leur nature', () => {
    expect(press({ signalType: 'hiring', signalLabel: 'Recrute 12 ingénieurs data' })).toBe('job')
    expect(press({ signalType: 'tender', signalLabel: 'Consultation MCO' })).toBe('tender')
    expect(press({ signalType: 'Annonce légale', signalLabel: 'Modification statutaire' })).toBe('legal')
  })

  it('le site de l’entreprise elle-même, sinon la presse', () => {
    expect(
      sourceKindOf(
        item({ sourceUrl: 'https://www.sncf.com/fr/groupe', website: 'https://sncf.com', signalType: 'divers' }),
      ),
    ).toBe('company')
    expect(press({ signalType: 'divers', signalLabel: 'Programme data annoncé' })).toBe('press')
  })

  it('aucune URL vérifiable ⇒ aucune nature (pas de lien, rien d’inventé)', () => {
    expect(sourceKindOf(item({ sourceUrl: null }))).toBeNull()
  })
})

describe('buildSignalLibrary — #5191 les recrutements d’abord, par défaut', () => {
  const items = [
    item({ id: 'projet-recent', signalLabel: 'Projet cloud', signalDate: '2026-10-21', signalType: 'Projet' }),
    item({ id: 'offre-ancienne', signalLabel: 'Recrute un DevOps', signalDate: '2026-09-01', signalType: 'hiring' }),
    item({ id: 'projet-ancien', signalLabel: 'Projet data', signalDate: '2026-08-01', signalType: 'Projet' }),
  ]

  it('sans tri choisi : l’offre passe en tête, le reste garde l’ordre par date, rien n’est masqué', () => {
    const view = buildSignalLibrary(items, new Map(), NO_FILTERS, { now: NOW, visible: 12 })
    expect(view.rows.map(row => row.item.id)).toEqual(['offre-ancienne', 'projet-recent', 'projet-ancien'])
    expect(view.total).toBe(3)
  })

  it('un tri CHOISI garde la main : « Plus récents » ne met plus l’offre en tête', () => {
    const view = buildSignalLibrary(items, new Map(), { ...NO_FILTERS, sort: 'recent' }, { now: NOW, visible: 12 })
    expect(view.rows.map(row => row.item.id)).toEqual(['projet-recent', 'offre-ancienne', 'projet-ancien'])
  })
})
