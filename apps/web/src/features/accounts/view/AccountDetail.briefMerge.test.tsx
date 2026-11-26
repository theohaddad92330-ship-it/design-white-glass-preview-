import type { Account } from '@bellum/contracts'
import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import bpceBrief from '../../../../../../packages/contracts/src/commercial-brief/bpce.fixture.json'

/**
 * K.1 (Louis 19/10/2026) — « Vue d'ensemble » est FUSIONNÉE dans « Ce que je sais ».
 * Avec un brief valide : l'onglet `overview` n'est plus listé, et « Ce que je sais » porte LES DEUX
 * — le brief et l'ancienne vue d'ensemble, sur une seule page. Louis 21/10 : le sous-onglet « Le dossier »
 * faisait une seconde rangée « Ce que je sais | Le dossier » sous « Ce que je sais | Score » ; il est retiré.
 * Sans brief : l'ancienne vue d'ensemble reste l'arrivée de repli.
 */
vi.mock('./account-detail/components/AccountDetailTabContent', () => ({
  AccountDetailTabContent: ({ activeTab }: { activeTab: string }) => (
    <div data-testid="tab-content" data-tab={activeTab} />
  ),
}))
vi.mock('./account-detail/components/AccountDetailTabsBar', async importOriginal => ({
  ...(await importOriginal<typeof import('./account-detail/components/AccountDetailTabsBar')>()),
  // Refonte Théo : la rangée de contexte (recherche du dossier) vit dans `workbarEnd` de la barre.
  AccountDetailTabsBar: ({ hiddenTabs, workbarEnd }: { hiddenTabs?: string[]; workbarEnd?: React.ReactNode }) => (
    <div data-testid="tabs-bar" data-hidden={(hiddenTabs ?? []).join(',')}>
      {workbarEnd}
    </div>
  ),
}))
vi.mock('./account-detail/components/AccountDetailHero', () => ({
  AccountDetailHero: () => <div data-testid="hero" />,
}))
// #2128 — `AccountDossierSearch` appelle `useSearch({ from: '/accounts/$id' })`,
// EXACTEMENT la cause écrite plus haut pour `AccountDetailTabContent` : le routeur
// minimal de `renderWithRouter` n'a pas cette route, l'invariant de TanStack Router
// jette, et l'arbre entier tombe dans l'error boundary AVANT le bandeau. Le stub
// retire la cause, pas ce que ce test garde (le MONTAGE du bandeau Collaboration).
vi.mock('./account-detail/search/AccountDossierSearch', () => ({
  AccountDossierSearch: () => <div data-testid="dossier-search" />,
}))
vi.mock('./account-detail/components/AccountDetailStatusBanners', () => ({
  AccountDetailStatusBanners: () => null,
}))
vi.mock('./account-detail/components/LinkedAccountsCard', () => ({ LinkedAccountsCard: () => null }))
vi.mock('./account-detail/components/GroupEntitiesCard', () => ({ GroupEntitiesCard: () => null }))
vi.mock('@/features/accounts/hooks/useCoverageGaps', () => ({ useCoverageGaps: () => ({ data: undefined }) }))
vi.mock('@/features/accounts/hooks/useCancelAnalysis', () => ({
  useCancelAnalysis: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useAnalysisProgress', () => ({ useAnalysisProgress: () => ({ phase: null, percent: 0 }) }))

// Les lectures du bandeau lui-même : ce test parle du MONTAGE, pas des données.
vi.mock('@/features/activities/hooks/useTimeline', () => ({ useTimeline: () => ({ data: { items: [] } }) }))
vi.mock('@/features/memoire-collective/hooks/useMemoryBridge', () => ({
  useMemoryBridge: () => ({ bridge: { data: undefined } }),
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('@/features/manager/hooks/useAssignAccount', () => ({
  useAssignAccount: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-moi' } }) }))

vi.mock('@/features/chains/view/ChainProgressBlock', () => ({
  ChainProgressBlock: ({
    subjectType,
    subjectId,
    variant,
  }: {
    subjectType: string
    subjectId: string
    variant?: string
  }) => (
    <div
      data-testid="chain-progress"
      data-subject-type={subjectType}
      data-subject-id={subjectId}
      data-variant={variant}
    />
  ),
}))

const { AccountDetail } = await import('./AccountDetail')

const compte = (rawAnalysis: Account['raw_analysis'], id = '00000000-0000-0000-0000-000000000001'): Account =>
  ({
    id,
    company_name: 'ACME',
    status: 'completed',
    raw_analysis: rawAnalysis,
  }) as Account

const withBrief = { commercial_brief: structuredClone(bpceBrief) } as Account['raw_analysis']

describe('K.1 — Vue d’ensemble fusionnée dans « Ce que je sais »', () => {
  // Le routeur écrit `?tab=` dans l'URL de jsdom : on repart d'une adresse vierge à chaque cas.
  beforeEach(() => window.history.replaceState(null, '', '/'))

  it('avec un brief : `overview` n’est plus listée, une seule page porte le brief ET le dossier', async () => {
    renderWithRouter(<AccountDetail account={compte(withBrief)} contacts={[]} />, '/accounts/test-id')
    const bar = await waitFor(() => screen.getByTestId('tabs-bar'))
    expect(bar.getAttribute('data-hidden')?.split(',')).toContain('overview')
    expect(screen.getByTestId('tab-content').getAttribute('data-tab')).toBe('brief')
    // Le haut du dossier est sur la MÊME page, sans second sous-onglet. #4508 (Louis 24/10) a retiré la rangée de
    // contexte (`account-context-row`) : c'est l'en-tête du dossier qui le prouve désormais.
    expect(screen.getByTestId('hero')).toBeTruthy()
    expect(screen.queryByTestId('account-context-row')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Le dossier' })).toBeNull()
    expect(screen.queryByTestId('brief-view-switch')).toBeNull()
  })

  it('sait dire NON : sans brief valide, ni sous-onglet ni onglet masqué — la vue d’ensemble reste l’arrivée', async () => {
    renderWithRouter(
      <AccountDetail account={compte(null, '00000000-0000-0000-0000-000000000002')} contacts={[]} />,
      '/accounts/test-id',
    )

    const bar = await waitFor(() => screen.getByTestId('tabs-bar'))
    expect(bar.getAttribute('data-hidden')?.split(',')).not.toContain('overview')
    expect(screen.getByTestId('tab-content').getAttribute('data-tab')).toBe('overview')
    expect(screen.queryByTestId('brief-view-switch')).toBeNull()
  })
})
