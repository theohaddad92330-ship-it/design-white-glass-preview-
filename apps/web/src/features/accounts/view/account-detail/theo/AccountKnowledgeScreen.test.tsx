import type { Account, Contact } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import bpce from '../../../../../../../../packages/contracts/src/commercial-brief/bpce.fixture.json'
import { AccountKnowledgeScreen } from './AccountKnowledgeScreen'

/**
 * Refonte Théo (23/10) — « Ce que je sais » suit l'ORDRE de la maquette appliquée `a/comptes-fiche.html` :
 * provenance → regard de Laura | À faire ensuite → repères → grille de cartes → « Pour aller plus loin ».
 * Les blocs qui lisent l'API sont des témoins : ce qui se vérifie ici est la structure de l'écran.
 */
const nextAction = vi.hoisted(() => ({ value: { label: 'Relancer Maxime Delaunay', tab: 'plan' } as unknown }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr' } }),
}))
vi.mock('../components/AccountVerdictSummary', () => ({
  AccountVerdictSummary: () => <div data-testid="stub-verdict">regard</div>,
}))
vi.mock('../tabs/knowledge/AccountKnowledgeCounters', () => ({
  AccountKnowledgeCounters: () => <div data-testid="stub-counters" />,
}))
vi.mock('../tabs/synthesis/AccountSynthesisCards', () => ({
  AccountSynthesisTop: () => <div data-testid="stub-synthesis-cards" />,
  useSynthesisNextAction: () => nextAction.value,
}))
vi.mock('../tabs/useAccountOverviewData', () => ({
  useAccountOverviewData: () => ({
    bellumRead: { title: 'Renfort cloud sur la trajectoire du plan 2029.', blocks: { nextAction: 'Appeler la DSI' } },
  }),
}))
vi.mock('../tabs/TabOverview', () => ({
  TabOverview: ({ refreshLifted }: { refreshLifted?: boolean }) => (
    <div data-testid="stub-overview" data-lifted={String(Boolean(refreshLifted))} />
  ),
}))
vi.mock('../tabs/sections/AccountChangesCard', () => ({
  AccountChangesCard: () => <div data-testid="stub-changes" />,
}))
vi.mock('../components/RefreshOutcomeCard', () => ({
  RefreshOutcomeCard: () => <div data-testid="stub-refresh-outcome" />,
}))
vi.mock('../tabs/TabEvaluation', () => ({ TabEvaluation: () => <div data-testid="stub-evaluation" /> }))
vi.mock('../tabs/sections/PresentEsnList', () => ({ PresentEsnList: () => <div data-testid="stub-esn" /> }))
vi.mock('@/features/chains/view/ChainProgressBlock', () => ({
  ChainProgressBlock: () => <div data-testid="stub-chain" />,
}))
vi.mock('../components/LinkedAccountsCard', () => ({ LinkedAccountsCard: () => null }))
vi.mock('../components/GroupEntitiesCard', () => ({ GroupEntitiesCard: () => null }))
vi.mock('../components/AccountSellerTargeting', () => ({ AccountSellerTargeting: () => null }))
vi.mock('@/features/team-guardrails/components/DuplicateCandidatesCard', () => ({
  DuplicateCandidatesCard: () => null,
}))

const account = (patch: Partial<Account> = {}) =>
  ({
    id: 'acc-1',
    company_name: 'Société Générale',
    status: 'completed',
    last_analyzed_at: '2026-10-14T08:00:00Z',
    raw_analysis: {},
    ...patch,
  }) as unknown as Account

const draw = (patch: Partial<Account> = {}) =>
  render(<AccountKnowledgeScreen account={account(patch)} contacts={[] as Contact[]} onTabChange={() => undefined} />)

const order = (testIds: string[]) => {
  const nodes = testIds.map(id => screen.getByTestId(id))
  for (let index = 1; index < nodes.length; index += 1) {
    // DOCUMENT_POSITION_FOLLOWING (4) : le bloc suivant vient APRÈS le précédent dans le document.
    expect(nodes[index - 1]!.compareDocumentPosition(nodes[index]!) & 4).toBe(4)
  }
}

