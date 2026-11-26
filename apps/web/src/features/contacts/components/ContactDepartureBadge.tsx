import { Badge } from '@bellum/ui'
import { UserX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDate, formatMonth } from '@/lib/locale'

/**
 * #4465.2 — la pastille « A quitté l'entreprise », partagée par la ligne de contact et la fiche. Elle ne dit que ce que
 * la lecture du parcours sait : la date de fin si elle est connue, l'employeur actuel en infobulle si le parcours le
 * nomme. Ni date ni employeur devinés — sans signal, l'appelant ne la rend pas.
 */
export function ContactDepartureBadge({ organization, at }: { organization: string | null; at: string | null }) {
  const { t } = useTranslation('contacts')
  const month = at ? formatMonth(at.slice(0, 7)) : ''
  const title = organization
    ? at
      ? t('keyInfo.employmentLeft', { organization, date: formatDate(new Date(at)) })
      : t('table.employmentLeftAt', { organization })
    : undefined
  return (
    <Badge
      variant="outline"
      data-testid="employment-left-badge"
      title={title}
      className="shrink-0 gap-1 border-[var(--bellum-danger)] px-1 py-0 text-xs text-[var(--danger-soft-text)]"
    >
      <UserX className="size-2.5" aria-hidden />{' '}
      {month ? t('table.employmentLeftOn', { date: month }) : t('table.employmentLeft')}
    </Badge>
  )
}
