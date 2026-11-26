import type { PipelineDetection } from '@bellum/contracts'
import { Badge, Box, Button, FilterChips, SearchEmptyState, SearchInput, Text, cn } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ChevronDown, Filter } from 'lucide-react'
import { Suspense, lazy, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import {
  useConfirmPipelineDetection,
  useDismissPipelineDetection,
  usePipelineDetections,
} from '../pipeline-detections/api'
import { MATURITY_LEVELS, maturityOfStage, type MaturityLevel } from '../portfolio/maturity-tabs'
import { useAccountNeeds } from '../portfolio/hooks/useAccountNeeds'
import {
  buildAccountNeeds,
  filterAccountNeeds,
  needStage,
  type AccountNeeds,
  type NeedItem,
} from '../portfolio/model/needs'
import { DiscoverAction, ImportNeedsAction } from '../portfolio/view/EmptyStateActions'
import { BoardSkeleton } from './BoardSkeleton'
import { CreateProjectDialog } from './CreateProjectDialog'

const NeedsAccountSheet = lazy(() =>
  import('../portfolio/view/NeedsAccountSheet').then(module => ({ default: module.NeedsAccountSheet })),
)

/** Ce qui manque à une piste pour devenir une affaire — dit, jamais deviné. */
type PisteGap = 'confirmation' | 'offer' | 'review'

type PisteRow =
  | { key: string; kind: 'detection'; companyName: string; detection: PipelineDetection; gaps: PisteGap[] }
  | {
      key: string
      kind: 'need'
      companyName: string
      entry: AccountNeeds
      need: NeedItem
      maturity: MaturityLevel
      gaps: PisteGap[]
    }

/** Les compteurs-filtres de la maquette validée. */
const COUNTERS = ['ready', 'toQualify', 'withOffer', 'withoutOffer'] as const
type PisteCounter = (typeof COUNTERS)[number]

function matchesCounter(row: PisteRow, counter: PisteCounter): boolean {
  if (counter === 'ready') return row.gaps.length === 0
  if (counter === 'toQualify') return row.gaps.length > 0
  if (row.kind === 'detection') return false
  return counter === 'withOffer' ? row.need.offer !== null : row.need.offer === null
}

/** Deux compteurs d'un même axe s'additionnent (OU), deux axes se croisent (ET). */
function matchesSelection(row: PisteRow, counters: ReadonlySet<PisteCounter>, maturities: ReadonlySet<MaturityLevel>) {
  const readiness = (['ready', 'toQualify'] as const).filter(counter => counters.has(counter))
  const offer = (['withOffer', 'withoutOffer'] as const).filter(counter => counters.has(counter))
  if (readiness.length > 0 && !readiness.some(counter => matchesCounter(row, counter))) return false
  if (offer.length > 0 && !offer.some(counter => matchesCounter(row, counter))) return false
  if (maturities.size > 0 && (row.kind === 'detection' || !maturities.has(row.maturity))) return false
  return true
}

function needGaps(need: NeedItem): PisteGap[] {
  const gaps: PisteGap[] = []
  if (needStage(need.kind) !== 'confirmed') gaps.push('confirmation')
  if (need.offer === null) gaps.push('offer')
  return gaps
}

/**
 * #4340 + refonte Théo (maquette validée `decouvrir/mes-cibles.html`) — LES PISTES, EN UN TABLEAU.
 *
 * Avant : un compteur, un bandeau « Détecté, à revoir » et une liste de cartes par compte (avec un
 * score). La maquette validée les FUSIONNE en un seul tableau du composant commun (`ResponsiveTable`) :
 * Piste · Compte · Origine · Ce qui manque · Action, les plus complètes d'abord. Rien n'est recalculé :
 * les détections viennent de `usePipelineDetections`, les besoins de `useAccountNeeds` → `buildAccountNeeds`.
 *
 * Ce qui reste, à sa place la plus proche :
 *  · confirmer / écarter une détection, le lien vers l'appel source, l'avertissement « entretien » ;
 *  · les onglets de maturité (Besoins confirmés · À creuser · Signaux seuls), sous « Plus de filtres » ;
 *  · la recherche, le panneau du compte (`NeedsAccountSheet`), les états vides nommés.
 * Le score de compte a quitté la liste : aucun score en points (décision de Louis).
 */
export function PistesBoard({ onOpenAccount }: { onOpenAccount: (accountId: string) => void }) {
  const { t } = useTranslation('projects')
  const needs = useAccountNeeds()
  const detections = usePipelineDetections()
  const confirm = useConfirmPipelineDetection()
  const dismiss = useDismissPipelineDetection()
  const [counters, setCounters] = useState<ReadonlySet<PisteCounter>>(() => new Set())
  const [maturities, setMaturities] = useState<ReadonlySet<MaturityLevel>>(() => new Set())
  const [moreOpen, setMoreOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState<string>()
  const [draftFor, setDraftFor] = useState<{ accountId: string; need: NeedItem }>()

  const entries = useMemo(() => buildAccountNeeds(needs.data ?? []), [needs.data])
  const searched = useMemo(() => filterAccountNeeds(entries, 'all', query), [entries, query])
  const rows = useMemo<PisteRow[]>(() => {
    const normalized = query.trim().toLocaleLowerCase('fr')
    const detectionRows: PisteRow[] = (detections.data?.items ?? [])
      .filter(
        item => !normalized || `${item.label} ${item.accountName ?? ''}`.toLocaleLowerCase('fr').includes(normalized),
      )
      .map(item => ({
        key: `detection-${item.id}`,
        kind: 'detection',
        companyName: item.accountName ?? '',
        detection: item,
        gaps: ['review'],
      }))
    const needRows: PisteRow[] = searched.flatMap(entry =>
      entry.needs.map(need => ({
        key: `need-${entry.accountId}-${need.id}`,
        kind: 'need' as const,
        companyName: entry.companyName,
        entry,
        need,
        maturity: maturityOfStage(needStage(need.kind)),
        gaps: needGaps(need),
      })),
    )
    // « Les plus complètes d'abord » : ce qui ne manque de rien, puis le moins de manques, puis par compte.
    return [...detectionRows, ...needRows].sort(
      (a, b) => a.gaps.length - b.gaps.length || a.companyName.localeCompare(b.companyName, 'fr'),
    )
  }, [detections.data, searched, query])

  const counts = useMemo(() => {
    const result = { all: rows.length } as Record<PisteCounter | 'all', number>
    for (const counter of COUNTERS) result[counter] = rows.filter(row => matchesCounter(row, counter)).length
    return result
  }, [rows])
  const maturityCounts = useMemo(() => {
    const result = {} as Record<MaturityLevel, number>
    for (const level of MATURITY_LEVELS)
      result[level] = rows.filter(row => row.kind === 'need' && row.maturity === level).length
    return result
  }, [rows])
  const visible = rows.filter(row => matchesSelection(row, counters, maturities))
  const filtered = counters.size > 0 || maturities.size > 0 || query.trim().length > 0
  const selectedEntry = selectedAccountId ? entries.find(entry => entry.accountId === selectedAccountId) : undefined
  const pending = confirm.isPending || dismiss.isPending

  const toggle = <T,>(set: ReadonlySet<T>, value: T): ReadonlySet<T> => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  }
  const clearFilters = () => {
    setCounters(new Set())
    setMaturities(new Set())
    setQuery('')
  }

  if (needs.isLoading || detections.isLoading) return <BoardSkeleton />
  if (needs.isError) {
    return <SearchEmptyState title={t('emptyState.errorTitle')} description={t('emptyState.errorDescription')} />
  }

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="pistes-board">
      <div className="flex flex-wrap items-center gap-2">
        {/* Les compteurs-filtres de la maquette validée — par le composant PARTAGÉ (GA-249). Une famille
            vide ne fait aucune puce : on n'affiche pas ce qu'on n'a pas. */}
        <FilterChips
          ariaLabel={t('pistes.countersAria')}
          multiple
          options={[
            { value: 'all' as const, label: t('pistes.counters.all'), count: counts.all },
            ...COUNTERS.filter(counter => counts[counter] > 0).map(counter => ({
              value: counter,
              label: t(`pistes.counters.${counter}`),
              count: counts[counter],
            })),
          ]}
          values={counters.size === 0 ? ['all'] : [...counters]}
          onToggle={value =>
            value === 'all' ? setCounters(new Set()) : setCounters(current => toggle(current, value))
          }
        />
        {/* #4503 /signals — `SearchInput size="sm"` pose `w-48 lg:w-64` sur son champ : 256 px FIXES dans une boîte `min-w-0`
            qui se laisse écraser par les puces et le bouton → le champ (930→1185 px) recouvrait « Filtres » (dès 1105 px),
            80 px de chevauchement mesurés en démo. Le champ prend la largeur de SA boîte (`w-full`), et la boîte a un
            plancher (`min-w-40`) : faute de place elle passe à la ligne (`flex-wrap`) au lieu de s'écraser. */}
        <div className="min-w-40 flex-1 sm:max-w-xs">
          <SearchInput
            size="sm"
            value={query}
            onChange={setQuery}
            placeholder={t('toolbar.searchPlaceholder')}
            className="w-full"
            inputClassName="w-full lg:w-full"
          />
        </div>
        <button
          type="button"
          aria-expanded={moreOpen || maturities.size > 0}
          onClick={() => setMoreOpen(open => !open)}
          className="flex min-h-11 items-center gap-1 rounded-control border border-[var(--bellum-border)] px-3 text-sm font-medium text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-primary)]"
        >
          <Filter className="size-3.5 shrink-0" aria-hidden />
          {t('pistes.moreFilters')}
          <ChevronDown
            className={cn('size-3 transition-transform', moreOpen || maturities.size > 0 ? '' : '-rotate-90')}
            aria-hidden
          />
        </button>
      </div>
      {moreOpen || maturities.size > 0 ? (
        <FilterChips
          ariaLabel={t('pistes.maturityAria')}
          multiple
          options={MATURITY_LEVELS.filter(level => maturityCounts[level] > 0).map(level => ({
            value: level,
            label: t(`maturity.${level}.tab`),
            count: maturityCounts[level],
          }))}
          values={[...maturities]}
          onToggle={level => setMaturities(current => toggle(current, level))}
        />
      ) : null}

      {detections.data?.autoDetect === 'off' ? (
        <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
          {t('detections.autoDetectOff')}
        </Text>
      ) : null}

      <ResponsiveTable
        rows={visible}
        rowKey={row => row.key}
        className="rounded-card border border-[var(--bellum-border)] bg-card"
        scrollLabel={t('pistes.heading')}
        onRowClick={row => {
          if (row.kind === 'need') setSelectedAccountId(row.entry.accountId)
        }}
        empty={
          filtered ? (
            <SearchEmptyState
              title={t('emptyState.filteredTitle')}
              description={t('emptyState.filteredDescription')}
              action={
                <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={clearFilters}>
                  {t('emptyState.clearFilters')}
                </Button>
              }
            />
          ) : (
            <SearchEmptyState
              title={t('emptyState.noNeedTitle')}
              description={t('emptyState.noNeedDescription')}
              action={
                <Box display="flex" className="flex-wrap justify-center gap-2">
                  <DiscoverAction />
                  <ImportNeedsAction />
                </Box>
              }
            />
          )
        }
        columns={[
          {
            key: 'piste',
            header: t('pistes.columns.piste'),
            mobile: 'title',
            render: row => (
              <span className="block min-w-0 break-words text-sm font-semibold text-[var(--bellum-text-primary)]">
                {row.kind === 'detection' ? row.detection.label : row.need.label}
              </span>
            ),
          },
          {
            key: 'account',
            header: t('pistes.columns.account'),
            mobile: 'meta',
            className: 'whitespace-nowrap',
            render: row => row.companyName,
          },
          {
            key: 'origin',
            header: t('pistes.columns.origin'),
            render: row => <PisteOrigin row={row} />,
          },
          {
            key: 'gaps',
            header: t('pistes.columns.gaps'),
            render: row => <PisteGaps gaps={row.gaps} />,
          },
          {
            key: 'action',
            header: t('pistes.columns.action'),
            className: 'w-px whitespace-nowrap text-right',
            render: row =>
              row.kind === 'detection' ? (
                <Box display="flex" className="flex-wrap justify-end gap-1">
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11"
                    disabled={pending}
                    onClick={() => confirm.mutate(row.detection.id)}
                  >
                    {t(`detections.confirm.${row.detection.kind}`)}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11"
                    disabled={pending}
                    onClick={() => dismiss.mutate(row.detection.id)}
                  >
                    {t('detections.dismiss')}
                  </Button>
                </Box>
              ) : row.gaps.length === 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  onClick={() => setDraftFor({ accountId: row.entry.accountId, need: row.need })}
                >
                  {t('pistes.createProject')}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  aria-label={t('pistes.qualifyAria', { label: row.need.label, company: row.companyName })}
                  onClick={() => setSelectedAccountId(row.entry.accountId)}
                >
                  {t('pistes.qualify')}
                </Button>
              ),
          },
        ]}
      />

      {selectedEntry ? (
        <Suspense fallback={null}>
          <NeedsAccountSheet
            entry={selectedEntry}
            open
            onOpenChange={open => {
              if (!open) setSelectedAccountId(undefined)
            }}
            onOpenAccount={onOpenAccount}
          />
        </Suspense>
      ) : null}

      {/* « Créer l'affaire » sur une piste complète : un BROUILLON renseigné de ce que la piste sait
          (#3683.2) — c'est la validation d'une personne qui crée l'affaire, jamais le clic seul. */}
      {draftFor ? (
        <CreateProjectDialog
          open
          onOpenChange={open => {
            if (!open) setDraftFor(undefined)
          }}
          accountId={draftFor.accountId}
          draft={{
            label: draftFor.need.label,
            objective: draftFor.need.offer,
            detail: draftFor.need.detail ?? draftFor.need.label,
            facts: [],
            missing: ['amount', 'closeOn', 'owner', 'contact'],
          }}
        />
      ) : null}
    </div>
  )
}

