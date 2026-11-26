import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}))

import { useAssignContacts } from './useAssignContacts'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  apiFetch.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
})

/**
 * L'attribution en masse annonce ce que le SERVEUR a écrit. Un commercial qui
 * coche des lignes portées par un collègue en attribue moins qu'il n'en a
 * coché — et il doit l'apprendre, pas le deviner.
 */
describe('useAssignContacts', () => {
  it('envoie la sélection et le destinataire sur le seul endpoint d’attribution', async () => {
    apiFetch.mockResolvedValue({ assigned_to: 'u-1', assigned: ['c-1', 'c-2'], skipped: [] })
    const { result } = renderHook(() => useAssignContacts(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate({ contactIds: ['c-1', 'c-2'], assignedTo: 'u-1', assigneeName: 'Léa Martin' })
    })

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/contacts/assign',
      method: 'PATCH',
      body: { contact_ids: ['c-1', 'c-2'], assigned_to: 'u-1' },
    })
  })

  it('annonce le compte RÉEL du serveur, pas la taille de la sélection', async () => {
    apiFetch.mockResolvedValue({ assigned_to: 'u-1', assigned: ['c-1'], skipped: ['c-2', 'c-3'] })
    const { result } = renderHook(() => useAssignContacts(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate({
        contactIds: ['c-1', 'c-2', 'c-3'],
        assignedTo: 'u-1',
        assigneeName: 'Léa Martin',
      })
    })

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(toastSuccess).toHaveBeenCalledWith(
      '1 contact attribué à Léa Martin.',
      expect.objectContaining({ description: expect.stringContaining('2 contacts ignorés') }),
    )
  })

  it('distingue le retrait d’attribution de l’attribution', async () => {
    apiFetch.mockResolvedValue({ assigned_to: null, assigned: ['c-1', 'c-2'], skipped: [] })
    const { result } = renderHook(() => useAssignContacts(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate({ contactIds: ['c-1', 'c-2'], assignedTo: null })
    })

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(toastSuccess).toHaveBeenCalledWith('2 contacts ne sont plus attribués.', undefined)
  })

  it('ne prétend pas au succès quand le serveur n’a rien écrit', async () => {
    apiFetch.mockResolvedValue({ assigned_to: 'u-1', assigned: [], skipped: ['c-1'] })
    const { result } = renderHook(() => useAssignContacts(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate({ contactIds: ['c-1'], assignedTo: 'u-1', assigneeName: 'Léa Martin' })
    })

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('traduit le refus d’autorisation (403) au lieu d’un échec générique', async () => {
    apiFetch.mockRejectedValue(new Error('Forbidden', { cause: 403 }))
    const { result } = renderHook(() => useAssignContacts(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate({ contactIds: ['c-1'], assignedTo: 'u-other', assigneeName: 'Autre' })
    })

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastError).toHaveBeenCalledWith("Seul un manager peut attribuer des contacts à quelqu'un d'autre.")
  })

  // #2160.9 (recette 26/09) — un 400 (ex. « ce membre n'appartient pas à
  // l'espace de travail ») avalait la phrase du serveur derrière un « a
  // échoué » générique : la seule raison réellement exploitable disparaissait.
  // Même grammaire que `useAccountAdminActions`/`useBestReference` — le titre
  // reste générique, la phrase du serveur voyage en description.
  it('garde la phrase du serveur pour tout échec qui n’est PAS un 403', async () => {
    apiFetch.mockRejectedValue(new Error("Ce membre n'appartient pas à l'espace de travail", { cause: 400 }))
    const { result } = renderHook(() => useAssignContacts(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate({ contactIds: ['c-1'], assignedTo: 'u-other', assigneeName: 'Autre' })
    })

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastError).toHaveBeenCalledWith(
      "L'attribution a échoué. Réessaie.",
      expect.objectContaining({ description: "Ce membre n'appartient pas à l'espace de travail" }),
    )
  })
})
