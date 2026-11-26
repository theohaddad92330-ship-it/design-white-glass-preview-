import { ApiError, sessionIsDead } from '@/lib/api-error'
import { isNetworkFailure } from '@/lib/api-origin'

/**
 * #1939.2 / #1939.13 — POURQUOI UN MESSAGE VOCAL N'A PAS ABOUTI, NOMMÉ.
 *
 * Le serveur écrit ses refus en français — l'API n'a pas de langue. L'écran ne
 * les répète donc PAS (un anglophone lirait du français) : il les classe ici, et
 * `VoiceInput` dit la phrase dans la langue de l'interface. Même partage que
 * `chat-error.ts` pour le plafond : le chiffre au serveur, la phrase à l'écran.
 */
export type VoiceModeError =
  | 'permissionDenied'
  | 'noMicrophone'
  | 'microphoneBusy'
  | 'unsupported'
  | 'tooLarge'
  | 'quota'
  | 'unavailable'
  | 'unreadable'
  | 'network'
  | 'sessionExpired'
  | 'failed'

/**
 * Un échec de `POST /ia/chat/voice/transcribe`.
 *
 *  · 429 — plafond du copilote ou débit de la transcription : le texte déjà tapé
 *    reste dans la saisie (on n'y touche pas) ;
 *  · 503 — capacité absente sur ce serveur, ou transcription en panne ;
 *  · 413 — enregistrement trop lourd ;
 *  · 400 — durée, format, silence, démo : « je n'ai pas pu transcrire ».
 */
export function voiceErrorFromTranscription(error: unknown): VoiceModeError {
  // Une panne de transport n'est pas une `ApiError` : testée en premier, sinon
  // elle retomberait sur le repli générique.
  if (isNetworkFailure(error)) return 'network'
  if (!(error instanceof ApiError)) return 'failed'
  if (sessionIsDead(error.status)) return 'sessionExpired'
  switch (error.status) {
    case 429:
      return 'quota'
    case 503:
      return 'unavailable'
    case 413:
      return 'tooLarge'
    case 400:
      return 'unreadable'
    default:
      return 'failed'
  }
}

/** Un refus de `getUserMedia` — les noms standard des `DOMException` du navigateur. */
export function voiceErrorFromMedia(error: unknown): VoiceModeError {
  const name = error instanceof DOMException || error instanceof Error ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'permissionDenied'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'noMicrophone'
    case 'NotReadableError':
      return 'microphoneBusy'
    default:
      return 'failed'
  }
}
