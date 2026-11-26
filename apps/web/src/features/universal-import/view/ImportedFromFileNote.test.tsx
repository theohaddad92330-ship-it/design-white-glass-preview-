import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import { ImportedFromFileNote } from './ImportedFromFileNote'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

const row = (over: Record<string, unknown>) => ({
  id: 'r',
  fileName: 'postes.xlsx',
  destination: 'target_personas',
  status: 'done',
  imported: 12,
  skipped: 0,
  scripts: null,
  message: null,
  createdAt: '2026-10-20T09:00:00.000Z',
  ...over,
})

// #4426.2 — « tiré de ton fichier <nom> » : le réglage dit d'où il vient, UNE fois, là où il vit.
describe('ImportedFromFileNote', () => {
  beforeEach(async () => {
    apiFetch.mockReset()
    await i18n.changeLanguage('fr')
  })

  it('nomme le dernier fichier importé réussi pour CETTE destination', async () => {
    apiFetch.mockResolvedValue([
      row({ id: 'a', fileName: 'ancien.xlsx', createdAt: '2026-10-01T09:00:00.000Z' }),
      row({ id: 'b', fileName: 'grille.xlsx', destination: 'qualification_grid' }),
      row({ id: 'c', fileName: 'postes.xlsx' }),
    ])
    render(<ImportedFromFileNote destination="target_personas" />, { wrapper })
    expect(await screen.findByText(/Tiré de ton fichier postes\.xlsx/)).toBeInTheDocument()
  })

  it('un import raté, ou aucun import pour cette destination : rien (on n’affiche pas ce qu’on n’a pas)', async () => {
    apiFetch.mockResolvedValue([row({ status: 'failed' }), row({ destination: 'knowledge' })])
    const { container } = render(<ImportedFromFileNote destination="qualification_grid" />, { wrapper })
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
