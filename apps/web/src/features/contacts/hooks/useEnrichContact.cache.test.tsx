import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import type * as ContactsApiModule from '@/features/contacts/api'

/**
 * Régression « email récupéré puis plus rien, obligé de F5 » : au retour d'un
 * enrichissement réussi, la fiche doit se rafraîchir SEULE. On vérifie deux
 * choses : (1) le résultat déjà en main est écrit dans le cache de la fiche
 * (mise à jour instantanée, sans dépendre d'un refetch), et (2) tous les
 * panneaux satellites (cycle de vie, cadence, sendabilité, listes, compte,
 * crédits) sont invalidés — pas seulement la carte principale.
 */
const enrich = vi.fn()
const enrichmentDurationEstimate = vi.fn()
const apiFetchMock = vi.fn()
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/api')
  return { ...actual, apiFetch: (...a: unknown[]) => apiFetchMock(...a) }
})
vi.mock('@/features/contacts/api', async () => {
  const actual = await vi.importActual<typeof ContactsApiModule>('@/features/contacts/api')
  return {
    ...actual,
    contactsApi: {
      ...actual.contactsApi,
      enrich: (...a: unknown[]) => enrich(...a),
      enrichmentDurationEstimate: (...a: unknown[]) => enrichmentDurationEstimate(...a),
    },
  }
})
// `loading` fait partie du contrat depuis #1077 : l'attente est annoncée, et
// le résultat REMPLACE le bandeau (même `id`). Un mock incomplet faisait
// échouer la mutation avant même l'appel réseau.
const toastLoading = vi.fn()
const toastSuccess = vi.fn()
const toastMessage = vi.fn()
const toastWarning = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    loading: (...a: unknown[]) => toastLoading(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
    message: (...a: unknown[]) => toastMessage(...a),
    warning: (...a: unknown[]) => toastWarning(...a),
    error: vi.fn(),
  },
}))

import { useEnrichContact } from './useEnrichContact'
import { useEnrichmentDurationEstimate } from './useEnrichmentDurationEstimate'
import { contactKeys } from '@/features/contacts/api'
import { accountKeys } from '@/features/accounts/api'

const CONTACT = {
  id: 'c1',
  account_id: 'acc1',
  full_name: 'Magnus J.',
  email: null,
  phone: null,
  linkedin_url: null,
  title: 'Project Manager',
  contact_score: 42,
} as unknown as Contact

let qc: QueryClient
function wrapper() {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  enrich.mockReset()
  apiFetchMock.mockReset()
  enrichmentDurationEstimate.mockReset()
  toastLoading.mockReset()
  toastSuccess.mockReset()
  toastMessage.mockReset()
  toastWarning.mockReset()
})

