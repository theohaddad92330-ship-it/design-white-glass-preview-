import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, ListOrdered, Play } from 'lucide-react'
import { toast } from 'sonner'
import { useQueries } from '@tanstack/react-query'
import type { AnalysisBatch, AnalysisBatchInput } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { ActionPreview } from '@/components/ActionPreview'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { launchPlanQueryOptions } from '@/features/search/hooks/useLaunchPlan'
import { exactBatchAnalysisCost } from '@/features/discover/lib/discover-batch-analyze-cost'
import { Badge, Checkbox, Text } from '@bellum/ui'
import { ExportSheetButton } from '@/features/google/components/ExportSheetButton'
import { toCsv } from '@/lib/csv'
import { downloadCSV } from '@/lib/export-csv'
import { useDataExit } from '@/lib/data-exit'
import { renderInlineMarkdown } from '../markdown'
import { ReplyCodeBadge } from '../ReplyBadges'
import { useReplyFollowUp } from '../reply-follow-up'
import { AccountLogo } from './AccountLogo'
import { RevealOutsidePeople } from './RevealOutsidePeople'
import { rankingExportTable } from './rankingExportTable'
import { rankingBatchItems, type LauraFraming } from './rankingBatchItems'
import { AnalysisFraming } from './AnalysisFraming'
import {
  CardLink,
  InlineLabel,
  ItemName,
  LabeledLines,
  NotEvaluated,
  ReplyCard,
  SourceBadge,
  TopThenRest,
  type BlockOf,
} from './ReplyCard'

type RankedAccount = BlockOf<'account_ranking'>['items'][number]
type IndexedAccount = { item: RankedAccount; originalIndex: number }
type SortMode = 'rank' | 'name'

/**
 * #1914.3 — un classement de comptes.
 *
 * L'ORDRE est la donnée, jamais un chiffre : aucun score ne s'affiche, les AXES
 * qui ordonnent la liste sont écrits en tête, et ce qui n'a pas pu être évalué
 * est nommé — pour la liste comme pour chaque compte. « Un score n'est jamais
 * nu » vaut d'autant plus pour un rang, qui se lit comme un verdict.
 *
 * #2945/#2299.36-.39 — TRIER, FILTRER, SÉLECTIONNER, ENREGISTRER, dans CETTE
 * carte. Première tranche de l'épopée #2945 : le tri/filtre/sélection reste
 * LOCAL à ce bloc (pas d'état partagé entre `account_ranking`/`contact_list`/
 * `consultant_shortlist` — ce chantier plus large reste à faire, voir le
 * commentaire d'épopée). Trier ne réordonne jamais silencieusement le VERDICT
 * de Laura : le tri par défaut reste SON ordre (`rank`), et « Nom (A→Z) » est un
 * second ordre explicitement nommé, jamais confondu avec un classement recalculé.
 * Enregistrer réutilise EXACTEMENT le mécanisme déjà gardé de `FileExportCard`
 * (`toCsv` + `downloadCSV` + `useDataExit`, garde
 * `a-csv-leaves-only-through-the-workspace-rule`) : aucune donnée n'est
 * inventée, seuls les champs déjà affichés partent dans le fichier.
 */
