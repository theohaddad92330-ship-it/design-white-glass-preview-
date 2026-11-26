import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatVoiceTranscription } from '@bellum/contracts'
import { useVoiceMode } from './useVoiceMode'
import type { VoiceModeError } from './voice-errors'
import { prepareSpokenText, speakableText, speechSynthesisAvailable } from './voice-read-policy'

/**
 * #2434.8/.9/.10/.12/.24/.30 — LE MODE CONVERSATION VOCALE (VERSION WEB).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA BOUCLE, ET CE QUI LA DISTINGUE DE LA DICTÉE (`useVoiceMode`)
 * ─────────────────────────────────────────────────────────────────────────────
 * La dictée pose un texte dans la saisie et s'arrête là — envoyer reste le
 * clic (#1939.10). Ici, une session EXPLICITEMENT démarrée enchaîne, jusqu'à
 * l'arrêt explicite : dictée → envoi → lecture de la réponse
 * (`speechSynthesis`, la même politique que `ListenReply` — jamais un second
 * exemplaire de ce qui ne se prononce pas, GA-26) → réécoute.
 *
 * Construit AU-DESSUS de `useVoiceMode` (une session dédiée, distincte de
 * celle du micro de dictée) plutôt qu'à côté : le cycle
 * requesting/recording/transcribing, la coupure du micro à chaque sortie
 * (#1939.8) et le plafond de durée restent SA seule responsabilité.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ÉTATS VISIBLES (#2434.30)
 * ─────────────────────────────────────────────────────────────────────────────
 * `idle` (repos, hors session) → `requesting` → `listening` → `transcribing`
 * → `sending` (le tour est diffusé, `sending` du fil vaut `true`) → `speaking`
 * (lecture de la réponse) → `listening`, en boucle — ou `error` (le tour a
 * échoué, rien de neuf à lire) avant de réécouter quand même.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ARRÊT EXPLICITE, ET INTERRUPTION (BARGE-IN)
 * ─────────────────────────────────────────────────────────────────────────────
 * `stop()` — le SEUL arrêt qui quitte la session : coupe le micro, annule la
 * lecture en cours, referme tout. `interrupt()` est plus étroit : il coupe
 * SEULEMENT la lecture en cours (la personne veut reparler par-dessus Laura)
 * et enchaîne directement sur la réécoute — la session continue.
 */

type VoiceConversationPhase = 'idle' | 'requesting' | 'listening' | 'transcribing' | 'sending' | 'speaking' | 'error'

/** Le temps où l'état « erreur » reste affiché avant la réécoute automatique. */
const ERROR_DWELL_MS = 1600

/**
 * #3455 — sous ce temps d'écoute, « Arrêter » n'a rien capté qui vaille d'être
 * transcrit (un clic de trop) : on coupe. Au-delà, ce qui a été DIT part.
 */
const MIN_SPEECH_TO_KEEP_MS = 1000

