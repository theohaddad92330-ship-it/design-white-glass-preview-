import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_BRAND_NAME, type AgendaSlotProposalPreview } from '@bellum/contracts'
import { AgendaSlotProposalTrigger } from './AgendaSlotProposalTrigger'

const previewMutate = vi.fn()
const usePreviewSlotProposalMock = vi.fn(
  (): {
    mutate: typeof previewMutate
    isPending: boolean
    isError: boolean
    data: AgendaSlotProposalPreview | undefined
  } => ({
    mutate: previewMutate,
    isPending: false,
    isError: false,
    data: undefined,
  }),
)
const confirmMutate = vi.fn()
const useConfirmSlotProposalMock = vi.fn(() => ({ mutate: confirmMutate, isPending: false }))
const rejectMutate = vi.fn()
const useRejectSlotProposalMock = vi.fn(() => ({ mutate: rejectMutate, isPending: false }))

vi.mock('@/features/briefing/api', () => ({
  usePreviewSlotProposal: () => usePreviewSlotProposalMock(),
  useConfirmSlotProposal: () => useConfirmSlotProposalMock(),
  useRejectSlotProposal: () => useRejectSlotProposalMock(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const READY: AgendaSlotProposalPreview = {
  status: 'ready',
  slot: { start: '2026-09-28T09:00:00.000Z', end: '2026-09-28T10:00:00.000Z' },
  consequence: { freeMinutesConsumed: 60 },
}

describe('AgendaSlotProposalTrigger — la porte d’écriture d’un créneau proposé (#2770)', () => {
  beforeEach(() => {
    previewMutate.mockClear()
    confirmMutate.mockClear().mockReset()
    rejectMutate.mockClear().mockReset()
    usePreviewSlotProposalMock.mockReturnValue({
      mutate: previewMutate,
      isPending: false,
      isError: false,
      data: undefined,
    })
  })

  it('ouvre la prévisualisation et la déclenche AU CLIC, jamais seule', () => {
    render(<AgendaSlotProposalTrigger accountId="acc-1" companyName="ACME" />)
    fireEvent.click(screen.getByText('Proposer un créneau'))
    expect(previewMutate).toHaveBeenCalledWith({ accountId: 'acc-1' })
  })

  it('#2101.40 — un refus déjà posé aujourd’hui se dit, sans jamais chercher de créneau à l’écran', () => {
    usePreviewSlotProposalMock.mockReturnValue({
      mutate: previewMutate,
      isPending: false,
      isError: false,
      data: { status: 'suppressed' },
    })
    render(<AgendaSlotProposalTrigger accountId="acc-1" companyName="ACME" />)
    fireEvent.click(screen.getByText('Proposer un créneau'))
    expect(screen.getByText(/pas reproposé/)).toBeInTheDocument()
  })

  it('#2101.22/.37 — la proposition se présente comme une PRÉVISUALISATION FIGÉE, jamais un rendez-vous', () => {
    usePreviewSlotProposalMock.mockReturnValue({ mutate: previewMutate, isPending: false, isError: false, data: READY })
    render(<AgendaSlotProposalTrigger accountId="acc-1" companyName="ACME" />)
    fireEvent.click(screen.getByText('Proposer un créneau'))
    expect(screen.getByText('Prévisualisation — pas encore écrit')).toBeInTheDocument()
    expect(screen.getByText(/Point commercial — ACME/)).toBeInTheDocument()
  })

  it('#2101.30 — la conséquence directe est NOMMÉE, jamais tue', () => {
    usePreviewSlotProposalMock.mockReturnValue({ mutate: previewMutate, isPending: false, isError: false, data: READY })
    render(<AgendaSlotProposalTrigger accountId="acc-1" companyName="ACME" />)
    fireEvent.click(screen.getByText('Proposer un créneau'))
    expect(screen.getByText(/Consomme 60 minutes/)).toBeInTheDocument()
  })

  it('confirmer écrit EXACTEMENT le créneau montré, puis marque l’écran « confirmé, proposé par {{brand}} »', () => {
    usePreviewSlotProposalMock.mockReturnValue({ mutate: previewMutate, isPending: false, isError: false, data: READY })
    confirmMutate.mockImplementation((_input, opts) => opts?.onSuccess?.())
    render(<AgendaSlotProposalTrigger accountId="acc-1" companyName="ACME" />)
    fireEvent.click(screen.getByText('Proposer un créneau'))
    fireEvent.click(screen.getByText('Confirmer sur mon agenda'))
    expect(confirmMutate).toHaveBeenCalledWith(
      { accountId: 'acc-1', title: 'Point commercial — ACME', start: READY.slot.start, end: READY.slot.end },
      expect.anything(),
    )
    // GA-252 — la marque passe par {{brand}} (`DEFAULT_BRAND_NAME`), jamais un
    // « BellumAI » écrit en dur dans la traduction ou dans ce test.
    expect(screen.getByText(`Confirmé — proposé par ${DEFAULT_BRAND_NAME}`)).toBeInTheDocument()
  })

  it('#2101.40 — refuser mémorise le refus, jamais un appel à l’agenda', () => {
    usePreviewSlotProposalMock.mockReturnValue({ mutate: previewMutate, isPending: false, isError: false, data: READY })
    rejectMutate.mockImplementation((_accountId, opts) => opts?.onSuccess?.())
    render(<AgendaSlotProposalTrigger accountId="acc-1" companyName="ACME" />)
    fireEvent.click(screen.getByText('Proposer un créneau'))
    fireEvent.click(screen.getByText('Pas maintenant'))
    expect(rejectMutate).toHaveBeenCalledWith('acc-1', expect.anything())
    expect(confirmMutate).not.toHaveBeenCalled()
    expect(screen.getByText(/ne sera pas reproposé aujourd'hui/)).toBeInTheDocument()
  })
})
