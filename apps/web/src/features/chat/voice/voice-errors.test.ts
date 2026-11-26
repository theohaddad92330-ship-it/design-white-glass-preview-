/**
 * #1939.2 / #1939.13 — un refus devient une raison NOMMÉE, que l'écran traduit.
 *
 * Le serveur écrit ses refus en français (l'API n'a pas de langue) : l'écran ne
 * les répète pas, il les classe et dit la phrase dans la langue de l'interface.
 */
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api-error'
import { voiceErrorFromMedia, voiceErrorFromTranscription } from './voice-errors'

describe('#1939.13 — les refus de la transcription', () => {
  it.each([
    [429, 'quota'],
    [503, 'unavailable'],
    [413, 'tooLarge'],
    [400, 'unreadable'],
    [401, 'sessionExpired'],
    [500, 'failed'],
  ] as const)('HTTP %i → %s', (status, code) => {
    expect(voiceErrorFromTranscription(new ApiError('refus du serveur', status))).toBe(code)
  })

  it('connexion coupée (la requête n’est peut-être jamais partie) → network', () => {
    expect(voiceErrorFromTranscription(new TypeError('Failed to fetch'))).toBe('network')
  })

  it('réponse hors contrat → failed, jamais un texte inventé', () => {
    expect(voiceErrorFromTranscription(new Error('réponse illisible'))).toBe('failed')
  })
})

describe('#1939.2 — les refus du micro', () => {
  it.each([
    ['NotAllowedError', 'permissionDenied'],
    ['SecurityError', 'permissionDenied'],
    ['NotFoundError', 'noMicrophone'],
    ['OverconstrainedError', 'noMicrophone'],
    ['NotReadableError', 'microphoneBusy'],
    ['AbortError', 'failed'],
  ] as const)('%s → %s', (name, code) => {
    expect(voiceErrorFromMedia(new DOMException('refus', name))).toBe(code)
  })

  it('une erreur qui n’est pas un refus du navigateur → failed', () => {
    expect(voiceErrorFromMedia('étrange')).toBe('failed')
  })
})
