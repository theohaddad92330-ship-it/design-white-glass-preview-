import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompanySearchResponse } from '@bellum/contracts'

const search = vi.fn()
vi.mock('@/features/search/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/search/api')>()),
  companiesApi: { search: (...args: unknown[]) => search(...args) },
}))

import { useCompanySearch } from './useCompanySearch'

function deferred() {
  let resolve!: (value: CompanySearchResponse) => void
  const promise = new Promise<CompanySearchResponse>(r => (resolve = r))
  return { promise, resolve }
}

const reply = (name: string, siren: string): CompanySearchResponse =>
  ({ suggestions: [{ name, siren }] }) as unknown as CompanySearchResponse

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useCompanySearch — réponses dans le désordre', () => {
  beforeEach(() => search.mockReset())

  it("n'affiche jamais la liste d'une frappe antérieure sous la saisie courante", async () => {
    const boul = deferred()
    const boulanger = deferred()
    search.mockImplementation((q: string) => (q === 'Boul' ? boul.promise : boulanger.promise))

    const { result } = renderHook(() => useCompanySearch('FR'), { wrapper })

    act(() => result.current.search('Boul'))
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1))
    act(() => result.current.search('Boulanger'))
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2))

    // La réponse de « Boulanger » arrive d'abord, celle de « Boul » (périmée) ensuite.
    await act(async () => boulanger.resolve(reply('BOULANGER', '1')))
    await act(async () => boul.resolve(reply('BOULANGERIES PAUL', '2')))

    await waitFor(() => expect(result.current.suggestions.map(s => s.name)).toEqual(['BOULANGER']))
  })

  it('masque la liste précédente tant que la réponse de la dernière frappe est attendue', async () => {
    const boul = deferred()
    const boulanger = deferred()
    search.mockImplementation((q: string) => (q === 'Boul' ? boul.promise : boulanger.promise))

    const { result } = renderHook(() => useCompanySearch('FR'), { wrapper })
    act(() => result.current.search('Boul'))
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1))
    await act(async () => boul.resolve(reply('BOULANGERIES PAUL', '2')))
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1))

    // Nouvelle frappe : la liste ne doit pas rester sous le pointeur puis être remplacée.
    act(() => result.current.search('Boulanger'))
    expect(result.current.suggestions).toEqual([])
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2))
    expect(result.current.suggestions).toEqual([])

    await act(async () => boulanger.resolve(reply('BOULANGER', '1')))
    await waitFor(() => expect(result.current.suggestions.map(s => s.siren)).toEqual(['1']))
  })
})
