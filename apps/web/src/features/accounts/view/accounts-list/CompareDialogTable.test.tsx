import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { AccountInterestPenetrability } from '@bellum/contracts'
import { CompareDialogTable } from './CompareDialogTable'
import type { AccountRow } from './types'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
// #3818 — l'objectif de l'espace, réglé par test (défaut : renseigné, comportement d'avant).
const mockHasObjective = vi.hoisted(() => ({ value: true }))
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({ useHasOfferObjective: () => mockHasObjective.value }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' } }) }))

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function row(id: string, company_name: string): AccountRow {
  return { id, company_name, sector: null, priority_score: null, status: 'completed', created_at: '2026-01-01' }
}

function matrix(over: Partial<AccountInterestPenetrability> = {}): AccountInterestPenetrability {
  return {
    accountId: 'a1',
    interest: { factors: [], band: 'high', known: 0, total: 3 },
    penetrability: { factors: [], band: 'low', known: 0, total: 3 },
    quadrant: 'priority_now',
    quadrantUnavailableReason: null,
    ...over,
  }
}

/**
 * #3258.15 (épopée #3362, lot E25 30/09) — LA COMPARAISON STRUCTURÉE (non-IA)
 * de la matrice intérêt × pénétrabilité, sur le tableau de comparaison déjà
 * réel (`CompareDialogTable`, ouvert depuis la barre de sélection de
 * `/accounts`). Aucun second calcul (GA-26) : chaque cellule lit la MÊME
 * façade que la fiche compte (`useAccountInterestPenetrability`).
 */
describe('CompareDialogTable — la matrice intérêt × pénétrabilité, compte par compte', () => {
  it('nomme le quadrant de CHAQUE compte comparé, lu sur son propre appel', async () => {
    apiFetch.mockImplementation(({ path }: { path: string }) =>
      Promise.resolve(
        path === '/accounts/a1/interest-penetrability'
          ? matrix({ accountId: 'a1', quadrant: 'priority_now' })
          : matrix({ accountId: 'a2', quadrant: 'no_go_watch' }),
      ),
    )

    render(<CompareDialogTable accounts={[row('a1', 'EDF'), row('a2', 'SNCF')]} />, { wrapper })

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Priorité immédiate')).toBeInTheDocument()
    expect(await screen.findByText('No-Go ou simple veille')).toBeInTheDocument()
  })

  it('NON : un quadrant non déterminable ne s’affiche jamais deviné — la raison NOMMÉE prend sa place', async () => {
    apiFetch.mockResolvedValue(matrix({ quadrant: null, quadrantUnavailableReason: 'reason' }))

    render(<CompareDialogTable accounts={[row('a1', 'EDF')]} />, { wrapper })

    expect(await screen.findByText('Position non déterminée')).toBeInTheDocument()
  })

  it('se tait (un tiret) tant que la façade n’a pas répondu ou n’est pas montée', async () => {
    apiFetch.mockResolvedValue({ status: 'unavailable' })

    render(<CompareDialogTable accounts={[row('a1', 'EDF')]} />, { wrapper })

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    const label = await screen.findByText('Matrice intérêt × pénétrabilité')
    const cell = label.closest('tr')!.querySelector('td:last-child')!
    expect(cell).toHaveTextContent('—')
  })
})
