import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, vi } from 'vitest'
import type { AwaitingOutcomeAction } from '@bellum/contracts'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'
import { AwaitingOutcomeQueue } from './AwaitingOutcomeQueue'

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

/**
 * #3211.9 (#3234, lot M11 09/10) — la FILE PROACTIVE des issues manquantes,
 * et sa saisie dédiée : une issue posée par le PATCH existant (`outcome` seul).
 */
const { update, awaitingOutcome } = vi.hoisted(() => ({ update: vi.fn(), awaitingOutcome: vi.fn() }))
vi.mock('@/features/actions/planItems.api', () => ({
  planItemsApi: { list: vi.fn(), mine: vi.fn(), update, awaitingOutcome },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const ROW: AwaitingOutcomeAction = {
  id: 'i1',
  label: 'Relancer le DSI',
  account_id: 'a1',
  company_name: 'ACME',
  completed_at: '2026-10-01T10:00:00.000Z',
  completion_mode: 'proof',
  target_kind: null,
}

describe('#3211.9 — Issues à déclarer', () => {
  beforeEach(() => {
    resetTestQueryClient() // QueryClient singleton : sans cela le test 3 relit le cache du test 2 («Issues à déclarer (1)»)
    update.mockReset()
    awaitingOutcome.mockReset()
    update.mockResolvedValue({ id: 'i1', outcome: 'positive' })
  })

  it('présente les actions faites sans issue, sans qu’on les demande', async () => {
    awaitingOutcome.mockResolvedValue([ROW])
    renderWithRouter(<AwaitingOutcomeQueue />)
    expect(await screen.findByText('Issues à déclarer (1)')).toBeInTheDocument()
    expect(screen.getByText('Relancer le DSI')).toBeInTheDocument()
    expect(screen.getByText(/faite par envoi vérifié/)).toBeInTheDocument()
  })

  it('la saisie dédiée écrit l’issue SEULE — jamais un nouveau statut', async () => {
    awaitingOutcome.mockResolvedValue([ROW])
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    renderWithRouter(<AwaitingOutcomeQueue />)
    await user.click(await screen.findByRole('button', { name: 'Déclarer l’issue de « Relancer le DSI »' }))
    await screen.findByText('Positif')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Positif' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('i1', { outcome: 'positive' }))
  })

  it('SAIT DIRE NON — rien à déclarer : aucune section', async () => {
    awaitingOutcome.mockResolvedValue([])
    const { container } = renderWithRouter(<AwaitingOutcomeQueue />)
    await waitFor(() => expect(awaitingOutcome).toHaveBeenCalled())
    expect(container.textContent).not.toMatch(/Issues à déclarer/)
  })

  it('une lecture impossible se DIT, jamais « rien à déclarer »', async () => {
    awaitingOutcome.mockResolvedValue(null)
    renderWithRouter(<AwaitingOutcomeQueue />)
    expect(await screen.findByText('Les actions sans issue n’ont pas pu être lues.')).toBeInTheDocument()
  })
})
