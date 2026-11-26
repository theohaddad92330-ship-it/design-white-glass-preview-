import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { NeedVerdictProfile } from '@bellum/contracts'

const profiles = vi.fn((): NeedVerdictProfile[] => [])
vi.mock('../hooks/useNeedVerdict', () => ({
  useNeedVerdict: () => ({ profiles: profiles(), isLoading: false, isError: false }),
}))

const { NeedVerdictProfiles } = await import('./NeedVerdictProfiles')

function profile(over: Partial<NeedVerdictProfile> = {}): NeedVerdictProfile {
  return {
    consultantId: '55555555-5555-4555-8555-555555555555',
    fullName: 'Camille Moreau',
    correspondenceScore: 92,
    pushableScore: 78,
    acceptance: [],
    consentState: 'valid',
    consentDaysLeft: null,
    ...over,
  }
}

describe('Refonte Théo — les profils du verdict, sans aucun score en points', () => {
  it('écrit la correspondance en clair et jamais « 92 » ni « 78 »', () => {
    profiles.mockReturnValue([
      profile({
        inClear: {
          correspondsSkills: ['SAP S/4HANA'],
          correspondsAxes: [],
          partialAxes: [],
          lacksSkills: ['Migration'],
          lacksAxes: [],
          toConfirmSkills: [],
          toConfirmAxes: [],
        },
      }),
    ])
    const { container } = render(<NeedVerdictProfiles needId="n-1" onCompare={() => undefined} />)
    expect(screen.getByTestId('verdict-profile-in-clear')).toHaveTextContent(
      'Correspond : SAP S/4HANA · Manque : Migration',
    )
    expect(container.textContent).not.toMatch(/92|78/)
  })

  it('sans lecture en clair (API plus ancienne), ne rend aucun nombre à la place', () => {
    profiles.mockReturnValue([profile()])
    const { container } = render(<NeedVerdictProfiles needId="n-1" onCompare={() => undefined} />)
    expect(screen.queryByTestId('verdict-profile-in-clear')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/92|78/)
  })
})
