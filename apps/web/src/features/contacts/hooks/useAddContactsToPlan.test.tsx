import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalContact } from '@/features/contacts/api'

const apiFetch = vi.fn()
const toastSuccess = vi.fn()
const toastInfo = vi.fn()
const toastError = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    info: (...a: unknown[]) => toastInfo(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}))

import { useAddContactsToPlan } from './useAddContactsToPlan'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

const contact = (id: string, accountId: string | null): GlobalContact =>
  ({
    id,
    account_id: accountId,
    full_name: `Contact ${id}`,
    title: 'DSI',
    entity: null,
    decision_role: 'technical',
    priority: 3,
    email: null,
    phone: null,
    linkedin_url: null,
    why_contact: null,
    user_status: 'new',
    source: 'apollo',
    company_name: 'ACME',
  }) as GlobalContact

beforeEach(() => {
  apiFetch.mockReset()
  toastSuccess.mockReset()
  toastInfo.mockReset()
  toastError.mockReset()
})

/** Ce que `POST /plan-items` rend : la ligne, et si elle vient d'être écrite. */
const created = (added: boolean) => ({ id: `i-${String(added)}`, account_id: 'acc-1', added })

/**
 * « Ajouter au plan » en masse réutilise EXACTEMENT la porte unitaire — pas de
 * second endpoint qui divergerait — et rend compte de ce que le serveur a
 * fait, jamais d'un compteur estimé.
 *
 * #2123.46 — cette porte est `POST /plan-items`, la ligne canonique que le plan
 * du compte affiche et que `/actions` liste. Elle écrivait
 * `raw_analysis.user_plan_actions`, un blob qu'aucun autre écran ne lit.
 */
describe('useAddContactsToPlan', () => {
  it('#2123.46 — écrit la ligne canonique une fois par contact, sur SON compte', async () => {
    apiFetch.mockResolvedValue(created(true))
    const { result } = renderHook(() => useAddContactsToPlan(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate([contact('c-1', 'acc-1'), contact('c-2', 'acc-2')])
    })

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2))
    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        path: '/plan-items',
        method: 'POST',
        body: expect.objectContaining({ account_id: 'acc-1' }),
      }),
    )
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        path: '/plan-items',
        method: 'POST',
        body: expect.objectContaining({ account_id: 'acc-2' }),
      }),
    )
    // Plus rien ne part vers l'ancienne porte.
    for (const call of apiFetch.mock.calls) {
      expect((call[0] as { path: string }).path).not.toMatch(/plan\/actions/)
    }
  })

  it('envoie le MÊME libellé que la fiche contact, et le contact VISÉ (le dédoublonnage compare les deux)', async () => {
    apiFetch.mockResolvedValue(created(true))
    const { result } = renderHook(() => useAddContactsToPlan(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate([contact('c-1', 'acc-1')])
    })

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect((apiFetch.mock.calls[0]![0] as { body: unknown }).body).toEqual({
      account_id: 'acc-1',
      // #2395.8 — le résultat attendu est requis à la création d'une action.
      expected_outcome: 'Un premier échange avec Contact c-1 — DSI est obtenu.',
      label: 'Prendre contact avec Contact c-1 — DSI',
      reason: 'Ouvrir la relation avec Contact c-1 — DSI et obtenir un premier échange',
      target: { kind: 'contact', id: 'c-1', label: 'Contact c-1' },
      method_rule: 'couverture_multi_roles_niveaux_entites',
    })
  })

  it('compte les ignorés à partir du `added` du serveur, pas d’une estimation', async () => {
    apiFetch
      .mockResolvedValueOnce(created(true))
      .mockResolvedValueOnce(created(false))
      .mockResolvedValueOnce(created(true))
    const { result } = renderHook(() => useAddContactsToPlan(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate([contact('c-1', 'acc-1'), contact('c-2', 'acc-1'), contact('c-3', 'acc-2')])
    })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual({ added: 2, skipped: 1, failed: 0, unqualified: 0 })
    expect(toastSuccess).toHaveBeenCalledWith(
      "2 contacts ajoutés au plan d'action.",
      expect.objectContaining({ description: expect.stringContaining('1 ignoré') }),
    )
  })

  it('n’échoue jamais en silence : un appel raté est compté et annoncé', async () => {
    apiFetch.mockResolvedValueOnce(created(true)).mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useAddContactsToPlan(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate([contact('c-1', 'acc-1'), contact('c-2', 'acc-1')])
    })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual({ added: 1, skipped: 0, failed: 1, unqualified: 0 })
    const options = toastSuccess.mock.calls[0]![1] as { description?: string }
    expect(options.description).toContain('1')
  })

  it('dit « rien de neuf » quand tout était déjà au plan (jamais un faux succès)', async () => {
    apiFetch.mockResolvedValue(created(false))
    const { result } = renderHook(() => useAddContactsToPlan(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate([contact('c-1', 'acc-1')])
    })

    await waitFor(() => expect(toastInfo).toHaveBeenCalled())
    expect(result.current.data).toEqual({ added: 0, skipped: 1, failed: 0, unqualified: 0 })
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('remonte une erreur quand AUCUN ajout ne passe', async () => {
    apiFetch.mockRejectedValue(new Error('down'))
    const { result } = renderHook(() => useAddContactsToPlan(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate([contact('c-1', 'acc-1')])
    })

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(result.current.data).toEqual({ added: 0, skipped: 0, failed: 1, unqualified: 0 })
  })

  // Une API antérieure au déploiement (la porte `POST /plan-items` du lot
  // précédent) n'envoie pas `added` : on ne devine pas
  // « déjà au plan », l'appel a réussi et il est compté comme ajouté.
  it('compte l’ajout comme réussi quand l’API ne renvoie pas `added`', async () => {
    apiFetch.mockResolvedValue({ id: 'i-1', account_id: 'acc-1' })
    const { result } = renderHook(() => useAddContactsToPlan(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate([contact('c-1', 'acc-1')])
    })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual({ added: 1, skipped: 0, failed: 0, unqualified: 0 })
  })

  // #1473 — un contact À QUALIFIER n'a pas de compte, donc pas de plan d'action
  // où poser la ligne. Ce n'est ni un échec (rien n'a cassé) ni un « déjà au
  // plan » (rien n'y était) : les confondre dirait au commercial que son geste
  // a porté alors qu'il n'a rien produit pour ces lignes-là.
  it('compte À PART un contact sans entreprise — ni échoué, ni déjà au plan', async () => {
    apiFetch.mockResolvedValue(created(true))
    const { result } = renderHook(() => useAddContactsToPlan(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate([contact('c-1', 'acc-1'), contact('c-2', null)])
    })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual({ added: 1, skipped: 0, failed: 0, unqualified: 1 })
    // Et aucun appel n'est parti pour lui : il n'y a aucune adresse où l'envoyer.
    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringContaining('1 contact'),
      expect.objectContaining({ description: expect.stringContaining('à qualifier') }),
    )
  })

  // Toute la sélection à qualifier : rien n'a été tenté, donc rien n'a échoué.
  // « Aucun ajout n'a pu être fait » enverrait chercher une panne inexistante.
  it('ne dit PAS « échec » quand toute la sélection est à qualifier', async () => {
    const { result } = renderHook(() => useAddContactsToPlan(), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate([contact('c-1', null), contact('c-2', null)])
    })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual({ added: 0, skipped: 0, failed: 0, unqualified: 2 })
    expect(apiFetch).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
    expect(toastInfo).toHaveBeenCalledWith(expect.stringContaining('à qualifier'))
  })
})
