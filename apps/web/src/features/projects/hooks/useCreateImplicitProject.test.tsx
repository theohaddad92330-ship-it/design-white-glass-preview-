import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2174.1 / #2174.14 — LE PROJET IMPLICITE, et la résolution d'entité.
 *
 * Deux gestes dans un seul clic, et l'ORDRE est le sujet : un projet n'existe
 * pas sans compte (`opportunities.account_id` est NOT NULL). La résolution de
 * l'entreprise n'est pas réécrite — c'est `POST /accounts/portfolio`, déjà
 * appelée par Découvrir, qui crée le compte s'il n'existe pas et ne duplique
 * jamais.
 */
const addToPortfolio = vi.fn()
const createProject = vi.fn()
const order: string[] = []

vi.mock('@/features/accounts/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/accounts/api')>('@/features/accounts/api')
  return {
    ...actual,
    accountsApi: {
      ...actual.accountsApi,
      addToPortfolio: (...args: unknown[]) => {
        order.push('account')
        return addToPortfolio(...args)
      },
    },
  }
})

vi.mock('@/features/projects/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/projects/api')>('@/features/projects/api')
  return {
    ...actual,
    projectsApi: {
      ...actual.projectsApi,
      create: (...args: unknown[]) => {
        order.push('project')
        return createProject(...args)
      },
    },
  }
})

import { useCreateImplicitProject } from './useCreateImplicitProject'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  addToPortfolio.mockReset()
  createProject.mockReset()
  order.length = 0
})

describe('useCreateImplicitProject — le compte d’abord, le projet ensuite', () => {
  it('résout l’entreprise AVANT de créer le projet, et nomme le projet comme le COMPTE résolu', async () => {
    addToPortfolio.mockResolvedValue({ id: 'acc-1', company_name: 'ACME', siren: null, created: true })
    // La porte unifiée rend `{ project, renewal_linked }` — les deux lots qui
    // avaient chacun leur `POST /projects` ont fusionné. Un double resté sur
    // l'ANCIENNE forme rend `project` indéfini, et le hook casse sur `.id`.
    createProject.mockResolvedValue({ project: { id: 'proj-1' }, renewal_linked: false })

    const { result } = renderHook(() => useCreateImplicitProject(), { wrapper: wrapper() })
    let created: { projectId: string; accountId: string } | undefined
    await act(async () => {
      created = await result.current.mutateAsync('  acme  ')
    })

    expect(order).toEqual(['account', 'project'])
    expect(addToPortfolio).toHaveBeenCalledWith({ company_name: 'acme' })
    // Le libellé vient du compte RÉSOLU, jamais de la saisie : « acme » tapé à
    // la volée devient « ACME », et deux saisies du même nom ne font pas deux
    // projets.
    expect(createProject).toHaveBeenCalledWith({ account_id: 'acc-1', label: 'ACME' })
    expect(created).toEqual({ projectId: 'proj-1', accountId: 'acc-1' })
  })

  it('ne crée AUCUN projet si l’entreprise n’a pas pu être résolue', async () => {
    addToPortfolio.mockRejectedValue(new Error('résolution impossible'))

    const { result } = renderHook(() => useCreateImplicitProject(), { wrapper: wrapper() })
    await act(async () => {
      await result.current.mutateAsync('acme').catch(() => undefined)
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(createProject).not.toHaveBeenCalled()
    expect(order).toEqual(['account'])
  })
})
