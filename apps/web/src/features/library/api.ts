import type { CreateLibraryItem, LibraryItem, LibraryItemKind, UpdateLibraryItem } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * HTTP client for the workspace knowledge library (`/library-items`) — the
 * team-shared templates & playbooks shown in Connaissances. Auth travels via the
 * user-scoped cookies that `apiFetch` already forwards.
 */
export const libraryApi = {
  list(kind: LibraryItemKind): Promise<LibraryItem[]> {
    return apiFetch<LibraryItem[]>({ path: `/library-items?kind=${kind}` })
  },
  create(input: CreateLibraryItem): Promise<LibraryItem> {
    return apiFetch<LibraryItem, CreateLibraryItem>({ path: '/library-items', method: 'POST', body: input })
  },
  update(id: string, patch: UpdateLibraryItem): Promise<LibraryItem> {
    return apiFetch<LibraryItem, UpdateLibraryItem>({ path: `/library-items/${id}`, method: 'PATCH', body: patch })
  },
  delete(id: string): Promise<void> {
    return apiFetch<void>({ path: `/library-items/${id}`, method: 'DELETE' })
  },
}
