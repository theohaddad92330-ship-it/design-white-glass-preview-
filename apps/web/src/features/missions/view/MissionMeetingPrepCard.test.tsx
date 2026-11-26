import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #4424.3 — la préparation du rendez-vous (pitch / R1) est PERSISTANTE sur la fiche mission, tant qu'aucun
 * compte rendu de R1 n'existe sur le compte ; le calcul reste celui du panneau de la fiche compte (GA-26).
 */

let factsBrief: { meetings?: { date: string; kind: 'meeting'; label: string }[] } | null = null

vi.mock('@/features/accounts/hooks/useAccount', () => ({
  useAccount: () => ({ account: { company_name: 'Airbus', it_challenges: [] } }),
}))
vi.mock('@/features/account-facts/useAccountFactsBrief', () => ({
  useAccountFactsBrief: () =>
    factsBrief
      ? { asOf: '2026-10-21T00:00:00.000Z', deals: [], missions: [], recurringNeeds: [], exchanges: [], ...factsBrief }
      : null,
}))
vi.mock('@/features/accounts/view/account-detail/tabs/plan/MeetingR1R2Panel', () => ({
  MeetingR1R2Panel: ({ accountId, companyName }: { accountId: string; companyName: string | null }) => (
    <div data-testid="r1r2-panel">{`${accountId}:${companyName}`}</div>
  ),
}))

const { MissionMeetingPrepCard } = await import('./MissionMeetingPrepCard')

describe('MissionMeetingPrepCard — #4424.3', () => {
  beforeEach(() => {
    factsBrief = null
  })

  it('reste visible sur la fiche tant que le R1 n’a pas eu lieu, et ouvre la préparation sur le bon compte', () => {
    render(<MissionMeetingPrepCard accountId="a1" accountName="Airbus" />)
    expect(screen.getByRole('heading', { name: 'Préparer le rendez-vous' })).toBeInTheDocument()
    expect(screen.queryByTestId('r1r2-panel')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Préparer le rendez-vous' }))
    expect(screen.getByTestId('r1r2-panel')).toHaveTextContent('a1:Airbus')
  })

  it('disparaît quand un compte rendu de R1 existe (le R2 se prépare depuis la fiche compte)', () => {
    factsBrief = { meetings: [{ date: '2026-10-01', kind: 'meeting', label: 'CR du R1 Airbus' }] }
    const { container } = render(<MissionMeetingPrepCard accountId="a1" accountName="Airbus" />)
    expect(container).toBeEmptyDOMElement()
  })
})
