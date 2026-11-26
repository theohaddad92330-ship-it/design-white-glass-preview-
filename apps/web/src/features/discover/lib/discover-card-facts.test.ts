import { describe, expect, it } from 'vitest'
import type { DiscoverSourceAxes, DiscoverSourceAxis } from '@bellum/contracts'
import { candidateCardFacts, cardFactFamilyOf, groupCardFactsByFamily, type CardFact } from './discover-card-facts'
import type { DiscoverCandidate, DiscoverSignal } from './discover-types'

const now = new Date('2026-10-13T12:00:00Z')
const spaceLabel = (axis: DiscoverSourceAxis) => `espace:${axis.key}`

const candidate = (
  overrides: Partial<DiscoverCandidate>,
): Pick<DiscoverCandidate, 'name' | 'signals' | 'knownNeeds' | 'sourceAxes'> => ({
  name: 'LATECOERE',
  signals: [],
  ...overrides,
})

const signal = (overrides: Partial<DiscoverSignal> & Pick<DiscoverSignal, 'label'>): DiscoverSignal => ({
  type: 'business',
  date: '2026-10-01',
  ...overrides,
})

// #4068 (Louis 13/10, recette LATECOERE) — la carte : forts en haut, contexte au détail, rien d'autre.
describe('#4068 — candidateCardFacts', () => {
  it('reproduit LATECOERE : ≤ 5 forts dont un recrutement, ≤ 10 contexte, aucun acte de capital, aucun doublon', () => {
    const signals: DiscoverSignal[] = [
      ...Array.from({ length: 6 }, (_, i) =>
        signal({ type: 'legal', label: `Modification survenue sur le capital (${i})`, date: `2026-09-0${i + 1}` }),
      ),
      signal({ label: "Latécoère : chiffre d'affaires S1 2026 en hausse de 15 %", date: '2026-09-25' }),
      signal({
        label: 'Latecoere affiche un CA semestriel de +15% sur S1 2026',
        date: '2026-09-26',
        url: 'https://example.org/ca',
      }),
      signal({ label: "Latécoère publie un chiffre d'affaires S1 2026 en hausse de 15 %", date: '2026-09-27' }),
      signal({ label: 'Lerevenu', date: '2026-09-30' }),
      signal({ label: 'Latecoere : quelles perspectives ?', date: '2026-09-30' }),
      signal({ type: 'legal', label: 'Changement de dirigeant', date: '2026-02-06' }),
      signal({ type: 'hiring', label: 'Ingénieur systèmes embarqués H/F', date: '2026-08-20', fromSpace: true }),
    ]
    const { strong, context } = candidateCardFacts(
      candidate({
        signals,
        knownNeeds: [{ label: 'Refonte du MES des usines', date: '2026-09-15', dateIsDetection: true }],
      }),
      { now, spaceLabel },
    )
    expect(strong.length).toBeLessThanOrEqual(5)
    expect(context.length).toBeLessThanOrEqual(10)
    expect(strong.map(f => f.nature)).toEqual(['need', 'hiring'])
    expect(context.map(f => f.label)).toEqual(["Latécoère publie un chiffre d'affaires S1 2026 en hausse de 15 %"])
    expect(context[0]?.url).toBe('https://example.org/ca')
    const all = [...strong, ...context].map(f => f.label).join(' | ')
    expect(all).not.toMatch(/capital|Lerevenu|perspectives|Changement de dirigeant/)
  })

  it('un besoin connu devient un fait FORT de l’espace, daté par l’analyse (jamais présenté comme publié ce jour-là)', () => {
    const { strong } = candidateCardFacts(
      candidate({ knownNeeds: [{ label: 'Refonte du MES', date: '2025-11-02', dateIsDetection: true }] }),
      { now, spaceLabel },
    )
    expect(strong).toEqual([
      expect.objectContaining({ label: 'Refonte du MES', nature: 'need', fromSpace: true, dateIsDetection: true }),
    ])
  })

  // #4067.4 (18/10) — Dassault : « 30/11/2026 · DÉJÀ CONNU · 1 mission en cours » — la fin prévue d'une mission
  // ouverte (FUTURE) prise pour la date du fait. Une date future n'est jamais affichée comme un fait passé.
  it('NON — une source de l’espace dont la date est FUTURE (fin de mission prévue) ne date jamais d’après aujourd’hui', () => {
    const sourceAxes: DiscoverSourceAxes = {
      axes: [
        {
          key: 'missions',
          points: 10,
          max: 10,
          measured: true,
          evidence: '1 mission en cours',
          label_key: 'missions_ongoing',
          label_params: {},
          latestAt: '2026-11-30T00:00:00Z',
        },
      ],
      score: 10,
      max: 10,
      unmeasured: [],
    }
    const { strong } = candidateCardFacts(candidate({ sourceAxes }), { now, spaceLabel })
    expect(strong).toHaveLength(1)
    expect(strong[0]?.date).toBe('2026-10-13')
  })

  it('une source décisive de l’espace (affaire gagnée, missions) concourt aux MÊMES places, sous sa nature', () => {
    const sourceAxes: DiscoverSourceAxes = {
      axes: [
        {
          key: 'crm',
          points: 10,
          max: 20,
          measured: true,
          evidence: 'Affaire gagnée',
          label_key: 'crm_won',
          label_params: {},
          latestAt: '2025-12-01T00:00:00Z',
        },
        {
          key: 'dataforge',
          points: 10,
          max: 10,
          measured: true,
          evidence: 'Cible prioritaire',
          label_key: 'reference_priority',
          label_params: {},
          latestAt: null,
        },
      ],
      score: 20,
      max: 30,
      unmeasured: [],
    }
    const { strong } = candidateCardFacts(candidate({ sourceAxes }), { now, spaceLabel })
    // un axe sans date (le référentiel) n'est pas un fait daté : il reste au score, pas dans la liste
    expect(strong).toEqual([expect.objectContaining({ label: 'espace:crm', nature: 'space', date: '2025-12-01' })])
  })

  it('aucun fait → deux listes vides (aucune ligne, jamais « 0 »)', () => {
    expect(candidateCardFacts(candidate({}), { now, spaceLabel })).toEqual({ strong: [], context: [] })
  })
})

