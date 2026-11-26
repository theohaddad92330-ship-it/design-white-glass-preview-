import { useEffect, useRef, useState } from 'react'

type SpeechRecognitionResultLike = { transcript: string }
type SpeechRecognitionEventLike = { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> }
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

function speechRecognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/** Le navigateur sait-il offrir un APERÇU en direct ? Absent : nommé, jamais deviné. */
export function liveTranscriptSupported(): boolean {
  return speechRecognitionCtor() !== undefined
}

const RECOGNITION_LANG: Record<'fr' | 'en', string> = { fr: 'fr-FR', en: 'en-US' }

/**
 * #2434.4 / #2434.24 — l'APERÇU EN DIRECT pendant la dictée, et l'état
 * « transcript partiel » qu'il rend possible — jamais LA transcription qui compte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE HOOK N'EST PAS `useVoiceMode`
 * ─────────────────────────────────────────────────────────────────────────────
 * Le pipeline qui produit le texte réellement posé dans la saisie reste BATCH
 * (Whisper, un seul résultat à `stop()` — `useVoiceMode`/`voice-api.ts`) : le
 * contrat tiers de transcription (`chatVoiceTranscribeSchema`) ne se devine
 * pas, il ne porte ni accent ni bruit ni mélange de langues, tout est délégué
 * au fournisseur externe (#2434.74/.75/.77, prouvé dans
 * `recette-lau-final-147.test.ts`). Ce hook n'y touche pas : il ouvre EN
 * PARALLÈLE la reconnaissance du NAVIGATEUR (Web Speech API) pour un texte
 * affiché PARTIEL — jamais posé dans la saisie, jamais relu par Laura, jamais
 * ce qui part au clic « Terminer ». « Non mesuré » plutôt que deviné : navigateur
 * sans cette API (Firefox desktop, notamment) → `supported` reste `false`, et
 * l'écran nomme l'absence (`VoiceInput.tsx`) au lieu d'un silence.
 */
export function useLiveTranscript(active: boolean, lang: 'fr' | 'en'): { supported: boolean; partialText: string } {
  const [partialText, setPartialText] = useState('')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const supported = liveTranscriptSupported()

  useEffect(() => {
    if (!active) {
      setPartialText('')
      return undefined
    }
    const Ctor = speechRecognitionCtor()
    if (!Ctor) return undefined

    const recognition = new Ctor()
    recognition.lang = RECOGNITION_LANG[lang]
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = event => {
      const chunks: string[] = []
      for (let i = 0; i < event.results.length; i += 1) chunks.push(event.results[i]?.[0]?.transcript ?? '')
      setPartialText(chunks.join(' ').trim())
    }
    // Un navigateur qui referme la reconnaissance seul (silence prolongé, limite
    // interne) la redémarre tant que la dictée est active : l'aperçu ne doit pas
    // disparaître avant « Terminer »/« Annuler ».
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognition.start()
    }
    // Une erreur ne remonte jamais ici : ce n'est qu'un aperçu, l'enregistrement
    // RÉEL (`useVoiceMode`) continue et gouverne seul la transcription envoyée.
    recognition.onerror = () => {}
    recognitionRef.current = recognition
    recognition.start()

    return () => {
      recognitionRef.current = null
      recognition.onend = null
      recognition.onerror = null
      recognition.stop()
      setPartialText('')
    }
  }, [active, lang])

  return { supported, partialText }
}