export function AccountRankingCard({ block }: { block: BlockOf<'account_ranking'> }) {
  const { t } = useTranslation('chat')
  const { allowed, grant } = useDataExit()
  const [filterText, setFilterText] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('rank')
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())

  const indexed = useMemo<IndexedAccount[]>(
    () => block.items.map((item, originalIndex) => ({ item, originalIndex })),
    [block.items],
  )

  const query = filterText.trim().toLowerCase()
  const filtered = query ? indexed.filter(({ item }) => item.name.toLowerCase().includes(query)) : indexed
  const shown = useMemo(
    () =>
      sortMode === 'name'
        ? [...filtered].sort((a, b) => a.item.name.localeCompare(b.item.name, undefined, { sensitivity: 'base' }))
        : filtered,
    [filtered, sortMode],
  )

  const toggleSelected = (originalIndex: number) =>
    setSelected(current => {
      const next = new Set(current)
      if (next.has(originalIndex)) next.delete(originalIndex)
      else next.add(originalIndex)
      return next
    })

  // #4269.1 (18/10) — cocher N comptes puis « Analyser la sélection » dépose UN lot de N analyses
  // (`POST /analysis-batches`, source `laura` : la liste est proposée par le copilote) — avant,
  // la case ne servait qu'à l'export et rien ne partait. Retour visible dans les deux cas.
  const [launching, setLaunching] = useState(false)
  const selectedNames = indexed.filter(({ originalIndex }) => selected.has(originalIndex)).map(({ item }) => item.name)
  // GA-86 — le coût EXACT s'annonce avant le clic (même devis que Découvrir et la liste des comptes :
  // `GET /analysis/launch-plan`, jamais un prix de grille recalculé). Non mesuré = lancement bloqué.
  const isDemo = useIsDemo()
  const launchPlans = useQueries({
    queries: selectedNames.map(name => ({
      ...launchPlanQueryOptions(name),
      enabled: !isDemo,
      retry: false,
      staleTime: 0,
    })),
  })
  const cost = exactBatchAnalysisCost({ isDemo, plans: launchPlans.map(query => query.data ?? null) })
  // #4642 — depuis une carte « Comptes où placer X », le clic ouvre d'abord le CADRAGE (prérempli, modifiable) ;
  // sans contexte de demande sur la carte, le lancement est direct, comme avant.
  const [framingOpen, setFramingOpen] = useState(false)
  const context = block.talent_context
  const framingSeed = context
    ? { talentId: context.talent_id, talentName: context.talent_name, skills: context.skills ?? [], zone: context.zone }
    : undefined
  const selectedOffers = new Map(
    indexed
      .filter(({ originalIndex }) => selected.has(originalIndex))
      .flatMap(({ item }) => (item.offers?.length ? [[item.name, item.offers] as const] : [])),
  )
  const offerCount = [...selectedOffers.values()].reduce((total, offers) => total + offers.length, 0)
  const launch = async (framing?: LauraFraming) => {
    // #4432.3 — la zone de la recherche voyage avec chaque nom : elle devient le périmètre du dossier.
    const items = rankingBatchItems(selectedNames, block.search_zone, framing)
    if (items.length === 0 || launching || !cost.measured) return
    setLaunching(true)
    try {
      await apiFetch<AnalysisBatch, { source: 'laura'; items: AnalysisBatchInput[] }>({
        path: '/analysis-batches',
        method: 'POST',
        body: { source: 'laura', items },
      })
      toast.success(t('blocks.resultsToolbar.analyzeLaunched', { count: items.length }))
      setSelected(new Set())
      setFramingOpen(false)
    } catch {
      toast.error(t('blocks.resultsToolbar.analyzeFailed', { count: items.length }))
    } finally {
      setLaunching(false)
    }
  }
  const analyzeSelection = () => (framingSeed ? setFramingOpen(true) : launch())

  const selectedItems = indexed.filter(({ originalIndex }) => selected.has(originalIndex)).map(({ item }) => item)

  return (
    <ReplyCard type={block.type} title={block.title ?? t('blocks.kind.account_ranking')} icon={ListOrdered}>
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('blocks.rankedBy')} {block.axes.join(' · ')}
      </Text>
      {/* #4748 — le nombre de comptes que le bloc PORTE, écrit une fois : c'est le seul chiffre de la carte. */}
      {block.items.length > 1 ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('blocks.listCount', { count: block.items.length })}
        </Text>
      ) : null}
      {block.items.length > 1 ? (
        <ResultsToolbar
          filterText={filterText}
          onFilterChange={setFilterText}
          sortMode={sortMode}
          onSortChange={setSortMode}
          selectedCount={selected.size}
          exportAllCount={shown.length}
          onAnalyze={selected.size > 0 && !launching && cost.measured ? analyzeSelection : undefined}
          sheetTable={selectedItems.length > 0 ? rankingExportTable(selectedItems, block.axes, t) : undefined}
          sheetTitle={block.title ?? t('blocks.kind.account_ranking')}
          // #4292.15 — sans rien cocher, « Exporter en CSV » envoie les comptes AFFICHÉS (filtre compris).
          onExportAll={
            allowed && grant && selectedItems.length === 0 && shown.length > 0
              ? () =>
                  downloadCSV(
                    accountSelectionCsv(
                      shown.map(({ item }) => item),
                      block.axes,
                      t,
                    ),
                    accountRankingFilename(),
                    grant,
                  )
              : undefined
          }
          onExport={
            allowed && grant && selectedItems.length > 0
              ? () => downloadCSV(accountSelectionCsv(selectedItems, block.axes, t), accountSelectionFilename(), grant)
              : undefined
          }
        />
      ) : null}
      {framingOpen && framingSeed && selected.size > 0 ? (
        <AnalysisFraming
          seed={framingSeed}
          offerCount={offerCount}
          launching={launching}
          onCancel={() => setFramingOpen(false)}
          onLaunch={({ withOffers, ...framing }) =>
            void launch({ ...framing, ...(withOffers ? { offers: selectedOffers } : {}) })
          }
        />
      ) : null}
      {selected.size > 0 ? (
        <ActionPreview
          title={t('blocks.resultsToolbar.previewTitle')}
          rows={
            cost.measured
              ? [
                  {
                    label: t('blocks.resultsToolbar.previewCountLabel'),
                    value: cost.demo
                      ? t('blocks.resultsToolbar.costDemo')
                      : t('blocks.resultsToolbar.countAnnounce', { count: selected.size }),
                  },
                  ...(cost.alreadyAnalyzed > 0
                    ? [
                        {
                          label: t('blocks.resultsToolbar.alreadyAnalyzedLabel'),
                          value: t('blocks.resultsToolbar.alreadyAnalyzed', { count: cost.alreadyAnalyzed }),
                        },
                      ]
                    : []),
                ]
              : [
                  {
                    label: t('blocks.resultsToolbar.previewCountLabel'),
                    value: t('blocks.resultsToolbar.costUnmeasured'),
                  },
                ]
          }
        />
      ) : null}
      {shown.length > 0 ? (
        <TopThenRest
          columns
          announceCount
          items={shown}
          renderItem={({ item, originalIndex }, index) => (
            <RankedAccountRow
              item={item}
              rank={index + 1}
              selected={selected.has(originalIndex)}
              onToggleSelected={() => toggleSelected(originalIndex)}
            />
          )}
        />
      ) : (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {t('blocks.resultsToolbar.noMatches', { query: filterText.trim() })}
        </Text>
      )}
      <NotEvaluated items={block.not_evaluated} />
    </ReplyCard>
  )
}

