import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { motion, useReducedMotion, type TargetAndTransition, type Transition } from 'framer-motion'
import { AlertCircle, Mic, MicOff, Square, WifiOff, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  CHAT_VOICE_MESSAGE_MAX_SECONDS,
  CHAT_VOICE_MESSAGE_RETENTION_DAYS,
  type ChatVoiceTranscription,
} from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  MOTION,
  reduced,
  SelectField,
} from '@bellum/ui'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { AiDisclosure } from '@/features/laura/AiDisclosure'
import { isSupportedLanguage } from '@/i18n/config'
import { useSession } from '@/lib/hooks/use-session'
import { TOAST_PROBLEM_MS } from '@/lib/toast-duration'
import { useLiveTranscript } from './live-transcript'
import { useVoiceAvailability } from './useVoiceAvailability'
import { fetchVoiceRefinements } from './voice-api'
import { useVoiceMode } from './useVoiceMode'
import { VoiceLevelMeter } from './VoiceLevelMeter'
import type { VoiceModeError } from './voice-errors'
import { formatVoiceClock } from './voice-recorder'

/**
 * #1939.1 / #1912.9 — LE MICRO DE LA ZONE DE SAISIE DE `/chat`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUAND IL EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Seulement quand les TROIS le permettent : le navigateur sait enregistrer, le
 * serveur déclare la capacité (`GET /ia/chat/voice/status` → `available: true` :
 * clé de transcription posée, stockage monté), et l'espace n'est pas une salle de
 * démonstration (aucun service payant n'y est appelé, #1939.13). Un bouton qui
 * échoue au clic est pire qu'un bouton absent. Le navigateur est vérifié AVANT le
 * serveur : sans enregistreur, aucun appel ne part.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL FAIT — ET CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il rend `{ text, voiceObjectId }` à l'écran, qui pose le texte DANS la saisie
 * (#1939.4). Il n'envoie rien : l'envoi reste le clic ordinaire (#1939.10), par
 * le tour ordinaire (#1939.14).
 *
 * Clic pour démarrer, « Terminer » pour arrêter — pas « maintenir appuyé » : un
 * geste maintenu ne se fait ni au clavier ni avec un lecteur d'écran, et un doigt
 * qui glisse sur un téléphone l'interrompt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1939.3 — AVANT LA PREMIÈRE ACTIVATION
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce qu'on fait de la voix se dit AVANT que le navigateur ne demande le micro :
 * transcrite, conservée N jours (la constante du stockage, lue ici comme par le
 * serveur — GA-26), puis supprimée, et réécoutable par les membres de l'espace
 * qui lisent le fil (décision du 12/09 : « même portée que le texte »). L'accord
 * est retenu par personne, sur ce navigateur ; sans stockage local, l'avertissement
 * revient à chaque fois — c'est le sens prudent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #4536.1 — revient sur #2434.1 : plus d'interrupteur « conversation continue »
 * ici. La dictée ne fait QUE poser le texte dans la saisie (rien ne part seul,
 * #1939.10) ; la boucle dictée → envoi → lecture → réécoute vit dans
 * `VoiceConversation` (〰️), qui garde le no-go « mot incertain » (#2434.1) et
 * l'envoi unique (#3457) dans `useVoiceConversation`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const NOTICE_ACK_KEY_PREFIX = 'bellum:chat-voice-notice:'
/** #2434.74/.75/.77 — un réglage par personne, retenu sur ce navigateur —
 *  même famille de stockage que l'accord de la notice ci-dessus (GA-26 : un
 *  seul endroit, jamais dupliqué ailleurs dans l'écran). */
const LANGUAGE_PREF_KEY_PREFIX = 'bellum:chat-voice-language:'

type VoiceLanguage = 'fr' | 'en' | 'auto'

function isVoiceLanguage(value: string | null): value is VoiceLanguage {
  return value === 'fr' || value === 'en' || value === 'auto'
}

function readLanguagePref(userId: string | null): VoiceLanguage | null {
  if (!userId) return null
  try {
    const stored = localStorage.getItem(`${LANGUAGE_PREF_KEY_PREFIX}${userId}`)
    return isVoiceLanguage(stored) ? stored : null
  } catch {
    return null
  }
}

