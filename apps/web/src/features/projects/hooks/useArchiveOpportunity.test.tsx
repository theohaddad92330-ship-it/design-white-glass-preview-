import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { projectQueryKeys, projectsApi } from '../api'
import { useArchiveOpportunity } from './useArchiveOpportunity'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// #4137 — recette prod 31/10 : « Archiver » laissait la carte au kanban, « Désarchiver » laissait la liste
// « Archivées » périmée. Le kanban vit sous `['opportunities', 'list']`, HORS de `['projects']` : l'invalidation
// doit couvrir les DEUX racines (kanban, fiche, liste des archivées).
describe('#4137 — archiver / désarchiver invalide le kanban ET la liste des archivées', () => {
  it.each([true, false])('archived=%s → kanban, fiche et archivées sont marqués périmés', async archived => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    vi.spyOn(projectsApi, archived ? 'archiveOpportunity' : 'unarchiveOpportunity').mockResolvedValue(
      {} as Awaited<ReturnType<typeof projectsApi.archiveOpportunity>>,
    )
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useArchiveOpportunity(), { wrapper })

    await act(async () => {
      result.current.mutate({ id: 'p-1', archived })
    })
    await waitFor(() => expect(invalidate).toHaveBeenCalled())

    const roots = invalidate.mock.calls.map(([filters]) => (filters?.queryKey as readonly string[])[0])
    expect(roots).toContain(projectQueryKeys.list('u')[0]) // kanban + fiche : 'opportunities'
    expect(roots).toContain(projectQueryKeys.archived('u')[0]) // archivées : 'projects'
  })
})
