import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAccountLastOutcome } from '../hooks/useAccountLastOutcome'
import { AccountLastOutcomeLine } from './AccountLastOutcomeLine'

vi.mock('../hooks/useAccountLastOutcome', () => ({ useAccountLastOutcome: vi.fn(() => null) }))

/**
 * #3287 (recette prod 02/10, Y18) — /briefing démo : SNCF listé (« Comptes à prioriser », « Comptes qui ont
 * bougé ») sans aucune ligne « Dernier résultat déclaré : Qualifié ». La ligne n'existait que sur la carte
 * de priorité : toute ligne de compte du briefing la porte maintenant, par ce seul composant.
 */
describe('AccountLastOutcomeLine — #3287', () => {
  it('dit le dernier résultat déclaré du compte', () => {
    vi.mocked(useAccountLastOutcome).mockReturnValue({
      id: 'i1',
      execution_status: 'done',
      outcome: 'qualified',
      completed_at: '2026-09-30T10:00:00Z',
    } as unknown as ReturnType<typeof useAccountLastOutcome>)
    render(<AccountLastOutcomeLine accountId="acc-sncf" />)
    expect(screen.getByText('Dernier résultat déclaré : Qualifié')).toBeInTheDocument()
  })

  it('ne rend rien sans action faite qui porte une issue, ni sans compte', () => {
    vi.mocked(useAccountLastOutcome).mockReturnValue(null)
    const { container } = render(<AccountLastOutcomeLine accountId="acc-vide" />)
    expect(container).toBeEmptyDOMElement()
    const none = render(<AccountLastOutcomeLine accountId={undefined} />)
    expect(none.container).toBeEmptyDOMElement()
  })
})
