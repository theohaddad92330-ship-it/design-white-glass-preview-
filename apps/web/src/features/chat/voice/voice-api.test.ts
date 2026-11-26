/**
 * #1939 — le client des trois routes vocales du lot 9.1.
 *
 * `@/lib/api` est doublé globalement (`src/test/setup.ts`) : aucun appel réseau
 * ne part d'ici. On prouve ce que le client ENVOIE et ce qu'il accepte de lire.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { fetchVoicePlayback, fetchVoiceRefinements, fetchVoiceStatus, transcribeVoiceMessage } from './voice-api'

const apiFetchMock = vi.mocked(apiFetch)
const VOICE_ID = '11111111-1111-4111-8111-111111111111'
const NOT_WIRED = { accent: 'not_wired', noise: 'not_wired', mixedLanguage: 'not_wired' } as const

beforeEach(() => {
  apiFetchMock.mockReset()
})

describe('#1939.1 — la capacité, lue AVANT d’afficher le micro', () => {
  it('GET /ia/chat/voice/status → `available`', async () => {
    apiFetchMock.mockResolvedValue({ available: true, refinements: NOT_WIRED })
    expect(await fetchVoiceStatus()).toBe(true)
    expect(apiFetchMock).toHaveBeenCalledWith({ path: '/ia/chat/voice/status' })
  })

  it('`available: false` → false', async () => {
    apiFetchMock.mockResolvedValue({ available: false, refinements: NOT_WIRED })
    expect(await fetchVoiceStatus()).toBe(false)
  })

  it('#2434.74 / #2434.75 / #2434.77 — sans `refinements` (forme hors contrat) : réponse illisible, jamais deviné', async () => {
    apiFetchMock.mockResolvedValue({ available: true })
    expect(await fetchVoiceStatus()).toBe(false)
  })

  it('réponse illisible ou panne → false : jamais un bouton qui échouerait au clic', async () => {
    apiFetchMock.mockResolvedValueOnce({})
    expect(await fetchVoiceStatus()).toBe(false)
    apiFetchMock.mockRejectedValueOnce(new Error('panne'))
    expect(await fetchVoiceStatus()).toBe(false)
  })
})

describe('#3579.3b — l’état live des raffinements, lu pour la notice', () => {
  it('rend `refinements` tel que le serveur le déclare', async () => {
    const wired = { accent: 'robust_model', noise: 'robust_model', mixedLanguage: 'segment_language' } as const
    apiFetchMock.mockResolvedValue({ available: true, refinements: wired })
    expect(await fetchVoiceRefinements()).toEqual(wired)
    expect(apiFetchMock).toHaveBeenCalledWith({ path: '/ia/chat/voice/status' })
  })

  it('réponse illisible ou panne → null : jamais un état deviné', async () => {
    apiFetchMock.mockResolvedValueOnce({ available: true })
    expect(await fetchVoiceRefinements()).toBeNull()
    apiFetchMock.mockRejectedValueOnce(new Error('panne'))
    expect(await fetchVoiceRefinements()).toBeNull()
  })
})

describe('#1939 — transcrire', () => {
  it('POST /ia/chat/voice/transcribe avec le corps STRICT du contrat', async () => {
    apiFetchMock.mockResolvedValue({
      text: 'Quels signaux sur Airbus ?',
      voiceObjectId: VOICE_ID,
      uncertainSegments: [],
    })
    await expect(transcribeVoiceMessage({ audioB64: 'GkXfow==', durationMs: 4200, language: 'fr' })).resolves.toEqual({
      text: 'Quels signaux sur Airbus ?',
      voiceObjectId: VOICE_ID,
      uncertainSegments: [],
    })
    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/ia/chat/voice/transcribe',
      method: 'POST',
      body: { audioB64: 'GkXfow==', durationMs: 4200, language: 'fr' },
    })
  })

  it('la durée part en millisecondes ENTIÈRES — le schéma serveur refuse une fraction', async () => {
    apiFetchMock.mockResolvedValue({
      text: 'ok',
      voiceObjectId: VOICE_ID,
      uncertainSegments: [],
    })
    await transcribeVoiceMessage({ audioB64: 'GkXfow==', durationMs: 4200.6, language: 'en' })
    expect(apiFetchMock.mock.calls[0]?.[0]).toMatchObject({ body: { durationMs: 4201, language: 'en' } })
  })

  it('#2434.74/.75/.77 — `auto` part tel quel : c’est le serveur qui l’omet vers le fournisseur', async () => {
    apiFetchMock.mockResolvedValue({
      text: 'ok',
      voiceObjectId: VOICE_ID,
      uncertainSegments: [],
    })
    await transcribeVoiceMessage({ audioB64: 'GkXfow==', durationMs: 1000, language: 'auto' })
    expect(apiFetchMock.mock.calls[0]?.[0]).toMatchObject({ body: { language: 'auto' } })
  })

  it('réponse hors contrat → rejette : jamais un texte inventé dans la saisie', async () => {
    apiFetchMock.mockResolvedValue({ text: '', voiceObjectId: 'pas-un-uuid' })
    await expect(transcribeVoiceMessage({ audioB64: 'GkXfow==', durationMs: 1000, language: 'fr' })).rejects.toThrow()
  })
})

describe('9.3 — réécouter', () => {
  it('GET /ia/chat/messages/:id/voice, identifiant encodé', async () => {
    const signed = {
      url: 'https://stockage.example/objet?jeton=abc',
      expiresAt: '2026-09-13T10:05:00Z',
      fileName: 'message-vocal.webm',
    }
    apiFetchMock.mockResolvedValue(signed)
    await expect(fetchVoicePlayback('m 1')).resolves.toEqual(signed)
    expect(apiFetchMock).toHaveBeenCalledWith({ path: '/ia/chat/messages/m%201/voice' })
  })

  it('URL signée absente → rejette', async () => {
    apiFetchMock.mockResolvedValue({ expiresAt: 'x', fileName: 'y' })
    await expect(fetchVoicePlayback('m-1')).rejects.toThrow()
  })
})
