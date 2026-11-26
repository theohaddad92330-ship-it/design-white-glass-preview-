import type { Account } from '@bellum/contracts'
import type { CrmDealPipelines, CrmPresence } from '@/features/crm/api'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CrmOpenDealsBatchAdvance } from './CrmOpenDealsBatchAdvance'

const useCrmPresenceMock = vi.fn()
vi.mock('@/features/crm/hooks/useCrmPresence', () => ({
  useCrmPresence: (...args: unknown[]) => useCrmPresenceMock(...args),
}))

const useCrmDealPipelinesMock = vi.fn()
vi.mock('@/features/crm/hooks/useCrmDealPipelines', () => ({
  useCrmDealPipelines: (...args: unknown[]) => useCrmDealPipelinesMock(...args),
}))

const proposeMutate = vi.fn()
const useProposeDealsBatchMock = vi.fn(() => ({ mutate: proposeMutate, isPending: false }))
vi.mock('@/features/crm/api', () => ({
  useProposeDealsBatch: () => useProposeDealsBatchMock(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const account = { id: 'a-1', company_name: 'ACME', website: 'https://acme.fr', siren: '123456789' } as Account

function presence(overrides: Partial<CrmPresence>): CrmPresence {
  return {
    provider: null,
    matched: false,
    contactsCount: 0,
    contacts: [],
    openDeals: [],
    lastActivityAt: null,
    ...overrides,
  }
}

const READY_PIPELINES: CrmDealPipelines = {
  status: 'ready',
  pipelines: [
    {
      id: 'default',
      label: 'Pipeline commercial',
      stages: [
        { id: 'appointmentscheduled', label: 'Découverte' },
        { id: 'contractsent', label: 'Négociation' },
      ],
    },
  ],
}

describe('CrmOpenDealsBatchAdvance (present-only, un lot dès deux affaires)', () => {
  it('renders nothing under two open deals', () => {
    useCrmPresenceMock.mockReturnValue({ data: presence({ provider: 'hubspot', matched: true, openDeals: [] }) })
    useCrmDealPipelinesMock.mockReturnValue({ data: undefined })
    const { container } = render(<CrmOpenDealsBatchAdvance account={account} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing with exactly one open deal — a batch needs at least two', () => {
    useCrmPresenceMock.mockReturnValue({
      data: presence({
        provider: 'hubspot',
        matched: true,
        openDeals: [{ id: 'd1', name: 'TMA', stage: 'appointmentscheduled', amount: null }],
      }),
    })
    useCrmDealPipelinesMock.mockReturnValue({ data: undefined })
    const { container } = render(<CrmOpenDealsBatchAdvance account={account} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the trigger with two or more open deals, and lists each as a checkbox', () => {
    useCrmPresenceMock.mockReturnValue({
      data: presence({
        provider: 'hubspot',
        matched: true,
        openDeals: [
          { id: 'd1', name: 'TMA Data', stage: 'appointmentscheduled', amount: null },
          { id: 'd2', name: 'Refonte site', stage: 'appointmentscheduled', amount: null },
        ],
      }),
    })
    useCrmDealPipelinesMock.mockReturnValue({ data: READY_PIPELINES })
    render(<CrmOpenDealsBatchAdvance account={account} />)
    fireEvent.click(screen.getByText('Faire avancer le lot'))
    expect(screen.getByText('TMA Data')).toBeInTheDocument()
    expect(screen.getByText('Refonte site')).toBeInTheDocument()
  })

  it('keeps the submit button disabled until a deal AND a target stage are chosen', () => {
    useCrmPresenceMock.mockReturnValue({
      data: presence({
        provider: 'hubspot',
        matched: true,
        openDeals: [
          { id: 'd1', name: 'TMA Data', stage: 'appointmentscheduled', amount: null },
          { id: 'd2', name: 'Refonte site', stage: 'appointmentscheduled', amount: null },
        ],
      }),
    })
    useCrmDealPipelinesMock.mockReturnValue({ data: READY_PIPELINES })
    render(<CrmOpenDealsBatchAdvance account={account} />)
    fireEvent.click(screen.getByText('Faire avancer le lot'))
    expect(screen.getByText('Proposer le lot').closest('button')).toBeDisabled()
  })

  it('proposes each selected deal as a typed deal_stage item, never a free kind/payload', () => {
    useCrmPresenceMock.mockReturnValue({
      data: presence({
        provider: 'hubspot',
        matched: true,
        openDeals: [
          { id: 'd1', name: 'TMA Data', stage: 'appointmentscheduled', amount: null },
          { id: 'd2', name: 'Refonte site', stage: 'appointmentscheduled', amount: null },
        ],
      }),
    })
    useCrmDealPipelinesMock.mockReturnValue({ data: READY_PIPELINES })
    render(<CrmOpenDealsBatchAdvance account={account} />)
    fireEvent.click(screen.getByText('Faire avancer le lot'))
    fireEvent.click(screen.getByLabelText('Sélectionner TMA Data'))
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByText('Négociation'))
    fireEvent.click(screen.getByText('Proposer le lot'))
    expect(proposeMutate).toHaveBeenCalledWith(
      [{ kind: 'deal_stage', dealId: 'd1', stageId: 'contractsent' }],
      expect.anything(),
    )
  })
})
