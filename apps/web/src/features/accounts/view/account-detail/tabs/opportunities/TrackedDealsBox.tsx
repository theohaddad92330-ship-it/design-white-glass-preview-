import type { ProjectRow } from '@bellum/contracts'
import { Card, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '@/lib/api'
import { queryKeys } from '@/lib/api/query-keys'
import { isHistoricalNeedRow } from '../accountNeedRows'

/** Au-delà, l'encadré renvoie au pipe plutôt que d'y recopier la liste. */
const LISTED_MAX = 3

/**
 * Théo A comptes-fiche.N11 — « Affaires déjà suivies » dans Signaux & besoins.
 * Le dossier RELIE les affaires de l'espace sur ce compte, il ne crée pas un second
 * pipeline : un signal brut n'est pas une affaire, un besoin clos (gagné, perdu) est
 * de l'historique. Sans affaire en cours, l'encadré se tait — jamais « 0 affaire ».
 * Même clé de cache que `TabNeeds` / `TabProjects` : la liste ne part qu'une fois.
 */
export function TrackedDealsBox({ accountId }: { accountId: string }) {
  const { t } = useTranslation('projects', { keyPrefix: 'accountOpportunity.trackedDeals' })
  const { data } = useQuery({
    queryKey: queryKeys.accounts.projects(accountId),
    queryFn: () => apiFetch<ProjectRow[]>({ path: `/projects?account_id=${accountId}` }),
  })
  const open = (data ?? []).filter(row => row.kind !== 'signal' && !isHistoricalNeedRow(row))
  if (open.length === 0) return null
  return (
    <Card className="gap-2 px-4 py-3" data-testid="tracked-deals-box">
      <Text element="h3" size="sm" weight="semibold">
        {t('title', { count: open.length })}
      </Text>
      <ul className="flex flex-col gap-1">
        {open.slice(0, LISTED_MAX).map(row => (
          <li key={row.id}>
            <Text size="sm">{row.label}</Text>
          </li>
        ))}
        {open.length > LISTED_MAX ? (
          <li>
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('more', { count: open.length - LISTED_MAX })}
            </Text>
          </li>
        ) : null}
      </ul>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('note')}
      </Text>
      <Link
        to="/projects"
        className="inline-flex min-h-11 w-fit items-center text-sm text-[var(--bellum-text-accent)] underline underline-offset-2"
      >
        {t('open')}
      </Link>
    </Card>
  )
}
