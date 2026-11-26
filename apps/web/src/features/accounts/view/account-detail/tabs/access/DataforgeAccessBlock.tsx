import type { DataforgeAccountAccess } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * Lot 776 (Louis 02/11/2026) — « Accès au compte · Base commune », dans l'onglet « Écosystème & accès » : comment
 * ENTRER chez ce compte. Libellés métier uniquement (jamais le code brut), aucun score nu, aucune probabilité, aucun
 * fournisseur nommé, aucune donnée de personne. Un axe non établi ne fait aucune ligne ; rien d'établi ⇒ aucun bloc.
 */
export function DataforgeAccessBlock({ access }: { access: DataforgeAccountAccess | null | undefined }) {
  const { t } = useTranslation('access', { keyPrefix: 'dataforge_access' })
  if (!access) return null
  const rows: { key: string; label: string; value: string }[] = [
    ...(access.accessibility
      ? [{ key: 'accessibility', label: t('accessibility.label'), value: t(`accessibility.${access.accessibility}`) }]
      : []),
    ...(access.barriers.length > 0
      ? [
          {
            key: 'barriers',
            label: t('barriers.label'),
            value: access.barriers.map(barrier => t(`barriers.${barrier}`)).join(' · '),
          },
        ]
      : []),
    ...(access.route ? [{ key: 'route', label: t('route.label'), value: t(`route.${access.route}`) }] : []),
    ...(access.priority
      ? [{ key: 'priority', label: t('priority.label'), value: t(`priority.${access.priority}`) }]
      : []),
  ]
  if (rows.length === 0) return null
  return (
    <section
      data-testid="dataforge-access-block"
      className="flex min-w-0 flex-col gap-3 rounded-card border border-[var(--bellum-border)] bg-card p-4"
    >
      <header className="min-w-0">
        <Text element="h3" size="base" weight="semibold">
          {t('title')}
        </Text>
        <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t('lead')}
        </Text>
      </header>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map(row => (
          <div key={row.key} className="min-w-0">
            <dt className="text-xs text-[var(--bellum-text-secondary)]">{row.label}</dt>
            <dd className="text-sm">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
