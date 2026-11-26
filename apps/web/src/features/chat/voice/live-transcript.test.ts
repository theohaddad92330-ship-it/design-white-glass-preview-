import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { liveTranscriptSupported, useLiveTranscript } from './live-transcript'

/**
 * #2434.4 / #2434.24 — l'APERÇU EN DIRECT pendant la dictée.
 *
 * ⚠️ jsdom n'a pas `SpeechRecognition` : la doublure ci-dessous prouve ce que
 * le hook DEMANDE au navigateur (démarrer/arrêter avec `active`, accumuler les
 * résultats), pas la qualité réelle de la reconnaissance — variable d'un
 * navigateur à l'autre, et hors de portée de ce dépôt (même discipline que
 * #2434.74/.75/.77, contrat de transcription tiers non vérifiable).
 */
class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = []
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  started = 0
  stopped = 0

  constructor() {
    FakeSpeechRecognition.instances.push(this)
  }

  start() {
    this.started += 1
  }

  stop() {
    this.stopped += 1
  }

  emit(...texts: string[]) {
    this.onresult?.({ results: texts.map(transcript => [{ transcript }]) })
  }
}

function withSpeechRecognition() {
  vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition)
}

beforeEach(() => {
  FakeSpeechRecognition.instances = []
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('liveTranscriptSupported', () => {
  it('absent du navigateur : nommé plutôt que deviné', () => {
    expect(liveTranscriptSupported()).toBe(false)
  })

  it('présent (Chromium/Safari, `webkitSpeechRecognition`) : détecté', () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeSpeechRecognition)
    expect(liveTranscriptSupported()).toBe(true)
  })
})

describe('useLiveTranscript', () => {
  it('navigateur sans reconnaissance : `supported` à `false`, aucun texte, jamais une valeur inventée', () => {
    const { result } = renderHook(() => useLiveTranscript(true, 'fr'))
    expect(result.current.supported).toBe(false)
    expect(result.current.partialText).toBe('')
  })

  it('inactif : aucune reconnaissance démarrée', () => {
    withSpeechRecognition()
    renderHook(() => useLiveTranscript(false, 'fr'))
    expect(FakeSpeechRecognition.instances).toHaveLength(0)
  })

  it('actif : démarre en `fr-FR`, continu, résultats intermédiaires', () => {
    withSpeechRecognition()
    renderHook(() => useLiveTranscript(true, 'fr'))
    const recognition = FakeSpeechRecognition.instances[0]
    expect(recognition?.started).toBe(1)
    expect(recognition?.lang).toBe('fr-FR')
    expect(recognition?.continuous).toBe(true)
    expect(recognition?.interimResults).toBe(true)
  })

  it('anglais : démarre en `en-US`', () => {
    withSpeechRecognition()
    renderHook(() => useLiveTranscript(true, 'en'))
    expect(FakeSpeechRecognition.instances[0]?.lang).toBe('en-US')
  })

  it('un résultat accumule le texte marqué PARTIEL, jamais posé ailleurs que dans ce hook', () => {
    withSpeechRecognition()
    const { result } = renderHook(() => useLiveTranscript(true, 'fr'))
    const recognition = FakeSpeechRecognition.instances[0]
    act(() => recognition?.emit('quels signaux', 'récents sur Airbus'))
    expect(result.current.partialText).toBe('quels signaux récents sur Airbus')
  })

  it('un navigateur qui referme seul la reconnaissance la redémarre tant que `active` tient', () => {
    withSpeechRecognition()
    renderHook(() => useLiveTranscript(true, 'fr'))
    const recognition = FakeSpeechRecognition.instances[0]
    act(() => recognition?.onend?.())
    expect(recognition?.started).toBe(2)
  })

  it('« Terminer »/« Annuler » (`active` retombe à `false`) : la reconnaissance s’arrête et le texte se vide', () => {
    withSpeechRecognition()
    const { result, rerender } = renderHook(({ active }) => useLiveTranscript(active, 'fr'), {
      initialProps: { active: true },
    })
    const recognition = FakeSpeechRecognition.instances[0]
    act(() => recognition?.emit('bonjour'))
    expect(result.current.partialText).toBe('bonjour')

    rerender({ active: false })
    expect(recognition?.stopped).toBe(1)
    expect(result.current.partialText).toBe('')
  })

  it('démontage pendant l’écoute : la reconnaissance s’arrête (rien ne continue en arrière-plan)', () => {
    withSpeechRecognition()
    const { unmount } = renderHook(() => useLiveTranscript(true, 'fr'))
    const recognition = FakeSpeechRecognition.instances[0]
    unmount()
    expect(recognition?.stopped).toBe(1)
  })

  it('une nouvelle session (retour à `false` puis `true`) repart d’un texte vide', () => {
    withSpeechRecognition()
    const { result, rerender } = renderHook(({ active }) => useLiveTranscript(active, 'fr'), {
      initialProps: { active: true },
    })
    act(() => FakeSpeechRecognition.instances[0]?.emit('premier essai'))
    expect(result.current.partialText).toBe('premier essai')
    rerender({ active: false })
    rerender({ active: true })
    expect(result.current.partialText).toBe('')
  })
})
