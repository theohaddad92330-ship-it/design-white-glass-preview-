import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { useProfileContext } from '@/features/profile-context/hooks/useProfileContext'
import { useRegenerateProfileContext } from '@/features/profile-context/hooks/useRegenerateProfileContext'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { useHasAccountsToAct } from '@/features/accounts/hooks/useHasAccountsToAct'
import { ProfileContextSubPage } from './ProfileContextSubPage'

vi.mock('@/features/profile-context/hooks/useProfileContext', () => ({ useProfileContext: vi.fn() }))
vi.mock('@/features/profile-context/hooks/useRegenerateProfileContext', () => ({
  useRegenerateProfileContext: vi.fn(),
}))
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({ useEsnProfile: vi.fn() }))
vi.mock('@/features/accounts/hooks/useHasAccountsToAct', () => ({ useHasAccountsToAct: vi.fn() }))
vi.mock('@/features/profile/hooks/useReconfigureOnboarding', () => ({
  useReconfigureOnboarding: () => ({ available: true, alreadyRequested: false, pending: false, trigger: vi.fn() }),
}))

/**
 * #3252.12 — la restitution de fin d'onboarding reste visible dans
 * `Paramètres › Profil` (SURFACE de #3252), MÊME composant que `/welcome`
 * (GA-26) : `CoachingFooter` n'a plus de rendu séparé ici.
 */
describe('ProfileContextSubPage — restitution (#3252)', () => {
  it('renders the onboarding restitution, without any weakest-link block (Cockpit seul), never a bare CoachingFooter', async () => {
    vi.mocked(useProfileContext).mockReturnValue({
      data: {
        status: 'ready',
        profile_context: {
          welcomeSummary: undefined,
          coachingInsights: { mainWeakness: 'prospection irrégulière', keyAdvice: 'régularité bat intensité' },
        },
        corrections: {},
        withheld: undefined,
        sourceHealth: undefined,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useProfileContext>)
    vi.mocked(useRegenerateProfileContext).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useRegenerateProfileContext>)
    vi.mocked(useEsnProfile).mockReturnValue({ data: null, isLoading: false } as unknown as ReturnType<
      typeof useEsnProfile
    >)
    vi.mocked(useHasAccountsToAct).mockReturnValue({ data: { hasAccountsToAct: false } } as unknown as ReturnType<
      typeof useHasAccountsToAct
    >)

    renderWithRouter(<ProfileContextSubPage />)

    expect(await screen.findByText("Ce n'est pas mon contexte")).toBeInTheDocument()
    expect(screen.queryByText('prospection irrégulière')).toBeNull()
    expect(screen.queryByText('Ton principal maillon faible')).toBeNull()
    expect(screen.getByText("Ce n'est pas mon contexte")).toBeInTheDocument()
  })
})
