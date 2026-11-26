import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { useCreateSignalAction } from './useSignalAction'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1', email: 'u@example.com' }, loading: false }),
}))

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return { ...actual, useNavigate: () => navigateMock }
})

const apiFetchMock = vi.mocked(apiFetch)

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

/**
 * #2695.2 — « il a fallu s'arrêter sans rien retirer » : un clic sur « En faire
 * une action » répondait un texte générique et n'offrait aucun chemin vers ce
 * qui venait d'être créé. La ligne existe (`action_plan_items`, onglet Plan
 * d'action du compte) mais restait INTROUVABLE depuis le panneau qui vient de
 * l'écrire — vingt lignes indiscernables, aucune ne se signale « je viens
 * d'être créée ».
 *
 * Le correctif ne supprime ni n'annule rien (aucun archivage n'existe sur
 * `action_plan_items`, cf. QUESTIONS du rapport) : il NOMME l'action créée et
 * PROPOSE un chemin vers l'onglet Plan du compte, où l'utilisateur peut la
 * retrouver et décider — « au minimum : un retour en arrière proposé dans le
 * message de confirmation » (#2695).
 */
describe('useCreateSignalAction — le message de confirmation nomme l’action et propose d’y aller', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
    navigateMock.mockReset()
  })

  it('nomme l’action créée dans le toast, au lieu d’un texte générique', async () => {
    apiFetchMock.mockResolvedValueOnce({ actionId: 'a-1', actionLabel: 'Traiter le signal : levée de fonds' })
    const { result } = renderHook(() => useCreateSignalAction(), { wrapper: wrapper() })

    result.current.mutate({ accountId: 'acc-1', label: 'levée de fonds' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(toast.success).toHaveBeenCalledTimes(1)
    const [message] = vi.mocked(toast.success).mock.calls[0] ?? []
    expect(message).toContain('Traiter le signal : levée de fonds')
  })

  it('propose un bouton qui mène au plan du compte — le seul chemin qui existe aujourd’hui pour la retrouver', async () => {
    apiFetchMock.mockResolvedValueOnce({ actionId: 'a-1', actionLabel: 'Traiter le signal : levée de fonds' })
    const { result } = renderHook(() => useCreateSignalAction(), { wrapper: wrapper() })

    result.current.mutate({ accountId: 'acc-1', label: 'levée de fonds' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [, options] = vi.mocked(toast.success).mock.calls[0] ?? []
    const action = options?.action as { label: string; onClick: () => void } | undefined
    expect(action?.label).toBeTruthy()

    action?.onClick()
    // #2107.32 — le chemin ne s'arrête plus à l'onglet : `item=action:<id>`
    // désigne la ligne CRÉÉE, dans le même format que la recherche
    // transversale du dossier (`dossierItemRef`, #2128.50) — un second réglage
    // pour la même idée aurait divergé de celui-là au premier renommage.
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/accounts/$id',
      params: { id: 'acc-1' },
      search: { tab: 'plan', item: 'action:a-1' },
    })
  })

  it('un échec ne propose aucun chemin — rien n’a été créé', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useCreateSignalAction(), { wrapper: wrapper() })

    result.current.mutate({ accountId: 'acc-1', label: 'levée de fonds' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toast.success).not.toHaveBeenCalled()
    expect(navigateMock).not.toHaveBeenCalled()
  })
})
