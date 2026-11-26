import { useTranslation } from 'react-i18next'
import { useReplyPreferences, useSetReplyPreference } from '@/features/memory/hooks/useReplyPreferences'

const LINK =
  'rounded px-1 text-xs text-[var(--bellum-text-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11'

/**
 * #1928.7 × #1928 — la proposition de réponses courtes, et le geste qui l'accepte.
 *
 * Monté par `ReplyFeedback` SEULEMENT quand l'accusé porte une proposition :
 * le pied de réponse, monté sous chaque message de Laura, ne gagne ainsi aucune
 * lecture réseau (les réglages ne se lisent qu'au moment où ils servent).
 *
 * « Garder » écrit `replyLength: 'short'` par le chemin UNIQUE des réglages de
 * réponse (`useSetReplyPreference`, le même que Réglages › Mémoire de Laura —
 * GA-26, un réglage vit à un seul endroit).
 *
 * Rien n'est proposé :
 *  - quand la longueur est DÉJÀ réglée, quelle qu'en soit la valeur — un choix
 *    de la personne ne se re-propose pas ;
 *  - tant que les réglages ne sont pas lus — inconnu n'est pas « non réglé ».
 */
export function ShorterRepliesSuggestion({ count }: { count: number }) {
  const { t } = useTranslation('chat')
  const preferences = useReplyPreferences()
  const setPreference = useSetReplyPreference()

  if (setPreference.isSuccess) return <span className="block">{t('feedback.ack.kept')}</span>
  if (!preferences.data || preferences.data.replyLength) return null

  return (
    <span className="block">
      {t('feedback.ack.suggestion', { count })}{' '}
      <button
        type="button"
        className={LINK}
        disabled={setPreference.isPending}
        onClick={() => setPreference.mutate({ key: 'replyLength', value: 'short' })}
      >
        {t('feedback.ack.keep')}
      </button>
    </span>
  )
}
