import { useTranslation } from 'react-i18next'
import { CRM_TOOL_NAMES, type CrmMirrorSource } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useAccountCrmMirror } from '@/features/accounts/hooks/useAccountCrmMirror'
import { formatDate } from '@/lib/locale'
import { formatCents } from '@/lib/money'

/**
 * SYNC-A (décision Louis 19/10/2026 : « toutes les infos, peu importe le CRM ») — les affaires et les
 * activités du compte, telles que le CRM BRANCHÉ les porte (le miroir). Le CRM du client se nomme
 * (c'est ce qu'il a branché) ; une valeur absente ne s'affiche pas (jamais « 0 ») ; rien à montrer =
 * aucune section (on n'affiche pas ce qu'on n'a pas). Le corps d'un e-mail ou d'une note n'est jamais
 * copié : une activité se lit par son type, son sujet et sa date.
 */
export function AccountCrmMirrorSection({ accountId }: { accountId: string }) {
  const { t } = useTranslation('accountFacts')
  const mirror = useAccountCrmMirror(accountId)
  if (!mirror || (mirror.deals.length === 0 && mirror.activities.length === 0)) return null
  const source = (provider: CrmMirrorSource) =>
    provider === 'demo' ? t('crmMirror.demoSource') : CRM_TOOL_NAMES[provider]

  return (
    <section
      aria-labelledby="account-crm-mirror-title"
      className="flex flex-col gap-2"
      data-testid="account-crm-mirror"
    >
      <Text element="h3" size="sm" weight="semibold" id="account-crm-mirror-title">
        {t('crmMirror.title')}
      </Text>
      {mirror.deals.length > 0 ? (
        <div className="flex flex-col gap-1">
          <Text element="h4" size="sm" weight="medium">
            {t('crmMirror.deals')}
          </Text>
          <ul className="flex flex-col gap-1" data-testid="account-crm-mirror-deals">
            {mirror.deals.map(deal => {
              const parts = [
                deal.status ? t(`crmMirror.status.${deal.status}`) : null,
                deal.stage,
                deal.amount === null ? null : formatCents(Math.round(deal.amount * 100), deal.currency ?? 'EUR'),
                formatDate(deal.closedAt ?? deal.expectedCloseDate, { dateStyle: 'medium' }),
                deal.ownerName,
                source(deal.provider),
              ].filter(Boolean)
              return (
                <li key={`${deal.provider}-${deal.id}`}>
                  <Text size="sm">
                    {deal.title ?? t('crmMirror.untitled')} — {parts.join(' · ')}
                  </Text>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
      {mirror.activities.length > 0 ? (
        <div className="flex flex-col gap-1">
          <Text element="h4" size="sm" weight="medium">
            {t('crmMirror.activities')}
          </Text>
          <ul className="flex flex-col gap-1" data-testid="account-crm-mirror-activities">
            {mirror.activities.map(activity => {
              const parts = [
                formatDate(activity.occurredAt, { dateStyle: 'medium' }),
                activity.done === null ? null : t(activity.done ? 'crmMirror.done' : 'crmMirror.todo'),
                activity.ownerName,
                source(activity.provider),
              ].filter(Boolean)
              return (
                <li key={`${activity.provider}-${activity.id}`}>
                  <Text size="sm">
                    {activity.kind ? `${t(`crmMirror.kind.${activity.kind}`)} — ` : ''}
                    {activity.subject ?? t('crmMirror.untitled')}
                    {parts.length > 0 ? ` (${parts.join(' · ')})` : ''}
                  </Text>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