describe('AccountKnowledgeScreen — l’ordre de la maquette', () => {
  it('provenance → regard de Laura → À faire ensuite → repères → cartes → Pour aller plus loin', () => {
    draw()
    order([
      'knowledge-provenance',
      'knowledge-opening',
      'stub-verdict',
      'knowledge-next',
      'stub-counters',
      'knowledge-grid',
      'knowledge-more',
    ])
  })

  it('#4508 — NON : le parcours compact du compte n’est plus dans « Ce que je sais » (Pilotage › Pipe)', () => {
    draw()
    expect(screen.queryByTestId('stub-chain')).toBeNull()
    expect(screen.getByTestId('knowledge-context')).toBeTruthy()
  })

  it('« Vue d’ensemble » et « Score » sont FONDUS dans « Pour aller plus loin », rien retiré', () => {
    draw()
    const more = screen.getByTestId('knowledge-more')
    expect(more).toContainElement(screen.getByTestId('stub-overview'))
    expect(more).toContainElement(screen.getByTestId('stub-evaluation'))
    expect(screen.getByText('moreEyebrow')).toBeInTheDocument()
  })

  it('« À faire ensuite » nomme la prochaine action et ouvre son onglet', () => {
    draw()
    expect(screen.getByTestId('knowledge-next')).toHaveTextContent('Relancer Maxime Delaunay')
    expect(screen.getByRole('button', { name: 'seePlan' })).toBeInTheDocument()
  })

  it('sait dire NON : sans prochaine action, aucun panneau « À faire ensuite » (jamais une case vide)', () => {
    nextAction.value = null
    draw()
    expect(screen.queryByTestId('knowledge-next')).not.toBeInTheDocument()
    expect(screen.getByTestId('knowledge-opening')).toBeInTheDocument()
    nextAction.value = { label: 'Relancer Maxime Delaunay', tab: 'plan' }
  })

  it('sait dire NON : un compte jamais analysé n’écrit aucune ligne de provenance', () => {
    draw({ last_analyzed_at: null } as Partial<Account>)
    expect(screen.queryByTestId('knowledge-provenance')).not.toBeInTheDocument()
  })

  it('sans brief : aucune carte du brief (ni entités, ni TJM, ni écosystème) — jamais « 0 »', () => {
    draw()
    expect(screen.queryByTestId('knowledge-card-entities')).not.toBeInTheDocument()
    expect(screen.queryByTestId('knowledge-card-tjm')).not.toBeInTheDocument()
    expect(screen.queryByTestId('knowledge-card-ecosystem')).not.toBeInTheDocument()
  })

  it('#4323.3 — sans brief, la liste UNIQUE des ESN présentes est montée quand même (pas deux cartes ESN dans « Pour aller plus loin »)', () => {
    draw()
    expect(screen.getByTestId('stub-esn')).toBeInTheDocument()
    expect(screen.getByTestId('knowledge-present-esn-nobrief')).toContainElement(screen.getByTestId('stub-esn'))
  })

  it('#4323.3 sait dire NON — avec un brief, la liste n’est montée qu’UNE fois (dans la carte écosystème)', () => {
    draw({ raw_analysis: { commercial_brief: structuredClone(bpce) } } as Partial<Account>)
    expect(screen.getAllByTestId('stub-esn')).toHaveLength(1)
    expect(screen.queryByTestId('knowledge-present-esn-nobrief')).not.toBeInTheDocument()
  })
})

describe('AccountKnowledgeScreen — #2164.29 #2164.30 #2164.34 #2164.38 #2164.39 actualisation visible (r53)', () => {
  const withBrief = { raw_analysis: { commercial_brief: structuredClone(bpce) } } as Partial<Account>

  it('avec un brief : « Ce que je ferais maintenant », « ce qui a changé » et la carte du diff sont dans la vue par défaut', () => {
    draw(withBrief)
    const lifted = screen.getByTestId('knowledge-refresh')
    expect(lifted).toHaveTextContent('nextAction')
    expect(lifted).toHaveTextContent('Appeler la DSI')
    expect(lifted).toContainElement(screen.getByTestId('stub-changes'))
    expect(lifted).toContainElement(screen.getByTestId('stub-refresh-outcome'))
    // Hors « Pour aller plus loin » replié ; et la lecture repliée ne les redit pas (GA-26).
    expect(screen.getByTestId('knowledge-more')).not.toContainElement(lifted)
    expect(screen.getByTestId('stub-overview')).toHaveAttribute('data-lifted', 'true')
  })

  it('sait dire NON : sans brief, rien n’est monté (la lecture ouverte d’office les porte, une seule fois)', () => {
    draw()
    expect(screen.queryByTestId('knowledge-refresh')).not.toBeInTheDocument()
    expect(screen.getByTestId('stub-overview')).toHaveAttribute('data-lifted', 'false')
  })
})

describe('AccountKnowledgeScreen — filiale / entité ambiguë (Kineis, recette 31/10)', () => {
  const subsidiary = {
    state: 'resolved',
    kind: 'subsidiary',
    canonical_id: 'siren:552100554',
    commercial_name: 'Kineis',
    legal_name: 'KINEIS',
    country: 'FR',
    identifiers: { siren: '552100554' },
    domain: null,
    naf_code: null,
    naf_label: null,
    location: null,
    parent_names: ['CLS'],
    children_count: null,
    sources: ['legal_identifier'],
    confidence: 80,
    reasons: [],
    question: null,
    resolved_at: '2026-10-30T10:00:00.000Z',
  }

  it('une filiale ouvre « Vue d’ensemble » d’office : l’avertissement se lit sans geste', () => {
    draw({ raw_analysis: { commercial_brief: structuredClone(bpce), entity_resolution: subsidiary } })
    expect(screen.getByTestId('knowledge-more-reading')).toHaveAttribute('open')
  })

  it('sait dire NON : avec un brief et sans filiale, la lecture reste repliée', () => {
    draw({ raw_analysis: { commercial_brief: structuredClone(bpce) } })
    expect(screen.getByTestId('knowledge-more-reading')).not.toHaveAttribute('open')
  })
})
