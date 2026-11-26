import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import { useImpactedAccounts } from '@/features/accounts/hooks/useImpactedAccounts'

/**
 * #2306.24 — « et si je change mes secteurs/offres, quels comptes sont
 * impactés ? » Même prédicat que la ligne unitaire de la fiche compte
 * (`AccountProfileProvenance.tsx`, `ranWithOlderProfile`), agrégé par le
 * serveur (`GET /accounts/impacted-by-profile-change`) — jamais un second
 * calcul côté écran.
 *
 * Le recalcul reste sur LA FICHE (GA-26 : un réglage vit à un seul endroit) —
 * cette bannière ne fait qu'ORIENTER vers les dossiers concernés, elle ne
 * duplique aucun bouton de recalcul.
 *
 * Present-only : rien tant que le chargement n'est pas fini ou qu'aucun
 * compte n'est concerné, même patron que `ProfileContextVersions`.
 */
export function ImpactedAccountsBanner() {
  const { t } = useTranslation('profile', { keyPrefix: 'context.impactedAccounts' })
  const { data, isLoading } = useImpactedAccounts()

  if (isLoading || !data || data.accounts.length === 0) return null

  return (
    <div className="space-y-2 rounded-xl border border-white/5 bg-[color-mix(in_srgb,var(--bellum-bg-darker)_60%,transparent)] p-4">
      <Text element="h4" size="sm" weight="semibold">
        {t('title')}
      </Text>
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('description', { count: data.accounts.length })}
      </Text>
      <ul className="space-y-1">
        {data.accounts.map(account => (
          <li key={account.accountId}>
            <ObjectMention kind="account" id={account.accountId} name={account.companyName} />
          </li>
        ))}
      </ul>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('hint')}
      </Text>
    </div>
  )
}
