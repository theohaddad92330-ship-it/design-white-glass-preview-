import { useId, useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import {
  ANALYSIS_BATCH_MAX_ITEMS,
  type AnalysisBatch,
  type AnalysisBatchPreview,
  type LauraContextMode,
} from '@bellum/contracts'
import { Badge, Box, Button, Card, FilterChips, Text, cn } from '@bellum/ui'
import { ActionPreview } from '@/components/ActionPreview'
import { LibraryTitle, QuietCard } from '@/components/page/LibrarySection'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { apiFetch } from '@/lib/api'
import { formatDateTime } from '@/lib/locale'
import { useCreditGate } from '@/features/credits/hooks/useCreditGate'
import { SoftBrake } from '@/features/credits/components/SoftBrake'
import { SurfaceContextChip } from '@/features/context-contract/view/SurfaceContextChip'
import { useTargetLists } from '@/features/target-lists/api'
import { useAnalysisBatchMutations, useAnalysisBatches, type BatchBody } from '../api'
import { batchItemTone, batchStatusTone } from '../lib/batch-tones'
import { parseBatchInput } from '../lib/parse-batch-input'
import {
  analysisBatchSourceFromTargetList,
  itemsFromTargetList,
  targetListsWithAccounts,
} from '../lib/target-list-batch-input'

/** #2809 (#2293.3) — les DEUX façons d'entrer une liste : collée à la main,
 *  ou reprise d'une liste cible déjà là (elle-même née manuellement, d'un
 *  import ou d'une proposition de Laura — voir `target-list-batch-input.ts`). */
type BatchSourceMode = 'paste' | 'target_list'

/**
 * #2293.2 / .3 / .4 — ANALYSER UNE LISTE D'ENTREPRISES EN UN GESTE.
 *
 * Collée (noms ou SIREN) OU reprise d'une liste cible existante, la liste
 * passe d'abord par la PRÉVIEW — entités résolues, ambiguïtés, doublons, déjà
 * analysées, analyses neuves, coût EXACT, limite, parallélisme, durée non
 * annoncée —, puis UN clic lance le lot : un parent, un sous-job par
 * entreprise (`/analysis-batches`). Rien ne part, rien n'est débité avant ce clic.
 *
 * `initialNames` (#2157.43, épopée #2962) — un appelant (« Analyser les
 * comptes » depuis une cible) pré-remplit la saisie avec des noms déjà
 * connus ; l'utilisateur garde la main, RIEN ne se lance sans son clic sur
 * « Prévisualiser » puis « Lancer ».
 */
export function NewAnalysisBatch({ initialNames }: { initialNames?: string[] }) {
  const { t } = useTranslation('discover')
  const navigate = useNavigate()
  const gate = useCreditGate()
  const { preview, invalidate } = useAnalysisBatchMutations()
  // #2293.5 — le SEUL geste qui crée le lot, donc qui débite : il vit ici, à
  // côté de la préview qui annonce son coût (GA-86), jamais dans un hook partagé.
  const create = useMutation({
    mutationFn: (body: BatchBody) =>
      apiFetch<AnalysisBatch, BatchBody>({ path: '/analysis-batches', method: 'POST', body }),
    onSuccess: invalidate,
  })
  const recent = useAnalysisBatches()
  const [text, setText] = useState(() => (initialNames && initialNames.length > 0 ? initialNames.join('\n') : ''))
  const [shown, setShown] = useState<AnalysisBatchPreview | null>(null)
  // #2922 — UN choix pour tout le lot ; absent = défaut de l'espace, comme un
  // lancement unitaire sans mode (`useAnalysis`, `Search.tsx`).
  const [contextMode, setContextMode] = useState<LauraContextMode | undefined>(undefined)

  // #2809 (#2293.3) — le sélecteur de source : « coller » reste le défaut
  // (comportement inchangé), « depuis une liste cible » branche les TROIS
  // sources jusqu'ici sans écran dédié (target_list / import / laura) sur les
  // listes cibles RÉELLES de l'espace (`useTargetLists`, déjà utilisé par
  // `AddToTargetListDialog.tsx` — jamais une seconde lecture du même appel).
  const [sourceMode, setSourceMode] = useState<BatchSourceMode>('paste')
  const targetLists = useTargetLists()
  const eligibleTargetLists = useMemo(() => targetListsWithAccounts(targetLists.data ?? []), [targetLists.data])
  const [selectedListId, setSelectedListId] = useState<string>('')
  const targetListSelectId = useId()
  const headingId = useId()
  const selectedList = eligibleTargetLists.find(list => list.id === selectedListId) ?? null

  const pasteParsed = parseBatchInput(text)
  const targetListParsed = selectedList
    ? { source: analysisBatchSourceFromTargetList(selectedList), ...itemsFromTargetList(selectedList) }
    : { source: 'target_list' as const, items: [], overLimit: 0 }
  const parsed = sourceMode === 'paste' ? pasteParsed : targetListParsed
  const canPreview = parsed.items.length > 0 && !preview.isPending

  const insufficient = shown !== null && gate.known && !gate.canAnalyze && !gate.locked
  const canLaunch = shown !== null && shown.items.length > 0 && !gate.locked && !insufficient && !create.isPending

  const runPreview = () => {
    if (!canPreview) return
    setShown(null)
    preview.mutate({ source: parsed.source, items: parsed.items }, { onSuccess: setShown })
  }

  const launch = () => {
    if (!canLaunch || !shown) return
    // Les entités que la préview a DÉJÀ résolues repartent avec leur SIREN : le
    // serveur ne refait pas la recherche au registre (50 noms = 50 recherches),
    // et le lot lancé est exactement celui que la préview a montré.
    const items = shown.items.map(item => (item.siren ? { name: item.name, siren: item.siren } : { name: item.name }))
    create.mutate(
      { source: parsed.source, items, ...(contextMode ? { context_mode: contextMode } : {}) },
      {
        onSuccess: batch => void navigate({ to: '/discover/lots/$batchId', params: { batchId: batch.id } }),
      },
    )
  }

  const pastedCount = pasteParsed.items.length
  const lots = recent.data ?? []

  return (
    <Box display="flex" className="mx-auto w-full max-w-6xl flex-col gap-8 px-4">
      {/* Refonte Théo (PR12) — la grille « bibliothèque » de Découvrir : la liste à
          gauche (1,8 fr), ce que le lot fera à droite (1 fr) ; une colonne sous 1024 px. */}
      <Box className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)]">
        <section aria-labelledby={`${headingId}-list`} className="flex min-w-0 flex-col gap-4">
          <LibraryTitle
            id={`${headingId}-list`}
            title={t('batches.listTitle')}
            aside={
              /* #2809 (#2293.3) — le sélecteur de source : deux boutons, jamais un
                 troisième moteur. « Depuis une liste cible » réutilise le MÊME
                 formulaire de préview/lancement — seule l'ORIGINE des `items` change. */
              <FilterChips<BatchSourceMode>
                ariaLabel={t('batches.sourceModeLabel')}
                value={sourceMode}
                onChange={next => {
                  if (!next) return
                  setSourceMode(next)
                  setShown(null)
                }}
                options={[
                  { value: 'paste', label: t('batches.sourceModePaste') },
                  { value: 'target_list', label: t('batches.sourceModeTargetList') },
                ]}
              />
            }
          />
          <Card className="gap-4 p-5 sm:p-6">
            {/* #2922 — ce que CHAQUE analyse du lot LIRA (profil versionné, CRM
                branché ou proposé) : le même contrat qu'Analyser, puisque le lot
                lance chaque entreprise par le MÊME chemin (`AnalysisService.start`).
                Le choix part avec le lancement (`create.mutate` ci-dessus). */}
            <SurfaceContextChip surface="analysis_batch" mode={contextMode} onModeChange={setContextMode} />

            {sourceMode === 'paste' ? (
              <label className="flex flex-col gap-2">
                <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
                  {t('batches.inputLabel')}
                </Text>
                <textarea
                  className="min-h-48 w-full resize-y rounded-control border border-[var(--bellum-border)] bg-card px-3 py-2.5 text-sm leading-6 text-[var(--bellum-text-primary)] focus-visible:border-[var(--bellum-text-accent)] focus-visible:outline-none"
                  placeholder={t('batches.inputPlaceholder')}
                  value={text}
                  onChange={event => {
                    setText(event.target.value)
                    setShown(null)
                  }}
                />
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {pastedCount > 0
                    ? t('batches.inputCounter', { count: pastedCount, max: ANALYSIS_BATCH_MAX_ITEMS })
                    : t('batches.inputHint', { max: ANALYSIS_BATCH_MAX_ITEMS })}
                </Text>
              </label>
            ) : (
              <fieldset className="flex flex-col gap-2">
                <legend className="pb-2">
                  <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
                    {t('batches.targetListLabel')}
                  </Text>
                </legend>
                {targetLists.isLoading ? (
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('batches.targetListLoading')}
                  </Text>
                ) : eligibleTargetLists.length === 0 ? (
                  <QuietCard title={t('batches.targetListEmptyTitle')}>{t('batches.targetListEmpty')}</QuietCard>
                ) : (
                  <Box display="flex" className="flex-col gap-2">
                    {eligibleTargetLists.map(list => {
                      const companies = itemsFromTargetList(list)
                      const checked = list.id === selectedListId
                      return (
                        <label
                          key={list.id}
                          className={cn(
                            'flex min-h-11 cursor-pointer items-center gap-3 rounded-control border px-3 py-2.5 duration-immediate ease-bellum-out',
                            checked
                              ? 'border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)]'
                              : 'border-[var(--bellum-border)] hover:bg-[var(--bellum-surface-2)]',
                          )}
                        >
                          <input
                            type="radio"
                            name={targetListSelectId}
                            value={list.id}
                            checked={checked}
                            onChange={() => {
                              setSelectedListId(list.id)
                              setShown(null)
                            }}
                            className="size-4 shrink-0 accent-[var(--bellum-text-accent)]"
                          />
                          <span className="flex min-w-0 flex-col">
                            <Text size="sm" weight="medium" className="truncate">
                              {list.name}
                            </Text>
                            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                              {t('batches.recentCompanies', { count: companies.items.length + companies.overLimit })}
                            </Text>
                          </span>
                        </label>
                      )
                    })}
                    <Text size="xs" className="text-[var(--bellum-text-muted)]">
                      {t('batches.targetListHint')}
                    </Text>
                  </Box>
                )}
              </fieldset>
            )}
            {parsed.overLimit > 0 && (
              <Text size="xs" className="text-[var(--danger-soft-text)]">
                {t('batches.overLimit', { count: parsed.overLimit, max: parsed.items.length })}
              </Text>
            )}
            <Box display="flex" className="flex-wrap gap-2">
              <Button variant="outline" className="min-h-11" disabled={!canPreview} onClick={runPreview}>
                {t('batches.previewAction')}
              </Button>
            </Box>
            {preview.isError && (
              <Text size="xs" className="text-[var(--danger-soft-text)]">
                {t('batches.previewFailed')}
              </Text>
            )}
          </Card>

          {shown && shown.items.length > 0 && (
            <section aria-labelledby={`${headingId}-items`} className="flex flex-col gap-3">
              <LibraryTitle
                id={`${headingId}-items`}
                title={t('batches.itemsTitle')}
                aside={t('batches.recentCompanies', { count: shown.items.length })}
              />
              {/* Le tableau COMMUN du produit : une ligne par entreprise, son état en pastille teintée. */}
              <Card className="p-2 sm:p-3">
                <ResponsiveTable
                  rows={shown.items}
                  rowKey={item => `${item.siren ?? ''}-${item.name}`}
                  scrollLabel={t('batches.itemsTitle')}
                  dense
                  columns={[
                    {
                      key: 'name',
                      header: t('batches.companyColumn'),
                      mobile: 'title',
                      render: item => (
                        <Text size="sm" weight="medium">
                          {item.name}
                        </Text>
                      ),
                    },
                    {
                      key: 'siren',
                      header: 'SIREN',
                      mobile: 'meta',
                      render: item =>
                        item.siren ? (
                          <Text size="xs" className="font-mono text-[var(--bellum-text-secondary)]">
                            {item.siren}
                          </Text>
                        ) : null,
                    },
                    {
                      key: 'state',
                      header: t('batches.stateColumn'),
                      render: item => (
                        <Badge variant={batchItemTone(item.resolution)}>{t(`batches.state.${item.resolution}`)}</Badge>
                      ),
                    },
                  ]}
                />
              </Card>
            </section>
          )}
        </section>

        <aside aria-labelledby={`${headingId}-quote`} className="flex min-w-0 flex-col gap-4">
          <LibraryTitle id={`${headingId}-quote`} title={t('batches.previewTitle')} />
          {shown ? (
            <Card className="gap-4 p-5">
              <ActionPreview title={t('batches.previewTitle')} rows={previewRows(shown, t)} />
              {insufficient ? <SoftBrake /> : null}
              {gate.locked && (
                <Text size="xs" className="text-[var(--danger-soft-text)]">
                  {t('analyzeDialog.locked')}
                </Text>
              )}
              <Button className="min-h-11 w-full" disabled={!canLaunch} onClick={launch}>
                {t('batches.launch')}
              </Button>
              {create.isError && (
                <Text size="xs" className="text-[var(--danger-soft-text)]">
                  {t('batches.launchFailed')}
                </Text>
              )}
            </Card>
          ) : (
            <QuietCard title={t('batches.quoteEmptyTitle')}>{t('batches.quoteEmpty')}</QuietCard>
          )}
        </aside>
      </Box>

      <section aria-labelledby={`${headingId}-recent`} className="flex flex-col gap-3">
        <LibraryTitle
          id={`${headingId}-recent`}
          title={t('batches.recentTitle')}
          aside={lots.length > 0 ? t('batches.recentCount', { count: lots.length }) : undefined}
        />
        {recent.isError ? (
          <Text size="sm" className="text-[var(--danger-soft-text)]">
            {t('batches.recentFailed')}
          </Text>
        ) : recent.data && lots.length === 0 ? (
          <QuietCard title={t('batches.recentEmptyTitle')}>{t('batches.recentEmpty')}</QuietCard>
        ) : lots.length > 0 ? (
          <Card className="p-2 sm:p-3">
            <ResponsiveTable
              rows={lots}
              rowKey={lot => lot.id}
              scrollLabel={t('batches.recentTitle')}
              dense
              onRowClick={lot => void navigate({ to: '/discover/lots/$batchId', params: { batchId: lot.id } })}
              columns={[
                {
                  key: 'lot',
                  header: t('batches.lotColumn'),
                  mobile: 'title',
                  render: lot => (
                    <Box display="flex" className="flex-col">
                      <Text size="sm" weight="medium">
                        {t(`batches.source.${lot.source}`)}
                      </Text>
                      <Text size="xs" className="text-[var(--bellum-text-muted)]">
                        {formatDateTime(lot.createdAt)}
                      </Text>
                    </Box>
                  ),
                },
                {
                  key: 'total',
                  header: t('batches.companiesColumn'),
                  mobile: 'meta',
                  className: 'text-right tabular-nums',
                  render: lot => (
                    <Text size="sm" className="tabular-nums">
                      {t('batches.recentCompanies', { count: lot.total })}
                    </Text>
                  ),
                },
                {
                  key: 'status',
                  header: t('batches.statusColumn'),
                  render: lot => (
                    <Badge variant={batchStatusTone(lot.status)}>{t(`batches.status.${lot.status}`)}</Badge>
                  ),
                },
                {
                  key: 'open',
                  header: t('batches.openColumn'),
                  mobile: 'meta',
                  className: 'w-px whitespace-nowrap text-right',
                  render: lot => (
                    <Link
                      to="/discover/lots/$batchId"
                      params={{ batchId: lot.id }}
                      aria-label={t('batches.openLot', {
                        source: t(`batches.source.${lot.source}`),
                        date: formatDateTime(lot.createdAt),
                      })}
                      className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
                    >
                      {t('batches.open')}
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  ),
                },
              ]}
            />
          </Card>
        ) : null}
      </section>
    </Box>
  )
}