// #4045.5 (Louis 15/10/2026) — les signaux de chaque carte rangés par FAMILLE : Recrutements / Projets / Marchés publics.
describe('cardFactFamilyOf / groupCardFactsByFamily (#4045.5)', () => {
  const fact = (key: string, type: string, nature: CardFact['nature'], date: string): CardFact =>
    ({ key, type, nature, date, label: key }) as CardFact

  it('un recrutement, un appel d’offres / attribution, le reste en projets', () => {
    expect(cardFactFamilyOf(fact('a', 'hiring', 'hiring', '2026-10-01'))).toBe('hiring')
    // #4115 — l'alternance est une offre : elle se range sous « Recrutements » (en contexte).
    expect(cardFactFamilyOf(fact('w', 'hiring', 'work_study', '2026-10-01'))).toBe('hiring')
    expect(cardFactFamilyOf(fact('b', 'tender', 'deal', '2026-10-01'))).toBe('public_market')
    expect(cardFactFamilyOf(fact('c', 'award', 'deal', '2026-10-01'))).toBe('public_market')
    expect(cardFactFamilyOf(fact('d', 'business', 'project', '2026-10-01'))).toBe('project')
    expect(cardFactFamilyOf(fact('e', 'funding', 'deal', '2026-10-01'))).toBe('project')
  })

  it('SAIT DIRE NON — un besoin connu de l’espace (type tender, nature need) n’est pas un marché public', () => {
    expect(cardFactFamilyOf(fact('n', 'tender', 'need', '2026-10-01'))).toBe('project')
  })

  it('groupe dans l’ordre Recrutements, Projets, Marchés publics ; l’ordre des dates reste celui du contrat à l’intérieur', () => {
    const groups = groupCardFactsByFamily([
      fact('t1', 'tender', 'deal', '2026-10-10'),
      fact('h1', 'hiring', 'hiring', '2026-10-09'),
      fact('p1', 'business', 'project', '2026-10-08'),
      fact('h2', 'hiring', 'hiring', '2026-10-07'),
    ])
    expect(groups.map(group => group.family)).toEqual(['hiring', 'project', 'public_market'])
    expect(groups[0]?.facts.map(f => f.key)).toEqual(['h1', 'h2'])
  })

  it('aucun fait → aucune famille (jamais une famille vide)', () => {
    expect(groupCardFactsByFamily([])).toEqual([])
  })

  it('le plafond du contrat tient : 5 forts et 10 de contexte au plus, quelle que soit la famille', () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      signal({
        label: `Poste ouvert — Ingénieur ${index}`,
        type: 'hiring',
        date: `2026-10-${String(1 + index).padStart(2, '0')}`,
      }),
    )
    const { strong, context } = candidateCardFacts(candidate({ signals: many }), { now, spaceLabel })
    expect(strong.length).toBeLessThanOrEqual(5)
    expect(context.length).toBeLessThanOrEqual(10)
  })
})

// #4285.1 (Louis 21/10) — l'augmentation de capital BODACC est un fait de carte, daté, avec son lien.
describe('#4285.1 — « Augmentation de capital » sur la carte', () => {
  it('SAIT DIRE OUI : un signal daté (< 180 j) avec son lien devient un fait de CONTEXTE, jamais fort', () => {
    const url = 'https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:B202600012345'
    const { strong, context } = candidateCardFacts(
      candidate({ signals: [signal({ label: 'Augmentation de capital', date: '2026-10-05', url })] }),
      { now, spaceLabel },
    )
    expect(strong).toEqual([])
    expect(context).toHaveLength(1)
    expect(context[0]).toMatchObject({ label: 'Augmentation de capital', date: '2026-10-05', url, type: 'business' })
  })

  it('SAIT DIRE NON : un acte de capital juridique ou une actualité qui en parle reste hors carte', () => {
    const { strong, context } = candidateCardFacts(
      candidate({
        signals: [
          signal({ type: 'legal', label: 'Modification survenue sur le capital', date: '2026-10-05' }),
          signal({ label: 'Augmentation de capital de Latécoère', date: '2026-10-05' }),
        ],
      }),
      { now, spaceLabel },
    )
    expect([...strong, ...context]).toEqual([])
  })

  it('absent : aucune ligne', () => {
    expect(candidateCardFacts(candidate({ signals: [] }), { now, spaceLabel })).toEqual({ strong: [], context: [] })
  })
})
