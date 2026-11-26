import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TodayStaleBanner } from './TodayStaleBanner'

/** #4485 — le bandeau PROPOSE ; seul le clic ferme. */
const closeStale = vi.hoisted(() => vi.fn())
vi.mock('@/features/actions/planItems.api', () => ({ planItemsApi: { closeStale } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderBanner(ids: string[]) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TodayStaleBanner ids={ids} />
    </QueryClientProvider>,
  )
}

describe('TodayStaleBanner', () => {
  beforeEach(() => {
    closeStale.mockReset()
    closeStale.mockResolvedValue({ closed: 2, skipped: 0, failed: 0 })
  })

  it('propose sans rien fermer au chargement : le compte, la question, le bouton', () => {
    renderBanner(['a', 'b'])
    expect(screen.getByText('2 actions en retard de plus de 30 jours — les marquer faites ?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Les marquer faites' })).toBeInTheDocument()
    expect(closeStale).not.toHaveBeenCalled()
  })

  it('au clic, envoie exactement les identifiants affichés', async () => {
    renderBanner(['a', 'b'])
    fireEvent.click(screen.getByRole('button', { name: 'Les marquer faites' }))
    await waitFor(() => expect(closeStale).toHaveBeenCalledWith(['a', 'b']))
    expect(closeStale).toHaveBeenCalledTimes(1)
  })

  it('accorde au singulier', () => {
    renderBanner(['a'])
    expect(screen.getByText('1 action en retard de plus de 30 jours — la marquer faite ?')).toBeInTheDocument()
  })

  it('sait dire NON : aucune action concernée, aucune ligne (jamais « 0 »)', () => {
    const { container } = renderBanner([])
    expect(container).toBeEmptyDOMElement()
  })
})
