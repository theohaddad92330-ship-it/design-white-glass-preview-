import { screen, within } from '@testing-library/react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ProfilePage } from './ProfilePage'

/**
 * Refonte Théo V22 (`settings-espace#profil`) — la STRUCTURE de Réglages › Profil, dans l'ordre de la maquette :
 * l'en-tête (eyebrow, h1, phrase), l'aperçu (carte du cadrage | carte de maturité), les thèmes EN CARTES sur deux
 * colonnes, « Ce que Laura sait de ton ESN », l'identité, la sécurité, puis la zone sensible REPLIÉE.
 */
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({
  useEsnProfile: () => ({ data: { company_name: 'Altaïs' }, isLoading: false }),
}))
vi.mock('@/features/profiles/hooks/useProfile', () => ({
  useProfile: () => ({
    data: { first_name: 'Théo', last_name: 'Haddad', email: 'theo@altais.fr' },
    isLoading: false,
  }),
}))
vi.mock('@/features/commercial-audit/hooks/useCommercialAudit', () => ({
  useCommercialAudit: () => ({
    auditContext: { maturity: {} },
    validatedAt: null,
    isPendingReview: false,
    isLoading: false,
  }),
}))
vi.mock('@/features/profile/hooks/useEsnProfileWorkspaceMeta', () => ({
  useEsnProfileWorkspaceMeta: () => ({ data: { shared: false, canEditCompany: true } }),
}))
vi.mock('@/features/profile/hooks/useImpactedAccounts', () => ({ useImpactedAccounts: () => ({ data: null }) }))
vi.mock('@/features/commercial-audit/components/ValidateContextStatus', () => ({
  ValidateContextStatus: () => <p>Cadrage à valider</p>,
}))
vi.mock('../components/ProfileMaturitySection', () => ({
  ProfileMaturitySection: () => <h2>Ta maturité commerciale</h2>,
}))
const { stub } = vi.hoisted(() => ({
  stub: (name: string) => () => <section aria-label={name} />,
}))
vi.mock('../components/OfferPortfolioSection', () => ({ OfferPortfolioSection: stub('offre') }))
vi.mock('../components/PlacedRolesSection', () => ({ PlacedRolesSection: stub('postes placés') }))
vi.mock('../components/TargetPersonasSection', () => ({ TargetPersonasSection: stub('personas') }))
vi.mock('@/features/work-contexts/view/WorkContextsSection', () => ({ WorkContextsSection: stub('contextes') }))
vi.mock('../components/EsnMarketMemorySection', () => ({ EsnMarketMemorySection: stub('mémoire marché') }))
vi.mock('../components/MyBusinessUnitsSection', () => ({ MyBusinessUnitsSection: stub('périmètres') }))
vi.mock('../components/ProfileContextSection', () => ({ ProfileContextSection: stub('contexte') }))
vi.mock('../components/SecuritySection', () => ({ SecuritySection: stub('sécurité') }))
vi.mock('../components/ReconfigureAnswersSection', () => ({ ReconfigureAnswersSection: stub('reconfigurer') }))
vi.mock('../components/DangerZoneSection', () => ({ DangerZoneSection: stub('zone danger') }))

const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('Réglages › Profil — structure Théo V22', () => {
  it('un seul h1, puis l’aperçu (cadrage | maturité), les thèmes, le contexte, l’identité, la zone sensible', async () => {
    const { container } = renderWithRouter(<ProfilePage />)
    const h1 = await screen.findByRole('heading', { level: 1, name: /profil de travail/i })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)

    const overview = container.querySelector('[data-profile-overview]')
    expect(overview).not.toBeNull()
    expect(within(overview as HTMLElement).getByRole('link', { name: 'Voir mon audit' })).toBeInTheDocument()
    expect(
      within(overview as HTMLElement).getByRole('heading', { name: 'Ta maturité commerciale' }),
    ).toBeInTheDocument()

    const themes = container.querySelector('[data-profile-themes]')
    expect(themes?.className).toContain('md:grid-cols-2')
    expect(themes?.querySelectorAll('[data-profile-section="card"]').length).toBeGreaterThan(0)

    const context = screen.getByRole('region', { name: /sait de ton ESN/i })
    const identity = screen.getByRole('heading', { level: 2, name: 'Identité' })
    const sensitive = container.querySelector('details[data-profile-sensitive]') as HTMLDetailsElement

    expect(follows(h1, overview as Element)).toBe(true)
    expect(follows(overview as Element, themes as Element)).toBe(true)
    expect(follows(themes as Element, context)).toBe(true)
    expect(follows(context, identity)).toBe(true)
    expect(follows(identity, sensitive)).toBe(true)
    // NON : la zone sensible ne s'ouvre pas d'elle-même.
    expect(sensitive.open).toBe(false)
    expect(within(sensitive).getByLabelText('zone danger')).toBeInTheDocument()
  })

  // #4364.4 — « Revoir mes réponses » est dans le PREMIER écran : après l'en-tête, AVANT les thèmes ; jamais dans la zone repliée.
  it('#4364.4 — « Revoir mes réponses » suit l’en-tête et précède les thèmes, hors de la zone sensible', async () => {
    const { container } = renderWithRouter(<ProfilePage />)
    const h1 = await screen.findByRole('heading', { level: 1, name: /profil de travail/i })
    const reconfigure = screen.getByLabelText('reconfigurer')
    const themes = container.querySelector('[data-profile-themes]') as Element
    const sensitive = container.querySelector('details[data-profile-sensitive]') as HTMLElement

    expect(follows(h1, reconfigure)).toBe(true)
    expect(follows(reconfigure, themes)).toBe(true)
    expect(within(sensitive).queryByLabelText('reconfigurer')).toBeNull()
  })

  it('NON : le titre d’un bloc vit DANS sa carte — l’identité n’a plus de titre posé au-dessus d’une carte', async () => {
    renderWithRouter(<ProfilePage />)
    const identity = await screen.findByRole('heading', { level: 2, name: 'Identité' })
    expect(identity.closest('section')?.className).toContain('rounded-xl')
  })
})
