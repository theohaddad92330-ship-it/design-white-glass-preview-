import type { Account } from '@bellum/contracts'
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * #3516 revient sur l'ordre du haut de page, délibérément (Louis, 01/10/2026 :
 * « mets cette barre juste en dessous du premier bloc du header, tout le reste
 * devient la page synthèse »). #2118.48 voulait le verdict sur TOUS les
 * onglets, avant bannières, ligne de contexte et barre ; il est désormais le
 * premier bloc de la Synthèse, SOUS la barre « Sections du dossier ».
 *
 * jsdom ne mesure aucun pixel : ce test lit l'ORDRE du DOM — hero (identité)
 * → barre d'onglets → verdict → bannières → ligne de contexte → contenu — et
 * prouve que les blocs déplacés n'existent QUE sur l'onglet Synthèse.
 */

vi.mock('./account-detail/components/AccountDetailHero', () => ({
  AccountDetailHero: () => <div data-testid="hero">ACME</div>,
}))
vi.mock('./account-detail/components/AccountDetailStatusBanners', () => ({
  AccountDetailStatusBanners: () => <div data-testid="status-banners" />,
}))
vi.mock('./account-detail/components/NotificationsProposalBanner', () => ({
  NotificationsProposalBanner: () => <div data-testid="notifications-proposal-banner" />,
}))
vi.mock('./account-detail/components/LinkedAccountsCard', () => ({
  LinkedAccountsCard: () => <div data-testid="linked-accounts-card" />,
}))
vi.mock('./account-detail/tabs/knowledge/AccountKnowledgeCounters', () => ({ AccountKnowledgeCounters: () => null }))
vi.mock('./account-detail/components/GroupEntitiesCard', () => ({ GroupEntitiesCard: () => null }))
vi.mock('./account-detail/search/AccountDossierSearch', () => ({
  AccountDossierSearch: () => <div data-testid="dossier-search" />,
}))
vi.mock('./account-detail/components/AccountDetailTabsBar', async importOriginal => ({
  ...(await importOriginal<typeof import('./account-detail/components/AccountDetailTabsBar')>()),
  AccountDetailTabsBar: () => <div data-testid="tabs-bar" />,
}))
vi.mock('./account-detail/components/AccountDetailTabContent', () => ({
  AccountDetailTabContent: () => <div data-testid="tab-content" />,
}))
vi.mock('@/features/accounts/hooks/useCoverageGaps', () => ({ useCoverageGaps: () => ({ data: undefined }) }))
vi.mock('@/features/accounts/hooks/useCancelAnalysis', () => ({
  useCancelAnalysis: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useAnalysisProgress', () => ({ useAnalysisProgress: () => ({ phase: null, percent: 0 }) }))

const { AccountDetail } = await import('./AccountDetail')
const { AccountVerdictSummary } = await import('./account-detail/components/AccountVerdictSummary')

const compte = (over: Partial<Account> = {}): Account =>
  ({
    id: '00000000-0000-0000-0000-000000000001',
    user_id: '00000000-0000-0000-0000-000000000002',
    company_name: 'ATOS FRANCE',
    siren: null,
    sector: null,
    employees: null,
    revenue: null,
    headquarters: null,
    website: null,
    subsidiaries: [],
    it_challenges: [],
    recent_signals: [],
    priority_score: 7,
    priority_justification: 'Compte prioritaire : signal fort et accord-cadre à renouveler.',
    raw_analysis: null,
    status: 'completed',
    error_message: null,
    user_context: null,
    api_cost_euros: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }) as Account

/** `a` avant `b` dans le document, quel que soit l'ordre où le test les nomme. */
function precede(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

/**
 * Refonte Théo (23/10) — la maquette appliquée `a/comptes-fiche.html` redessine le haut de la fiche :
 * l'identité (hero) — `.x-collab` en est retiré le 24/10 (#4507, gestes d'équipe dans « … ») —, la barre
 * d'onglets, puis `.x-banner-row` (bandeaux d'état) sur tous les onglets. Ce que #3516 gardait est CONSERVÉ
 * ailleurs : le verdict reste le premier bloc de la page Synthèse, SOUS la barre — il vit désormais dans le
 * contenu de l'onglet (`AccountKnowledgeScreen`, ordre provenance → regard de Laura → … gardé par
 * `AccountKnowledgeScreen.test.tsx`), donc jamais sur un autre onglet. Le bloc verdict lui-même (#3280,
 * une rangée ; aucun score en points) est gardé ici sur le composant.
 */
describe('#3516 — la barre des sections suit l’identité, le verdict appartient à la Synthèse', () => {
  it('hero → barre → bandeaux → contenu ; aucun verdict au-dessus de la barre (#4507 : plus de `.x-collab`)', async () => {
    renderWithRouter(<AccountDetail account={compte()} contacts={[]} />, '/accounts/test-id')

    await waitFor(() => expect(screen.getByTestId('tabs-bar')).toBeTruthy())

    const hero = screen.getByTestId('hero')
    const tabsBar = screen.getByTestId('tabs-bar')
    const statusBanners = screen.getByTestId('status-banners')
    const tabContent = screen.getByTestId('tab-content')

    expect(precede(hero, tabsBar)).toBe(true)
    expect(screen.queryByTestId('account-collab-row')).not.toBeInTheDocument()
    expect(precede(tabsBar, statusBanners)).toBe(true)
    expect(precede(statusBanners, tabContent)).toBe(true)
    // Le verdict n'est PAS monté par la coque de la fiche : il est dans le contenu de la Synthèse.
    expect(screen.queryByTestId('account-verdict-summary')).not.toBeInTheDocument()
  })

  it('⚠️ SAIT DIRE NON — hors Synthèse, ni verdict ni proposition de notifications', async () => {
    renderWithRouter(<AccountDetail account={compte()} contacts={[]} initialTab="contacts" />, '/accounts/test-id')

    await waitFor(() => expect(screen.getByTestId('tabs-bar')).toBeTruthy())
    expect(screen.queryByTestId('account-verdict-summary')).not.toBeInTheDocument()
    expect(screen.queryByTestId('notifications-proposal-banner')).not.toBeInTheDocument()
    expect(precede(screen.getByTestId('hero'), screen.getByTestId('tabs-bar'))).toBe(true)
  })

  it('chaque bloc du haut de page n’apparaît qu’une fois', async () => {
    renderWithRouter(<AccountDetail account={compte()} contacts={[]} />, '/accounts/test-id')
    await waitFor(() => expect(screen.getByTestId('tabs-bar')).toBeTruthy())
    for (const id of ['status-banners', 'tabs-bar', 'hero']) {
      expect(screen.getAllByTestId(id)).toHaveLength(1)
    }
  })

  // #3280 — « mets ça sur une ligne, une ligne où tu condenses ces infos » :
  // hero, libellé, badge et phrase partagent UNE rangée (repliable sous md),
  // plus une pile verticale (`space-y-*`).
  it('#3280 — le verdict tient sur une ligne : phrase, badge et titre dans la même rangée flex', async () => {
    renderWithRouter(<AccountVerdictSummary account={compte()} />, '/accounts/test-id')
    const verdict = await screen.findByTestId('account-verdict-summary')
    const row = verdict.querySelector('[data-testid="verdict-row"]') as HTMLElement
    expect(row).not.toBeNull()
    expect(row.className).toContain('flex-wrap')
    expect(row.className).not.toContain('space-y')
    // #3499 — « Ce qu'il faut retenir » : le titre et le verdict NOMMÉ sur la
    // rangée, la phrase lisible juste dessous ; plus de score en haut de page.
    expect(row.textContent).toContain("Ce qu'il faut retenir")
    expect(verdict.textContent).toContain('Compte prioritaire')
    // #2932 — le verdict se lit sous son nom MÉTIER quand il existe, sinon le code brut.
    expect(verdict.textContent).toMatch(
      /AGIR MAINTENANT|QUALIFIER|RÉSERVE|METTRE EN VEILLE|ÉCARTER POUR CET OBJECTIF|GO|PRUDENT|NO-GO|EXPLORER/,
    )
    expect(verdict.querySelector('[data-testid="score-circle"]')).toBeNull()
  })

  it('⚠️ SAIT DIRE NON — sans dossier analysé (score et phrase absents), le bloc ne s’affiche pas', async () => {
    renderWithRouter(
      <AccountVerdictSummary account={compte({ priority_score: null, priority_justification: null })} />,
      '/accounts/test-id',
    )

    await waitFor(() => expect(document.body).toBeTruthy())
    expect(screen.queryByTestId('account-verdict-summary')).not.toBeInTheDocument()
  })
})
