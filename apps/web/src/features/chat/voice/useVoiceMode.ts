import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CHAT_VOICE_MESSAGE_MAX_BYTES,
  CHAT_VOICE_MESSAGE_MAX_SECONDS,
  type ChatVoiceTranscription,
} from '@bellum/contracts'
import { useDeclareLauraBusy } from '@/features/laura/useLauraBusy'
import { transcribeVoiceMessage } from './voice-api'
import { voiceErrorFromMedia, voiceErrorFromTranscription, type VoiceModeError } from './voice-errors'
import { blobToBase64, pickRecorderMimeType, voiceCaptureSupported } from './voice-recorder'

/**
 * #1939.2 / .5 / .6 / .7 / .8 — L'ENREGISTREUR DU MESSAGE VOCAL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CYCLE
 * ─────────────────────────────────────────────────────────────────────────────
 * repos → autorisation du micro → enregistrement → transcription → repos.
 * La transcription rend `{ text, voiceObjectId }` à l'appelant, qui le pose DANS
 * la saisie : rien n'est envoyé d'ici (#1939.10).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1939.8 — AUCUN ENREGISTREMENT EN ARRIÈRE-PLAN
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque piste du micro est arrêtée (`track.stop()`, ce qui éteint le voyant
 * système) à CHACUNE des sorties : « Terminer », « Annuler », la durée maximale,
 * la page qui passe en arrière-plan, le démontage, et le changement de fil
 * (`resetKey`). Un micro accordé APRÈS une annulation — l'invite de permission
 * était encore ouverte — est coupé dès qu'il arrive.
 *
 * La « génération » est ce qui tient tout ça : chaque démarrage et chaque
 * annulation la font avancer, et un résultat né d'une génération passée (un
 * micro accordé trop tard, une transcription qui revient après « Annuler » ou
 * après un changement de fil) n'a plus le droit de toucher à rien.
 *
 * ⚠️ Les rappels (`onTranscribed`, `onError`) et la langue sont lus dans une
 * référence au moment où ils servent, JAMAIS en dépendance d'un effet : une
 * fonction passée en prop est neuve à chaque rendu, et un effet qui en dépend
 * rejoue sans fin.
 */

import { openLevelMeter, type LevelMeter } from './voice-level'

type VoicePhase = 'idle' | 'requesting' | 'recording' | 'transcribing'

/** La durée maximale — celle que le serveur refuse au-delà (contrat partagé). */
const MAX_DURATION_MS = CHAT_VOICE_MESSAGE_MAX_SECONDS * 1000
/** Le pas du chronomètre : assez fin pour qu'une seconde ne saute pas. */
const CLOCK_TICK_MS = 250

type RecordingSession = {
  stream: MediaStream
  recorder: MediaRecorder
  chunks: Blob[]
  startedAt: number
  durationMs: number
  timer: ReturnType<typeof setInterval> | null
  generation: number
  /** #3455 — la jauge de niveau ; `null` sans Web Audio (jamais une jauge inventée). */
  meter: LevelMeter | null
  peak: number | null
}

function stopTracks(stream: MediaStream): void {
  stream.getTracks().forEach(track => track.stop())
}

function releaseMicrophone(session: RecordingSession): void {
  if (session.timer !== null) {
    clearInterval(session.timer)
    session.timer = null
  }
  session.meter?.close()
  session.meter = null
  stopTracks(session.stream)
}

/**
 * #2434.66-.70 — un retour DISCRET au doigt : bref au début de l'écoute, bref
 * à la fin — jamais un long buzz qu'on confondrait avec une notification.
 * Absent (bureau, navigateur qui ne l'implémente pas) : `navigator.vibrate`
 * est alors `undefined`, l'appel ne fait rien — pas une fonctionnalité mobile
 * simulée sur un ordinateur de bureau.
 */
function vibrate(durationMs: number): void {
  if (typeof navigator === 'undefined') return
  // #2434.68 — « vibration légère SELON PRÉFÉRENCES » : la préférence existe déjà,
  // c'est celle du système (mouvement réduit). Aucun réglage Bellum de plus
  // (GA-26, un réglage vit à un seul endroit) : demandée, aucune vibration.
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  navigator.vibrate?.(durationMs)
}