describe('useEnrichContact — rafraîchissement au retour', () => {
  it('#4063.3 — « Téléphone seulement » : le toast dit « téléphone », jamais un email non demandé', async () => {
    enrich.mockResolvedValue({
      email: 'deja@dirigo.fr',
      phone: '+33102030405',
      credits_remaining: 10,
      enrichment: {},
    })
    const { result } = renderHook(() => useEnrichContact(), { wrapper: wrapper() })
    await act(async () => {
      result.current.mutate({ contact: CONTACT, accountCompanyName: 'Dirigo', only: 'phone' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [message] = toastSuccess.mock.calls[0] as [string]
    expect(message).toMatch(/téléphone/i)
    expect(message).not.toMatch(/email/i)
  })

  it('#4063.1 — `resume` rejoint le job en vol : jamais de POST (aucun second débit), même toast, même résultat', async () => {
    apiFetchMock.mockResolvedValue({
      state: 'done',
      job_id: 'j',
      result: { email: null, phone: '+33102030405', credits_remaining: 10, enrichment: {} },
    })
    const { result } = renderHook(() => useEnrichContact(), { wrapper: wrapper() })
    await act(async () => {
      result.current.mutate({ contact: CONTACT, accountCompanyName: 'Dirigo', resume: true })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(enrich).not.toHaveBeenCalled()
    expect(apiFetchMock).toHaveBeenCalledWith(expect.objectContaining({ path: '/contacts/c1/enrichment' }))
    expect(toastLoading).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ id: 'enrich:c1' }))
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })

  it('écrit le contact enrichi dans le cache de la fiche (present-only, garde les champs calculés)', async () => {
    enrich.mockResolvedValue({
      email: 'magnus@dirigo.fr',
      email_verified: true,
      phone: null,
      linkedin_url: 'https://linkedin.com/in/magnus',
      full_name: 'Magnus Jensen',
      title: 'Project Manager',
      credits_remaining: 389,
      enrichment: {},
    })
    const { result } = renderHook(() => useEnrichContact(), { wrapper: wrapper() })
    qc.setQueryData<Contact>(contactKeys.detail('c1'), CONTACT)

    await act(async () => {
      result.current.mutate({ contact: CONTACT, accountCompanyName: 'Dirigo' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // #1077 « je clique sur enrichissement, et rien ne se passe » : l'attente
    // s'annonce, sous l'identifiant que le résultat réutilisera.
    expect(toastLoading).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ id: 'enrich:c1' }))

    // ⚠️ Trouvé en recette de production : sonner FUSIONNE sur l'identifiant,
    // donc la description de l'attente (« ça prend de quelques secondes à une
    // minute ») survivait au résultat et se lisait « c'est encore en cours »
    // au-dessus d'un e-mail déjà trouvé. La notification finale doit la
    // remplacer explicitement.
    const [, optionsSucces] = toastSuccess.mock.calls[0] as [string, { id: string; description?: string }]
    expect(optionsSucces.id).toBe('enrich:c1')
    expect(optionsSucces.description).toBeUndefined()

    const cached = qc.getQueryData<Contact>(contactKeys.detail('c1'))!
    expect(cached.email).toBe('magnus@dirigo.fr')
    expect(cached.email_verified).toBe(true)
    expect(cached.linkedin_url).toBe('https://linkedin.com/in/magnus')
    // Identité complétée → le badge « Nom à révéler » disparaît.
    expect(cached.full_name).toBe('Magnus Jensen')
    // Champs calculés côté serveur préservés (pas écrasés par un present-only).
    expect(cached.contact_score).toBe(42)
    // Un canal resté vide n'est pas écrasé par null.
    expect(cached.phone).toBeNull()
  })

  it('invalide TOUS les panneaux de la fiche, pas seulement la carte', async () => {
    enrich.mockResolvedValue({ email: 'a@b.fr', credits_remaining: 1, enrichment: {} })
    const spy = vi.fn()
    const { result } = renderHook(() => useEnrichContact(), { wrapper: wrapper() })
    qc.setQueryData<Contact>(contactKeys.detail('c1'), CONTACT)
    const origInvalidate = qc.invalidateQueries.bind(qc)
    vi.spyOn(qc, 'invalidateQueries').mockImplementation(args => {
      spy(args?.queryKey)
      return origInvalidate(args)
    })

    await act(async () => {
      result.current.mutate({ contact: CONTACT, accountCompanyName: 'Dirigo' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const invalidated = spy.mock.calls.map(c => JSON.stringify(c[0]))
    for (const key of [
      contactKeys.detail('c1'),
      contactKeys.lifecycle('c1'),
      contactKeys.cadence('c1'),
      contactKeys.sendability('c1'),
      contactKeys.byAccount('acc1'),
      accountKeys.detail('acc1'),
      ['credits'],
      // #2120.57 (c) — la médiane annoncée par `EnrichConfirmDialog` doit se
      // rafraîchir APRÈS un enrichissement, pas rester figée pour la durée du
      // `staleTime` (5 min) : recette de production, dialogue rouvert quatre
      // fois entre des enrichissements réussis, texte identique à chaque fois.
      ['contacts', 'enrichment-duration-estimate'],
    ]) {
      expect(invalidated).toContain(JSON.stringify(key))
    }
  })
})

/**
 * #2120.57 (c) — mesuré en production le 20/09 : le dialogue rouvert QUATRE
 * FOIS de suite, entre des enrichissements réussis, affichait EXACTEMENT le
 * même texte à chaque fois. `useEnrichmentDurationEstimate` a un `staleTime`
 * de 5 minutes — sans invalidation, un second enrichissement dans la même
 * session ne redéclenche donc AUCUN refetch. Ce test monte le VRAI hook de
 * lecture (`useEnrichmentDurationEstimate`) sur le même client que la
 * mutation, plutôt que de se limiter à vérifier l'appel à
 * `invalidateQueries` : c'est le comportement réellement observé (le
 * dialogue rouvert) qui doit changer, pas seulement l'intention du code.
 */
describe('useEnrichContact — la médiane de durée se rafraîchit après un enrichissement (#2120.57 c)', () => {
  it('un second rendu du hook de lecture refetch, au lieu de servir le cache figé', async () => {
    enrichmentDurationEstimate
      .mockResolvedValueOnce({ estimate: { medianMs: 32_000, sampleSize: 7 } })
      .mockResolvedValueOnce({ estimate: { medianMs: 33_500, sampleSize: 8 } })
    enrich.mockResolvedValue({ email: 'a@b.fr', credits_remaining: 1, enrichment: {} })

    const w = wrapper()
    qc.setQueryData<Contact>(contactKeys.detail('c1'), CONTACT)

    // 1) Le dialogue s'ouvre une première fois — la médiane se charge.
    const first = renderHook(() => useEnrichmentDurationEstimate(true), { wrapper: w })
    await waitFor(() => expect(first.result.current.data?.estimate?.medianMs).toBe(32_000))
    expect(enrichmentDurationEstimate).toHaveBeenCalledTimes(1)

    // 2) Un enrichissement réussit pendant que le dialogue est fermé.
    const { result: enrichResult } = renderHook(() => useEnrichContact(), { wrapper: w })
    await act(async () => {
      enrichResult.current.mutate({ contact: CONTACT, accountCompanyName: 'Dirigo' })
    })
    await waitFor(() => expect(enrichResult.current.isSuccess).toBe(true))

    // 3) Le dialogue se ROUVRE (nouveau montage du même hook, staleTime
    // encore largement dans sa fenêtre de 5 min) : sans invalidation, il
    // servirait encore 32 000 ms depuis le cache.
    const second = renderHook(() => useEnrichmentDurationEstimate(true), { wrapper: w })
    await waitFor(() => expect(enrichmentDurationEstimate).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(second.result.current.data?.estimate?.medianMs).toBe(33_500))
  })
})

// #2120.61 / #2120.64 — un enrichissement qui ne trouve rien de MIEUX le DIT,
// il ne se confond pas avec un « rien trouvé » ordinaire.
describe('useEnrichContact — résultats qui ne choisissent pas et n’écrasent rien', () => {
  it('#2120.61 — identité ambiguë : un toast NOMMÉ, pas le toast générique « rien trouvé »', async () => {
    enrich.mockResolvedValue({
      email: null,
      phone: null,
      last_enrichment_result: 'ambiguous',
      credits_remaining: 0,
      enrichment: {},
    })
    const { result } = renderHook(() => useEnrichContact(), { wrapper: wrapper() })
    qc.setQueryData<Contact>(contactKeys.detail('c1'), CONTACT)

    await act(async () => {
      result.current.mutate({ contact: CONTACT, accountCompanyName: 'Dirigo' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Le toast d'ambiguïté est déclenché — jamais le succès (rien n'est
    // trouvé), jamais le message générique de "rien trouvé".
    expect(toastWarning).toHaveBeenCalledTimes(1)
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastMessage).not.toHaveBeenCalled()
    const [text] = toastWarning.mock.calls[0] as [string]
    expect(text).toContain('Magnus J.')
  })

  /**
   * #2297.18 — le toast d'ambiguïté ne peut pas rester une note qu'on lit et
   * qu'on oublie : il doit EXIGER une sélection à l'écran avant toute
   * relance. Le geste minimal, faute d'un second candidat retourné par le
   * serveur (`homonymFound` ne renvoie que le fait, pas l'AUTRE fiche) : une
   * action qui ouvre l'onglet Contacts du compte, filtré sur ce nom — la
   * comparaison et le choix se font À L'ÉCRAN, jamais devinés ici.
   */
  it('#2297.18 — le toast d’ambiguïté porte une action qui ouvre les fiches du compte, filtrées sur le nom', async () => {
    enrich.mockResolvedValue({
      email: null,
      phone: null,
      last_enrichment_result: 'ambiguous',
      credits_remaining: 0,
      enrichment: {},
    })
    const { result } = renderHook(() => useEnrichContact(), { wrapper: wrapper() })
    qc.setQueryData<Contact>(contactKeys.detail('c1'), CONTACT)

    await act(async () => {
      result.current.mutate({ contact: CONTACT, accountCompanyName: 'Dirigo' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const [, options] = toastWarning.mock.calls[0] as [string, { action?: { label: string; onClick: () => void } }]
    expect(options.action?.label).toBeTruthy()

    const assign = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...window.location, assign }, writable: true })
    options.action?.onClick()
    expect(assign).toHaveBeenCalledWith('/accounts/acc1?tab=contacts&q=Magnus%20J.')
  })

  it('#2120.64 — donnée existante plus récente : un toast NOMMÉ, distinct du succès et du « rien trouvé »', async () => {
    enrich.mockResolvedValue({
      email: null,
      phone: null,
      last_enrichment_result: 'newer_data_exists',
      credits_remaining: 0,
      enrichment: {},
    })
    const { result } = renderHook(() => useEnrichContact(), { wrapper: wrapper() })
    qc.setQueryData<Contact>(contactKeys.detail('c1'), CONTACT)

    await act(async () => {
      result.current.mutate({ contact: CONTACT, accountCompanyName: 'Dirigo' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(toastMessage).toHaveBeenCalledTimes(1)
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastWarning).not.toHaveBeenCalled()
    const [, options] = toastMessage.mock.calls[0] as [string, { description?: string }]
    // La description dit POURQUOI rien n'a été écrasé, jamais un « 0 » muet.
    expect(options.description).toMatch(/correction/i)
  })

  // #3850.3 — retour bêta mesuré le 08/10 : le toast disait « Aucune personne
  // trouvée » puis un numéro apparaissait peu après (révélation Apollo en
  // vol, #3782). Ni e-mail ni téléphone trouvés CE tour n'est pas un
  // « rien trouvé » tant qu'une coordonnée reste `pending` ou `unknown`.
  it('#3850.3 — une révélation encore EN VOL ne conclut jamais « Aucune personne trouvée »', async () => {
    enrich.mockResolvedValue({
      email: null,
      phone: null,
      credits_remaining: 10,
      enrichment: {},
      enrichment_coordinates: { phone: { state: 'pending', sources_queried: 1, at: '2026-10-08T09:00:00.000Z' } },
    })
    const { result } = renderHook(() => useEnrichContact(), { wrapper: wrapper() })
    qc.setQueryData<Contact>(contactKeys.detail('c1'), CONTACT)

    await act(async () => {
      result.current.mutate({ contact: CONTACT, accountCompanyName: 'Dirigo' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(toastMessage).toHaveBeenCalledTimes(1)
    const [text] = toastMessage.mock.calls[0] as [string]
    expect(text).not.toMatch(/aucune personne trouvée/i)
    expect(text).toMatch(/recherche en cours/i)
  })

  // #3850.2/#3850.3 — même attente pour une sonde FullEnrich qui n'a pas
  // conclu (`unknown`, 18 recherches sur 19 mesurées le 08/10) : ce n'est
  // PAS une panne constatée, donc pas davantage un « rien trouvé ».
  it('#3850.3 — une sonde FullEnrich restée `unknown` ne conclut pas non plus', async () => {
    enrich.mockResolvedValue({
      email: null,
      phone: null,
      credits_remaining: 10,
      enrichment: {},
      enrichment_coordinates: { phone: { state: 'unknown', sources_queried: 0, at: '2026-10-08T09:00:00.000Z' } },
    })
    const { result } = renderHook(() => useEnrichContact(), { wrapper: wrapper() })
    qc.setQueryData<Contact>(contactKeys.detail('c1'), CONTACT)

    await act(async () => {
      result.current.mutate({ contact: CONTACT, accountCompanyName: 'Dirigo' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const [text] = toastMessage.mock.calls[0] as [string]
    expect(text).not.toMatch(/aucune personne trouvée/i)
    expect(text).toMatch(/recherche en cours/i)
  })

  it('#3850.3 — un `not_found` CONSTATÉ (aucune coordonnée en vol) conclut bien « Aucune personne trouvée »', async () => {
    enrich.mockResolvedValue({
      email: null,
      phone: null,
      credits_remaining: 10,
      enrichment: {},
      enrichment_coordinates: { phone: { state: 'not_found', sources_queried: 2, at: '2026-10-08T09:00:00.000Z' } },
    })
    const { result } = renderHook(() => useEnrichContact(), { wrapper: wrapper() })
    qc.setQueryData<Contact>(contactKeys.detail('c1'), CONTACT)

    await act(async () => {
      result.current.mutate({ contact: CONTACT, accountCompanyName: 'Dirigo' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const [text] = toastMessage.mock.calls[0] as [string]
    expect(text).toMatch(/aucune personne trouvée/i)
  })
})
