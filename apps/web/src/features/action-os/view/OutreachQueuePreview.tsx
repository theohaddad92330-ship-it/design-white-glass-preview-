import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { OutreachMessage } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { outreachKeys, outreachMessagesApi } from '@/features/outreach/api'
import { useSession } from '@/lib/hooks/use-session'
import { QueueTraceLine } from './QueueTraceLine'

const MAX_ROWS = 3

// #3420.1 — ce qui attend un geste de l'utilisateur, DANS L'ORDRE où il le juge : à valider d'abord,
// puis modifié, puis bloqué. Un message déjà parti / planifié / en échec n'attend rien ici.
const WAITING_ORDER = ['to_review', 'modified', 'blocked'] as const

/**
 * #3420 (recette 03/10) — les messages d'approche à relire ou bloqués se voient
 * dans « À valider » : le lien seul n'en montrait aucun, et un message bloqué
 * (ex. Ferdinand Aumont en démo) restait introuvable depuis le centre. Même
 * lecture que la fiche Contact et les Séquences (clé `outreachKeys.messages()`,
 * un seul appel) ; chaque rangée nomme le contact et son premier motif
 * (`approval.blocker.*`, clé unique GA-26). Aucune ligne quand il n'y en a pas.
 */
export function OutreachQueuePreview() {
  const { t } = useTranslation(['actions', 'outreach'])
  const { user } = useSession()
  const { data } = useQuery({
    queryKey: outreachKeys.messages(),
    queryFn: () => outreachMessagesApi.list(),
    enabled: Boolean(user),
  })
  // #2200.13/.14/.21 — auteur · source · prochaine action. Inconnu ⇒ pas de segment.
  const traceParts = (message: OutreachMessage): (string | null)[] => {
    // Le gabarit (`template`) n'a pas d'auteur humain : l'auteur est celui de la première version PERSONNALISÉE.
    const first = [...(message.versions ?? [])]
      .sort((a, b) => a.version - b.version)
      .find(version => version.kind !== 'template')
    const author = !first
      ? null
      : first.author === null
        ? t('actions:center.queueTrace.author.laura')
        : first.author === user?.id
          ? t('actions:center.queueTrace.author.me')
          : t('actions:center.queueTrace.author.colleague')
    const source =
      message.sequence_id || message.source === 'sequences'
        ? t('actions:center.queueTrace.source.sequence')
        : message.source === 'laura' || message.source === 'automation'
          ? t(`actions:center.queueTrace.source.${message.source}`)
          : null
    const next = message.view ? t(`actions:center.queueTrace.next.${message.view}`) : null
    return [author, source, next]
  }
  const waiting = (Array.isArray(data) ? data : [])
    .flatMap(message => {
      const rank = WAITING_ORDER.findIndex(view => view === message.view)
      return rank < 0 ? [] : [{ message, rank }]
    })
    .sort((a, b) => a.rank - b.rank)
    .map(entry => entry.message)
  return (
    <div className="space-y-1">
      <Link to="/actions/sequences" className="inline-block text-xs underline">
        {t('actions:center.outreachLink')}
        {waiting.length > 0 ? ` · ${waiting.length}` : ''}
      </Link>
      {waiting.length > 0 ? (
        <ul className="space-y-1">
          {waiting.slice(0, MAX_ROWS).map(message => (
            <li key={message.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <Text element="span" size="sm" weight="semibold">
                {message.contact_name ?? message.account_name}
              </Text>
              {message.view ? (
                <Text element="span" size="xs" color="text-muted-foreground">
                  {t(`outreach:approval.view.${message.view}`)}
                </Text>
              ) : null}
              {message.blockers[0] ? (
                <Text element="span" size="sm" color="text-muted-foreground">
                  {t(`outreach:approval.blocker.${message.blockers[0]}`)}
                </Text>
              ) : null}
              <div className="basis-full">
                <QueueTraceLine parts={traceParts(message)} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
