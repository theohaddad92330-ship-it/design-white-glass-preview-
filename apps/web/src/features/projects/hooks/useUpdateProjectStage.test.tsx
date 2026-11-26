import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { projectQueryKeys } from '../api'

vi.mock('../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../api')>()
  return {
    ...actual,
    projectsApi: { ...actual.projectsApi, updateStage: vi.fn().mockResolvedValue({ project: {}, effects: [] }) },
  }
})

const { useUpdateProjectStage } = await import('./useUpdateProjectStage')

/**
 * #2446.17 (lot M12) — trouvé par le parcours e2e CONTINU besoin → mission :
 * après « Changer d'étape », le dossier gardait l'ANCIENNE étape et l'ancienne
 * action principale jusqu'au rechargement. La mutation invalidait `['projects']`
 * alors que le dossier lit `projectQueryKeys.byId` (`['opportunities', …]`).
 */
describe('useUpdateProjectStage — le dossier relit son étape', () => {
  it('invalide la lecture du dossier ET la liste du pipe, pas seulement `[projects]`', async () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useUpdateProjectStage(), { wrapper })

    await act(() => result.current.mutateAsync({ id: 'p-1', stage: 'negotiation' }))

    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey)
    expect(keys).toContainEqual(projectQueryKeys.all)
    // Préfixe commun de `byId`, `list`, `steps`, `documents` — sait dire NON :
    // retirer cette invalidation fait rougir le test.
    expect(keys).toContainEqual(['opportunities'])
  })
})
