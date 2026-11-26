import { vi } from 'vitest'

/**
 * Doublures de `MediaRecorder` / `getUserMedia`, partagées par tout test qui
 * exerce `useVoiceMode` (`VoiceInput.test.tsx`, `ImportTargetListDialog.test.tsx`,
 * #2434.55) — jsdom n'implémente ni l'un ni l'autre. Extrait pour ne pas
 * recopier la même doublure à chaque nouvel écran qui dicte (GA-26).
 *
 * NE PROUVE PAS : la vraie invite de permission, le voyant système, iOS.
 */

class FakeTrack {
  stop = vi.fn()
}
class FakeStream {
  readonly tracks = [new FakeTrack()]
  getTracks() {
    return this.tracks
  }
}
class FakeMediaRecorder {
  static isTypeSupported = (type: string) => type.startsWith('audio/webm')
  state: 'inactive' | 'recording' = 'inactive'
  readonly mimeType: string
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(_stream: FakeStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? ''
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    if (this.state === 'inactive') return
    this.state = 'inactive'
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])]) })
      this.onstop?.()
    })
  }
}

let stream: FakeStream
let getUserMediaMock: ReturnType<typeof vi.fn>

export function installVoiceMediaFakes() {
  stream = new FakeStream()
  getUserMediaMock = vi.fn().mockResolvedValue(stream)
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: getUserMediaMock }, configurable: true })
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  return getUserMediaMock
}

/** Le flux accordé par le dernier `installVoiceMediaFakes()` — pour vérifier que ses pistes s'arrêtent. */
export function voiceMediaStream() {
  return stream
}

export function removeVoiceMediaFakes() {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'mediaDevices')
}
