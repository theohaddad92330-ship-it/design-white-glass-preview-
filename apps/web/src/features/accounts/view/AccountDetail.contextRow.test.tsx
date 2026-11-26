import type { Account } from '@bellum/contracts'
import { screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TAB_KEYS } from './account-detail/components/AccountDetailTabsBar'

/**
 * #4507 / #4508 (refonte V22, décisions Louis 24/10/2026) — CE QUI SÉPARAIT L'EN-TÊTE DES ONGLETS N'Y EST PLUS.
 *
 * Avant : l'identité, puis la rangée `account-collab-row` (propriétaire + équipe, refonte Théo du 23/10), puis
 * la barre des sections portant en bout la ligne `account-context-row` (recherche dans le dossier + parcours
 * compact, #2273.2 / #3381). Désormais : l'en-tête, puis la barre, sur TOUS les onglets. Les gestes d'équipe
 * sont dans « … » (gardé par `AccountDetailHero.test.tsx`), chercher passe par ⌘K, les parcours vivent dans
 * Pilotage › Pipe. Cette suite rend le VRAI `AccountDetail` : elle tombe si quelqu'un remonte l'une des deux
 * rangées, ou si la barre se remet à recevoir un bout de ligne (`workbarEnd`).
 */

vi.mock('./account-detail/components/AccountDetailTabContent', () => ({
  AccountDetailTabContent: () => <div data-testid="tab-content" />,
}))
vi.mock('./account-detail/components/AccountDetailTabsBar', async importOriginal => ({
  ...(await importOriginal<typeof import('./account-detail/components/AccountDetailTabsBar')>()),
  AccountDetailTabsBar: ({ workbarEnd }: { workbarEnd?: ReactNode }) => (
    <div data-testid="tabs-bar">{workbarEnd ? <div data-testid="tabs-bar-workbar-end">{workbarEnd}</div> : null}</div>
  ),
}))
vi.mock('./account-detail/components/AccountDetailHero', () => ({
  AccountDetailHero: () => <div data-testid="hero" />,
}))
vi.mock('./account-detail/search/AccountDossierSearch', () => ({
  AccountDossierSearch: () => <div data-testid="dossier-search" />,
}))
vi.mock('./account-detail/components/AccountDetailStatusBanners', () => ({
  AccountDetailStatusBanners: () => <div data-testid="status-banners" />,
}))
vi.mock('./account-detail/components/LinkedAccountsCard', () => ({
  LinkedAccountsCard: () => <div data-testid="linked-accounts-card" />,
}))
vi.mock('./account-detail/tabs/knowledge/AccountKnowledgeCounters', () => ({ AccountKnowledgeCounters: () => null }))
vi.mock('./account-detail/components/GroupEntitiesCard', () => ({ GroupEntitiesCard: () => null }))
vi.mock('@/features/chains/view/ChainProgressBlock', () => ({
  ChainProgressBlock: () => <div data-testid="chain-progress" />,
}))
vi.mock('./account-detail/components/NotificationsProposalBanner', () => ({
  NotificationsProposalBanner: () => <div data-testid="notifications-proposal-banner" />,
}))
vi.mock('@/features/accounts/hooks/useCoverageGaps', () => ({ useCoverageGaps: () => ({ data: undefined }) }))
vi.mock('@/features/accounts/hooks/useCancelAnalysis', () => ({
  useCancelAnalysis: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useAnalysisProgress', () => ({ useAnalysisProgress: () => ({ phase: null, percent: 0 }) }))

const { AccountDetail } = await import('./AccountDetail')

const compte = (over: Partial<Account> = {}): Account =>
  ({
    id: '00000000-0000-0000-0000-000000000001',
    company_name: 'ACME',
    status: 'completed',
    raw_analysis: null,
    ...over,
  }) as Account

describe('#4507 / #4508 — l’en-tête, puis directement la barre des sections', () => {
  it.each(TAB_KEYS.filter(tab => tab !== 'brief'))(
    'onglet « %s » : ni rangée propriétaire/équipe, ni ligne recherche + parcours',
    async tab => {
      renderWithRouter(
        <AccountDetail account={compte({ owner: null })} contacts={[]} initialTab={tab} />,
        '/accounts/test-id',
      )
      await waitFor(() => expect(screen.getByTestId('tabs-bar')).toBeTruthy())

      expect(screen.queryByTestId('account-collab-row')).toBeNull()
      expect(screen.queryByTestId('account-context-row')).toBeNull()
      expect(screen.queryByTestId('dossier-search')).toBeNull()
      expect(screen.queryByTestId('chain-progress')).toBeNull()
      expect(screen.queryByTestId('tabs-bar-workbar-end')).toBeNull()
      expect(screen.queryByText('Propriétaire non renseigné')).toBeNull()
    },
  )

  it('l’en-tête précède immédiatement la barre (aucune rangée entre les deux)', async () => {
    renderWithRouter(<AccountDetail account={compte()} contacts={[]} />, '/accounts/test-id')
    await waitFor(() => expect(screen.getByTestId('tabs-bar')).toBeTruthy())
    const hero = screen.getByTestId('hero')
    const barWrapper = screen.getByTestId('tabs-bar').parentElement
    expect(hero.nextElementSibling).toBe(barWrapper)
  })
})

describe('#3523 — la proposition de notifications', () => {
  // #3523 — « affiche le nécessaire uniquement » : la proposition de notifications
  // (#2510) ne s'impose plus au-dessus ; elle descend sous le contenu.
  it('n’est plus au-dessus des onglets : elle vient sous le contenu', async () => {
    renderWithRouter(<AccountDetail account={compte({ owner: null })} contacts={[]} />, '/accounts/test-id')

    await waitFor(() => expect(screen.getByTestId('tab-content')).toBeTruthy())
    // Elle descend SOUS le contenu, jamais entre l'en-tête et la barre.
    const banner = screen.getByTestId('notifications-proposal-banner')
    expect(
      screen.getByTestId('tab-content').compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  // #3523 (recette prod 02/10) — « 0 occurrence » : la proposition n'était
  // montée que sur l'onglet `overview` ; la page d'entrée `brief` est dans la
  // même section Synthèse et la portait pas.
  it('#3523 — la proposition de notifications est aussi sur toute la section Synthèse (ex. Évaluation), pas seulement `overview`', async () => {
    renderWithRouter(
      <AccountDetail account={compte({ owner: null })} contacts={[]} initialTab="evaluation" />,
      '/accounts/test-id',
    )

    await waitFor(() => expect(screen.getByTestId('tab-content')).toBeTruthy())
    expect(screen.getByTestId('notifications-proposal-banner')).toBeTruthy()
  })

  it('#3523 ⚠️ SAIT DIRE NON — hors Synthèse (ex. Projets), aucune proposition', async () => {
    renderWithRouter(
      <AccountDetail account={compte({ owner: null })} contacts={[]} initialTab="projects" />,
      '/accounts/test-id',
    )

    await waitFor(() => expect(screen.getByTestId('tab-content')).toBeTruthy())
    expect(screen.queryByTestId('notifications-proposal-banner')).toBeNull()
  })
})
