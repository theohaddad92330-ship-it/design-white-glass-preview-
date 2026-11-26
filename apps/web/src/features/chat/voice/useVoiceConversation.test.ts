/**
 * #2434.8/.9/.10/.12/.24/.30 — LE MODE CONVERSATION : la boucle dictée → envoi
 * → lecture de la réponse → réécoute, l'arrêt explicite, et l'interruption
 * (barge-in) qui ne referme pas la session.
 *
 * `useVoiceMode` (l'enregistreur RÉEL, micro compris) est doublé : ce test
 * prouve l'ENCHAÎNEMENT — quand appeler `onSend`, quand lire la réponse, quand
 * réécouter — jamais le micro lui-même (déjà prouvé par `useVoiceMode.test.tsx`).
 * ⚠️ jsdom n'a pas `speechSynthesis` : doublure explicite, comme `ListenReply.test.tsx`.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatVoiceTranscription } from '@bellum/contracts'
import type { VoiceModeError } from './voice-errors'
import { useVoiceConversation } from './useVoiceConversation'

type TranscribedHandler = (result: ChatVoiceTranscription) => void
type ErrorHandler = (error: VoiceModeError) => void

const voice = vi.hoisted(() => ({
  phase: 'idle' as string,
  elapsedMs: 0,
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  onTranscribed: null as TranscribedHandler | null,
  onError: null as ErrorHandler | null,
}))

vi.mock('./useVoiceMode', () => ({
  useVoiceMode: (opts: { onTranscribed: TranscribedHandler; onError: ErrorHandler }) => {
    voice.onTranscribed = opts.onTranscribed
    voice.onError = opts.onError
    return {
      phase: voice.phase,
      elapsedMs: voice.elapsedMs,
      start: voice.start,
      stop: voice.stop,
      cancel: voice.cancel,
    }
  },
}))

class FakeUtterance {
  lang = ''
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(readonly text: string) {}
}

const synth = { speak: vi.fn(), cancel: vi.fn() }
const TRANSCRIBED = (text: string): ChatVoiceTranscription => ({
  text,
  voiceObjectId: '11111111-1111-4111-8111-111111111111',
  uncertainSegments: [],
})

beforeEach(() => {
  voice.phase = 'idle'
  voice.elapsedMs = 0
  voice.start.mockReset()
  voice.stop.mockReset()
  voice.cancel.mockReset()
  synth.speak.mockReset()
  synth.cancel.mockReset()
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window, 'speechSynthesis')
})

function mount(initial: { sending: boolean; lastAssistantText: string | null; lastTurnFailed: boolean }) {
  const onSend = vi.fn()
  const onError = vi.fn()
  const onUncertain = vi.fn()
  const hook = renderHook(
    (props: { sending: boolean; lastAssistantText: string | null; lastTurnFailed: boolean; resetKey?: string }) =>
      useVoiceConversation({
        language: 'fr',
        resetKey: props.resetKey ?? 'fil-1',
        accountId: null,
        sending: props.sending,
        lastAssistantText: props.lastAssistantText,
        lastTurnFailed: props.lastTurnFailed,
        onSend,
        onUncertain,
        onError,
      }),
    { initialProps: { ...initial, resetKey: 'fil-1' } },
  )
  return { hook, onSend, onError, onUncertain }
}

const spoken = () => synth.speak.mock.calls[0]?.[0] as FakeUtterance | undefined

describe('#2434.8/.9/.10 — démarrer, dicter, ENVOYER (jamais poser dans une saisie)', () => {
  it('« Démarrer » ouvre l’écoute — état visible, session active', () => {
    const { hook } = mount({ sending: false, lastAssistantText: null, lastTurnFailed: false })
    expect(hook.result.current.active).toBe(false)
    act(() => hook.result.current.start())
    expect(voice.start).toHaveBeenCalledTimes(1)
    expect(hook.result.current.active).toBe(true)
    expect(hook.result.current.phase).toBe('listening')
  })

  it('une transcription ENVOIE directement — jamais un texte pausé dans une saisie', () => {
    const { hook, onSend } = mount({ sending: false, lastAssistantText: null, lastTurnFailed: false })
    act(() => hook.result.current.start())
    act(() => voice.onTranscribed?.(TRANSCRIBED('Quels signaux sur Airbus ?')))
    expect(onSend).toHaveBeenCalledWith('Quels signaux sur Airbus ?')
    expect(hook.result.current.phase).toBe('sending')
  })
})

describe('#4536.2 — garde #2434.1 / #3457 : rien ne part seul si un mot est incertain', () => {
  const WITH_UNCERTAIN: ChatVoiceTranscription = {
    ...TRANSCRIBED('Quels signaux sur Airbus ?'),
    words: [
      { text: 'Quels', uncertain: false },
      { text: 'Airbus', uncertain: true },
    ],
  } as ChatVoiceTranscription

  it('un mot incertain N’ENVOIE PAS : le texte est rendu à la saisie, la session se referme', () => {
    const { hook, onSend, onUncertain } = mount({ sending: false, lastAssistantText: null, lastTurnFailed: false })
    act(() => hook.result.current.start())
    act(() => voice.onTranscribed?.(WITH_UNCERTAIN))
    expect(onSend).not.toHaveBeenCalled()
    expect(onUncertain).toHaveBeenCalledTimes(1)
    expect(onUncertain).toHaveBeenCalledWith(WITH_UNCERTAIN)
    expect(hook.result.current.active).toBe(false)
    expect(hook.result.current.phase).toBe('idle')
  })

  it('#3457 — sans mot incertain, UN seul envoi par transcription, et jamais de dépôt dans la saisie', () => {
    const { hook, onSend, onUncertain } = mount({ sending: false, lastAssistantText: null, lastTurnFailed: false })
    act(() => hook.result.current.start())
    act(() => voice.onTranscribed?.(TRANSCRIBED('Bonjour')))
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledWith('Bonjour')
    expect(onUncertain).not.toHaveBeenCalled()
  })
})

describe('#2434.12/.24 — la réponse se lit, puis on réécoute', () => {
  it('l’envoi qui finit avec une réponse NEUVE la lit à voix haute', () => {
    const { hook } = mount({ sending: false, lastAssistantText: null, lastTurnFailed: false })
    act(() => hook.result.current.start())
    act(() => voice.onTranscribed?.(TRANSCRIBED('Question')))
    hook.rerender({ sending: true, lastAssistantText: null, lastTurnFailed: false, resetKey: 'fil-1' })
    hook.rerender({
      sending: false,
      lastAssistantText: 'Trois signaux cette semaine.',
      lastTurnFailed: false,
      resetKey: 'fil-1',
    })
    expect(spoken()?.text).toBe('Trois signaux cette semaine.')
    expect(hook.result.current.phase).toBe('speaking')
  })

  it('la lecture TERMINÉE relance l’écoute — la boucle continue', () => {
    const { hook } = mount({ sending: false, lastAssistantText: null, lastTurnFailed: false })
    act(() => hook.result.current.start())
    act(() => voice.onTranscribed?.(TRANSCRIBED('Question')))
    hook.rerender({ sending: true, lastAssistantText: null, lastTurnFailed: false, resetKey: 'fil-1' })
    hook.rerender({ sending: false, lastAssistantText: 'Réponse.', lastTurnFailed: false, resetKey: 'fil-1' })
    voice.start.mockClear()
    act(() => spoken()?.onend?.())
    expect(voice.start).toHaveBeenCalledTimes(1)
    expect(hook.result.current.phase).toBe('listening')
  })

  it('une réponse déjà présente au DÉMARRAGE de la session n’est pas relue', () => {
    const { hook } = mount({ sending: false, lastAssistantText: 'Déjà là avant la session.', lastTurnFailed: false })
    act(() => hook.result.current.start())
    act(() => voice.onTranscribed?.(TRANSCRIBED('Question')))
    hook.rerender({
      sending: true,
      lastAssistantText: 'Déjà là avant la session.',
      lastTurnFailed: false,
      resetKey: 'fil-1',
    })
    hook.rerender({
      sending: false,
      lastAssistantText: 'Déjà là avant la session.',
      lastTurnFailed: false,
      resetKey: 'fil-1',
    })
    // Rien de NEUF à lire (même texte qu'avant la session) : on réécoute
    // directement, sans passer par `speaking`.
    expect(synth.speak).not.toHaveBeenCalled()
    expect(hook.result.current.phase).toBe('listening')
  })
})

describe('#2434.30 — l’état « erreur » : nommé, puis réécoute', () => {
  it('un tour ÉCHOUÉ se nomme, puis réécoute après un court délai — jamais un silence', () => {
    vi.useFakeTimers()
    const { hook } = mount({ sending: false, lastAssistantText: null, lastTurnFailed: false })
    act(() => hook.result.current.start())
    act(() => voice.onTranscribed?.(TRANSCRIBED('Question')))
    act(() => hook.rerender({ sending: true, lastAssistantText: null, lastTurnFailed: false, resetKey: 'fil-1' }))
    act(() => hook.rerender({ sending: false, lastAssistantText: null, lastTurnFailed: true, resetKey: 'fil-1' }))
    expect(hook.result.current.phase).toBe('error')
    expect(synth.speak).not.toHaveBeenCalled()
    voice.start.mockClear()
    act(() => vi.advanceTimersByTime(2000))
    expect(voice.start).toHaveBeenCalledTimes(1)
    expect(hook.result.current.phase).toBe('listening')
  })
})

describe('#2434.30 — arrêt explicite, et interruption (barge-in)', () => {
  it('« Arrêter » referme tout : micro, lecture, session', () => {
    const { hook } = mount({ sending: false, lastAssistantText: null, lastTurnFailed: false })
    act(() => hook.result.current.start())
    act(() => hook.result.current.stop())
    expect(voice.cancel).toHaveBeenCalledTimes(1)
    expect(synth.cancel).toHaveBeenCalledTimes(1)
    expect(hook.result.current.active).toBe(false)
    expect(hook.result.current.phase).toBe('idle')
  })

  it('#3455 — « Arrêter » après une vraie phrase la TRANSCRIT et l’envoie, puis ferme la session', () => {
    const { hook, onSend } = mount({ sending: false, lastAssistantText: null, lastTurnFailed: false })
    act(() => hook.result.current.start())
    voice.phase = 'recording'
    voice.elapsedMs = 4000
    hook.rerender({ sending: false, lastAssistantText: null, lastTurnFailed: false, resetKey: 'fil-1' })

    act(() => hook.result.current.stop())
    // L'enregistrement est TERMINÉ (donc transcrit), pas annulé.
    expect(voice.stop).toHaveBeenCalledTimes(1)
    expect(voice.cancel).not.toHaveBeenCalled()
    expect(hook.result.current.phase).toBe('transcribing')

    act(() => voice.onTranscribed?.(TRANSCRIBED('Quels signaux sur Airbus ?')))
    expect(onSend).toHaveBeenCalledWith('Quels signaux sur Airbus ?')
    expect(hook.result.current.active).toBe(false)
    expect(hook.result.current.phase).toBe('idle')
    // Session fermée : la réponse ne se lit pas et le micro ne se rouvre pas.
    expect(voice.start).toHaveBeenCalledTimes(1)
  })

  it('#3455 — un « Arrêter » sous la seconde d’écoute n’a rien capté : on coupe, rien ne part', () => {
    const { hook, onSend } = mount({ sending: false, lastAssistantText: null, lastTurnFailed: false })
    act(() => hook.result.current.start())
    voice.phase = 'recording'
    voice.elapsedMs = 300
    hook.rerender({ sending: false, lastAssistantText: null, lastTurnFailed: false, resetKey: 'fil-1' })
    act(() => hook.result.current.stop())
    expect(voice.cancel).toHaveBeenCalledTimes(1)
    expect(voice.stop).not.toHaveBeenCalled()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('« Interrompre » coupe SEULEMENT la lecture — la session continue', () => {
    const { hook } = mount({ sending: false, lastAssistantText: null, lastTurnFailed: false })
    act(() => hook.result.current.start())
    act(() => voice.onTranscribed?.(TRANSCRIBED('Question')))
    hook.rerender({ sending: true, lastAssistantText: null, lastTurnFailed: false, resetKey: 'fil-1' })
    hook.rerender({
      sending: false,
      lastAssistantText: 'Une longue réponse.',
      lastTurnFailed: false,
      resetKey: 'fil-1',
    })
    expect(hook.result.current.phase).toBe('speaking')

    voice.start.mockClear()
    synth.cancel.mockClear()
    act(() => hook.result.current.interrupt())
    expect(synth.cancel).toHaveBeenCalledTimes(1)
    expect(voice.start).toHaveBeenCalledTimes(1)
    expect(hook.result.current.active).toBe(true)
    expect(hook.result.current.phase).toBe('listening')
  })

  it('« Interrompre » hors lecture ne fait rien', () => {
    const { hook } = mount({ sending: false, lastAssistantText: null, lastTurnFailed: false })
    act(() => hook.result.current.start())
    voice.start.mockClear()
    act(() => hook.result.current.interrupt())
    expect(voice.start).not.toHaveBeenCalled()
    expect(synth.cancel).not.toHaveBeenCalled()
  })
})

describe('#1939.2 / #1939.8 — un échec du micro, ou un changement de fil, referme la session', () => {
  it('un échec du micro (permission refusée…) referme la session plutôt que de rester bloquée', () => {
    const { hook, onError } = mount({ sending: false, lastAssistantText: null, lastTurnFailed: false })
    act(() => hook.result.current.start())
    act(() => voice.onError?.('permissionDenied'))
    expect(onError).toHaveBeenCalledWith('permissionDenied')
    expect(hook.result.current.active).toBe(false)
    expect(hook.result.current.phase).toBe('idle')
  })

  it('changer de fil referme la session en vol (même règle que la dictée, #1939.8)', () => {
    const { hook } = mount({ sending: false, lastAssistantText: null, lastTurnFailed: false })
    act(() => hook.result.current.start())
    act(() => hook.rerender({ sending: false, lastAssistantText: null, lastTurnFailed: false, resetKey: 'fil-2' }))
    expect(voice.cancel).toHaveBeenCalled()
  })
})
