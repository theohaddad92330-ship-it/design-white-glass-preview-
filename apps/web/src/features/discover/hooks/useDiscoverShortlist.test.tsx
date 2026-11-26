import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const addToPortfolio = vi.fn()
const removeFromPortfolio = vi.fn()

vi.mock('@/features/accounts/api', () => ({
  accountsApi: {
    addToPortfolio: (...args: unknown[]) => addToPortfolio(...args),
    removeFromPortfolio: (...args: unknown[]) => removeFromPortfolio(...args),
  },
}))

vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' } }) }))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const navigate = vi.fn()
vi.mock('@/router', () => ({ router: { navigate: (...args: unknown[]) => navigate(...args) } }))

import { toast } from 'sonner'
import { useDiscoverShortlist } from './useDiscoverShortlist'

type ToastAction = { label: string; onClick: () => void }

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const candidate = { siren: '552081317', name: 'TF1', sector: 'Médias' }

/**
 * « Ajouter à mon portefeuille » (D6) : le geste ATTRIBUE vraiment le compte.
 * Ce qui est vérifié ici, c'est que l'écran ne ment jamais — ni en promettant
 * une attribution qui n'a pas eu lieu, ni en envoyant au serveur autre chose
 * que ce que le registre a donné.
 */
describe('useDiscoverShortlist — portefeuille serveur', () => {
  beforeEach(() => {
    localStorage.clear()
    addToPortfolio.mockReset().mockResolvedValue({ id: 'a1', created: true })
    removeFromPortfolio.mockReset().mockResolvedValue({ removed: true })
  })

  it('ajoute le compte côté serveur avec les faits du registre', async () => {
    const { result } = renderHook(() => useDiscoverShortlist(), { wrapper })

    act(() => result.current.toggleFollow(candidate))

    await waitFor(() => expect(addToPortfolio).toHaveBeenCalledTimes(1))
    expect(addToPortfolio).toHaveBeenCalledWith({
      company_name: 'TF1',
      siren: '552081317',
      sector: 'Médias',
    })
    expect(result.current.followed.has('552081317')).toBe(true)
  })

  it('retire le compte côté serveur quand on décoche', async () => {
    const { result } = renderHook(() => useDiscoverShortlist(), { wrapper })

    act(() => result.current.toggleFollow(candidate))
    await waitFor(() => expect(result.current.followed.has('552081317')).toBe(true))

    act(() => result.current.toggleFollow(candidate))

    await waitFor(() => expect(removeFromPortfolio).toHaveBeenCalledWith('552081317'))
    expect(result.current.followed.has('552081317')).toBe(false)
  })

  it('REVIENT en arrière si le serveur refuse — pas de portefeuille imaginaire', async () => {
    addToPortfolio.mockRejectedValueOnce(new Error('500'))
    const { result } = renderHook(() => useDiscoverShortlist(), { wrapper })

    act(() => result.current.toggleFollow(candidate))

    await waitFor(() => expect(result.current.followed.has('552081317')).toBe(false))
  })

  it("n'envoie pas de secteur quand le registre n'en donne pas", async () => {
    const { result } = renderHook(() => useDiscoverShortlist(), { wrapper })

    act(() => result.current.toggleFollow({ siren: '999', name: 'Sans secteur', sector: null }))

    await waitFor(() => expect(addToPortfolio).toHaveBeenCalledWith({ company_name: 'Sans secteur', siren: '999' }))
  })

  /**
   * #2149.30 — CONTINUITÉ DÉCOUVRIR → COMPTES.
   *
   * `invalidateQueries(['accounts'])` rafraîchit la LISTE des comptes, mais ce
   * CANDIDAT-CI garde `accountId: null` en mémoire tant que la recherche
   * Découvrir elle-même n'est pas rejouée (jamais invalidée ici — la relancer
   * coûterait un appel payant). Le seul fait frais est la réponse de
   * `addToPortfolio`, qui porte déjà l'id du compte créé/attribué : la seule
   * source honnête d'un lien direct.
   */
  it('offre un lien direct vers le compte fraîchement attribué', async () => {
    const { result } = renderHook(() => useDiscoverShortlist(), { wrapper })

    act(() => result.current.toggleFollow(candidate))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    const [, options] = vi.mocked(toast.success).mock.calls[0] as [string, { action?: ToastAction }]
    expect(options?.action?.label).toBeTruthy()

    options!.action!.onClick()

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/accounts/$id', params: { id: 'a1' } }))
  })

  it('ne propose AUCUN lien sur un retrait — rien de nouveau à ouvrir', async () => {
    const { result } = renderHook(() => useDiscoverShortlist(), { wrapper })
    act(() => result.current.toggleFollow(candidate))
    await waitFor(() => expect(result.current.followed.has('552081317')).toBe(true))
    vi.mocked(toast.success).mockClear()

    act(() => result.current.toggleFollow(candidate))

    await waitFor(() => expect(removeFromPortfolio).toHaveBeenCalled())
    const [, options] = vi.mocked(toast.success).mock.calls[0] as [string, { action?: ToastAction } | undefined]
    expect(options?.action).toBeUndefined()
  })
})
