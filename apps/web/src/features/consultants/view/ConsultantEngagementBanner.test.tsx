import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConsultantEngagementBanner } from './ConsultantEngagementBanner'

/**
 * #4196 (L5) — la fiche dit une chose saisie à la main, la mission en dit une autre :
 * on NOMME l'écart et on propose « Aligner » (une écriture humaine). Pas d'écart,
 * pas de ligne : on n'affiche pas ce qu'on n'a pas.
 */
const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (args: unknown) => apiFetch(args) }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' } }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const ID = '00000000-0000-4000-8000-0000000000c1'

function renderBanner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConsultantEngagementBanner consultantId={ID} />
    </QueryClientProvider>,
  )
}

describe('ConsultantEngagementBanner', () => {
  beforeEach(() => apiFetch.mockReset())

  it('sans écart, ne rend rien', async () => {
    apiFetch.mockResolvedValue({ conflict: null })
    const { container } = renderBanner()
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('nomme l’écart (valeur de la fiche, date de saisie, mission) et aligne au clic', async () => {
    apiFetch.mockImplementation(async (args?: { path: string }) =>
      args?.path.endsWith('/align')
        ? { consultantId: ID, outcome: 'written' }
        : {
            conflict: {
              consultantId: ID,
              missionId: 'm-1',
              missionLabel: 'Refonte SI',
              endsOn: '2027-03-31',
              ficheAvailability: 'immediate',
              ficheEnteredAt: '2026-09-02T10:00:00.000Z',
            },
          },
    )
    renderBanner()
    expect(await screen.findByText(/La fiche dit « Disponible » \(saisi le 02\/09\/2026\)/)).toBeInTheDocument()
    expect(screen.getByText(/Refonte SI/)).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Aligner' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ path: `/consultants/${ID}/engagement/align`, method: 'POST' }),
      ),
    )
  })
})
