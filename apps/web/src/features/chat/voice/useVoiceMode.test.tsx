/**
 * #1939.2 / .5 / .6 / .7 / .8 — l'enregistreur du message vocal.
 *
 * ⚠️ jsdom n'a ni `MediaRecorder` ni `getUserMedia` : les doublures ci-dessous
 * sont EXPLICITES. Elles prouvent ce que le hook DEMANDE au navigateur (couper
 * chaque piste, ne rien envoyer après une annulation, s'arrêter à la durée
 * maximale). Elles ne prouvent PAS qu'un vrai micro s'éteint : le voyant système,
 * l'invite de permission et Safari iOS ne se vérifient que sur un téléphone réel.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_VOICE_MESSAGE_MAX_BYTES, CHAT_VOICE_MESSAGE_MAX_SECONDS } from '@bellum/contracts'
import { ApiError } from '@/lib/api-error'
import { useDeclaredBusyStore } from '@/stores/lauraDeclaredBusyStore'
import { useVoiceMode } from './useVoiceMode'

const transcribeMock = vi.hoisted(() => vi.fn())
vi.mock('./voice-api', () => ({ transcribeVoiceMessage: (...args: unknown[]) => transcribeMock(...args) }))

const VOICE_ID = '11111111-1111-4111-8111-111111111111'
const WEBM_HEADER = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])

class FakeTrack {
  stop = vi.fn()
}

class FakeStream {
  readonly tracks = [new FakeTrack(), new FakeTrack()]
  getTracks() {
    return this.tracks
  }
}

const recorderData = { next: new Blob([WEBM_HEADER], { type: 'audio/webm' }) }

class FakeMediaRecorder {
  static isTypeSupported = vi.fn((type: string) => type.startsWith('audio/webm'))
  static instances: FakeMediaRecorder[] = []
  state: 'inactive' | 'recording' = 'inactive'
  readonly mimeType: string
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null

  constructor(
    readonly stream: FakeStream,
    options?: { mimeType?: string },
  ) {
    this.mimeType = options?.mimeType ?? ''
    FakeMediaRecorder.instances.push(this)
  }

  start() {
    this.state = 'recording'
  }

  stop() {
    if (this.state === 'inactive') return
    this.state = 'inactive'
    // Comme un navigateur : les derniers octets puis `stop`, APRÈS le retour de l'appel.
    queueMicrotask(() => {
      this.ondataavailable?.({ data: recorderData.next })
      this.onstop?.()
    })
  }
}

let stream: FakeStream
let getUserMedia: ReturnType<typeof vi.fn>

const allTracksStopped = (target: FakeStream) => target.tracks.every(track => track.stop.mock.calls.length > 0)

let vibrateMock: ReturnType<typeof vi.fn>
let setActionHandlerMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  stream = new FakeStream()
  getUserMedia = vi.fn().mockResolvedValue(stream)
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  FakeMediaRecorder.instances = []
  FakeMediaRecorder.isTypeSupported.mockImplementation((type: string) => type.startsWith('audio/webm'))
  recorderData.next = new Blob([WEBM_HEADER], { type: 'audio/webm' })
  transcribeMock.mockReset().mockResolvedValue({ text: 'Quels signaux sur Airbus ?', voiceObjectId: VOICE_ID })
  useDeclaredBusyStore.setState({ activeIds: new Set() })
  // #2434.66-.70 — jsdom n'a ni l'un ni l'autre : doublures explicites, comme
  // le micro ci-dessus.
  vibrateMock = vi.fn()
  Object.defineProperty(navigator, 'vibrate', { value: vibrateMock, configurable: true })
  setActionHandlerMock = vi.fn()
  Object.defineProperty(navigator, 'mediaSession', {
    value: { setActionHandler: setActionHandlerMock },
    configurable: true,
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'mediaDevices')
  Reflect.deleteProperty(document, 'visibilityState')
  Reflect.deleteProperty(navigator, 'vibrate')
  Reflect.deleteProperty(navigator, 'mediaSession')
})

function mount(initialKey = 'fil-1', initialAccountId: string | null = null) {
  const onTranscribed = vi.fn()
  const onError = vi.fn()
  const hook = renderHook(
    ({ resetKey, accountId }: { resetKey: string; accountId: string | null }) =>
      useVoiceMode({ language: 'fr', resetKey, accountId, onTranscribed, onError }),
    { initialProps: { resetKey: initialKey, accountId: initialAccountId } },
  )
  return { hook, onTranscribed, onError }
}

type Mounted = ReturnType<typeof mount>['hook']

async function startRecording(hook: Mounted) {
  await act(async () => {
    await hook.result.current.start()
  })
}

describe('#1939.2 — démarrer', () => {
  it('demande le micro, puis enregistre en webm/opus quand le navigateur le sait', async () => {
    const { hook } = mount()
    await startRecording(hook)
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(FakeMediaRecorder.instances[0]?.mimeType).toBe('audio/webm;codecs=opus')
    expect(FakeMediaRecorder.instances[0]?.state).toBe('recording')
    expect(hook.result.current.phase).toBe('recording')
  })

  it('Safari : mp4 quand webm n’est pas pris en charge', async () => {
    FakeMediaRecorder.isTypeSupported.mockImplementation((type: string) => type === 'audio/mp4')
    const { hook } = mount()
    await startRecording(hook)
    expect(FakeMediaRecorder.instances[0]?.mimeType).toBe('audio/mp4')
  })

  it('permission refusée : raison nommée, aucun enregistreur, retour au repos', async () => {
    getUserMedia.mockRejectedValue(new DOMException('refusé', 'NotAllowedError'))
    const { hook, onError } = mount()
    await startRecording(hook)
    expect(onError).toHaveBeenCalledWith('permissionDenied')
    expect(FakeMediaRecorder.instances).toHaveLength(0)
    expect(hook.result.current.phase).toBe('idle')
  })
})

describe('#1939.4 — terminer, puis transcrire', () => {
  it('« Terminer » coupe le micro TOUT DE SUITE, puis transcrit en base64 avec la durée et la langue', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    const { hook, onTranscribed } = mount()
    await startRecording(hook)
    now.mockReturnValue(1_004_200)
    act(() => hook.result.current.stop())
    now.mockRestore()

    // Avant même que l'enregistreur ne rende ses derniers octets.
    expect(allTracksStopped(stream)).toBe(true)
    expect(hook.result.current.phase).toBe('transcribing')

    await waitFor(() =>
      expect(onTranscribed).toHaveBeenCalledWith({ text: 'Quels signaux sur Airbus ?', voiceObjectId: VOICE_ID }),
    )
    expect(transcribeMock).toHaveBeenCalledWith({
      audioB64: 'GkXfow==',
      durationMs: 4200,
      language: 'fr',
      accountId: null,
    })
    expect(hook.result.current.phase).toBe('idle')
  })

  it('#2434.33 — transmet le dossier ouvert, pour orienter la reconnaissance des noms propres', async () => {
    const { hook } = mount('fil-1', 'compte-nova-logistique')
    await startRecording(hook)
    act(() => hook.result.current.stop())
    await waitFor(() => expect(transcribeMock).toHaveBeenCalled())
    expect(transcribeMock).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'compte-nova-logistique' }))
  })

  it('#2434.33 — changer de dossier PENDANT l’enregistrement n’interrompt rien (seul `resetKey` le fait)', async () => {
    const { hook } = mount('fil-1', 'compte-a')
    await startRecording(hook)
    act(() => {
      hook.rerender({ resetKey: 'fil-1', accountId: 'compte-b' })
    })
    expect(hook.result.current.phase).toBe('recording')
    act(() => hook.result.current.stop())
    await waitFor(() => expect(transcribeMock).toHaveBeenCalled())
    // Le dossier LU AU MOMENT DE LA FIN est le plus récent — la référence, pas
    // une valeur figée au démarrage.
    expect(transcribeMock).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'compte-b' }))
  })

  it('#1939.13 — un refus du serveur (429) remonte nommé, et aucun texte n’arrive', async () => {
    transcribeMock.mockRejectedValue(new ApiError('Plafond du copilote atteint', 429))
    const { hook, onTranscribed, onError } = mount()
    await startRecording(hook)
    act(() => hook.result.current.stop())
    await waitFor(() => expect(onError).toHaveBeenCalledWith('quota'))
    expect(onTranscribed).not.toHaveBeenCalled()
    expect(hook.result.current.phase).toBe('idle')
  })

  it('au-delà de la taille maximale : refus nommé, et RIEN n’est envoyé', async () => {
    recorderData.next = new Blob([new Uint8Array(CHAT_VOICE_MESSAGE_MAX_BYTES + 1)], { type: 'audio/webm' })
    const { hook, onError } = mount()
    await startRecording(hook)
    act(() => hook.result.current.stop())
    await waitFor(() => expect(onError).toHaveBeenCalledWith('tooLarge'))
    expect(transcribeMock).not.toHaveBeenCalled()
    expect(hook.result.current.phase).toBe('idle')
  })
})

describe('#1939.6 — annuler, toujours', () => {
  it('pendant l’enregistrement : le micro se coupe et RIEN ne part', async () => {
    const { hook, onTranscribed } = mount()
    await startRecording(hook)
    await act(async () => {
      hook.result.current.cancel()
    })
    expect(allTracksStopped(stream)).toBe(true)
    expect(transcribeMock).not.toHaveBeenCalled()
    expect(onTranscribed).not.toHaveBeenCalled()
    expect(hook.result.current.phase).toBe('idle')
  })

  it('pendant la transcription : le texte n’arrive jamais dans la saisie', async () => {
    let release: (value: unknown) => void = () => {}
    transcribeMock.mockReturnValue(
      new Promise(resolve => {
        release = resolve
      }),
    )
    const { hook, onTranscribed } = mount()
    await startRecording(hook)
    act(() => hook.result.current.stop())
    await waitFor(() => expect(transcribeMock).toHaveBeenCalled())
    act(() => hook.result.current.cancel())
    await act(async () => {
      release({ text: 'trop tard', voiceObjectId: VOICE_ID })
    })
    expect(onTranscribed).not.toHaveBeenCalled()
    expect(hook.result.current.phase).toBe('idle')
  })
})

describe('#1939.8 — aucun enregistrement en arrière-plan', () => {
  it('démontage pendant l’enregistrement : toutes les pistes s’arrêtent, rien ne part', async () => {
    const { hook } = mount()
    await startRecording(hook)
    await act(async () => {
      hook.unmount()
    })
    expect(allTracksStopped(stream)).toBe(true)
    expect(transcribeMock).not.toHaveBeenCalled()
  })

  it('changement de fil pendant l’enregistrement : toutes les pistes s’arrêtent, rien ne part', async () => {
    const { hook } = mount('fil-1')
    await startRecording(hook)
    await act(async () => {
      hook.rerender({ resetKey: 'fil-2', accountId: null })
    })
    expect(allTracksStopped(stream)).toBe(true)
    expect(transcribeMock).not.toHaveBeenCalled()
    expect(hook.result.current.phase).toBe('idle')
  })

  it('fil changé PENDANT l’invite de permission : le micro accordé ensuite est coupé aussitôt', async () => {
    let grant: (value: FakeStream) => void = () => {}
    getUserMedia.mockReturnValue(
      new Promise<FakeStream>(resolve => {
        grant = resolve
      }),
    )
    const { hook } = mount('fil-1')
    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = hook.result.current.start()
    })
    await act(async () => {
      hook.rerender({ resetKey: 'fil-2', accountId: null })
    })
    await act(async () => {
      grant(stream)
      await pending
    })
    expect(allTracksStopped(stream)).toBe(true)
    expect(FakeMediaRecorder.instances).toHaveLength(0)
    expect(hook.result.current.phase).toBe('idle')
  })

  it('la page passe en arrière-plan : l’enregistrement s’arrête (et se transcrit)', async () => {
    const { hook } = mount()
    await startRecording(hook)
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(allTracksStopped(stream)).toBe(true)
    await waitFor(() => expect(transcribeMock).toHaveBeenCalled())
  })
})

describe('#1939.7 — chronomètre et durée maximale', () => {
  it('le chronomètre avance pendant l’enregistrement', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const { hook } = mount()
    await startRecording(hook)
    act(() => {
      vi.advanceTimersByTime(7_000)
    })
    expect(hook.result.current.elapsedMs).toBeGreaterThanOrEqual(6_750)
    expect(hook.result.current.elapsedMs).toBeLessThanOrEqual(7_000)
  })

  it('arrêt AUTOMATIQUE à la durée maximale du contrat, puis transcription', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const { hook } = mount()
    await startRecording(hook)
    act(() => {
      vi.advanceTimersByTime(CHAT_VOICE_MESSAGE_MAX_SECONDS * 1000)
    })
    expect(allTracksStopped(stream)).toBe(true)
    vi.useRealTimers()
    await waitFor(() =>
      expect(transcribeMock).toHaveBeenCalledWith(
        expect.objectContaining({ durationMs: CHAT_VOICE_MESSAGE_MAX_SECONDS * 1000 }),
      ),
    )
  })
})

describe('#2403.16 — le vocal actif rend Laura occupée', () => {
  it('repos : aucune déclaration', () => {
    mount()
    expect(useDeclaredBusyStore.getState().activeIds.has('voice-mode')).toBe(false)
  })

  it('enregistrement : « voice-mode » est déclaré occupé', async () => {
    const { hook } = mount()
    await startRecording(hook)
    expect(useDeclaredBusyStore.getState().activeIds.has('voice-mode')).toBe(true)
  })

  it('transcription : toujours occupé, jusqu’au retour au repos', async () => {
    const { hook } = mount()
    await startRecording(hook)
    act(() => hook.result.current.stop())
    expect(hook.result.current.phase).toBe('transcribing')
    expect(useDeclaredBusyStore.getState().activeIds.has('voice-mode')).toBe(true)

    await waitFor(() => expect(hook.result.current.phase).toBe('idle'))
    expect(useDeclaredBusyStore.getState().activeIds.has('voice-mode')).toBe(false)
  })

  it('démontage pendant l’enregistrement : la déclaration se retire (fil changé, onglet fermé)', async () => {
    const { hook } = mount()
    await startRecording(hook)
    expect(useDeclaredBusyStore.getState().activeIds.has('voice-mode')).toBe(true)

    act(() => {
      hook.unmount()
    })
    expect(useDeclaredBusyStore.getState().activeIds.has('voice-mode')).toBe(false)
  })
})

describe('#2434.66-.70 — retour au doigt, et casque Bluetooth', () => {
  it('vibre au DÉBUT de l’écoute, et le casque peut désormais l’arrêter', async () => {
    const { hook } = mount()
    await startRecording(hook)
    expect(vibrateMock).toHaveBeenCalledWith(30)
    expect(setActionHandlerMock).toHaveBeenCalledWith('pause', expect.any(Function))
  })

  it('la touche « pause » du casque arrête l’écoute — comme « Terminer » à l’écran', async () => {
    const { hook } = mount()
    await startRecording(hook)
    const [, onPause] = setActionHandlerMock.mock.calls.find(([action]) => action === 'pause') ?? []
    act(() => onPause?.())
    expect(hook.result.current.phase).toBe('transcribing')
  })

  it('vibre à la FIN de l’écoute (« Terminer »), et retire le rappel du casque', async () => {
    const { hook } = mount()
    await startRecording(hook)
    vibrateMock.mockClear()
    act(() => hook.result.current.stop())
    expect(vibrateMock).toHaveBeenCalledWith(15)
    expect(setActionHandlerMock).toHaveBeenCalledWith('pause', null)
  })

  it('« Annuler » vibre aussi, et retire le rappel du casque', async () => {
    const { hook } = mount()
    await startRecording(hook)
    vibrateMock.mockClear()
    setActionHandlerMock.mockClear()
    act(() => hook.result.current.cancel())
    expect(vibrateMock).toHaveBeenCalledWith(15)
    expect(setActionHandlerMock).toHaveBeenCalledWith('pause', null)
  })

  it('annuler AVANT tout enregistrement ne vibre pas — rien à couper', () => {
    const { hook } = mount()
    act(() => hook.result.current.cancel())
    expect(vibrateMock).not.toHaveBeenCalled()
  })

  it('#2434.68 — « selon préférences » : mouvement réduit demandé au système, AUCUNE vibration', async () => {
    const original = window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query.includes('prefers-reduced-motion: reduce'), media: query }),
    })
    try {
      const { hook } = mount()
      await startRecording(hook)
      act(() => hook.result.current.stop())
      expect(vibrateMock).not.toHaveBeenCalled()
      // Le casque, lui, reste branché : la préférence ne coupe que le retour au doigt.
      expect(setActionHandlerMock).toHaveBeenCalledWith('pause', expect.any(Function))
    } finally {
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: original })
    }
  })

  it('navigateur sans vibration ni MediaSession : silencieux, jamais une erreur', async () => {
    Reflect.deleteProperty(navigator, 'vibrate')
    Reflect.deleteProperty(navigator, 'mediaSession')
    const { hook } = mount()
    await expect(startRecording(hook)).resolves.not.toThrow()
    expect(hook.result.current.phase).toBe('recording')
  })
})