/** Ce que le fichier exporté porte — les FAITS du classement (#4073.5), voir `rankingExportTable`. */
function accountSelectionCsv(
  items: readonly RankedAccount[],
  axes: readonly string[],
  t: (key: string) => string,
): string {
  const { columns, rows } = rankingExportTable(items, axes, t)
  return toCsv([columns, ...rows])
}

function accountRankingFilename(): string {
  return `classement-${new Date().toISOString().slice(0, 10)}.csv`
}

function accountSelectionFilename(): string {
  return `comptes-selection-${new Date().toISOString().slice(0, 10)}.csv`
}

function ResultsToolbar({
  filterText,
  onFilterChange,
  sortMode,
  onSortChange,
  selectedCount,
  exportAllCount,
  onExport,
  onExportAll,
  onAnalyze,
  sheetTable,
  sheetTitle,
}: {
  filterText: string
  onFilterChange: (value: string) => void
  sortMode: SortMode
  onSortChange: (mode: SortMode) => void
  selectedCount: number
  /** #4748 — combien de comptes partent dans le CSV « tout » : le libellé le dit, l'export partiel est un choix. */
  exportAllCount: number
  onExport?: () => void
  /** #4292.15 — exporte tout ce qui est affiché quand rien n'est coché. */
  onExportAll?: () => void
  /** #4269.1 — lance l'analyse des comptes cochés ; absent = rien de coché. */
  onAnalyze?: () => void
  /** #4073.5 — la même table que le CSV, vers une feuille Google (masquée sous la règle de sortie de données). */
  sheetTable?: { columns: string[]; rows: string[][] }
  sheetTitle: string
}) {
  const { t } = useTranslation('chat')
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--bellum-border)] pb-2">
      <input
        type="text"
        value={filterText}
        onChange={event => onFilterChange(event.target.value)}
        placeholder={t('blocks.resultsToolbar.filterPlaceholder')}
        aria-label={t('blocks.resultsToolbar.filterAria')}
        className="h-8 min-w-0 flex-1 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-2 text-xs text-[var(--bellum-text-primary)] placeholder:text-[var(--bellum-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--bellum-primary-500)]"
      />
      <div className="flex items-center gap-1" role="group" aria-label={t('blocks.resultsToolbar.sortAria')}>
        <SortButton active={sortMode === 'rank'} onClick={() => onSortChange('rank')}>
          {t('blocks.resultsToolbar.sortByRank')}
        </SortButton>
        <SortButton active={sortMode === 'name'} onClick={() => onSortChange('name')}>
          {t('blocks.resultsToolbar.sortByName')}
        </SortButton>
      </div>
      {selectedCount > 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('blocks.resultsToolbar.selectedCount', { count: selectedCount })}
        </Text>
      ) : null}
      {onAnalyze ? (
        <button
          type="button"
          onClick={onAnalyze}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--bellum-border)] px-2 text-xs font-medium text-[var(--bellum-text-accent)] hover:bg-[var(--bellum-surface-2)] pointer-coarse:min-h-11"
        >
          <Play className="size-3.5" aria-hidden />
          {t('blocks.resultsToolbar.analyzeSelection')}
        </button>
      ) : null}
      {onExport ? (
        <button
          type="button"
          onClick={onExport}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--bellum-border)] px-2 text-xs font-medium text-[var(--bellum-text-accent)] hover:bg-[var(--bellum-surface-2)] pointer-coarse:min-h-11"
        >
          <Download className="size-3.5" aria-hidden />
          {t('blocks.resultsToolbar.exportSelection', { count: selectedCount })}
        </button>
      ) : null}
      {onExportAll ? (
        <button
          type="button"
          onClick={onExportAll}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--bellum-border)] px-2 text-xs font-medium text-[var(--bellum-text-accent)] hover:bg-[var(--bellum-surface-2)] pointer-coarse:min-h-11"
        >
          <Download className="size-3.5" aria-hidden />
          {t('blocks.resultsToolbar.exportAll', { count: exportAllCount })}
        </button>
      ) : null}
      {sheetTable ? <ExportSheetButton table={sheetTable} title={sheetTitle} variant="ghost" /> : null}
    </div>
  )
}

