/**
 * #4364.2 — l'APPELANT : le lien permanent vers le questionnaire est monté dans la coque de l'accueil
 * (`/briefing`), et nulle part ailleurs. Le refus de droits est prouvé dans `OnboardingPermanentLink.test.tsx`.
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
vi.mock('./ReturnToConversationBanner', () => ({ ReturnToConversationBanner: () => null }))
vi.mock('./OnboardingPermanentLink', () => ({
  OnboardingPermanentLink: () => <button type="button">lien-permanent</button>,
}))
vi.mock('@/features/guide/GuideHelpCenter', () => ({ GuideHelpCenter: () => null }))

const { CustomerPageContent } = await import('./CustomerPageContent')

afterEach(() => {
  cleanup()
  window.history.pushState({}, '', '/')
})

describe('CustomerPageContent — le lien permanent vers le questionnaire (#4364.2)', () => {
  it('est monté sur l’accueil', async () => {
    window.history.pushState({}, '', '/briefing')
    renderWithRouter(
      <CustomerPageContent pageTitle="Briefing">
        <p>corps</p>
      </CustomerPageContent>,
      '/briefing',
    )
    expect(await screen.findByRole('button', { name: 'lien-permanent' })).toBeInTheDocument()
  })

  it('sait dire NON : il n’est pas monté sur les autres écrans', async () => {
    window.history.pushState({}, '', '/accounts')
    renderWithRouter(
      <CustomerPageContent pageTitle="Comptes">
        <p>corps</p>
      </CustomerPageContent>,
      '/accounts',
    )
    await screen.findByText('corps')
    expect(screen.queryByRole('button', { name: 'lien-permanent' })).toBeNull()
  })
})
