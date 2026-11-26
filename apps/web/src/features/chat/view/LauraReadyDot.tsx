import { useTranslation } from 'react-i18next'
import { useBackgroundTurnsStore } from '@/features/chat/lib/background-turns'

/**
 * #4967.3 — une pastille DISCRÈTE sur l'entrée « Laura » de la navigation quand une
 * recherche s'est terminée pendant qu'on était ailleurs. Une forme + un texte accessible
 * (jamais la couleur seule) ; rien tant qu'aucune réponse n'attend — une recherche encore
 * en cours ne fait pas de bruit. Le contenu se retrouve dans le fil (« Reprendre »).
 */
export function LauraReadyDot() {
  const { t } = useTranslation('chat')
  const ready = useBackgroundTurnsStore(state => Object.values(state.turns).includes('ready'))
  if (!ready) return null
  return (
    <span role="status" className="inline-flex items-center">
      <span aria-hidden className="size-2 rounded-full bg-[var(--bellum-text-accent)]" />
      <span className="sr-only">{t('nav.answerReady')}</span>
    </span>
  )
}
