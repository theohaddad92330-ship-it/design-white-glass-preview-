import type { OutreachDisplayStatus } from '@bellum/contracts'
import { Badge } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * Théo C sequences-liste / sequences-detail — la pastille d'état est TEINTÉE (jetons doux, contraste AA dans les
 * deux thèmes) : vert = ça court, violet = prévue ou à valider, ambre = en attente d'un geste, rouge = échec,
 * neutre = terminée. La couleur dit un état ; le mot le dit aussi (jamais la couleur seule). Un seul endroit
 * pour la liste ET la page d'une campagne (GA-26).
 */
const STATUS_TONE: Record<OutreachDisplayStatus, 'success' | 'primary' | 'warning' | 'danger' | 'info' | 'default'> = {
  scheduled: 'success',
  responded: 'success',
  prepared: 'primary',
  awaiting_validation: 'primary',
  paused: 'warning',
  awaiting_connection: 'warning',
  ready_to_copy: 'info',
  failed: 'danger',
  refused: 'danger',
  bounced: 'danger',
  completed: 'default',
  cancelled: 'default',
}

export function SequenceStatusBadge({ status }: { status: OutreachDisplayStatus }) {
  const { t } = useTranslation('outreach')
  return <Badge variant={STATUS_TONE[status]}>{t(`status.${status}`)}</Badge>
}