/**
 * #2434.66-.70 — LE CASQUE BLUETOOTH : la touche « pause » arrête l'écoute,
 * exactement comme le bouton « Terminer » à l'écran — utile en particulier à
 * la reprise après un appel téléphonique, où les mains ne sont pas toujours
 * sur l'écran. Posée UNIQUEMENT depuis `start()`/`stop()`/`cancel()` (des
 * gestionnaires, jamais un effet, voir la garde #2319.58 dans
 * `voice-never-records-a-meeting.test.ts` : aucun enregistrement ne démarre
 * depuis un effet React) — ici on ne fait qu'ENREGISTRER un rappel pour un
 * bouton matériel, jamais démarrer quoi que ce soit tant qu'il n'est pas pressé.
 */
function setHeadsetPauseHandler(onPause: (() => void) | null): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.setActionHandler('pause', onPause)
  } catch {
    // Action non reconnue par ce navigateur : silencieux, comme l'absence de vibration.
  }
}

export function useVoiceMode({
  language,
  resetKey,
  accountId,
  onTranscribed,
  onError,
}: {
  /** #2434.74/.75/.77 — la langue de l'interface, ou `'auto'` quand la
   *  personne parle une autre langue (accent, mélange français/anglais) :
   *  Whisper détecte seul plutôt que de forcer une langue erronée. */
  language: 'fr' | 'en' | 'auto'
  /** Le fil actif : quand il change, tout enregistrement en cours est abandonné. */
  resetKey: string
  /** #2434.33 — le dossier ouvert, pour orienter la reconnaissance des noms
   *  propres. Lu en RÉFÉRENCE comme `language` : changer de dossier pendant un
   *  enregistrement en cours ne l'interrompt pas (seul `resetKey` le fait). */
  accountId: string | null
  onTranscribed: (result: ChatVoiceTranscription) => void
  onError: (error: VoiceModeError) => void
}) {
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  // #3455 — niveau d'entrée courant et plus haut pic de l'écoute ; `null` = non mesuré.
  const [level, setLevel] = useState<number | null>(null)
  const [peak, setPeak] = useState<number | null>(null)
  const sessionRef = useRef<RecordingSession | null>(null)
  const generationRef = useRef(0)
  const latest = useRef({ language, accountId, onTranscribed, onError })

  useEffect(() => {
    latest.current = { language, accountId, onTranscribed, onError }
  })

  const finish = useCallback(async (session: RecordingSession) => {
    const isCurrent = () => session.generation === generationRef.current
    try {
      const blob = new Blob(session.chunks, { type: session.recorder.mimeType || 'audio/webm' })
      if (blob.size === 0) {
        latest.current.onError('unreadable')
        return
      }
      // Refusé AVANT l'envoi : le serveur refuserait de toute façon, après avoir
      // fait monter deux mégaoctets sur un réseau mobile.
      if (blob.size > CHAT_VOICE_MESSAGE_MAX_BYTES) {
        latest.current.onError('tooLarge')
        return
      }
      const audioB64 = await blobToBase64(blob)
      if (!isCurrent()) return
      const result = await transcribeVoiceMessage({
        audioB64,
        durationMs: session.durationMs,
        language: latest.current.language,
        accountId: latest.current.accountId,
      })
      if (!isCurrent()) return
      latest.current.onTranscribed(result)
    } catch (error) {
      if (isCurrent()) latest.current.onError(voiceErrorFromTranscription(error))
    } finally {
      if (isCurrent()) {
        setPhase('idle')
        setElapsedMs(0)
      }
    }
  }, [])

  /** « Terminer » — et l'arrêt automatique à la durée maximale. */
  const stop = useCallback(() => {
    const session = sessionRef.current
    if (!session || session.recorder.state === 'inactive') return
    sessionRef.current = null
    session.durationMs = Math.min(Math.max(Date.now() - session.startedAt, 1), MAX_DURATION_MS)
    // La phase change AVANT `recorder.stop()` : un navigateur qui rendrait `stop`
    // tout de suite ne doit pas voir sa fin écrasée par cette ligne.
    setPhase('transcribing')
    session.recorder.onstop = () => void finish(session)
    session.recorder.stop()
    // #1939.8 — le micro s'éteint à l'instant du geste, sans attendre les derniers octets.
    releaseMicrophone(session)
    // #2434.66-.70 — la fin de l'écoute se sent, et le casque ne propose plus
    // d'arrêter ce qui est déjà arrêté.
    vibrate(15)
    setHeadsetPauseHandler(null)
  }, [finish])

  /** #1939.6 — « Annuler », disponible à chaque étape : rien ne part, rien n'arrive. */
  const cancel = useCallback(() => {
    generationRef.current += 1
    const session = sessionRef.current
    sessionRef.current = null
    if (session) {
      session.recorder.ondataavailable = null
      session.recorder.onstop = null
      if (session.recorder.state !== 'inactive') session.recorder.stop()
      releaseMicrophone(session)
      // #2434.66-.70 — seulement s'il y avait quelque chose à couper : annuler
      // avant tout enregistrement ne vibre pas pour rien.
      vibrate(15)
      setHeadsetPauseHandler(null)
    }
    setPhase('idle')
    setElapsedMs(0)
  }, [])

  const start = useCallback(async () => {
    if (sessionRef.current) return
    if (!voiceCaptureSupported()) {
      latest.current.onError('unsupported')
      return
    }
    generationRef.current += 1
    const generation = generationRef.current
    setPhase('requesting')

    let stream: MediaStream
    try {
      // #1939.2 — c'est cet appel qui fait apparaître l'invite du navigateur.
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
      if (generation !== generationRef.current) return
      latest.current.onError(voiceErrorFromMedia(error))
      setPhase('idle')
      return
    }
    // Annulé, démonté ou fil changé pendant l'invite : le micro accordé est coupé tout de suite.
    if (generation !== generationRef.current) {
      stopTracks(stream)
      return
    }

    let recorder: MediaRecorder
    try {
      const mimeType = pickRecorderMimeType(type => MediaRecorder.isTypeSupported(type))
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    } catch {
      stopTracks(stream)
      latest.current.onError('unsupported')
      setPhase('idle')
      return
    }

    const session: RecordingSession = {
      stream,
      recorder,
      chunks: [],
      startedAt: Date.now(),
      durationMs: 0,
      timer: null,
      generation,
      meter: openLevelMeter(stream),
      peak: null,
    }
    recorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) session.chunks.push(event.data)
    }
    sessionRef.current = session
    recorder.start()
    // #1939.7 — le chronomètre, et l'arrêt automatique à la durée maximale.
    session.timer = setInterval(() => {
      const elapsed = Date.now() - session.startedAt
      if (elapsed >= MAX_DURATION_MS) {
        stop()
        return
      }
      setElapsedMs(elapsed)
      const reading = session.meter?.read() ?? null
      if (reading !== null) {
        session.peak = Math.max(session.peak ?? 0, reading)
        setLevel(reading)
        setPeak(session.peak)
      }
    }, CLOCK_TICK_MS)
    setElapsedMs(0)
    setLevel(null)
    setPeak(null)
    setPhase('recording')
    // #2434.66-.70 — le début de l'écoute se sent au doigt, et le casque
    // Bluetooth peut désormais l'arrêter (touche « pause » = « Terminer »).
    vibrate(30)
    setHeadsetPauseHandler(() => stop())
  }, [stop])

  // #1939.8 — démontage ET changement de fil : la même sortie, « Annuler ».
  useEffect(() => () => cancel(), [resetKey, cancel])

  // #1939.8 — la page passe en arrière-plan (onglet quitté, téléphone verrouillé) :
  // l'enregistrement s'arrête et ce qui a été dit se transcrit, rien ne continue d'écouter.
  useEffect(() => {
    if (phase !== 'recording') return undefined
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') stop()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [phase, stop])

  // #2403.16 — AUCUNE INTERRUPTION PENDANT LE MODE VOCAL ACTIF. `voice.phase`
  // restait local à `VoiceInput` : Laura pouvait s'afficher au-dessus d'un
  // enregistrement ou d'une transcription en cours. `requesting` compte aussi
  // — l'invite de permission du micro occupe l'écran au même titre.
  useDeclareLauraBusy(phase === 'requesting' || phase === 'recording' || phase === 'transcribing', 'voice-mode')

  return { phase, elapsedMs, level, peak, start, stop, cancel }
}
