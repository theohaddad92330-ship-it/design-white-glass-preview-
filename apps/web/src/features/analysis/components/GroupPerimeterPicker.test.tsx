import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AnalysisScopeSelection, GroupPerimeter } from '@bellum/contracts'
import { useState, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { GroupPerimeterPicker } from './GroupPerimeterPicker'

const apiFetch = vi.fn()
vi.mock('@/lib/api', async () => ({
  ApiError: (await vi.importActual<typeof import('@/lib/api-error')>('@/lib/api-error')).ApiError,
  apiFetch: (...args: unknown[]) => apiFetch(...(args as Parameters<typeof apiFetch>)),
  setAuthExpiredHandler: vi.fn(),
  refreshTokensOnce: vi.fn().mockResolvedValue(false),
}))

const DECATHLON: GroupPerimeter = {
  rootSiren: '306138900',
  headSiren: '306138900',
  truncated: true,
  entities: [
    {
      siren: '306138900',
      name: 'DECATHLON SE',
      role: 'groupe',
      headcountLabel: '0 salarié',
      city: 'Villeneuve-d’Ascq',
      region: 'Hauts-de-France',
      isActive: true,
    },
    {
      siren: '500569405',
      name: 'DECATHLON FRANCE',
      role: 'filiale',
      headcountLabel: '10 000 salariés et plus',
      city: 'Villeneuve-d’Ascq',
      region: 'Hauts-de-France',
      isActive: true,
    },
    {
      siren: '123456789',
      name: 'DECATHLON IMMO',
      role: 'filiale',
      headcountLabel: null,
      city: null,
      region: null,
      isActive: false,
    },
  ],
}

let last: AnalysisScopeSelection = {}
function Harness({ siren }: { siren: string | undefined }) {
  const [selection, setSelection] = useState<AnalysisScopeSelection>({})
  last = selection
  return <GroupPerimeterPicker siren={siren} selection={selection} onSelectionChange={setSelection} />
}

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

/**
 * Lot 757 — CONTACTS 3/6 (arbitrage Louis 31/10) : taper « Decathlon » ouvre le groupe et ses filiales (taille,
 * siège, région) ; le commercial coche ; les contacts sont cherchés sur l'entité analysée ET les cochées.
 */
describe('GroupPerimeterPicker', () => {
  it('liste le groupe et ses filiales avec taille, siège, région — une absence ne fait aucun « 0 »', async () => {
    apiFetch.mockResolvedValueOnce(DECATHLON)
    render(wrap(<Harness siren="306138900" />))
    expect(await screen.findByText('DECATHLON FRANCE')).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith({ path: '/group-perimeter/306138900' })
    expect(screen.getByText(/10 000 salariés et plus · Villeneuve-d’Ascq · Hauts-de-France/)).toBeInTheDocument()
    // L'entité analysée est toujours dans la recherche : cochée, non décochable.
    const root = screen.getByRole('checkbox', { name: /DECATHLON SE/ })
    expect(root).toBeChecked()
    expect(root).toBeDisabled()
    // Le registre muet : la ligne dit « non publiés », jamais un chiffre.
    const immo = screen.getByRole('checkbox', { name: /DECATHLON IMMO/ }).closest('label')
    expect(immo?.textContent ?? '').not.toMatch(/\b0\b/)
    expect(screen.getByText(/plus de 16 entités/i)).toBeInTheDocument()
  })

  it('cocher une filiale l’ajoute aux contact_entities ; décocher la retire', async () => {
    apiFetch.mockResolvedValueOnce(DECATHLON)
    render(wrap(<Harness siren="306138900" />))
    const box = await screen.findByRole('checkbox', { name: /DECATHLON FRANCE/ })
    expect(screen.getByText('Contacts cherchés sur 1 entité')).toBeInTheDocument()
    fireEvent.click(box)
    await waitFor(() => expect(last.contact_entities).toEqual([{ siren: '500569405', name: 'DECATHLON FRANCE' }]))
    expect(screen.getByText('Contacts cherchés sur 2 entités')).toBeInTheDocument()
    fireEvent.click(box)
    await waitFor(() => expect(last).not.toHaveProperty('contact_entities'))
  })

  it('sans SIREN, ou un groupe d’une seule entité : rien ne s’affiche, aucun appel inutile', async () => {
    const { container, rerender } = render(wrap(<Harness siren={undefined} />))
    expect(container).toBeEmptyDOMElement()
    expect(apiFetch).not.toHaveBeenCalledWith({ path: '/group-perimeter/undefined' })
    apiFetch.mockResolvedValueOnce({ ...DECATHLON, truncated: false, entities: [DECATHLON.entities[0]] })
    rerender(wrap(<Harness siren="306138900" />))
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})

describe('GroupPerimeterPicker — réponse hors contrat', () => {
  it('une réponse qui n’est pas un périmètre ne casse pas l’écran et n’affiche rien', async () => {
    apiFetch.mockResolvedValueOnce({ ok: true })
    const { container } = render(wrap(<Harness siren="306138900" />))
    await waitFor(() => expect(container.querySelector('[role="status"]')).toBeNull())
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})
