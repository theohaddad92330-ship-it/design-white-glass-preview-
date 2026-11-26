import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * #2874 / #2367.17 — L'ÉCHANTILLON avant de valider une campagne à plusieurs
 * contacts. Verrouille : (1) le choix du premier contact JOIGNABLE par
 * e-mail, jamais un contact inventé (doctrine c74) ; (2) le hook déclenche
 * `POST /ia/message` (le MÊME chemin que le composer, crédit 0) pour UN SEUL
 * contact, jamais un par contact de l'audience ; (3) rien ne part tout seul —
 * `generate` doit être appelé explicitement, jamais au montage.
 */

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiFetch }))

const { firstSampleCandidate, useCampaignSample } = await import('./campaign-sample')

beforeEach(() => {
  apiFetch.mockReset()
})

describe('firstSampleCandidate', () => {
  it('retient le premier contact avec une adresse e-mail', () => {
    const contacts = [
      { id: '1', email: null },
      { id: '2', email: 'a@b.fr' },
      { id: '3', email: 'c@d.fr' },
    ]
    expect(firstSampleCandidate(contacts)?.id).toBe('2')
  })

  it('rend null quand aucun contact n’a d’adresse — jamais un contact inventé', () => {
    expect(firstSampleCandidate([{ id: '1', email: null }])).toBeNull()
  })
})

describe('useCampaignSample', () => {
  it('ne lance aucun appel au montage — le geste est explicite', () => {
    renderHook(() => useCampaignSample())
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('appelle /ia/message pour UN SEUL contact, jamais un par contact de l’audience', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { subject: 'Objet', body: 'Bonjour Claire,' } })
    const { result } = renderHook(() => useCampaignSample())

    await act(async () => {
      await result.current.generate({ id: 'c1', full_name: 'Claire Dubois' }, 'Relancer les DSI')
    })

    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/ia/message',
      method: 'POST',
      body: { contactId: 'c1', channel: 'email', context: 'Relancer les DSI' },
    })
    expect(result.current.sample).toEqual({
      state: 'ready',
      contactId: 'c1',
      contactName: 'Claire Dubois',
      subject: 'Objet',
      body: 'Bonjour Claire,',
    })
  })

  it('passe par un état "loading" avant le résultat', async () => {
    let resolve!: (value: unknown) => void
    apiFetch.mockReturnValue(new Promise(r => (resolve = r)))
    const { result } = renderHook(() => useCampaignSample())

    act(() => {
      void result.current.generate({ id: 'c1', full_name: 'Claire' })
    })
    await waitFor(() => expect(result.current.sample).toEqual({ state: 'loading', contactId: 'c1' }))

    await act(async () => {
      resolve({ success: true, data: { subject: '', body: 'Corps.' } })
    })
    await waitFor(() => expect(result.current.sample.state).toBe('ready'))
  })

  it('un échec du moteur rend un état "error" nommé, jamais un message inventé', async () => {
    apiFetch.mockRejectedValue(new Error('502'))
    const { result } = renderHook(() => useCampaignSample())

    await act(async () => {
      await result.current.generate({ id: 'c1', full_name: 'Claire' })
    })

    expect(result.current.sample).toEqual({ state: 'error', contactId: 'c1' })
  })

  it('une réponse sans corps rend aussi "error" — jamais un corps vide affiché comme un brouillon', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { subject: 'Objet', body: '' } })
    const { result } = renderHook(() => useCampaignSample())

    await act(async () => {
      await result.current.generate({ id: 'c1', full_name: 'Claire' })
    })

    expect(result.current.sample).toEqual({ state: 'error', contactId: 'c1' })
  })

  it('reset ramène à idle', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { subject: '', body: 'Corps.' } })
    const { result } = renderHook(() => useCampaignSample())
    await act(async () => {
      await result.current.generate({ id: 'c1', full_name: 'Claire' })
    })
    act(() => result.current.reset())
    expect(result.current.sample).toEqual({ state: 'idle' })
  })
})
