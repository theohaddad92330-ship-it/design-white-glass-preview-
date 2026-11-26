import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AccountFactsBrief } from '@bellum/contracts'
import { AccountDealFactsSection } from './AccountDealFactsSection'

const brief = vi.hoisted(() => ({ value: null as AccountFactsBrief | null }))
vi.mock('@/features/account-facts/useAccountFactsBrief', () => ({
  useAccountFactsBrief: () => brief.value,
}))

// #3918.1 — recette prod R4b, SNCF RESEAU et SG : les affaires CRM gagnées /
// perdues / en sommeil n'apparaissaient sur AUCUN écran de la fiche compte,
// alors que le socle de faits (#4069/#4072) et son rendu (`AccountFactLines`)
// existaient déjà — seule la préparation de RDV les montrait.
describe('AccountDealFactsSection — #3918.1, les affaires CRM sur la fiche compte', () => {
  it('liste les affaires gagnées / perdues / en sommeil, datées', () => {
    brief.value = {
      asOf: '2026-10-14T08:00:00.000Z',
      deals: [
        { date: '2026-08-01', kind: 'deal_lost', label: 'Migration cloud' },
        { date: '2026-07-01', kind: 'deal_dormant', label: 'TMA SI RH' },
      ],
      missions: [],
      recurringNeeds: [],
      exchanges: [],
      notes: [],
    }
    render(<AccountDealFactsSection accountId="a1" />)
    expect(screen.getByText(/Migration cloud/)).toBeInTheDocument()
    expect(screen.getByText(/TMA SI RH/)).toBeInTheDocument()
  })

  it('#4069.4 — les notes de l’équipe se lisent aussi, sous leur propre titre', () => {
    brief.value = {
      asOf: '2026-10-14T08:00:00.000Z',
      deals: [],
      missions: [],
      recurringNeeds: [],
      exchanges: [],
      notes: [{ date: '2026-10-01', kind: 'note', label: 'Budget gelé jusqu’en janvier' }],
    }
    render(<AccountDealFactsSection accountId="a1" />)
    expect(screen.getByText(/Budget gelé jusqu’en janvier/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Notes de l’équipe' })).toBeInTheDocument()
  })

  it('aucune affaire connue : la section ne rend rien', () => {
    brief.value = {
      asOf: '2026-10-14T08:00:00.000Z',
      deals: [],
      missions: [],
      recurringNeeds: [],
      exchanges: [],
      notes: [],
    }
    const { container } = render(<AccountDealFactsSection accountId="a1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lecture en échec (`null`) : rien d’inventé, la section ne rend rien', () => {
    brief.value = null
    const { container } = render(<AccountDealFactsSection accountId="a1" />)
    expect(container).toBeEmptyDOMElement()
  })
})
