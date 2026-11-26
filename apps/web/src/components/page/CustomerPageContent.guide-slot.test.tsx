/**
 * #4654 — « Comment travailler ici ? » sur la MÊME ligne que le titre de l'écran et ses gestes, jamais seul sur une
 * rangée. Prouvé sur le rendu : ni `<header>` vide réservé par la coque, ni second lien, ni zéro.
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
const { ScreenIntro } = await import('@/components/primitives/ScreenIntro')

afterEach(cleanup)

const LINK = 'Comment travailler ici ?'

function intro(action = <button type="button">Nouvelle affaire</button>) {
  return <ScreenIntro title="Affaires" titleWithoutName="Affaires" subtitle="Ton pipe" action={action} />
}

describe('« Comment travailler ici ? » sur la rangée du titre (#4654)', () => {
  it('écran titleInScreen sans gestes : le lien est dans la rangée du titre, avant le bouton, et la coque ne réserve aucune rangée', async () => {
    const { container } = renderWithRouter(
      <CustomerPageContent pageTitle="Affaires" titleInScreen>
        {intro()}
      </CustomerPageContent>,
      '/projects',
    )
    const link = await screen.findByRole('button', { name: LINK })
    const h1 = screen.getByRole('heading', { level: 1, name: 'Affaires' })
    const row = h1.parentElement?.parentElement as HTMLElement
    expect(row).toContainElement(link)
    const order = Array.from(row.querySelectorAll('button')).map(b => b.textContent?.trim())
    expect(order).toEqual([LINK, 'Nouvelle affaire'])
    // La coque n'a plus rien à y dire : aucun <header> vide, donc aucune bande entre onglets et titre.
    expect(container.querySelector('header')).toBeNull()
    expect(screen.getAllByText(LINK)).toHaveLength(1)
  })

  it('un écran qui n’offre aucun emplacement garde le lien dans l’en-tête : jamais zéro', async () => {
    const { container } = renderWithRouter(
      <CustomerPageContent pageTitle="Affaires" titleInScreen>
        <p>corps sans emplacement</p>
      </CustomerPageContent>,
      '/projects',
    )
    const link = await screen.findByRole('button', { name: LINK })
    expect(link.closest('header')).not.toBeNull()
    expect(container.querySelectorAll('[data-shell="screen-guide"]')).toHaveLength(1)
  })

  it('deux en-têtes dans le même écran : un seul lien, jamais deux', async () => {
    renderWithRouter(
      <CustomerPageContent pageTitle="Affaires" titleInScreen>
        {intro()}
        {intro(<button type="button">Autre</button>)}
      </CustomerPageContent>,
      '/projects',
    )
    await screen.findByRole('button', { name: LINK })
    expect(screen.getAllByText(LINK)).toHaveLength(1)
  })

  it('un écran avec gestes d’en-tête garde le lien dans la rangée de la coque (#4578), pas dans la sienne', async () => {
    renderWithRouter(
      <CustomerPageContent pageTitle="Comptes" headerActions={<button type="button">Importer</button>} titleInScreen>
        {intro()}
      </CustomerPageContent>,
      '/accounts',
    )
    const link = await screen.findByRole('button', { name: LINK })
    expect(link.closest('[data-shell="header-actions"]')).not.toBeNull()
    expect(screen.getAllByText(LINK)).toHaveLength(1)
  })
})
