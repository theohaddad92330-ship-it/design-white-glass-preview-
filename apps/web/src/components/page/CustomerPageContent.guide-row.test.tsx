/**
 * #4578 — « Comment travailler ici ? » et les gestes de la page tiennent sur UNE ligne : le lien est
 * rendu dans l'en-tête, juste avant les actions, au lieu d'un `<div>` frère qui tombait en dessous.
 * Prouvé sur le rendu (même parent, ordre du DOM = ordre de tabulation), pas sur une classe CSS.
 */
import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/test/i18n-default-language'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/profiles/hooks/useOnboardingStatus', () => ({
  useOnboardingStatus: () => ({ needsOnboarding: false, isLoading: false }),
}))
vi.mock('@/components/access/useRouteAccess', () => ({
  useCurrentRouteAccess: () => ({ pending: false, access: { state: 'granted' } }),
}))
vi.mock('@/components/access/CapabilityBanner', () => ({ CapabilityBanner: () => null }))
vi.mock('@/components/shell/ShellTopbar', () => ({ ShellTopbar: () => null }))
vi.mock('@/components/navigation/SectionTabs', () => ({ SectionTabs: () => null }))
vi.mock('@/components/layout/DemoModeBanner', () => ({ DemoModeBanner: () => null }))
vi.mock('./OnboardingRefreshBanner', () => ({ OnboardingRefreshBanner: () => null }))
vi.mock('./OnboardingPermanentLink', () => ({ OnboardingPermanentLink: () => null }))
vi.mock('./ReturnToConversationBanner', () => ({ ReturnToConversationBanner: () => null }))
vi.mock('@/features/guide/GuideHelpCenter', () => ({ GuideHelpCenter: () => null }))

const { CustomerPageContent } = await import('./CustomerPageContent')

afterEach(cleanup)

function actions() {
  return (
    <div>
      <button type="button">Importer</button>
      <button type="button">Analyser un compte</button>
    </div>
  )
}

describe('CustomerPageContent — le lien d’aide dans la rangée des gestes (#4578)', () => {
  it('le lien et les deux boutons vivent dans la même rangée de l’en-tête, le lien en premier', async () => {
    renderWithRouter(
      <CustomerPageContent pageTitle="Comptes" headerActions={actions()}>
        <p>corps</p>
      </CustomerPageContent>,
      '/accounts',
    )
    const link = await screen.findByRole('button', { name: 'Comment travailler ici ?' })
    const header = link.closest('header')
    expect(header).not.toBeNull()
    expect(header).toContainElement(screen.getByRole('button', { name: 'Importer' }))
    const row = link.closest('[data-shell="header-actions"]') as HTMLElement
    expect(row).not.toBeNull()
    expect(row).toContainElement(screen.getByRole('button', { name: 'Analyser un compte' }))
    const order = Array.from(row.querySelectorAll('button')).map(b => b.textContent?.trim())
    expect(order).toEqual(['Comment travailler ici ?', 'Importer', 'Analyser un compte'])
    expect(screen.getAllByText('Comment travailler ici ?')).toHaveLength(1)
  })

  it('#4578.6 — la cible du lien garde son plancher 44 px (mobile) et la rangée ne réordonne rien au clavier', async () => {
    renderWithRouter(
      <CustomerPageContent pageTitle="Comptes" headerActions={actions()}>
        <p>corps</p>
      </CustomerPageContent>,
      '/accounts',
    )
    const link = await screen.findByRole('button', { name: 'Comment travailler ici ?' })
    expect(link.className).toContain('min-h-11')
    const row = link.closest('[data-shell="header-actions"]') as HTMLElement
    // Ordre de tabulation = ordre du DOM = ordre visuel : aucun tabindex positif, aucune rangée inversée.
    expect(row.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])')).toHaveLength(0)
    expect(row.className).not.toMatch(/flex-row-reverse|order-/)
  })

  it('un écran sans gestes garde le lien dans l’en-tête, sans bande vide en dessous', async () => {
    const { container } = renderWithRouter(
      <CustomerPageContent pageTitle="Comptes">
        <p>corps</p>
      </CustomerPageContent>,
      '/accounts',
    )
    const link = await screen.findByRole('button', { name: 'Comment travailler ici ?' })
    expect(link.closest('header')).not.toBeNull()
    expect(container.querySelectorAll('[data-shell="screen-guide"]')).toHaveLength(1)
  })

  it('un écran qui porte son propre guide garde le repli sous l’en-tête, jamais un second lien', async () => {
    const { container } = renderWithRouter(
      <CustomerPageContent pageTitle="Comptes" headerActions={actions()} screenGuide={<p>Texte du guide</p>}>
        <p>corps</p>
      </CustomerPageContent>,
      '/accounts',
    )
    await screen.findByText('Texte du guide')
    expect(container.querySelector('header [data-shell="screen-guide"]')).toBeNull()
    expect(screen.getAllByText('Comment travailler ici ?')).toHaveLength(1)
  })
})
