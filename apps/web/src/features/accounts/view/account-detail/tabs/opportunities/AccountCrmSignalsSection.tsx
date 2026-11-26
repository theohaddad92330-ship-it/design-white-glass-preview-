import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'
import { useAccountCrmSignals, useAccountHasNoLinkedCrmDeal } from '@/features/accounts/hooks/useAccountCrmSignals'
import { formatDate } from '@/lib/locale'

/**
 * #3918.2 (recette prod R41, Servier `?tab=veille`) — la clé `veille` ouvre l'écran « Signaux et besoins » : les
 * signaux d'affaires CRM (affaire perdue, dormante, à renouveler — `crm-account-signals.service.ts`) n'étaient
 * montés que dans le journal REPLIÉ (`TabSignal`) et sur la Vue d'ensemble. Ici ils se lisent à l'ouverture : chaque
 * signal nomme l'objet de l'affaire (le texte de la preuve) et sa date. Aucune affaire rattachée alors qu'un CRM est
 * branché et lu : UNE phrase, jamais un blanc sans cause. Même lecture que la veille (`useAccountCrmSignals`, GA-26).
 */
export function AccountCrmSignalsSection({ accountId }: { accountId: string }) {
  const { t } = useTranslation('accountFacts')
  const signals = useAccountCrmSignals(accountId)
  const noLinkedDeal = useAccountHasNoLinkedCrmDeal(accountId)
  if (signals.length > 0) {
    return (
      <section aria-labelledby="account-crm-signals-title" className="flex flex-col gap-1">
        <Text element="h3" size="sm" weight="semibold" id="account-crm-signals-title">
          {t('brief.crmSignals')}
        </Text>
        <ul className="flex flex-col gap-1" data-testid="account-crm-signals">
          {signals.map(signal => {
            const day = formatDate(signal.date ?? null, { dateStyle: 'long' })
            return (
              <li key={`${signal.type}-${signal.date}-${signal.signal}`}>
                <Text size="sm">
                  {signal.type ? `${signal.type} — ` : ''}
                  {signal.signal}
                  {day ? ` (${day})` : ''}
                </Text>
              </li>
            )
          })}
        </ul>
      </section>
    )
  }
  return noLinkedDeal ? (
    <Text size="sm" color="text-[var(--bellum-text-secondary)]" data-testid="account-crm-no-linked-deal">
      {t('brief.noLinkedCrmDeal')}
    </Text>
  ) : null
}
