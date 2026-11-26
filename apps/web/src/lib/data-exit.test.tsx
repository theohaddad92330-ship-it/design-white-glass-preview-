import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceRulesView } from '@bellum/contracts'
import { i18n } from '@/i18n'

// Le module est bouchonné pour toute la suite web (`test/setup.ts`) : ici, c'est
// LUI qu'on mesure.
vi.unmock('@/lib/data-exit')

const apiFetch = vi.fn()
class FakeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a), ApiError: FakeApiError }))

const { useDataExit, workspaceRuleRefusalText } = await import('./data-exit')

/**
 * #2081.14 — DÉCISION Louis 19/09/2026 : un CSV construit DANS LE NAVIGATEUR
 * (Découvrir, le chat, la sélection de contacts, la finance) n'a pas de route
 * à garder. La décision vient donc de l'API (`dataExitAllowed`, dérivé par
 * `workspaceRuleForbids`) : l'écran la lit, et n'offre le bouton que si elle
 * dit oui. Sans réponse — chargement, panne — le bouton reste masqué : une
 * règle qui RETIRE ne s'ouvre pas sur un doute.
 */
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const view = (dataExitAllowed: boolean): WorkspaceRulesView => ({
  businessUnitAccountsVisibility: { value: 'shared', changedByUserId: null, changedByName: null, changedAt: null },
  exportPolicy: {
    value: dataExitAllowed ? 'everyone' : 'admins',
    changedByUserId: null,
    changedByName: null,
    changedAt: null,
  },
  canEdit: false,
  dataExitAllowed,
})

describe('#2081.14 — useDataExit : la sortie de données, décidée par l’API', () => {
  beforeEach(() => {
    apiFetch.mockReset()
  })

  it('NON : l’API dit « réservé » — pas de bouton, pas de preuve pour télécharger', async () => {
    apiFetch.mockResolvedValue(view(false))
    const { result } = renderHook(() => useDataExit(), { wrapper })

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith({ path: '/workspaces/rules' }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(result.current).toEqual({ allowed: false, grant: null })
  })

  it('l’API dit oui — le bouton s’offre, et la preuve existe', async () => {
    apiFetch.mockResolvedValue(view(true))
    const { result } = renderHook(() => useDataExit(), { wrapper })

    await waitFor(() => expect(result.current.allowed).toBe(true))
    expect(result.current.grant).not.toBeNull()
  })

  it('sans réponse (l’API n’a pas encore répondu), rien ne s’ouvre', async () => {
    apiFetch.mockReturnValue(new Promise(() => undefined))
    const { result } = renderHook(() => useDataExit(), { wrapper })

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(result.current).toEqual({ allowed: false, grant: null })
  })

  it('une panne ne se lit pas « ouverte »', async () => {
    apiFetch.mockRejectedValue(new Error('réseau'))
    const { result } = renderHook(() => useDataExit(), { wrapper })

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(result.current).toEqual({ allowed: false, grant: null })
  })
})

describe('#2081.14 — le refus d’une règle d’espace se DIT, jamais en erreur générique', () => {
  it('un 403 `workspace_rule_refused` rend la phrase « Réservé par la règle d’espace : … »', async () => {
    await i18n.changeLanguage('fr')
    const refused = new FakeApiError('ignored', 403, 'workspace_rule_refused', { rule: 'exportPolicy' })
    expect(workspaceRuleRefusalText(refused)).toMatch(/^Réservé par la règle d’espace : /)

    await i18n.changeLanguage('en')
    expect(workspaceRuleRefusalText(refused)).toMatch(/^Reserved by the workspace rule: /)
    await i18n.changeLanguage('fr')
  })

  it('n’attrape pas ce qu’il ne vise pas — un autre refus garde son propre message', () => {
    expect(workspaceRuleRefusalText(new FakeApiError('Rôle insuffisant', 403))).toBeNull()
    expect(workspaceRuleRefusalText(new Error('réseau'))).toBeNull()
  })
})
