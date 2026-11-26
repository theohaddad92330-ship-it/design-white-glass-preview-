import type { ChatVoiceTranscription } from '@bellum/contracts'
import { useReducedMotion, motion, type TargetAndTransition, type Transition } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { AudioLines, Square, Volume2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button, MOTION, reduced } from '@bellum/ui'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { isSupportedLanguage } from '@/i18n/config'
import { TOAST_PROBLEM_MS } from '@/lib/toast-duration'
import { voiceErrorText } from './VoiceInput'
import { VoiceLevelMeter } from './VoiceLevelMeter'
import { formatVoiceClock } from './voice-recorder'
import { useVoiceAvailability } from './useVoiceAvailability'
import { useVoiceConversation } from './useVoiceConversation'

/**
 * #2434.8/.9/.10/.12/.24/.30 — LE MODE « CONVERSATION » (VERSION WEB).
 *
 * Un bouton distinct du micro de dictée (`VoiceInput`) : celui-ci ENVOIE — la
 * décision explicite du 27/09 qui referme ces six points. Une session
 * EXPLICITEMENT démarrée enchaîne dictée → envoi → lecture de la réponse
 * (`speechSynthesis`) → réécoute, jusqu'à l'arrêt explicite — jamais en
 * arrière-plan, jamais sans que l'état à l'écran le dise (`role="status"`
 * ci-dessous, `aria-live`).
 *
 * Même capacité que la dictée (navigateur, serveur, jamais en démonstration,
 * voir `useVoiceAvailability`) : un bouton qui échouerait au clic est pire
 * qu'un bouton absent (#1939.1).
 */
export function VoiceConversation({
  conversationKey,
  accountId = null,
  sending,
  lastAssistantText,
  lastTurnFailed,
  onSend,
  onUncertain,
}: {
  /** Le fil actif : le changer referme la session (#1939.8). */
  conversationKey: string
  accountId?: string | null
  /** #1953.1 — vrai pendant tout le tour (envoi jusqu'à la fin de la diffusion). */
  sending: boolean
  lastAssistantText: string | null
  lastTurnFailed: boolean
  onSend: (text: string) => void
  /** Un mot incertain : le texte revient dans la saisie (#2434.1), rien ne part. */
  onUncertain: (result: ChatVoiceTranscription) => void
}) {
  const { t, i18n } = useTranslation('chat')
  const isDemo = useIsDemo()
  const available = useVoiceAvailability(isDemo)
  const prefersReducedMotion = useReducedMotion()
  const language = isSupportedLanguage(i18n.language) ? i18n.language : 'fr'

  const conversation = useVoiceConversation({
    language,
    resetKey: conversationKey,
    accountId,
    sending,
    lastAssistantText,
    lastTurnFailed,
    onSend,
    onUncertain,
    onError: error => toast.error(voiceErrorText(t, error), { duration: TOAST_PROBLEM_MS }),
  })

  if (!available) return null

  const listening = prefersReducedMotion ? reduced(MOTION.breathe, 'breathe') : MOTION.breathe

  if (!conversation.active) {
    return (
      <button
        type="button"
        onClick={conversation.start}
        disabled={sending}
        aria-label={t('voice.conversation.start')}
        title={t('voice.conversation.start')}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--bellum-text-secondary)] outline-none transition-colors hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 min-h-11 min-w-11"
      >
        <AudioLines className="size-4" aria-hidden />
      </button>
    )
  }

  // #2434.30 — l'état, NOMMÉ, dans la langue de l'interface — jamais un
  // indicateur muet : la personne sait toujours ce que fait la conversation.
  const phaseLabel = ((): string => {
    switch (conversation.phase) {
      case 'requesting':
        return t('voice.requesting')
      case 'listening':
        return t('voice.conversation.listening')
      case 'transcribing':
        return t('voice.transcribing')
      case 'sending':
        return t('voice.conversation.sending')
      case 'speaking':
        return t('voice.conversation.speaking')
      case 'error':
        return t('voice.conversation.error')
      default:
        return t('voice.conversation.listening')
    }
  })()

  return (
    <span
      role="group"
      aria-label={t('voice.conversation.aria')}
      className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--bellum-border)] px-2 py-1"
    >
      {conversation.phase === 'listening' ? (
        <motion.span
          data-testid="voice-conversation-listening-indicator"
          data-motion={prefersReducedMotion ? 'reduced' : 'breathe'}
          aria-hidden
          className="size-2.5 shrink-0 rounded-full bg-[var(--bellum-danger)]"
          animate={listening.animate as TargetAndTransition}
          transition={listening.transition as Transition}
        />
      ) : null}
      {conversation.phase === 'speaking' ? <Volume2 className="size-3.5 shrink-0" aria-hidden /> : null}
      {/* #2434.83 — aria-live : l'état d'écoute/lecture s'annonce sans lecture
          d'écran silencieuse entre deux clics. */}
      <span role="status" aria-live="polite" className="text-xs font-medium text-[var(--bellum-text-primary)]">
        {phaseLabel}
      </span>
      {/* #3455 — « la wave enregistre rien » : pendant l'écoute, rien à l'écran ne
          prouvait que le micro captait. Le chronomètre avance tant que
          l'enregistrement tourne — le même repère que la dictée. */}
      {conversation.phase === 'listening' ? (
        <span
          data-testid="voice-conversation-clock"
          className="text-xs tabular-nums text-[var(--bellum-text-secondary)]"
        >
          {formatVoiceClock(conversation.elapsedMs)}
        </span>
      ) : null}
      {/* #3455 — la vraie onde : le niveau du flux accordé (jauge partagée avec la dictée). */}
      {conversation.phase === 'listening' ? (
        <VoiceLevelMeter level={conversation.level} peak={conversation.peak} elapsedMs={conversation.elapsedMs} />
      ) : null}
      {conversation.phase === 'speaking' ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={X}
          onClick={conversation.interrupt}
          className="min-h-11"
          aria-label={t('voice.conversation.interruptAria')}
        >
          {t('voice.conversation.interrupt')}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="black"
        size="sm"
        icon={Square}
        onClick={conversation.stop}
        className="min-h-11"
        aria-label={t('voice.conversation.stopAria')}
      >
        {t('voice.conversation.stop')}
      </Button>
    </span>
  )
}
