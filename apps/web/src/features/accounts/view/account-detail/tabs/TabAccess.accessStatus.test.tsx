import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { TabAccess } from './TabAccess'

/**
 * #4802 — le GESTE qui pose l'état d'accès d'un compte (inconnu · référencé · à bâtir). Sans lui, les deux
 * ordres d'interlocuteurs (#4271) étaient inatteignables. Tant que rien n'est posé, l'écran dit « Accès inconnu ».
 */
const apiFetchMock = vi.mocked(apiFetch)
const ACCOUNT = { id: 'acc-1', status: 'completed', created_at: '2026-08-01T09:00:00.000Z' } as Account

function landscape(accessStatus: unknown): Record<string, unknown> {
  return {
    lock: { state: 'inconnu', fact: null },
    modes: [],
    cost: null,
    facts: [],
    entities: [],
    avoidGroupEntry: false,
    warning: null,
    community: null,
    question: null,
    barrier: null,
    accessLevel: 'inconnu',
    accessLevelFact: null,
    accessStatus,
  }
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <TabAccess account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

describe('l’onglet Accès pose l’état d’accès (#4802)', () => {
  beforeEach(() => apiFetchMock.mockReset())
  afterEach(cleanup)

  it('rien posé : « Accès inconnu » reste dit, aucun des trois états n’est pressé', async () => {
    apiFetchMock.mockResolvedValue(landscape(null))
    mount()
    expect(await screen.findByText('Accès inconnu')).toBeInTheDocument()
    for (const name of ['Inconnu', 'Référencé', 'À bâtir'])
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
  })

  // #4802.2 — recette prod : « Accès inconnu » restait affiché à côté d'un état choisi (Référencé / À bâtir).
  it('un état choisi : « Accès inconnu » ne reste pas affiché à côté', async () => {
    apiFetchMock.mockResolvedValue(
      landscape({ state: 'referenced', source: 'déclaré par marie@x.fr', observed_at: '2026-10-01T00:00:00Z' }),
    )
    mount()
    expect(await screen.findByRole('button', { name: 'Référencé' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Accès inconnu')).not.toBeInTheDocument()
  })

  it('SAIT DIRE NON — « inconnu » posé : « Accès inconnu » reste dit', async () => {
    apiFetchMock.mockResolvedValue(
      landscape({ state: 'inconnu', source: 'déclaré par marie@x.fr', observed_at: '2026-10-01T00:00:00Z' }),
    )
    mount()
    expect(await screen.findByText('Accès inconnu')).toBeInTheDocument()
  })

  it('cliquer « Référencé » déclare un fait `access_status` humain', async () => {
    apiFetchMock.mockResolvedValue(landscape(null))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Référencé' }))
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/accounts/acc-1/access',
          method: 'POST',
          body: { kind: 'access_status', value: 'referenced' },
        }),
      ),
    )
  })

  it('un état posé est pressé et nomme sa source', async () => {
    apiFetchMock.mockResolvedValue(
      landscape({ state: 'to_build', source: 'déclaré par marie@x.fr', observed_at: '2026-10-01T00:00:00Z' }),
    )
    mount()
    expect(await screen.findByRole('button', { name: 'À bâtir' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Référencé' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/^déclaré par marie@x\.fr · /)).toBeInTheDocument()
  })
})