function writeLanguagePref(userId: string | null, language: VoiceLanguage): void {
  if (!userId) return
  try {
    localStorage.setItem(`${LANGUAGE_PREF_KEY_PREFIX}${userId}`, language)
  } catch {
    // Stockage indisponible : le réglage reviendra à la langue de l'interface au prochain chargement.
  }
}

/** Les trois options du sélecteur de langue, dans la langue de l'interface. */
function voiceLanguageOptions(t: TFunction<'chat'>): { value: VoiceLanguage; label: string }[] {
  return [
    { value: 'fr', label: t('voice.language.fr') },
    { value: 'en', label: t('voice.language.en') },
    { value: 'auto', label: t('voice.language.auto') },
  ]
}

function noticeAcknowledged(userId: string | null): boolean {
  if (!userId) return false
  try {
    return localStorage.getItem(`${NOTICE_ACK_KEY_PREFIX}${userId}`) === '1'
  } catch {
    return false
  }
}

function acknowledgeNotice(userId: string | null): void {
  if (!userId) return
  try {
    localStorage.setItem(`${NOTICE_ACK_KEY_PREFIX}${userId}`, '1')
  } catch {
    // Stockage indisponible : l'avertissement reviendra à la prochaine activation.
  }
}

const DENIED_HINT_DISMISSED_KEY = 'bellum.voice.denied-hint-dismissed'