/**
 * Les éléments de la préview (#2293.4). Une ligne à zéro ne s'affiche pas —
 * on n'affiche pas ce qu'on n'a pas —, sauf le coût, qui se dit toujours.
 */
function previewRows(
  preview: AnalysisBatchPreview,
  t: (key: string, options?: Record<string, unknown>) => string,
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  const count = (key: string, value: number) => {
    if (value > 0) rows.push({ label: t(`batches.preview.${key}`), value: String(value) })
  }
  count('resolved', preview.counts.resolved)
  count('toConfirm', preview.counts.toConfirm)
  count('duplicates', preview.duplicates)
  count('alreadyAnalyzed', preview.counts.alreadyAnalyzed)
  count('fresh', preview.counts.fresh)
  if (preview.counts.toConfirm > 0) {
    rows.push({
      label: t('batches.preview.actions'),
      value: t('batches.preview.actionsValue', { count: preview.counts.toConfirm }),
    })
  }
  // #4463 — le coût total n'est plus annoncé ; seule la démonstration le dit.
  if (preview.demo) rows.push({ label: t('batches.preview.demoLabel'), value: t('batches.preview.costDemo') })
  rows.push({ label: t('batches.preview.limit'), value: t('batches.preview.limitValue', { max: preview.maxItems }) })
  rows.push({
    label: t('batches.preview.parallel'),
    value: t('batches.preview.parallelValue', { count: preview.parallelRuns }),
  })
  rows.push({ label: t('batches.preview.duration'), value: t('batches.preview.durationValue') })
  return rows
}
