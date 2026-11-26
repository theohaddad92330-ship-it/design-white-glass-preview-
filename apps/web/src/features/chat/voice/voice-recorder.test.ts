/**
 * #1939.2 / #1939.7 — les pièces pures de l'enregistreur : le format choisi,
 * la capacité du navigateur, le chronomètre, l'encodage avant envoi.
 *
 * ⚠️ jsdom n'a ni `MediaRecorder` ni `getUserMedia` : ce qui est prouvé ici est
 * la DÉCISION prise à partir de ce que le navigateur déclare, jamais un vrai
 * enregistrement. Safari iOS (mp4) ne se vérifie que sur un téléphone réel.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHAT_VOICE_MESSAGE_MAX_SECONDS } from '@bellum/contracts'
import { blobToBase64, formatVoiceClock, pickRecorderMimeType, voiceCaptureSupported } from './voice-recorder'

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

describe('#1939.2 — le format d’enregistrement suit ce que le navigateur sait faire', () => {
  it('Chrome / Firefox : webm/opus en premier', () => {
    expect(pickRecorderMimeType(type => type.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus')
  })

  it('Safari : mp4 quand webm n’est pas pris en charge', () => {
    expect(pickRecorderMimeType(type => type === 'audio/mp4')).toBe('audio/mp4')
  })

  it('aucun format connu : chaîne vide — le navigateur choisit, le serveur lit les octets', () => {
    expect(pickRecorderMimeType(() => false)).toBe('')
  })

  it('un `isTypeSupported` qui jette ne fait pas tomber l’enregistrement', () => {
    expect(
      pickRecorderMimeType(() => {
        throw new Error('non implémenté')
      }),
    ).toBe('')
  })
})

describe('la capacité du navigateur — un bouton qui échoue au clic est pire qu’un bouton absent', () => {
  it('sans MediaRecorder ni getUserMedia (jsdom) : non pris en charge', () => {
    expect(voiceCaptureSupported()).toBe(false)
  })

  it('getUserMedia sans MediaRecorder : non pris en charge', () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true })
    expect(voiceCaptureSupported()).toBe(false)
  })

  it('les deux présents : pris en charge', () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true })
    vi.stubGlobal('MediaRecorder', class {})
    expect(voiceCaptureSupported()).toBe(true)
  })
})

describe('#1939.7 — le chronomètre', () => {
  it('minutes:secondes, secondes entières arrondies à l’inférieur', () => {
    expect(formatVoiceClock(0)).toBe('0:00')
    expect(formatVoiceClock(7_900)).toBe('0:07')
    expect(formatVoiceClock(65_000)).toBe('1:05')
  })

  it('la durée maximale se lit depuis le contrat, jamais en dur', () => {
    expect(formatVoiceClock(CHAT_VOICE_MESSAGE_MAX_SECONDS * 1000)).toBe('1:30')
  })

  it('une valeur illisible rend 0:00, jamais NaN', () => {
    expect(formatVoiceClock(Number.NaN)).toBe('0:00')
    expect(formatVoiceClock(-5)).toBe('0:00')
  })
})

describe('encodage base64 avant envoi', () => {
  it('rend le base64 BRUT, sans le préfixe `data:` — c’est ce que le serveur attend', async () => {
    const blob = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: 'audio/webm' })
    expect(await blobToBase64(blob)).toBe('GkXfow==')
  })
})
