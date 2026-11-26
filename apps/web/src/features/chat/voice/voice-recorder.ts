/**
 * #1939.2 / #1939.7 — LES PIÈCES PURES DE L'ENREGISTREUR DU MESSAGE VOCAL.
 *
 * Elles ne touchent ni au micro ni au réseau : elles décident à partir de ce que
 * le navigateur DÉCLARE (formats pris en charge, présence des interfaces). Le
 * geste lui-même vit dans `useVoiceMode`.
 *
 * ⚠️ Ce que jsdom ne peut pas prouver : le format réellement produit par Safari
 * iOS, et que le micro s'éteint pour de vrai. Le serveur ne se fie pas au type
 * déclaré de toute façon — il lit les premiers octets (`sniffChatVoiceContainer`).
 */

/**
 * Les formats demandés, dans l'ordre. webm/opus d'abord (Chrome, Firefox,
 * Edge), mp4 ensuite (Safari), ogg en dernier recours. Les trois conteneurs sont
 * ceux que le serveur sait ranger — un format hors de cette liste serait refusé
 * APRÈS avoir fait parler quelqu'un.
 */
const RECORDER_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'] as const

/**
 * Le format à demander à `MediaRecorder`. `''` = aucun format connu déclaré :
 * on laisse le navigateur choisir plutôt que de refuser d'enregistrer.
 */
export function pickRecorderMimeType(isTypeSupported: (type: string) => boolean): string {
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(candidate)) return candidate
    } catch {
      return ''
    }
  }
  return ''
}

/**
 * Le navigateur sait-il enregistrer ? Les DEUX interfaces sont nécessaires : un
 * micro qu'on ne peut pas enregistrer ne se propose pas (un bouton qui échoue au
 * clic est pire qu'un bouton absent — même règle que la capacité serveur).
 */
export function voiceCaptureSupported(): boolean {
  if (typeof navigator === 'undefined') return false
  const mediaDevices = (navigator as Navigator & { mediaDevices?: Partial<MediaDevices> }).mediaDevices
  return typeof mediaDevices?.getUserMedia === 'function' && typeof globalThis.MediaRecorder === 'function'
}

/** #1939.7 — `m:ss`. Une valeur illisible rend `0:00`, jamais `NaN:NaN`. */
export function formatVoiceClock(ms: number): string {
  const totalSeconds = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * L'enregistrement en base64 BRUT — le chemin de tous les dépôts du produit, et
 * ce que `POST /ia/chat/voice/transcribe` attend (`audioB64`). `FileReader`
 * plutôt que `Blob.arrayBuffer()` : c'est l'interface présente partout, Safari
 * ancien compris.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Lecture de l’enregistrement impossible.'))
    reader.readAsDataURL(blob)
  })
}