/** #3704.2 — recette prod 06/10 : « déjà dans ton espace » / « nouvelle cible », nommées sur
 *  la ligne elle-même. `undefined` = non vérifié pour cette ligne : aucun badge, jamais devinée. */
function MembershipBadge({ alreadyInWorkspace }: { alreadyInWorkspace?: boolean }) {
  const { t } = useTranslation('chat')
  if (alreadyInWorkspace === undefined) return null
  return (
    <Badge variant={alreadyInWorkspace ? 'outline' : 'info'}>
      {t(alreadyInWorkspace ? 'blocks.alreadyInWorkspace' : 'blocks.newTarget')}
    </Badge>
  )
}

function SortButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        'rounded-md border px-2 text-xs font-medium pointer-coarse:min-h-11 ' +
        (active
          ? 'border-[var(--bellum-primary-400)] bg-[var(--bellum-primary-400)] text-white'
          : 'border-[var(--bellum-border)] text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)]')
      }
    >
      {children}
    </button>
  )
}

function RankedAccountRow({
  item,
  rank,
  selected,
  onToggleSelected,
}: {
  item: RankedAccount
  rank: number
  selected: boolean
  onToggleSelected: () => void
}) {
  const { t } = useTranslation('chat')
  return (
    <article className="flex h-full min-w-0 flex-col gap-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3">
      <div className="flex min-w-0 items-start gap-2">
        {/* #4288.6 — la CIBLE est un vrai bloc de 44 × 44 px (mesurable, vue par la garde) ; la case reste petite
            dedans. Les marges négatives rendent à la ligne sa place d'avant (-ml/-mr/-mt = le surplus de la cible). */}
        <label className="-ml-3.5 -mr-2 -mt-1.5 flex size-11 shrink-0 cursor-pointer items-center justify-center">
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelected()}
            aria-label={t('blocks.resultsToolbar.selectAria', { name: item.name })}
          />
        </label>
        <span aria-hidden className="mt-2 w-4 shrink-0 text-xs font-semibold text-[var(--bellum-text-muted)]">
          {rank}
        </span>
        <AccountLogo name={item.name} href={item.href} twoLetters={item.why?.some(w => ACCESS_CLASS_LINE.test(w))} />
        <div className="min-w-0 flex-1 space-y-1">
          <ItemName name={item.name} href={item.href} />
          <div className="flex flex-wrap items-center gap-1.5">
            {/* #3764 (lot L1 07/10) — le niveau dérivé par le serveur de la catégorie de l'outil ; absent = rien. */}
            {item.level ? <ReplyCodeBadge code={item.level} /> : null}
            {/* #3704.2 — « déjà dans ton espace » vs « nouvelle cible » : calculé côté serveur
                (rapprochement SIREN), jamais deviné ici ; absent = appartenance non vérifiée. */}
            <MembershipBadge alreadyInWorkspace={item.already_in_workspace} />
          </div>
          {/* #4432.3 — le palier de zone d'un compte élargi (« à 38 km de Toulouse »), posé par le serveur. */}
          {item.zone_label ? (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {item.zone_label}
            </Text>
          ) : null}
        </div>
      </div>
      {item.verdict ? (
        <Text size="sm" color="text-[var(--bellum-text-primary)]">
          {renderInlineMarkdown(item.verdict)}
        </Text>
      ) : null}
      <LabeledLines label={t('blocks.why')} lines={item.why} />
      {item.why_now ? <InlineLabel label={t('blocks.whyNow')}>{renderInlineMarkdown(item.why_now)}</InlineLabel> : null}
      <LabeledLines label={t('blocks.limits')} lines={item.limits} />
      <NotEvaluated items={item.not_evaluated} />
      {/* Le prochain geste, mis en évidence : c'est ce que le commercial fait ensuite. */}
      {item.action ? (
        <div className="rounded-lg bg-[var(--accent-soft-bg)] px-3 py-2">
          <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--accent-soft-text)]">
            {t('blocks.nextGesture')}
          </span>
          <span className="text-sm font-medium text-[var(--bellum-text-primary)]">
            <CardLink href={item.action.href}>{item.action.label}</CardLink>
          </span>
        </div>
      ) : null}
      <FollowUps items={item.follow_ups} />
      {/* #4421.15 — les personnes trouvées hors de l'espace, révélables au clic (posées par le serveur). */}
      {item.reveal ? <RevealOutsidePeople companyName={item.name} reveal={item.reveal} /> : null}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
        {item.href ? <CardLink href={item.href}>{t('blocks.seeAccount')}</CardLink> : null}
        <SourceBadge source={item.source} />
      </div>
    </article>
  )
}

