import { Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { RenderAccountLink } from './account-link'

/** Comptes de l'espace situés dans la zone : une absence ne fait aucune ligne. */
export function LinkedAccounts({
  accounts,
  renderAccountLink,
}: {
  accounts: ReadonlyArray<{ id: string; name: string }>
  renderAccountLink: RenderAccountLink
}) {
  const { t } = useTranslation('marketBrief')
  if (accounts.length === 0) return null
  return (
    <Card data-testid="market-linked-accounts" className="min-w-0 px-4 pb-2 pt-4">
      <Text element="h3" size="base" weight="semibold">
        {t('linkedAccounts.title')}
      </Text>
      {/* Recette 06/10/2026 : chaque lien porte déjà sa cible de 44 px (min-h-11) — pas d'écart de rangée en plus, ni de bas de carte de 16 px. */}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-0">
        {accounts.map(account => (
          <li key={account.id} className="flex min-w-0 items-center gap-2">
            {/* Les initiales, teintées : le repère visuel d'un compte, comme dans la liste des comptes. */}
            <span
              aria-hidden
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft-bg)] text-xs font-semibold text-[var(--accent-soft-text)]"
            >
              {account.name.trim().slice(0, 2).toUpperCase()}
            </span>
            <Text size="sm">{renderAccountLink(account.id, account.name)}</Text>
          </li>
        ))}
      </ul>
    </Card>
  )
}
