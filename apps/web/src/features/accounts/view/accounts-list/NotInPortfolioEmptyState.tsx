import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState } from '@bellum/ui'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

type NotInPortfolioEmptyStateProps = {
  company: string
  /** Ouvre l'onglet « Hors priorité » (statut `archived`) — le geste que l'écran DIT. */
  onShowArchived: () => void
}

/**
 * #4621 — « aucun compte ne correspond » sur un nom qu'on sait avoir vu : la liste écarte les comptes archivés de la
 * recherche (#4053, décision inscrite — elle n'est pas renversée ici). Mais l'écran ne distinguait pas « absent » d'
 * « archivé ». Il compte donc, avec le MÊME nom et le statut `archived`, ce que la liste a écarté, et le DIT.
 *
 * #4621.1 — la cause MESURÉE en base (26/10) n'était pourtant pas l'archive : une coquille d'échec VIDE (`error`, ni
 * contact ni angle ni plan ni run) est masquée par conception (anti-parasite) tant que le filtre « Échecs » n'est pas
 * demandé. Même lecture, même nom : si une analyse a échoué sur ce nom, l'écran le DIT et offre de la reprendre
 * (relancer l'analyse réutilise la coquille, jamais un doublon) ou de voir les échecs. L'archivé passe d'abord.
 *
 * Seul le total est lu (`limit: 1`). Une lecture ratée ou en cours rend le message d'avant : jamais un « 0 archivé »
 * affirmé sans mesure, jamais une analyse payante proposée à qui a déjà le compte.
 */
export function NotInPortfolioEmptyState({ company, onShowArchived }: NotInPortfolioEmptyStateProps) {
  const { t } = useTranslation('accounts')
  const { user } = useSession()
  const archived = useQuery({
    queryKey: [...accountKeys.list(user?.id), 'archived-matches', company],
    queryFn: () => accountsApi.list({ q: company, status: 'archived', limit: 1 }),
    enabled: !!user && company.length > 0,
    staleTime: 30_000,
  })
  const failed = useQuery({
    queryKey: [...accountKeys.list(user?.id), 'failed-matches', company],
    queryFn: () => accountsApi.list({ q: company, status: ['error', 'canceled'], limit: 1 }),
    enabled: !!user && company.length > 0,
    staleTime: 30_000,
  })
  const archivedCount = archived.data?.pagination.totalItems
  const failedCount = failed.data?.pagination.totalItems

  if (archivedCount !== undefined && archivedCount > 0) {
    return (
      <EmptyState
        size="md"
        align="center"
        icon={<Search className="h-10 w-10" />}
        title={t('emptyFiltered.title')}
        description={t('emptyFiltered.archivedMatch', { company, count: archivedCount })}
        action={
          <Button size="sm" variant="default" onClick={onShowArchived}>
            {t('emptyFiltered.showArchived', { tab: t('listTabs.archived') })}
          </Button>
        }
      />
    )
  }

  if (failedCount !== undefined && failedCount > 0) {
    return (
      <EmptyState
        size="md"
        align="center"
        icon={<Search className="h-10 w-10" />}
        title={t('emptyFiltered.title')}
        description={t('emptyFiltered.failedMatch', { company, count: failedCount })}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="default" asChild>
              <Link to="/search" search={{ company }}>
                {t('emptyFiltered.resume', { company })}
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/accounts" search={{ q: company, status: ['error', 'canceled'] }}>
                {t('emptyFiltered.showFailed')}
              </Link>
            </Button>
          </div>
        }
      />
    )
  }

  /* #1134 : « c'est normal qu'il ne trouve aucun résultat alors que cette société existe ? ». Oui — cette liste
     cherche dans le PORTEFEUILLE, pas dans le monde. On propose le seul geste qui peut la faire apparaître. */
  return (
    <EmptyState
      size="md"
      align="center"
      icon={<Search className="h-10 w-10" />}
      title={t('emptyFiltered.title')}
      description={t('emptyFiltered.notInPortfolio', { company })}
      action={
        <Button size="sm" variant="default" asChild>
          <Link to="/search" search={{ company }}>
            {t('emptyFiltered.analyse', { company })}
          </Link>
        </Button>
      }
    />
  )
}
