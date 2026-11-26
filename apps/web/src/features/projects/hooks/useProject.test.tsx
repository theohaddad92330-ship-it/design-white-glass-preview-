import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'
import { projectQueryKeys } from '../api'
import { useProject } from './useProject'

vi.mock('@/lib/hooks/use-session')

const apiFetchMock = vi.mocked(apiFetch)
const useSessionMock = vi.mocked(useSession)

const ID = '55555555-5555-4555-8555-555555555555'
const OTHER = '66666666-6666-4666-8666-666666666666'

function row(id: string) {
  return { id, label: `projet ${id.slice(0, 4)}` }
}

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

/**
 * UN projet par son identité — la lecture du DOSSIER `/projects/$id` (#2801).
 *
 * Même précédent que `useMission` (D200, 30/08/2026) :
 *  1. La MÊME lecture que la liste (`?id=`), jamais une seconde route.
 *  2. Le projet est RETROUVÉ par son identité, jamais pris en première ligne.
 *  3. « Introuvable » et « la lecture a échoué » sont DEUX réponses.
 */
describe('useProject — ce que lit le dossier /projects/$id (#2801)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    useSessionMock.mockReturnValue({ user: { id: 'user-1' } } as unknown as ReturnType<typeof useSession>)
  })

  it('lit la MÊME route que la liste, resserrée par `?id=`', async () => {
    apiFetchMock.mockResolvedValueOnce([row(ID)])

    const { result } = renderHook(() => useProject(ID), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.project).toBeDefined())
    // Une seconde route serveur recomposerait la ligne ailleurs — second
    // `SELECT`, seconde décoration, seconde vérité (même refus que la mission).
    expect(apiFetchMock).toHaveBeenCalledWith({ path: `/projects?id=${ID}` })
    expect(result.current.project?.id).toBe(ID)
    expect(result.current.notFound).toBe(false)
  })

  it('RETROUVE son projet — il ne prend jamais la première ligne rendue', async () => {
    apiFetchMock.mockResolvedValueOnce([row(OTHER), row(ID)])

    const { result } = renderHook(() => useProject(ID), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.project?.id).toBe(ID)
  })

  it('dit INTROUVABLE quand la lecture a abouti sans le trouver — pas « ça charge »', async () => {
    apiFetchMock.mockResolvedValueOnce([row(OTHER)])

    const { result } = renderHook(() => useProject(ID), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.notFound).toBe(true))
    expect(result.current.isError).toBe(false)
    expect(result.current.project).toBeUndefined()
  })

  it('dit ÉCHEC quand la lecture échoue — l’autre phrase, l’autre geste', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('réseau'))

    const { result } = renderHook(() => useProject(ID), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.notFound).toBe(false)
  })

  it('n’écrase pas le cache de la liste — l’identité est dans la clé', () => {
    expect(projectQueryKeys.byId('user-1', ID)).not.toEqual(projectQueryKeys.list('user-1'))
    expect(projectQueryKeys.byId('user-1', ID)).not.toEqual(projectQueryKeys.byId('user-1', OTHER))
  })
})
