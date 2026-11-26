import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const getOne = vi.fn()
const list = vi.fn()

vi.mock('@/features/accounts/api', () => ({
  accountsApi: { getOne: (id: string) => getOne(id), list: (f: unknown) => list(f) },
  accountKeys: { detail: (id: string) => ['account', id], list: () => ['accounts'] },
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))

const { mergeScopeRows, resolveScopeAccountName, useScopeAccountLookup } = await import('./use-scope-account-lookup')

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('#3654.1 mergeScopeRows — les comptes hors page rejoignent la source, sans doublon', () => {
  it('ajoute un compte absent et garde le chargé quand l’id est déjà là', () => {
    const merged = mergeScopeRows([{ id: 'a', company_name: 'DARTY' }], [{ id: 'a', company_name: 'x' }, { id: 'b' }])
    expect(merged.map(row => row.id)).toEqual(['a', 'b'])
    expect(merged[0]?.company_name).toBe('DARTY')
  })
})

describe('#3654.1 useScopeAccountLookup — ?accountId= d’un compte analysé non chargé', () => {
  beforeEach(() => {
    getOne.mockReset()
    list.mockReset()
  })

  it('lit le compte par son id quand la liste chargée ne le contient pas', async () => {
    getOne.mockResolvedValue({ id: 'mp', company_name: 'MP GEMS', status: 'completed', commercial_status: null })
    const { result } = renderHook(() => useScopeAccountLookup({ accountId: 'mp', loadedIds: ['x'], query: '' }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.map(row => row.company_name)).toEqual(['MP GEMS']))
    expect(getOne).toHaveBeenCalledWith('mp')
  })

  it('ne relit pas un compte déjà chargé', () => {
    renderHook(() => useScopeAccountLookup({ accountId: 'mp', loadedIds: ['mp'], query: '' }), { wrapper })
    expect(getOne).not.toHaveBeenCalled()
  })

  it('cherche côté serveur dès qu’on tape (DARTY au-delà de la première page)', async () => {
    list.mockResolvedValue({ data: [{ id: 'd', company_name: 'DARTY', status: 'completed' }], pagination: {} })
    const { result } = renderHook(() => useScopeAccountLookup({ accountId: null, loadedIds: [], query: 'dart' }), {
      wrapper,
    })
    await waitFor(() => expect(result.current.map(row => row.company_name)).toEqual(['DARTY']))
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ q: 'dart', status: 'completed' }))
  })

  it('sans id ni recherche : aucun appel, aucune ligne', () => {
    const { result } = renderHook(() => useScopeAccountLookup({ accountId: null, loadedIds: [], query: '  ' }), {
      wrapper,
    })
    expect(result.current).toEqual([])
    expect(getOne).not.toHaveBeenCalled()
    expect(list).not.toHaveBeenCalled()
  })
})

describe('#3654 (KO 06/10) — le nom du compte en portée suit la lecture ciblée', () => {
  it('trouve le nom d’un compte hors première page une fois fusionné (accueil et pastilles scopés)', () => {
    const firstPage = [{ id: 'a', company_name: 'DARTY' }]
    const looked = [{ id: 'mp', company_name: 'MP GEMS' }]
    expect(resolveScopeAccountName('mp', firstPage)).toBeNull()
    expect(resolveScopeAccountName('mp', mergeScopeRows(firstPage, looked))).toBe('MP GEMS')
  })
  it('sans compte en portée ou compte inconnu : null, rien d’inventé', () => {
    expect(resolveScopeAccountName(null, [{ id: 'a', company_name: 'X' }])).toBeNull()
    expect(resolveScopeAccountName('zz', [{ id: 'a', company_name: 'X' }])).toBeNull()
  })
})
