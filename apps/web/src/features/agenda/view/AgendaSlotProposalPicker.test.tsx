import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Le menu Radix ne s'ouvre pas sous jsdom : un double à la forme de `SelectField` suffit à prouver le câblage.
vi.mock('@bellum/ui', async importActual => {
  const actual = await importActual<typeof import('@bellum/ui')>()
  return {
    ...actual,
    SelectField: ({
      ariaLabel,
      value,
      onChange,
      options,
    }: {
      ariaLabel: string
      value: string
      onChange: (value: string) => void
      options: { value: string; label: string }[]
    }) => (
      <select aria-label={ariaLabel} value={value} onChange={changed => onChange(changed.target.value)}>
        <option value="" />
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
  }
})
vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({
    data: {
      pages: [
        {
          data: [
            { id: 'a1', company_name: 'Airbus' },
            { id: 'a2', company_name: 'Orange' },
          ],
        },
      ],
    },
  }),
}))
vi.mock('@/features/accounts/view/account-detail/components/AgendaSlotProposalTrigger', () => ({
  AgendaSlotProposalTrigger: ({ accountId, companyName }: { accountId: string; companyName: string }) => (
    <div data-testid="trigger">{`${accountId}:${companyName}`}</div>
  ),
}))

const { AgendaSlotProposalPicker } = await import('./AgendaSlotProposalPicker')

// Théo A today-agenda.A5 — proposer un créneau pour un compte, depuis l'agenda.
describe('AgendaSlotProposalPicker', () => {
  it('ne propose rien tant qu’aucun compte n’est choisi', () => {
    render(<AgendaSlotProposalPicker />)
    expect(screen.queryByTestId('trigger')).toBeNull()
  })

  it('monte la porte de proposition sur le compte choisi', () => {
    render(<AgendaSlotProposalPicker />)
    fireEvent.change(screen.getByLabelText('Proposer un créneau à un compte'), { target: { value: 'a2' } })
    expect(screen.getByTestId('trigger')).toHaveTextContent('a2:Orange')
  })
})
