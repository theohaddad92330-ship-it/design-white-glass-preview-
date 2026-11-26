import { matchesFlexibleQuery } from '@bellum/contracts'
import { Box, Button, Card, SearchEmptyState, SearchInput, SelectField, Text } from '@bellum/ui'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { AffairesTabs } from '@/features/projects/view/AffairesTabs'
import { useSubmissions } from '../api'
import {
  isPresentationInProgress,
  PRESENTATION_STATES,
  presentationFunnel,
  presentationsByOwner,
  presentationState,
  type PresentationFunnel,
  type PresentationOwnerRow,
  type PresentationState,
} from '../lib/presentationStates'
import { composeSubmissionsDigest } from '../lib/submissionsDigest'
import { AddPresentationDialog } from './AddPresentationDialog'
import { PresentationsTable } from './PresentationsTable'
import { SubmissionFunnelSummary } from './SubmissionFunnelSummary'

/** #3544 — combien de lignes se montent d'un coup (le rendu de 200 lignes pesait ≈ 210 ms). */
const PRESENTATIONS_PAGE = 50

type StateFilter = 'in_progress' | 'all' | PresentationState

/**
 * Théo C projects-presentations — AFFAIRES › PRÉSENTATIONS (liste autonome, voisine du pipe et des besoins).
 *
 * « Un consultant, un besoin et une histoire distincte. Aucun envoi ne se déduit d'un déplacement de
 * carte. » Quatre états à l'écran (R1), les sorties — refusé, retiré, sans réponse, converti en mission,
 * archivé — dans le filtre (A4) ; l'entonnoir (A1) et le digest restent en tête, et passent SOUS le tableau
 * en dessous de 768 px (replié sous le contenu, jamais caché).
 */
export function PresentationsPage({ projectId }: { projectId?: string } = {}) {
  const { t } = useTranslation('submissions')
  const { data, isLoading, isError } = useSubmissions(projectId ? { projectId } : {})
  const [filter, setFilter] = useState<StateFilter>('in_progress')
  const [adding, setAdding] = useState(false)
  // Théo — « Consultant, besoin ou compte… » : une recherche locale sur la liste chargée.
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(PRESENTATIONS_PAGE)
  const items = useMemo(() => data?.items ?? [], [data?.items])

  const shown = useMemo(
    () =>
      items.filter(item => {
        const state = presentationState(item)
        const needle = query.trim()
        if (
          needle &&
          !matchesFlexibleQuery(
            needle.toLowerCase(),
            [item.consultantName, item.needRole, item.projectLabel, item.accountName].filter(Boolean).join(' '),
          )
        )
          return false
        if (filter === 'all') return true
        if (filter === 'in_progress') return isPresentationInProgress(state)
        return state === filter
      }),
    [items, filter, query],
  )
  // #3544 (reporté de `SubmissionsView`, #4528.4) — la liste monte 50 lignes, pas 200 d'un coup ; la recherche porte
  // sur TOUTES les lignes et le total réel reste dit (« 50 sur 120 »), jamais une borne muette.
  const mounted = useMemo(() => shown.slice(0, visible), [shown, visible])
  const hiddenCount = shown.length - mounted.length
  const funnel = useMemo(() => presentationFunnel(items, new Date()), [items])
  const owners = useMemo(() => presentationsByOwner(items), [items])
  const digest = useMemo(() => composeSubmissionsDigest(t, items), [t, items])

  // Refonte Théo C (`projects-presentations`) — l'ordre de la maquette : l'en-tête (« Présentations », sa
  // phrase, « Ajouter une présentation »), le guide de la coque, la barre d'Affaires, l'entonnoir des
  // 30 derniers jours en UNE bande, la ligne « Par commercial », la barre d'outils, puis le tableau.
  return (
    <CustomerPage
      pageTitle={t('presentations.title')}
      pageSubtitle={t('presentations.subtitle')}
      headerActions={
        <Button type="button" size="sm" className="pointer-coarse:min-h-11" onClick={() => setAdding(true)}>
          {t('presentations.add.cta')}
        </Button>
      }
    >
      <Box id="presentations" className="flex flex-col gap-4 pb-6">
        <AffairesTabs active="presentations" />

        <Box className="flex flex-col gap-4">
          <Box className="max-md:order-last">
            <FunnelBlock funnel={funnel} owners={owners} />
            {data?.funnel ? (
              <details className="mt-3">
                <summary className="min-h-11 cursor-pointer py-2 text-sm text-[var(--bellum-text-secondary)]">
                  {t('presentations.funnel.details')}
                </summary>
                <SubmissionFunnelSummary funnel={data.funnel} />
                {digest ? (
                  <Card className="mt-3 p-3">
                    <Text size="xs" weight="semibold" color="text-muted-foreground" className="mb-1 block">
                      {t('digest.title')}
                    </Text>
                    <Text size="sm">{digest}</Text>
                  </Card>
                ) : null}
              </details>
            ) : null}
          </Box>

          <Box className="space-y-3">
            {/* Théo `.bo11-toolbar` — recherche · état · (espace) · N présentations. */}
            <Box data-testid="presentations-toolbar" className="flex flex-wrap items-center gap-2">
              <SearchInput
                size="sm"
                value={query}
                onChange={next => {
                  setQuery(next)
                  setVisible(PRESENTATIONS_PAGE)
                }}
                placeholder={t('presentations.search')}
                className="w-full md:w-64 md:shrink-0"
                inputClassName="w-full lg:w-full"
              />
              <SelectField
                ariaLabel={t('presentations.filter.label')}
                value={filter}
                onChange={next => {
                  setFilter((next || 'in_progress') as StateFilter)
                  setVisible(PRESENTATIONS_PAGE)
                }}
                options={[
                  { value: 'in_progress', label: t('presentations.filter.inProgress') },
                  { value: 'all', label: t('presentations.filter.all') },
                  ...PRESENTATION_STATES.map(state => ({ value: state, label: t(`presentations.states.${state}`) })),
                ]}
                className="min-w-48"
              />
              <span className="hidden flex-1 md:block" />
              <Text size="xs" color="text-muted-foreground">
                {t('presentations.count', { count: shown.length })}
              </Text>
            </Box>

            {isLoading ? (
              <Text size="sm" color="text-muted-foreground">
                {t('states.loading')}
              </Text>
            ) : isError ? (
              <Text size="sm" color="text-muted-foreground">
                {t('states.error')}
              </Text>
            ) : shown.length === 0 ? (
              <SearchEmptyState
                title={t('presentations.empty.title')}
                description={t(items.length === 0 ? 'presentations.empty.none' : 'presentations.empty.filtered')}
                action={
                  items.length === 0 ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
                      {t('presentations.add.cta')}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setFilter('all')
                        setQuery('')
                        setVisible(PRESENTATIONS_PAGE)
                      }}
                    >
                      {t('presentations.filter.all')}
                    </Button>
                  )
                }
              />
            ) : (
              <Box className="space-y-2">
                <PresentationsTable items={mounted} />
                {hiddenCount > 0 ? (
                  <Box display="flex" className="flex-wrap items-center gap-3">
                    <Text size="xs" color="text-muted-foreground">
                      {t('page.shownOf', { shown: mounted.length, total: shown.length })}
                    </Text>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="pointer-coarse:min-h-11"
                      onClick={() => setVisible(count => count + PRESENTATIONS_PAGE)}
                    >
                      {t('page.showMore', { count: Math.min(PRESENTATIONS_PAGE, hiddenCount) })}
                    </Button>
                  </Box>
                ) : null}
              </Box>
            )}
          </Box>
        </Box>
      </Box>
      <AddPresentationDialog open={adding} onOpenChange={setAdding} />
    </CustomerPage>
  )
}

