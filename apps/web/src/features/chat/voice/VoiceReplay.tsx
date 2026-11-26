import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play } from 'lucide-react'
import { ApiError } from '@/lib/api-error'
import { fetchVoicePlayback } from './voice-api'

/**
 * #1939 (lot 9.3) — « RÉÉCOUTER » UN MESSAGE DICTÉ.
 *
 * Posé sur une bulle qui porte `voice_object_id`. La portée est celle du TEXTE
 * du fil (décision du 12/09) : c'est le serveur qui la tient, en cherchant le
 * message dans l'espace de la session — l'écran ne décide rien.
 *
 * ⚠️ L'URL signée (cinq minutes) est demandée AU CLIC et ne vit que le temps de
 * la lecture : ni cache de requêtes, ni stockage local, ni état qui survive à la
 * fin du morceau. Une URL gardée finirait par être rejouée expirée — ou copiée.
 *
 * 404 = l'enregistrement n'est plus conservé (30 jours passés, compte effacé) :
 * on le DIT, et le bouton s'efface — réessayer ne le fera pas revenir.
 */

type ReplayState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'playing'; url: string }
  | { kind: 'gone' }
  | { kind: 'failed' }

export function VoiceReplay({ messageId }: { messageId: string }) {
  const { t } = useTranslation('chat')
  const [state, setState] = useState<ReplayState>({ kind: 'idle' })
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = async () => {
    setState({ kind: 'loading' })
    try {
      const signed = await fetchVoicePlayback(messageId)
      if (mounted.current) setState({ kind: 'playing', url: signed.url })
    } catch (error) {
      if (!mounted.current) return
      setState(error instanceof ApiError && error.status === 404 ? { kind: 'gone' } : { kind: 'failed' })
    }
  }

  if (state.kind === 'gone') {
    return (
      <span role="status" className="text-xs text-[var(--bellum-text-muted)]">
        {t('voice.replayGone')}
      </span>
    )
  }

  if (state.kind === 'playing') {
    return (
      <audio
        src={state.url}
        controls
        autoPlay
        onEnded={() => setState({ kind: 'idle' })}
        onError={() => setState({ kind: 'failed' })}
        className="h-9 max-w-full"
      />
    )
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void load()}
        disabled={state.kind === 'loading'}
        aria-label={t('voice.replayAria')}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-[var(--bellum-text-muted)] outline-none transition-colors hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-accent)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)] disabled:cursor-wait pointer-coarse:min-h-11"
      >
        <Play className="size-3" aria-hidden />
        <span>{state.kind === 'loading' ? t('voice.replayLoading') : t('voice.replay')}</span>
      </button>
      {state.kind === 'failed' ? (
        <span role="status" className="text-xs text-[var(--bellum-text-secondary)]">
          {t('voice.replayFailed')}
        </span>
      ) : null}
    </span>
  )
}
