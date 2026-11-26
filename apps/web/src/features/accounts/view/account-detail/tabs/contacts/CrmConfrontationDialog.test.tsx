import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CrmConfrontationDialog } from './CrmConfrontationDialog'

const confrontationMock = vi.fn()
vi.mock('@/features/contacts/hooks/useCrmConfrontation', () => ({
  useCrmConfrontation: () => confrontationMock(),
}))
vi.mock('@/features/contacts/hooks/useHideContact', () => ({ useHideContact: () => ({ mutate: vi.fn() }) }))

const open = () => render(<CrmConfrontationDialog accountId="a-1" open onOpenChange={() => undefined} />)

// #4680 — la confrontation lit l'instantané IMPORTÉ en base et le dit ; « aucun CRM branché » = le cas réellement vide.
describe('CrmConfrontationDialog — import en base', () => {
  beforeEach(() => confrontationMock.mockReset())

  it('ni connecteur ni import : le message « Aucun CRM branché » reste, exactement', () => {
    confrontationMock.mockReturnValue({
      data: { connected: false, snapshotAt: null, pairs: [] },
      isLoading: false,
      isError: false,
    })
    open()
    expect(screen.getByText('Aucun CRM branché')).toBeInTheDocument()
    expect(screen.queryByTestId('confrontation-imported')).toBeNull()
  })

  it('un import en base est confronté : la source est nommée et la date de l’instantané est dite', () => {
    confrontationMock.mockReturnValue({
      data: { connected: false, imported: true, snapshotAt: '2026-10-20T08:00:00.000Z', pairs: [] },
      isLoading: false,
      isError: false,
    })
    open()
    expect(screen.queryByText('Aucun CRM branché')).toBeNull()
    expect(screen.getByTestId('confrontation-imported')).toHaveTextContent('contacts importés de ton CRM')
    expect(screen.getByText(/Instantané du/)).toBeInTheDocument()
  })

  it('SAIT DIRE NON — import sans date : « Fraîcheur non mesurée », jamais une date devinée', () => {
    confrontationMock.mockReturnValue({
      data: { connected: false, imported: true, snapshotAt: null, pairs: [] },
      isLoading: false,
      isError: false,
    })
    open()
    expect(screen.getByText('Fraîcheur non mesurée')).toBeInTheDocument()
    expect(screen.queryByText(/Instantané du/)).toBeNull()
  })

  it('le seul geste proposé reste MASQUER (aucune fusion)', () => {
    confrontationMock.mockReturnValue({
      data: {
        connected: false,
        imported: true,
        snapshotAt: null,
        pairs: [
          {
            crmContact: { id: 'i-1', fullName: 'Didier Montandon', email: 'd@x.fr' },
            bellumContact: { id: 'b-1', fullName: 'Didier Montandon', email: 'd@x.fr' },
            reason: 'same_email',
            confidence: 0.95,
          },
        ],
      },
      isLoading: false,
      isError: false,
    })
    open()
    expect(screen.queryByRole('button', { name: /fusionn/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Garder la fiche CRM' })).toBeInTheDocument()
  })
})
