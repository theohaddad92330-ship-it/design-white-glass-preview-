import { describe, expect, it } from 'vitest'

import { callAnalysisRefusal, telephonyCredentialsSchema, telephonyStatusSchema } from './telephony.js'

/**
 * #4016 L12 (Louis 11/10) — l'analyse des appels enregistrés est permise AVEC
 * consentement ANNONCÉ. Le renversement : on analyse des appels, mais jamais
 * sans que l'ESN ait déclaré que l'enregistrement est annoncé aux deux parties
 * (art. 226-1 du Code pénal — non négociable). Défaut : non annoncé = aucune analyse.
 */
describe('callAnalysisRefusal — l’analyse exige la transcription ET le consentement annoncé', () => {
  it('rend null seulement quand les deux sont posés', () => {
    expect(callAnalysisRefusal({ transcriptsEnabled: true, recordingConsentAnnounced: true })).toBeNull()
  })

  it('refuse sans lecture des transcriptions', () => {
    expect(callAnalysisRefusal({ transcriptsEnabled: false, recordingConsentAnnounced: true })).toBe(
      'transcripts_disabled',
    )
  })

  it('refuse sans consentement annoncé — même avec les transcriptions lues', () => {
    expect(callAnalysisRefusal({ transcriptsEnabled: true, recordingConsentAnnounced: false })).toBe(
      'consent_not_announced',
    )
  })

  it('le motif « consentement » l’emporte quand les deux manquent : c’est la question légale', () => {
    expect(callAnalysisRefusal({ transcriptsEnabled: false, recordingConsentAnnounced: false })).toBe(
      'consent_not_announced',
    )
  })
})

describe('le consentement annoncé a un défaut : NON', () => {
  it('une connexion créée sans que la question soit posée n’annonce rien', () => {
    const parsed = telephonyCredentialsSchema.parse({ provider: 'ringover', apiKey: 'k' })
    expect(parsed.recordingConsentAnnounced).toBe(false)
  })

  it('le statut le rend', () => {
    const status = telephonyStatusSchema.parse({
      connected: true,
      provider: 'ringover',
      connectedAt: null,
      transcriptsEnabled: true,
      recordingConsentAnnounced: false,
    })
    expect(status.recordingConsentAnnounced).toBe(false)
  })
})