function readDeniedHintDismissed(): boolean {
  try {
    return sessionStorage.getItem(DENIED_HINT_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeDeniedHintDismissed(): void {
  try {
    sessionStorage.setItem(DENIED_HINT_DISMISSED_KEY, '1')
  } catch {
    // Stockage indisponible : le message reviendra au prochain montage.
  }
}

type MicPermissionStatus = 'unknown' | 'granted' | 'denied' | 'prompt'

/**
 * #2434.20 / #2434.21 — L'ÉTAT DE LA PERMISSION MICRO, DISTINCT ET PERSISTANT.
 *
 * Avant ce hook, un refus du navigateur ne laissait aucune trace : `useVoiceMode`
 * remettait la phase à `idle` (#1939.2), et le bouton micro ORDINAIRE réapparaissait
 * — indiscernable de l'état « jamais demandé » (#2434.20, déjà vrai : `idle` avant
 * tout appel à `getUserMedia`). Un clic relançait alors une invite déjà refusée
 * (ou aucune invite, le navigateur retenant le refus en silence), sans jamais dire
 * pourquoi.
 *
 * `navigator.permissions.query({ name: 'microphone' })` donne l'état RÉEL, y
 * compris AVANT tout clic. Absent (Safari ne l'implémente pas pour `microphone`,
 * ou lève une erreur) : on reste `'unknown'`, repli explicite sur le comportement
 * d'avant ce hook — jamais un état inventé.
 */
function useMicPermissionStatus(): MicPermissionStatus {
  const [status, setStatus] = useState<MicPermissionStatus>('unknown')

  useEffect(() => {
    let cancelled = false
    let subscription: PermissionStatus | null = null
    const permissions = (
      navigator as unknown as {
        permissions?: { query: (descriptor: { name: string }) => Promise<PermissionStatus> }
      }
    ).permissions
    if (!permissions?.query) return undefined
    permissions
      .query({ name: 'microphone' })
      .then(result => {
        if (cancelled) return
        subscription = result
        setStatus(result.state as MicPermissionStatus)
        result.onchange = () => setStatus(result.state as MicPermissionStatus)
      })
      .catch(() => {
        // Certains navigateurs refusent la requête pour 'microphone' : on reste 'unknown'.
      })
    return () => {
      cancelled = true
      if (subscription) subscription.onchange = null
    }
  }, [])

  return status
}

/** #1939.2 / #1939.13 — une raison nommée devient une phrase, dans la langue
 *  de l'interface. Partagé avec `VoiceConversation` (GA-26). */
export function voiceErrorText(t: TFunction<'chat'>, error: VoiceModeError): string {
  switch (error) {
    case 'permissionDenied':
      return t('voice.errors.permissionDenied')
    case 'noMicrophone':
      return t('voice.errors.noMicrophone')
    case 'microphoneBusy':
      return t('voice.errors.microphoneBusy')
    case 'unsupported':
      return t('voice.errors.unsupported')
    case 'tooLarge':
      return t('voice.errors.tooLarge', { seconds: CHAT_VOICE_MESSAGE_MAX_SECONDS })
    case 'quota':
      return t('voice.errors.quota')
    case 'unavailable':
      return t('voice.errors.unavailable')
    case 'unreadable':
      return t('voice.errors.unreadable')
    case 'network':
      return t('voice.errors.network')
    case 'sessionExpired':
      return t('voice.errors.sessionExpired')
    default:
      return t('voice.errors.failed')
  }
}

export function VoiceInput({
  conversationKey,
  accountId = null,
  disabled,
  onTranscribed,
}: {
  /** Le fil actif : le changer abandonne l'enregistrement en cours (#1939.8). */
  conversationKey: string
  /** #2434.33 — le dossier ouvert, pour orienter la reconnaissance des noms
   *  propres à la transcription. `null` = aucun dossier ouvert (fil général). */
  accountId?: string | null
  /** Un envoi est en vol : on ne dicte pas la question suivante par-dessus. */
  disabled: boolean
  onTranscribed: (result: ChatVoiceTranscription) => void
}) {
  const { t, i18n } = useTranslation('chat')
  const isDemo = useIsDemo()
  const { user } = useSession()
  const available = useVoiceAvailability(isDemo)
  const micPermission = useMicPermissionStatus()
  const prefersReducedMotion = useReducedMotion()
  // #3541 — le refus du navigateur se MASQUE (le temps de la session) : jamais
  // un bandeau permanent sans issue.
  const [deniedHintDismissed, setDeniedHintDismissed] = useState(readDeniedHintDismissed)
  // X37 / #3443 — la mention du refus ne vit qu'APRÈS un geste micro et
  // s'efface au prochain envoi : jamais un bandeau permanent sous le composeur.
  const [micTapped, setMicTapped] = useState(false)
  useEffect(() => {
    if (disabled) setMicTapped(false)
  }, [disabled])
  const [noticeOpen, setNoticeOpen] = useState(false)
  // #3579.3b — l'état live des raffinements, lu à l'ouverture de la notice seulement.
  const [refinements, setRefinements] = useState<Awaited<ReturnType<typeof fetchVoiceRefinements>>>(null)
  useEffect(() => {
    if (!noticeOpen) return undefined
    let live = true
    void fetchVoiceRefinements().then(status => {
      if (live) setRefinements(status)
    })
    return () => {
      live = false
    }
  }, [noticeOpen])
  // #2434.28 / #2434.29 — le toast (`sonner`) disparaît seul au bout de quelques
  // secondes : la raison de l'échec doit rester lisible jusqu'à la prochaine
  // tentative. Le refus de permission garde son propre état, déjà persistant
  // (#2434.21, `permissionDenied` ci-dessous) : on ne le double pas ici.
  const [persistentError, setPersistentError] = useState<VoiceModeError | null>(null)

  const onError = useCallback(
    (error: VoiceModeError) => {
      toast.error(voiceErrorText(t, error), { duration: TOAST_PROBLEM_MS })
      if (error !== 'permissionDenied') setPersistentError(error)
    },
    [t],
  )

  const userId = user?.id ?? null
  const interfaceLanguage = isSupportedLanguage(i18n.language) ? i18n.language : 'fr'
  // #2434.74/.75/.77 — un réglage par personne : la langue de l'interface par
  // défaut, `'auto'` (Whisper détecte seul) quand la personne parle une autre
  // langue — accent, mélange français/anglais.
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>(() => readLanguagePref(userId) ?? interfaceLanguage)
  const changeVoiceLanguage = (next: VoiceLanguage) => {
    setVoiceLanguage(next)
    writeLanguagePref(userId, next)
  }

  // #2434.40 / #2434.85 — les mots INCERTAIN de la DERNIÈRE transcription, à
  // souligner — jamais un pourcentage (`words`, `chat-voice.ts`). Effacés à
  // chaque nouvelle tentative et à chaque changement de fil : une correction
  // faite ne doit pas rester soulignée sous le message suivant.
  const [uncertainWords, setUncertainWords] = useState<string[]>([])
  useEffect(() => {
    setUncertainWords([])
  }, [conversationKey])

  // La langue DÉTECTÉE n'est plus annoncée (retour Louis 30/09 : un toast
  // « Langue détectée : french » à chaque message vocal est du bruit — le
  // sélecteur de langue à côté du micro dit déjà ce qui est demandé). #2434.40 / #2434.85 — les mots que le fournisseur juge
  // incertains (`words`, calcul pur côté serveur) s'ATTIRENT l'œil, soulignés
  // dans la saisie, la transcription restant de toute façon éditable avant
  // envoi (#1939.4). Rien ne part seul d'ici (#1939.10, #4536.1).
  const handleTranscribed = useCallback(
    (result: ChatVoiceTranscription) => {
      const notices: string[] = []
      if (result.uncertainSegments.length > 0) {
        notices.push(t('voice.uncertain', { segments: result.uncertainSegments.join(' · ') }))
      }
      if (notices.length > 0) toast.info(notices.join(' '), { duration: TOAST_PROBLEM_MS })
      const uncertain = (result.words ?? []).filter(word => word.uncertain).map(word => word.text)
      setUncertainWords(uncertain)
      onTranscribed(result)
    },
    [onTranscribed, t],
  )

  const voice = useVoiceMode({
    language: voiceLanguage,
    resetKey: conversationKey,
    accountId,
    onTranscribed: handleTranscribed,
    onError,
  })

  // #2434.4 / #2434.24 — l'aperçu en direct, jamais la transcription qui compte
  // (celle-ci reste `voice-api.ts`, à `stop()`). Voir `live-transcript.ts`.
  // ⚠️ Comparaison recomposée via `phase` : la garde #2434.84
  // (`le-micro-narrete-jamais-actif-sans-indicateur-visible.test.ts`) repère le
  // bloc JSX par la PREMIÈRE occurrence textuelle du marqueur `voice.phase ===`
  // suivi de la phase visée — une seconde occurrence ici la ferait pointer sur
  // la mauvaise parenthèse.
  const phase = voice.phase
  const recording = phase === 'recording'
  // La reconnaissance du NAVIGATEUR (aperçu seulement) ne connaît pas `'auto'` :
  // elle veut une langue définie — celle de l'interface, en repli.
  const liveTranscript = useLiveTranscript(recording, voiceLanguage === 'auto' ? interfaceLanguage : voiceLanguage)

  if (!available) return null

  const startRecording = () => {
    void voice.start()
  }
  const openMicrophone = () => {
    setMicTapped(true)
    // Refus du navigateur déjà posé : on ne redemande pas, la mention le dit.
    if (micPermission === 'denied') return
    // #2434.28 / #2434.29 — une nouvelle tentative efface la mention de l'échec précédent.
    setPersistentError(null)
    // #2434.40 / #2434.85 — de même pour les mots soulignés du message précédent.
    setUncertainWords([])
    if (noticeAcknowledged(userId)) startRecording()
    else setNoticeOpen(true)
  }
  const acceptNotice = () => {
    acknowledgeNotice(userId)
    setNoticeOpen(false)
    startRecording()
  }

  // #1939.5 — « ça travaille » : la respiration de la grammaire du mouvement, et
  // son repli sans déplacement quand la personne a demandé moins de mouvement.
  const listening = prefersReducedMotion ? reduced(MOTION.breathe, 'breathe') : MOTION.breathe
  const cancelButton = (
    // #1939.6 — « Annuler » à chaque étape : autorisation, écoute, transcription.
    <Button
      type="button"
      variant="ghost"
      size="sm"
      icon={X}
      onClick={voice.cancel}
      aria-label={t('voice.cancelAria')}
      className="min-h-11"
    >
      {t('voice.cancel')}
    </Button>
  )

  // #2434.21 — refus PERSISTANT et distinct de l'état « jamais demandé »
  // (#2434.20, déjà `idle` ci-dessous) : ni bouton cliquable, ni nouvelle invite.
  const permissionDenied = voice.phase === 'idle' && micPermission === 'denied'

  return (
    <>
      {voice.phase === 'idle' && permissionDenied && micTapped && !deniedHintDismissed ? (
        // #3355 (LAU-UI-307) — même idiome que les autres pastilles du
        // composeur (`ConnectedToolsStrip`, les pièces jointes) : un fond et
        // des coins arrondis, plutôt qu'un texte nu posé dans la ligne — le
        // contenu ne change pas, seule l'intégration visuelle change.
        <span
          role="status"
          className="flex max-w-full items-center gap-1.5 rounded-full bg-[var(--bellum-surface-2)] px-2 py-0.5 text-[var(--bellum-text-muted)]"
          title={t('voice.permissionDeniedHint')}
        >
          <MicOff className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate text-xs">{t('voice.permissionDeniedHint')}</span>
          <button
            type="button"
            onClick={() => {
              writeDeniedHintDismissed()
              setDeniedHintDismissed(true)
            }}
            aria-label={t('voice.permissionDeniedDismiss')}
            title={t('voice.permissionDeniedDismiss')}
            className="flex size-5 shrink-0 items-center justify-center rounded-full outline-none transition-colors hover:text-[var(--bellum-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)] min-h-11 min-w-11"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ) : null}

      {voice.phase === 'idle' ? (
        <button
          type="button"
          onClick={openMicrophone}
          disabled={disabled}
          aria-label={t('voice.start')}
          title={t('voice.start')}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--bellum-text-secondary)] outline-none transition-colors hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 min-h-11 min-w-11"
        >
          <Mic className="size-4" aria-hidden />
        </button>
      ) : null}

      {/* #2434.74/.75/.77 — la langue transmise à la transcription : celle de
          l'interface par défaut, ou `'auto'` (Whisper détecte seul) pour un
          accent ou un mélange français/anglais. Visible seulement au repos —
          un réglage qui changerait en cours d'écoute serait trompeur.
          `SelectField`, jamais l'élément HTML natif (GA-251). */}
      {voice.phase === 'idle' && !permissionDenied ? (
        <SelectField
          value={voiceLanguage}
          onChange={next => changeVoiceLanguage(next as VoiceLanguage)}
          options={voiceLanguageOptions(t)}
          disabled={disabled}
          ariaLabel={t('voice.language.label')}
          size="sm"
          className="min-h-11 w-auto shrink-0 gap-1 px-1.5 text-xs"
        />
      ) : null}

      {/* #2434.28 / #2434.29 — l'échec reste lisible au-delà du toast, jusqu'à la
          prochaine tentative ; l'hors-ligne porte une mention distincte de l'erreur
          générique (icônes NOMMÉES, GA-32). */}
      {voice.phase === 'idle' && !permissionDenied && persistentError ? (
        <span
          role="status"
          className="flex items-center gap-1.5 px-1 text-[var(--bellum-text-muted)]"
          title={voiceErrorText(t, persistentError)}
        >
          {persistentError === 'network' ? (
            <WifiOff className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          )}
          <span className="text-xs">{voiceErrorText(t, persistentError)}</span>
        </span>
      ) : null}

      {/* #2434.40 / #2434.85 — les mots que le fournisseur juge peu fiables,
          SOULIGNÉS, jamais un pourcentage : la doctrine interdit d'afficher une
          probabilité, et l'écran ne fait qu'inviter à relire ces mots précis
          dans la saisie (déjà éditable) avant d'envoyer — la lecture humaine
          reste celle qui tranche. */}
      {voice.phase === 'idle' && !permissionDenied && uncertainWords.length > 0 ? (
        <span role="status" className="flex flex-wrap items-center gap-1 px-1 text-xs text-[var(--bellum-text-muted)]">
          {t('voice.uncertainWords.label')}
          {uncertainWords.map((word, index) => (
            <span key={`${word}-${index}`} className="underline decoration-wavy decoration-[var(--bellum-warning)]">
              {word}
            </span>
          ))}
        </span>
      ) : null}

      {voice.phase === 'requesting' ? (
        <span className="flex items-center gap-2">
          <span role="status" className="text-xs text-[var(--bellum-text-muted)]">
            {t('voice.requesting')}
          </span>
          {cancelButton}
        </span>
      ) : null}

      {voice.phase === 'recording' ? (
        <span role="group" aria-label={t('voice.recordingAria')} className="flex flex-wrap items-center gap-2">
          <motion.span
            data-testid="voice-listening-indicator"
            data-motion={prefersReducedMotion ? 'reduced' : 'breathe'}
            aria-hidden
            className="size-2.5 shrink-0 rounded-full bg-[var(--bellum-danger)]"
            animate={listening.animate as TargetAndTransition}
            transition={listening.transition as Transition}
          />
          {/* #2434.83 — l'état d'écoute s'annonce : `role="status"` (`aria-live`
              implicite « polite ») sur le texte, pas seulement sur le groupe qui
              le porte — un lecteur d'écran qui n'a pas le focus DESSUS doit
              quand même l'entendre apparaître. Annoncé UNE fois à l'entrée en
              écoute (texte statique) ; le chronomètre juste après reste hors
              live region : il changerait de valeur toutes les 250 ms
              (`CLOCK_TICK_MS`), et le réannoncer à ce rythme harcèlerait plutôt
              qu'informerait. */}
          <span role="status" className="text-xs font-medium text-[var(--bellum-text-primary)]">
            {t('voice.listening')}
          </span>
          {/* #1939.7 — le chronomètre, sur la durée maximale du contrat. */}
          <span className="text-xs tabular-nums text-[var(--bellum-text-muted)]">
            {t('voice.clock', {
              elapsed: formatVoiceClock(voice.elapsedMs),
              max: formatVoiceClock(CHAT_VOICE_MESSAGE_MAX_SECONDS * 1000),
            })}
          </span>
          {/* #3455 — « la wave enregistre rien » : la dictée prouve aussi que le micro capte. */}
          <VoiceLevelMeter level={voice.level} peak={voice.peak} elapsedMs={voice.elapsedMs} />
          {cancelButton}
          <Button
            type="button"
            variant="black"
            size="sm"
            icon={Square}
            onClick={voice.stop}
            aria-label={t('voice.stopAria')}
            className="min-h-11"
          >
            {t('voice.stop')}
          </Button>
          {/* #2434.4 / #2434.24 — transcript en direct, marqué PARTIEL : un aperçu
              écran, jamais ce qui part au clic « Terminer » (`useVoiceMode` seul
              gouverne la transcription envoyée, via Whisper). Absent du navigateur
              (Firefox desktop, notamment) : nommé plutôt que deviné. */}
          {liveTranscript.supported ? (
            liveTranscript.partialText ? (
              <span
                role="status"
                aria-label={t('voice.livePreview.partialAria')}
                className="w-full basis-full text-xs text-[var(--bellum-text-muted)] italic"
              >
                {t('voice.livePreview.partial', { text: liveTranscript.partialText })}
              </span>
            ) : null
          ) : (
            <span className="w-full basis-full text-xs text-[var(--bellum-text-muted)]">
              {t('voice.livePreview.unsupported')}
            </span>
          )}
        </span>
      ) : null}

      {voice.phase === 'transcribing' ? (
        <span className="flex items-center gap-2">
          <span role="status" className="text-xs text-[var(--bellum-text-muted)]">
            {t('voice.transcribing')}
          </span>
          {cancelButton}
        </span>
      ) : null}

      {/* #1939.3 — ce qu'on fait de la voix, dit AVANT la première demande du micro. */}
      <Dialog open={noticeOpen} onOpenChange={setNoticeOpen}>
        <DialogContent closeLabel={t('common:actions.close')} className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('voice.notice.title')}</DialogTitle>
            <DialogDescription>{t('voice.notice.body')}</DialogDescription>
            {/* #1956.26 — la mention obligatoire (article 50 EU AI Act, 02/08/2026) : la
                voix est transcrite par un système d'IA. Même composant partagé que
                Chat.tsx (GA-246), rendue ici parce que c'est le SEUL écran lu avant la
                première activation — la personne doit savoir avant de parler, pas après. */}
            <AiDisclosure />
          </DialogHeader>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-[var(--bellum-text-secondary)]">
            <li>{t('voice.notice.retention', { count: CHAT_VOICE_MESSAGE_RETENTION_DAYS })}</li>
            <li>{t('voice.notice.sharing')}</li>
            {/* #2434.19 — dite AVANT le premier usage, comme les deux autres puces. */}
            <li>{t('voice.notice.stop')}</li>
            {/* #2434.74 / #2434.75 / #2434.77 / #3579.3b — nommé plutôt que deviné,
                et lu sur l'état LIVE du serveur (`voiceRefinementStatus`) : le
                raffinement accent/bruit est annoncé branché seulement s'il l'est. */}
            <li>
              {refinements?.accent === 'robust_model' && refinements.noise === 'robust_model'
                ? t('voice.notice.refinementWired')
                : t('voice.notice.refinementNotWired')}
            </li>
          </ul>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => setNoticeOpen(false)}>
              {t('voice.notice.decline')}
            </Button>
            <Button type="button" size="sm" icon={Mic} onClick={acceptNotice}>
              {t('voice.notice.accept')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
