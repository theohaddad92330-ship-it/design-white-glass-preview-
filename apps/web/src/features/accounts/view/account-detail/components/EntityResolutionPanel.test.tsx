import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EntityResolution } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { trackActionStarted } from '@/lib/product-tracker'
import { EntityResolutionPanel } from './EntityResolutionPanel'

/**
 * #2284.65 / .67-.69 — l'APPELANT réel du geste : la carte lit l'historique des
 * corrections de l'espace et écrit la suivante par la route de l'API.
 */
const apiFetchMock = vi.mocked(apiFetch)

vi.mock('@/lib/product-tracker', () => ({ trackActionStarted: vi.fn() }))
const trackerMock = vi.mocked(trackActionStarted)

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const AMBIGUOUS: EntityResolution = {
  state: 'ambiguous',
  kind: null,
  canonical_id: null,
  commercial_name: 'Thales',
  legal_name: null,
  country: 'FR',
  identifiers: {},
  domain: null,
  naf_code: null,
  naf_label: null,
  location: null,
  parent_names: [],
  children_count: null,
  sources: ['normalized_name'],
  confidence: null,
  reasons: [],
  question: {
    candidates: [
      { name: 'THALES', siren: '552059024', city: 'Meudon' },
      { name: 'THALES SERVICES', siren: '000000001', city: 'Vélizy' },
    ],
  },
  resolved_at: '2026-09-30T10:00:00Z',
}

describe('EntityResolutionPanel', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    trackerMock.mockClear()
  })

  it('lit les corrections du compte et les superpose au calcul', async () => {
    apiFetchMock.mockResolvedValueOnce([
      {
        version: 1,
        decision: 'confirmed',
        target_name: 'THALES',
        target_siren: '552059024',
        note: null,
        decided_at: '2026-09-01T09:00:00Z',
      },
    ])
    renderWithClient(<EntityResolutionPanel accountId="acc-1" resolution={AMBIGUOUS} />)
    expect(await screen.findByText('Entité choisie par ton espace')).toBeInTheDocument()
    expect(apiFetchMock).toHaveBeenCalledWith({ path: '/accounts/acc-1/entity-resolution/corrections' })
  })

  it('« c’est bien celle-ci » écrit la correction par la route du compte', async () => {
    apiFetchMock.mockResolvedValueOnce([]).mockResolvedValueOnce({ version: 1 }).mockResolvedValue([])
    renderWithClient(<EntityResolutionPanel accountId="acc-1" resolution={AMBIGUOUS} />)
    fireEvent.click(await screen.findByRole('button', { name: 'C’est bien THALES SERVICES' }))
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith({
        path: '/accounts/acc-1/entity-resolution/corrections',
        method: 'POST',
        body: { decision: 'confirmed', target_name: 'THALES SERVICES', target_siren: '000000001' },
      }),
    )
  })

  it('muet sur un dossier antérieur à #2284, sans aucune requête', () => {
    const { container } = renderWithClient(<EntityResolutionPanel accountId="acc-1" resolution={null} />)
    expect(container).toBeEmptyDOMElement()
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('#2130.72 — la soumission d’une correction émet correction_submitted sur le dossier compte', async () => {
    apiFetchMock.mockResolvedValueOnce([]).mockResolvedValueOnce({ version: 1 }).mockResolvedValue([])
    renderWithClient(<EntityResolutionPanel accountId="acc-1" resolution={AMBIGUOUS} />)
    fireEvent.click(await screen.findByRole('button', { name: 'C’est bien THALES SERVICES' }))
    expect(trackerMock).toHaveBeenCalledWith('correction_submitted', '/accounts/$id')
  })
})