export function useVoiceConversation({
  language,
  resetKey,
  accountId,
  sending,
  lastAssistantText,
  lastTurnFailed,
  onSend,
  onUncertain,
  onError,
}: {
  language: 'fr' | 'en' | 'auto'
  /** Le fil actif : le changer referme la session (même règle que la dictée, #1939.8). */
  resetKey: string
  accountId: string | null
  /** #1953.1 — vrai pendant tout le tour (envoi jusqu'à la fin de la diffusion). */
  sending: boolean
  /** La dernière réponse RÉUSSIE du fil — `null` : rien à lire. */
  lastAssistantText: string | null
  /** Le dernier tour envoyé a échoué : rien de neuf à lire (voir `error` ci-dessus). */
  lastTurnFailed: boolean
  onSend: (text: string) => void
  /** #2434.1 — un mot incertain : rien ne part seul, le texte est rendu à la saisie pour relecture. */
  onUncertain: (result: ChatVoiceTranscription) => void
  onError: (error: VoiceModeError) => void
}) {
  const [active, setActive] = useState(false)
  const [phase, setPhase] = useState<VoiceConversationPhase>('idle')
  const activeRef = useRef(active)
  activeRef.current = active
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  /** Le dernier texte déjà LU — pour ne jamais relire deux fois la même réponse. */
  const readTextRef = useRef<string | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** #3455 — « Arrêter » pendant l'écoute : la dernière phrase se transcrit, PUIS la session se ferme. */
  const closingAfterTranscriptionRef = useRef(false)

  const handleTranscribed = useCallback(
    (result: ChatVoiceTranscription) => {
      if (!activeRef.current) return
      // #2434.1 (repris de la dictée, #4536.2) — LE NO-GO : un mot que le
      // fournisseur juge incertain n'est JAMAIS envoyé seul. La session se
      // referme et le texte retourne dans la saisie, éditable avant envoi.
      if ((result.words ?? []).some(word => word.uncertain)) {
        closingAfterTranscriptionRef.current = false
        activeRef.current = false
        setActive(false)
        setPhase('idle')
        onUncertain(result)
        return
      }
      if (closingAfterTranscriptionRef.current) {
        // La session est déjà fermée dans l'esprit de la personne : on envoie
        // ce qu'elle a dit, on ne lit pas la réponse et on ne réécoute pas.
        closingAfterTranscriptionRef.current = false
        activeRef.current = false
        setActive(false)
        setPhase('idle')
        onSend(result.text)
        return
      }
      setPhase('sending')
      onSend(result.text)
    },
    [onSend, onUncertain],
  )

  // #1939.2 — un échec du micro (permission refusée, matériel disparu, réseau)
  // referme la session PLUTÔT que de la laisser bloquée sur `requesting` :
  // `useVoiceMode` retombe seul à `idle` en interne, sans jamais le dire à ce
  // niveau — sans ce repli, `active` resterait vrai sans plus rien écouter.
  const handleVoiceError = useCallback(
    (error: VoiceModeError) => {
      onError(error)
      closingAfterTranscriptionRef.current = false
      activeRef.current = false
      setActive(false)
      setPhase('idle')
    },
    [onError],
  )

  const voice = useVoiceMode({
    language,
    resetKey,
    accountId,
    onTranscribed: handleTranscribed,
    onError: handleVoiceError,
  })

  // #2434.30 — la phase RECOMPOSÉE depuis celle, plus fine, de l'enregistreur
  // sous-jacent — mais seulement pendant qu'une session est active : `idle`
  // ailleurs, sans qu'un enregistrement resté en vol la déplace.
  useEffect(() => {
    if (!active) return
    if (voice.phase === 'requesting') setPhase('requesting')
    else if (voice.phase === 'recording') setPhase('listening')
    else if (voice.phase === 'transcribing') setPhase('transcribing')
  }, [active, voice.phase])

  const listenAgain = useCallback(() => {
    setPhase('listening')
    void voice.start()
  }, [voice])

  const speak = useCallback(
    (text: string) => {
      if (!speechSynthesisAvailable()) {
        listenAgain()
        return
      }
      const { spoken, blocked } = prepareSpokenText(text)
      if (blocked) {
        listenAgain()
        return
      }
      setPhase('speaking')
      const synth = window.speechSynthesis
      synth.cancel()
      const utterance = new SpeechSynthesisUtterance(speakableText(spoken))
      // #1939 — la langue de l'INTERFACE, jamais devinée (même règle que
      // `ListenReply`) : Laura répond déjà dans la langue des préférences,
      // `'auto'` (dictée seulement, #2434.74/.75/.77) n'a rien à dire ici.
      utterance.lang = language === 'en' ? 'en-GB' : 'fr-FR'
      const proceed = () => {
        if (utteranceRef.current !== utterance) return
        utteranceRef.current = null
        if (!activeRef.current) {
          setPhase('idle')
          return
        }
        listenAgain()
      }
      utterance.onend = proceed
      utterance.onerror = proceed
      utteranceRef.current = utterance
      synth.speak(utterance)
    },
    [language, listenAgain],
  )

  // #2434.8/.9/.10/.12/.24/.30 — LA CHAÎNE : l'envoi vient de finir
  // (`sending` true → false) pendant qu'on l'attendait (`phase === 'sending'`)
  // → on lit la réponse, ou on nomme l'échec puis on réécoute.
  //
  // ⚠️ #2319.58 — la RÉÉCOUTE ci-dessous ouvre le micro depuis CET effet, sans
  // clic. Ce n'est PAS le démarrage sans geste que la garde
  // `voice-never-records-a-meeting.test.ts` interdit : celui-ci protège contre
  // un SECOND enregistreur qui s'ouvrirait tout seul (un « mode réunion »
  // implicite, jamais consenti). Ici, un SEUL geste explicite — le clic sur
  // « Démarrer la conversation » (`start` ci-dessous) — ouvre la session ; la
  // réécoute qui suit chaque réponse EST le service demandé par ce geste, visible
  // à l'écran (`phase`) et fermé par un second geste tout aussi explicite
  // (`stop`). Un message vocal isolé, lui, n'a toujours qu'UN geste par tour —
  // rien ne change à `useVoiceMode`, seul fichier qui ouvre le micro.
  const wasSending = useRef(sending)
  useEffect(() => {
    if (wasSending.current && !sending && active && phase === 'sending') {
      if (lastTurnFailed) {
        setPhase('error')
        errorTimerRef.current = setTimeout(() => {
          if (activeRef.current) listenAgain()
        }, ERROR_DWELL_MS)
      } else if (lastAssistantText && lastAssistantText !== readTextRef.current) {
        readTextRef.current = lastAssistantText
        speak(lastAssistantText)
      } else {
        listenAgain()
      }
    }
    wasSending.current = sending
  }, [sending, active, phase, lastAssistantText, lastTurnFailed, speak, listenAgain])

  const start = useCallback(() => {
    if (activeRef.current) return
    setActive(true)
    // La réponse déjà présente sur le fil (session ouverte sur une conversation
    // déjà entamée) n'est PAS relue au démarrage — seulement les réponses aux
    // questions posées PENDANT cette session.
    readTextRef.current = lastAssistantText
    listenAgain()
  }, [lastAssistantText, listenAgain])

  /** Coupe tout, sans rien garder : le démontage et le changement de fil (#1939.8). */
  const close = useCallback(() => {
    closingAfterTranscriptionRef.current = false
    setActive(false)
    if (errorTimerRef.current !== null) {
      clearTimeout(errorTimerRef.current)
      errorTimerRef.current = null
    }
    voice.cancel()
    utteranceRef.current = null
    if (speechSynthesisAvailable()) window.speechSynthesis.cancel()
    setPhase('idle')
  }, [voice])

  /**
   * « Arrêter ». #3455 (« la wave enregistre rien ») : pendant l'écoute, l'arrêt
   * JETAIT ce qui venait d'être dit — l'enregistrement était annulé, rien ne se
   * transcrivait, rien ne partait, et l'écran ne montrait jamais qu'il avait
   * capté quoi que ce soit. Une phrase réellement dite se transcrit et part
   * maintenant ; la session se ferme ensuite (`handleTranscribed`).
   */
  const stop = useCallback(() => {
    if (voice.phase === 'recording' && voice.elapsedMs >= MIN_SPEECH_TO_KEEP_MS) {
      closingAfterTranscriptionRef.current = true
      setPhase('transcribing')
      if (speechSynthesisAvailable()) window.speechSynthesis.cancel()
      voice.stop()
      return
    }
    close()
  }, [voice, close])

  /** #2434 — interruption (barge-in) : coupe SEULEMENT la lecture, la session continue. */
  const interrupt = useCallback(() => {
    if (phase !== 'speaking') return
    utteranceRef.current = null
    if (speechSynthesisAvailable()) window.speechSynthesis.cancel()
    listenAgain()
  }, [phase, listenAgain])

  // #1939.8 — démontage ET changement de fil : la session se referme, comme la dictée.
  useEffect(() => () => close(), [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return { active, phase, elapsedMs: voice.elapsedMs, level: voice.level, peak: voice.peak, start, stop, interrupt }
}