/**
 * #3816.2 — les SUITES depuis ce compte (lancer l'analyse, voir les contacts, préparer le
 * message). Cliquer envoie `ask` — la phrase complète, qui porte le profil — à Laura, par le
 * même geste que les actions d'une cartographie (`useReplyFollowUp`) : le commercial ne
 * ressaisit rien, et rien ne part chez un tiers (Laura prépare, le commercial envoie).
 * Sans fil actif (fil relu, partagé), le libellé reste du texte : jamais un bouton qui ne fait rien.
 */
// #5013 — une ligne « Classe d'accès B — … » : la pastille ne montre alors jamais une lettre seule (lue comme classe).
const ACCESS_CLASS_LINE = /^\s*classe(\s+d['’]accès)?\s+[A-D]\b/i

export function FollowUps({ items }: { items: RankedAccount['follow_ups'] }) {
  const { t } = useTranslation('chat')
  const followUp = useReplyFollowUp()
  if (!items?.length) return null
  return (
    <div role="group" aria-label={t('blocks.followUps')} className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
      {items.map(item =>
        followUp ? (
          <button
            key={item.label}
            type="button"
            onClick={() => (item.talent_id ? followUp(item.ask, { talentId: item.talent_id }) : followUp(item.ask))}
            className="text-sm font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline pointer-coarse:min-h-11"
          >
            {item.label}
          </button>
        ) : (
          <span key={item.label} className="text-sm font-medium text-[var(--bellum-text-secondary)]">
            {item.label}
          </span>
        ),
      )}
    </div>
  )
}
