import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const demo = vi.hoisted(() => ({ isDemo: true }))
vi.mock('@/components/layout/DemoModeBanner', () => ({
  DemoModeBanner: () => (demo.isDemo ? <div role="status">MODE DÉMO</div> : null),
}))
vi.mock('@/components/sidebar/SettingsNavbarBody', () => ({ SettingsNavbarBody: () => <nav /> }))
vi.mock('@/features/mobile/MobileShell', () => ({
  MobileShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/features/mobile/useIsMobile', () => ({ useIsMobile: () => true }))
vi.mock('@/features/profiles/hooks/useOnboardingStatus', () => ({
  useOnboardingStatus: () => ({ needsOnboarding: false, isLoading: false }),
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/components/navigation/RedirectTo', () => ({ RedirectTo: () => null }))
vi.mock('../GlobalLoadingState', () => ({ GlobalLoadingState: () => null }))

import { SettingsPage } from './SettingsPage'

// Recette prod 02/10 — « /settings en démo : bandeau MODE DÉMO absent sur Préférences ».
describe('SettingsPage — le bandeau MODE DÉMO (recette 02/10)', () => {
  it('est monté au-dessus du contenu des réglages', () => {
    demo.isDemo = true
    render(
      <SettingsPage>
        <p>Préférences</p>
      </SettingsPage>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('MODE DÉMO')
    expect(screen.getByText('Préférences')).toBeInTheDocument()
  })

  it('⚠️ SAIT DIRE NON — espace réel : aucun bandeau', () => {
    demo.isDemo = false
    render(
      <SettingsPage>
        <p>Préférences</p>
      </SettingsPage>,
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it("#2958.5 — `anchorId` pose l'id sur le contenu : `/settings#parametres` a une cible", () => {
    render(
      <SettingsPage anchorId="parametres">
        <p>Préférences</p>
      </SettingsPage>,
    )
    expect(document.getElementById('parametres')).toContainElement(screen.getByText('Préférences'))
  })

  it("#2958.5 — sans `anchorId`, aucun id n'est inventé", () => {
    const { container } = render(
      <SettingsPage>
        <p>Préférences</p>
      </SettingsPage>,
    )
    expect(container.querySelector('[id]')).toBeNull()
  })
})
