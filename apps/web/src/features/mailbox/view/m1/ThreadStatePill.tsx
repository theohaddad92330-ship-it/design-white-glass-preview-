import type { MailThread } from '@bellum/contracts'
import { Badge } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

type Tone = 'success' | 'warning' | 'danger' | 'primary' | 'default'

/** La couleur dit un ÉTAT (décision Louis) : favorable, nouveau, silence long, traité. Jetons doux, deux thèmes. */
const TONE: Record<string, Tone> = {
  positive_reply_unread: 'success',
  positive_reply: 'success',
  unread: 'warning',
  awaiting_reply_late: 'danger',
  awaiting_reply: 'primary',
  treated: 'success',
  irrelevant: 'default',
}

/**
 * #2393.5 — la RAISON du classement, calculée par le serveur (`priorityReason`), jamais un niveau nu. `none` ne
 * s'affiche pas : un fil sans signal n'a rien à annoncer. Une réponse antérieure au champ retombe sur « non lu ».
 */
export function ThreadStatePill({ thread }: { thread: MailThread }) {
  const { t } = useTranslation('mailbox')
  const reason = thread.priorityReason
  if (reason && reason !== 'none') {
    return <Badge variant={TONE[reason] ?? 'default'}>{t(`priorityReason.${reason}`)}</Badge>
  }
  // Une réponse antérieure au champ : l'état décidé (traité, non pertinent) se dit quand même, en mots.
  if (thread.state === 'treated') return <Badge variant="success">{t('state.treated')}</Badge>
  if (thread.state === 'irrelevant') return <Badge variant="default">{t('state.irrelevant')}</Badge>
  if (thread.unread) return <Badge variant="warning">{t('thread.unread')}</Badge>
  return null
}
