import { Badge, Box, Button, Card, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { memo, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TeamResearchItem, TeamResearchKind } from '@bellum/contracts'
import { ScreenState } from '@/components/primitives/ScreenState'
import { emptyUnifiedFilters, type UnifiedFilters } from '@/features/discover/lib/discover-filters'
import { searchFromFilters } from '@/features/discover/lib/discover-prefill'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { useTeamResearch } from '@/features/team-research/hooks/useTeamResearch'

type Filter = 'all' | TeamResearchKind
const FILTERS: readonly Filter[] = ['all', 'discover', 'analysis']

/** Les modes de périmètre d'une analyse que l'écran sait nommer ; un mode inconnu ne s'affiche pas. */
const KNOWN_SCOPE_MODES: readonly string[] = ['group', 'france', 'subsidiaries', 'it_digital']

function initialsOf(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('')
}

/** Théo D team-recherches.R2 — « Examiner » : le dossier pour une analyse, Découvrir pour une recherche. */
function ResearchCard({ item }: { item: TeamResearchItem }) {
  const { t, i18n } = useTranslation('teamResearch')
  const when = new Date(item.occurred_at).toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  })
  const scope =
    item.kind === 'analysis'
      ? item.scope_label && KNOWN_SCOPE_MODES.includes(item.scope_label)
        ? t(`scope.${item.scope_label}`)
        : null
      : item.scope_label
  const accounts =
    item.kind === 'analysis'
      ? t('accounts.analysed')
      : item.account_count === null
        ? t('accounts.unmeasured')
        : t('accounts.inResult', { count: item.account_count })
  const actions =
    item.open_action_count === 0 ? t('actions.none') : t('actions.open', { count: item.open_action_count })

  return (
    <Card className="p-4" data-testid="team-research-card">
      <article className="flex h-full flex-col gap-3">
        <Box display="flex" className="items-center justify-between gap-2">
          <Badge variant={item.kind === 'discover' ? 'secondary' : 'info'} className="text-xs">
            {t(`kind.${item.kind}`)}
          </Badge>
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {when}
          </Text>
        </Box>
        <Box>
          <Text element="h3" size="base" weight="semibold">
            {item.title}
          </Text>
          {scope && (
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {scope}
            </Text>
          )}
        </Box>
        <Box className="space-y-0.5">
          <Text size="sm" weight="medium">
            {accounts}
          </Text>
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {actions}
          </Text>
          {item.next_action && (
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {item.next_action}
            </Text>
          )}
        </Box>
        <Box display="flex" className="mt-auto flex-wrap items-center justify-between gap-2">
          <Box display="flex" className="items-center gap-2">
            {item.author_name && (
              <>
                <span
                  aria-hidden="true"
                  className="inline-flex size-7 items-center justify-center rounded-full bg-[var(--bellum-surface-2)] text-xs"
                >
                  {initialsOf(item.author_name)}
                </span>
                <Text size="sm">{item.author_name}</Text>
              </>
            )}
          </Box>
          {item.kind === 'analysis' && item.account_id ? (
            <Box className="flex flex-col items-end gap-1">
              <Button asChild variant="secondary" className="min-h-11">
                <Link to="/accounts/$id" params={{ id: item.account_id }}>
                  {t('examine')}
                </Link>
              </Button>
            </Box>
          ) : (
            <Button asChild variant="secondary" className="min-h-11">
              <Link
                to="/discover"
                search={searchFromFilters({ ...emptyUnifiedFilters(), ...(item.filters ?? {}) } as UnifiedFilters)}
              >
                {t('resumeDiscover')}
              </Link>
            </Button>
          )}
        </Box>
      </article>
    </Card>
  )
}

/**
 * Équipe › Recherches (Théo D team-recherches). Les recherches conservées de TOUT l'espace :
 * lecture ouverte à tout membre (Q3), jamais « qui a consulté quel compte ».
 */
export const TeamResearchView = memo(function TeamResearchView() {
  const { t } = useTranslation('teamResearch')
  const { data, isLoading, isError, refetch } = useTeamResearch()
  const [filter, setFilter] = useState<Filter>('all')

  const all = data?.items ?? []

  // #1904 — ce que l'écran déclare à Laura : son utilité et le nombre de recherches conservées (jamais « 0 » d'un échec).
  useLauraContext({
    kind: 'screen',
    label: t('title'),
    entityId: null,
    facets: data ? [{ label: t('laura.kept'), value: String(all.length) }] : [],
    state: isLoading && !data ? 'loading' : 'ready',
    purpose: t('laura.purpose'),
  })
  const visible = useMemo(() => (filter === 'all' ? all : all.filter(item => item.kind === filter)), [all, filter])

  return (
    <div className="w-full space-y-6">
      <Box>
        <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
          {t('eyebrow')}
        </Text>
        <Text element="h1" size="2xl" weight="bold">
          {t('title')}
        </Text>
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('subtitle')}
        </Text>
      </Box>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <Box>
          <Text element="h2" size="xl" weight="bold">
            {t('hero.count', { count: all.length })}
          </Text>
          <Text size="sm" weight="medium">
            {t('hero.choose')}
          </Text>
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('hero.note')}
          </Text>
        </Box>
        <Box display="flex" className="flex-wrap gap-2">
          <Button asChild className="min-h-11">
            <Link to="/discover">{t('newSearch')}</Link>
          </Button>
          <Button asChild variant="secondary" className="min-h-11">
            <Link to="/discover/lots">{t('batches')}</Link>
          </Button>
        </Box>
      </Card>

      <Box display="flex" className="flex-wrap items-center gap-2" role="group" aria-label={t('filters.label')}>
        {FILTERS.map(key => (
          <Button
            key={key}
            variant={filter === key ? 'default' : 'secondary'}
            aria-pressed={filter === key}
            className="min-h-11"
            onClick={() => setFilter(key)}
          >
            {t(`filters.${key}`)}
          </Button>
        ))}
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('teamScope')}
        </Text>
      </Box>

      {isError && (
        <ScreenState
          state="error"
          message={t('errors.load')}
          action={{ label: t('errors.retry'), onClick: () => void refetch() }}
        />
      )}
      {isLoading && !data && <ScreenState state="loading" message={t('states.loading')} />}
      {data && all.length === 0 && (
        <ScreenState
          state="empty_never"
          title={t('empty.title')}
          message={t('empty.message')}
          action={{ label: t('newSearch'), to: '/discover' }}
        />
      )}
      {data && all.length > 0 && visible.length === 0 && (
        <ScreenState
          state="empty_true"
          message={t('emptyFiltered')}
          action={{ label: t('filters.all'), onClick: () => setFilter('all') }}
        />
      )}
      {visible.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map(item => (
            <ResearchCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
})