function PisteOrigin({ row }: { row: PisteRow }) {
  const { t } = useTranslation('projects')
  if (row.kind === 'need') {
    const stage = needStage(row.need.kind)
    return (
      <span className="text-sm text-[var(--bellum-text-primary)]" title={t(`stages.${stage}.help`)}>
        {t(`stages.${stage}.label`)}
        {row.need.timeframe ? <span className="text-[var(--bellum-text-muted)]"> · {row.need.timeframe}</span> : null}
      </span>
    )
  }
  const item = row.detection
  return (
    <span className="flex flex-col items-start gap-1 text-sm">
      <span className="text-[var(--bellum-text-primary)]">{t(`detections.kind.${item.kind}`)}</span>
      {/* #4016.L6.a — le lien vers l'appel qui a fait naître la ligne, dans l'historique du compte.
          Sans appel retrouvé : AUCUN lien, jamais un lien mort. */}
      {item.sourceCallId ? (
        <Link
          to="/accounts/$id"
          params={{ id: item.accountId }}
          search={{ tab: 'history' }}
          hash={`activity-${item.sourceCallId}`}
          className="text-xs text-[var(--bellum-text-accent)] underline pointer-coarse:min-h-11"
        >
          {t('detections.openSourceCall')}
        </Link>
      ) : null}
      {item.kind === 'interview_to_mission' ? (
        <span className="text-xs text-[var(--bellum-text-muted)]">
          {t('detections.missionNeedsAgreement')}{' '}
          {item.submissionId ? (
            <Link to="/submissions/$id" params={{ id: item.submissionId }} className="underline">
              {t('detections.openSubmission')}
            </Link>
          ) : null}
        </span>
      ) : null}
    </span>
  )
}

function PisteGaps({ gaps }: { gaps: PisteGap[] }) {
  const { t } = useTranslation('projects')
  if (gaps.length === 0) return <Badge variant="success">{t('pistes.gaps.none')}</Badge>
  return (
    <span className="flex flex-wrap gap-1">
      {gaps.map(gap => (
        <Badge key={gap} variant="warning">
          {t(`pistes.gaps.${gap}`)}
        </Badge>
      ))}
    </span>
  )
}
