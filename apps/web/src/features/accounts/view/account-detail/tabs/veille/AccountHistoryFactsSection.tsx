import { useTranslation } from 'react-i18next'
import { AccountFactsBriefBlock } from '@/features/account-facts/AccountFactsBriefBlock'
import { useAccountFactsBrief } from '@/features/account-facts/useAccountFactsBrief'
import { useAccountHasNoLinkedCrmDeal } from '@/features/accounts/hooks/useAccountCrmSignals'

/**
 * #4068.6 (R17 15/10) — l'historique DATÉ que la carte /discover montre (affaires passées, missions, besoins
 * récurrents, derniers échanges) se retrouve ici, sur la veille du compte. Même lecteur (`useAccountFactsBrief`),
 * même rendu (`AccountFactsBriefBlock`, GA-26) : un second appelant, pas une seconde lecture.
 * Sans fait : aucun bloc (on n'affiche pas ce qu'on n'a pas).
 *
 * #3918.2 (r40) — UNE exception, dite en une phrase : un CRM est branché et lu, et AUCUNE affaire n'est
 * rattachée à ce compte. Le blanc n'a alors pas de cause cachée, et l'écran le dit au lieu de se taire.
 */
export function AccountHistoryFactsSection({ accountId }: { accountId: string }) {
  const { t } = useTranslation('accountFacts')
  const brief = useAccountFactsBrief(accountId)
  const noLinkedDeal = useAccountHasNoLinkedCrmDeal(accountId)
  const showsDeals = (brief?.deals.length ?? 0) > 0
  return (
    <>
      {brief ? <AccountFactsBriefBlock brief={brief} /> : null}
      {noLinkedDeal && !showsDeals ? (
        <p className="text-xs text-[var(--bellum-text-secondary)]">{t('brief.noLinkedCrmDeal')}</p>
      ) : null}
    </>
  )
}
