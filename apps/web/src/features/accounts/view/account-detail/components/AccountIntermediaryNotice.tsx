import { accountActorBadgeKind } from '@bellum/contracts'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * #2265.5/.7/.14 (épopée #2851) — LA FICHE COMPTE (trois natures, un seul bloc), le second écran nommé par
 * l'épopée après /discover. Même dérivation que `IntermediaryBadge` de
 * Découvrir et `AccountIntermediaryFlag` de la liste (`isIntermediaryActor`,
 * `@bellum/contracts`, GA-26 : un seul calcul) — mais rendue en pleine
 * phrase, comme le reste du bloc identité du hero (`hero.tradeName`,
 * `hero.country`), plutôt qu'en pastille compacte : la fiche a la place
 * d'expliquer, la liste non.
 */
export function AccountIntermediaryNotice({
  nafCode,
  companyName,
  isDeclaredPartner,
}: {
  nafCode?: string | null
  companyName: string
  isDeclaredPartner?: boolean
}) {
  const { t } = useTranslation('accounts')
  const kind = accountActorBadgeKind({ name: companyName, naf: nafCode ?? null, isDeclaredPartner })
  if (kind === null) return null
  const prefix = kind === 'intermediary' ? 'intermediary' : `actorBadge.${kind}`

  return (
    <div
      data-testid="account-intermediary-notice"
      className="mt-2 flex items-start gap-1.5 rounded-md px-2 py-1.5"
      style={{ background: 'var(--warning-soft-bg)', border: '1px solid var(--warning-soft-border)' }}
    >
      <AlertTriangle className="mt-px h-3 w-3 shrink-0" style={{ color: 'var(--warning-soft-text)' }} aria-hidden />
      <span className="text-xs leading-snug" style={{ color: 'var(--warning-soft-text)' }}>
        <span className="font-medium">{t(`${prefix}.label`)}</span>
        {' — '}
        {t(`${prefix}.help`)}
      </span>
    </div>
  )
}
