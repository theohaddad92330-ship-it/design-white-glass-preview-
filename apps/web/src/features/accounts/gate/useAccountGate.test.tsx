import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDecideAccountGate } from './useAccountGate'

const apiFetchMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }))

const mockToastSuccess = vi.hoisted(() => vi.fn())
const mockToastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => mockToastSuccess(...a), error: (...a: unknown[]) => mockToastError(...a) },
}))

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/**
 * Le serveur dit pourquoi un compte écarté était parti (`GateDecisionResult.reopening`,
 * `apps/api/src/modules/account-gate/account-gate.service.ts:84-90`) — renseigné
 * UNIQUEMENT à la transition `parked → pending`, au moment même où il efface
 * `gate_reason`/`gate_decided_at`. Avant ce chantier, le web le lisait sans le
 * déclarer (`GateResult` ne portait pas `reopening`) et l'`onSuccess` affichait
 * un toast générique, sans jamais le lire : le motif du refus disparaissait sans
 * que personne ne le sache.
 */
describe('useDecideAccountGate — le rappel du motif à la réouverture', () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    apiFetchMock.mockReset()
    mockToastSuccess.mockReset()
    mockToastError.mockReset()
  })

  it('réouverture avec motif : un fait daté, jamais un état courant du compte', async () => {
    apiFetchMock.mockResolvedValue({
      id: 'acc-1',
      priority_gate: 'pending',
      gate_reason: null,
      gate_decided_at: null,
      reopening: { previousReason: 'Hors cible', previousDecidedAt: '2026-03-12T10:00:00.000Z' },
    })
    const { result } = renderHook(() => useDecideAccountGate('acc-1', 'ACME Industries'), { wrapper })

    await act(async () => {
      result.current.mutate({ gate: 'pending' })
    })

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled())
    // Le message principal ne change pas — c'est la description qui porte le
    // rappel, pour rester un fait annexe et non une nouvelle vérité affichée
    // en gras.
    expect(mockToastSuccess).toHaveBeenCalledWith('La question est rouverte sur ACME Industries.', {
      description: 'Écarté le 12/03/2026 — Hors cible',
    })
  })

  it('réouverture sans motif enregistré : la date reste affichée, aucune raison n’est inventée', async () => {
    apiFetchMock.mockResolvedValue({
      id: 'acc-1',
      priority_gate: 'pending',
      gate_reason: null,
      gate_decided_at: null,
      reopening: { previousReason: null, previousDecidedAt: '2026-03-12T10:00:00.000Z' },
    })
    const { result } = renderHook(() => useDecideAccountGate('acc-1', 'ACME Industries'), { wrapper })

    await act(async () => {
      result.current.mutate({ gate: 'pending' })
    })

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled())
    expect(mockToastSuccess).toHaveBeenCalledWith('La question est rouverte sur ACME Industries.', {
      description: 'Écarté le 12/03/2026, sans motif enregistré',
    })
  })

  it('transition qui n’est pas une réouverture : toast générique inchangé, sans rappel', async () => {
    apiFetchMock.mockResolvedValue({
      id: 'acc-1',
      priority_gate: 'prioritised',
      gate_reason: null,
      gate_decided_at: '2026-08-30T10:00:00.000Z',
    })
    const { result } = renderHook(() => useDecideAccountGate('acc-1', 'ACME Industries'), { wrapper })

    await act(async () => {
      result.current.mutate({ gate: 'prioritised' })
    })

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled())
    expect(mockToastSuccess).toHaveBeenCalledWith('C’est fait. ACME Industries est dans ton portefeuille.', undefined)
  })

  it('écartement (pas une réouverture) : toast générique inchangé, sans rappel', async () => {
    apiFetchMock.mockResolvedValue({
      id: 'acc-1',
      priority_gate: 'parked',
      gate_reason: 'Pas de budget',
      gate_decided_at: '2026-08-30T10:00:00.000Z',
    })
    const { result } = renderHook(() => useDecideAccountGate('acc-1', 'ACME Industries'), { wrapper })

    await act(async () => {
      result.current.mutate({ gate: 'parked', reason: 'Pas de budget' })
    })

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled())
    expect(mockToastSuccess).toHaveBeenCalledWith(
      'ACME Industries est écarté. Ce compte ne reviendra plus dans Découvrir.',
      undefined,
    )
  })

  it('échec de l’appel : une erreur claire, jamais confondue avec le rappel du motif', async () => {
    apiFetchMock.mockRejectedValue(new Error('Compte introuvable dans cet espace.'))
    const { result } = renderHook(() => useDecideAccountGate('acc-1', 'ACME Industries'), { wrapper })

    await act(async () => {
      result.current.mutate({ gate: 'pending' })
    })

    await waitFor(() => expect(mockToastError).toHaveBeenCalled())
    expect(mockToastError).toHaveBeenCalledWith('Je n’ai pas pu enregistrer cette décision.', {
      description: 'Compte introuvable dans cet espace.',
    })
    expect(mockToastSuccess).not.toHaveBeenCalled()
  })

  /**
   * #2116.40 — « aucun toast sans objet ». Les trois messages de la porte
   * disaient « Écarté. », « La question est rouverte. » : sur une liste de
   * comptes, ils ne disaient pas DE QUI on parlait — la seule chose qu'on
   * voulait relire. La garde `dossier-cta-interdits.test.ts` tient la règle
   * sur les traductions ; ces deux cas tiennent le CÂBLAGE.
   */
  it('nomme le compte dans le message de succès — #2116.40', async () => {
    apiFetchMock.mockResolvedValue({
      id: 'acc-1',
      priority_gate: 'prioritised',
      gate_reason: null,
      gate_decided_at: '2026-08-30T10:00:00.000Z',
    })
    const { result } = renderHook(() => useDecideAccountGate('acc-1', 'Crédit Mutuel'), { wrapper })

    await act(async () => {
      result.current.mutate({ gate: 'prioritised' })
    })

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled())
    expect(mockToastSuccess.mock.calls[0][0]).toContain('Crédit Mutuel')
  })

  it('sans nom lisible, un libellé générique — jamais un nom inventé — #2116.40', async () => {
    apiFetchMock.mockResolvedValue({
      id: 'acc-1',
      priority_gate: 'parked',
      gate_reason: 'Pas de budget',
      gate_decided_at: '2026-08-30T10:00:00.000Z',
    })
    const { result } = renderHook(() => useDecideAccountGate('acc-1', '   '), { wrapper })

    await act(async () => {
      result.current.mutate({ gate: 'parked', reason: 'Pas de budget' })
    })

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled())
    // Le repli est le MÊME libellé que l'export PDF (`pdf.fallbackAccountName`),
    // et le message ne commence jamais par un blanc laissé par l'interpolation.
    expect(mockToastSuccess.mock.calls[0][0]).toBe('compte est écarté. Ce compte ne reviendra plus dans Découvrir.')
  })
})