function FunnelBlock({ funnel, owners }: { funnel: PresentationFunnel; owners: PresentationOwnerRow[] }) {
  const { t } = useTranslation('submissions')
  const tiles: { key: string; label: string; value: number | null; note: string | null }[] = [
    {
      key: 'preselected',
      label: t('presentations.funnel.preselected'),
      value: funnel.preselected,
      note: t('presentations.funnel.window'),
    },
    {
      key: 'presented',
      label: t('presentations.funnel.presented'),
      value: funnel.presented,
      note:
        funnel.presentedWithoutReply === null
          ? null
          : t('presentations.funnel.withoutReply', { count: funnel.presentedWithoutReply }),
    },
    {
      key: 'interviews',
      label: t('presentations.funnel.interviews'),
      value: funnel.interviews,
      note:
        funnel.interviewsThisWeek === null
          ? null
          : t('presentations.funnel.thisWeek', { count: funnel.interviewsThisWeek }),
    },
    {
      key: 'retained',
      label: t('presentations.funnel.retained'),
      value: funnel.retained,
      note:
        funnel.missionsToPrepare === null
          ? null
          : t('presentations.funnel.toPrepare', { count: funnel.missionsToPrepare }),
    },
  ]
  // Théo `.c2-funnel` — une seule bande à quatre cases séparées d'un filet (deux par ligne sous 768 px),
  // puis la ligne « Par commercial » (`.c2-byowner`). Une valeur non mesurée le dit, jamais « 0 ».
  return (
    <Box className="space-y-3">
      <ul
        aria-label={t('presentations.funnel.label')}
        className="grid grid-cols-2 overflow-hidden rounded-xl border border-[var(--bellum-border)] bg-card md:grid-cols-4"
      >
        {tiles.map((tile, index) => (
          <li
            key={tile.key}
            className={`min-w-0 border-[var(--bellum-border)] px-3.5 py-3 ${index < tiles.length - 1 ? 'md:border-r' : ''} ${index % 2 === 0 ? 'max-md:border-r' : ''} ${index < 2 ? 'max-md:border-b' : ''}`}
          >
            <Text size="xs" className="block text-[var(--bellum-text-secondary)]">
              {tile.label}
            </Text>
            <Text size="lg" weight="bold" className="block tabular-nums">
              {tile.value ?? t('presentations.funnel.unmeasured')}
            </Text>
            {tile.note ? (
              <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                {tile.note}
              </Text>
            ) : null}
          </li>
        ))}
      </ul>
      {owners.length > 0 ? (
        <Box
          data-testid="presentations-by-owner"
          className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-[var(--bellum-text-secondary)]"
        >
          <span className="uppercase tracking-wider text-[var(--bellum-text-muted)]">
            {t('presentations.funnel.byOwner')}
          </span>
          {owners.map(row => (
            <span key={row.owner}>
              <b className="mr-1 font-semibold text-[var(--bellum-text-primary)]">{row.owner}</b>
              {[
                row.inProgress > 0 ? t('presentations.funnel.ownerInProgress', { count: row.inProgress }) : null,
                row.retained > 0 ? t('presentations.funnel.ownerRetained', { count: row.retained }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          ))}
        </Box>
      ) : null}
    </Box>
  )
}
