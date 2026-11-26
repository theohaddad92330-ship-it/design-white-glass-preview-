import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'
import type { LauraJobView } from '@bellum/contracts'
import { jobStatusOf } from './job-status'

/**
 * #5045 — l'en-tête V8 d'un travail de Laura : kicker de statut, étape courante,
 * « x sur y ». Tout vient de l'état RÉEL du job (`jobStatusOf`) : pas d'horloge,
 * pas de durée. Le bouton Arrêter reste celui du composeur (GA-26 : un seul).
 */
export function LauraWorkStatus({ view }: { view: LauraJobView }) {
  const { t } = useTranslation('chat')
  const status = jobStatusOf(view)
  if (!status.kicker) return null
  return (
    <div className="flex flex-col gap-0.5" data-testid="laura-work-status">
      {/* #5045 — l'annonce suit l'état serveur ; role="status" conservé. */}
      <p role="status" className="text-sm font-semibold text-[var(--bellum-text-primary)]">
        {t(`lauraJob.work.kicker.${status.kicker}`)}
      </p>
      {status.current ? (
        <Text size="xs" data-testid="laura-work-current">
          {t('lauraJob.work.current', { label: status.current.label })}
        </Text>
      ) : null}
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('lauraJob.work.progress', { done: status.done, total: status.total })}
      </Text>
    </div>
  )
}
