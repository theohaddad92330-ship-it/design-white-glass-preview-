import type { ProjectReadRow } from '@bellum/contracts'
import {
  Box,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Text,
  cn,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ChevronDown, Columns3, List, ListFilter } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'

/**
 * Refonte Théo C — la barre d'outils du Pipeline (`.bo11-toolbar`) : recherche · Responsable · État des
 * affaires · Filtres · Mes vues · Colonnes · Kanban/Liste. Chaque contrôle porte un état qui EXISTAIT déjà
 * dans `ProjectsPage` (les six filtres rapides #1328/#2170, la bascule de vue #1328, les onglets Archivés
 * #4137 et Perdus #3295) : la refonte change leur forme, jamais leur sens.
 */

/** L'état des affaires lu par le Pipeline (Théo `#sel-etat`). */
export type PipeState = 'all' | 'open' | 'won' | 'lost' | 'dormant' | 'archived'

const PIPE_STATES: readonly PipeState[] = ['all', 'open', 'won', 'lost', 'dormant', 'archived']

/** Les filtres rapides, dans l'ordre de la maquette (`#m-filters`). */
export type QuickFilter = 'mine' | 'withoutNextAction' | 'stale' | 'withoutProfile' | 'toSign' | 'interviewThisWeek'

const triggerClass =
  'h-9 gap-1.5 rounded-control border-[var(--bellum-border)] bg-card text-sm font-normal text-[var(--bellum-text-primary)] pointer-coarse:min-h-11'

/** « Responsable » — multi-sélection (décision Louis : multi partout). Vide = tous les responsables. */
export function PipelineOwnerFilter({
  members,
  selected,
  onChange,
}: {
  members: ReadonlyArray<{ id: string; name: string }>
  selected: readonly string[]
  onChange: (next: string[]) => void
}) {
  const { t } = useTranslation('projects')
  if (members.length === 0) return null
  const label =
    selected.length === 0
      ? t('pipeTheo.owner.all')
      : selected.length === 1
        ? (members.find(member => member.id === selected[0])?.name ?? t('pipeTheo.owner.some', { count: 1 }))
        : t('pipeTheo.owner.some', { count: selected.length })
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={triggerClass}
          aria-label={t('pipeTheo.owner.aria', { value: label })}
        >
          <span className="max-w-40 truncate">{label}</span>
          <ChevronDown className="size-4 text-[var(--bellum-text-muted)]" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[60dvh] min-w-56 overflow-y-auto">
        <DropdownMenuLabel>{t('pipeTheo.owner.label')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {members.map(member => (
          <DropdownMenuCheckboxItem
            key={member.id}
            checked={selected.includes(member.id)}
            onSelect={event => event.preventDefault()}
            onCheckedChange={checked =>
              onChange(checked ? [...selected, member.id] : selected.filter(id => id !== member.id))
            }
          >
            {member.name}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>{t('pipeTheo.owner.all')}</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** « État des affaires » — ouvertes, gagnées, perdues, en sommeil, archivées, tout le portefeuille. */
export function PipelineStateSelect({ value, onChange }: { value: PipeState; onChange: (next: PipeState) => void }) {
  const { t } = useTranslation('projects')
  const label = t(`pipeTheo.state.${value}`)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={triggerClass}
          aria-label={t('pipeTheo.state.aria', { value: label })}
        >
          {label}
          <ChevronDown className="size-4 text-[var(--bellum-text-muted)]" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel>{t('pipeTheo.state.label')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={value} onValueChange={next => onChange(next as PipeState)}>
          {PIPE_STATES.map(state => (
            <DropdownMenuRadioItem key={state} value={state}>
              {t(`pipeTheo.state.${state}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * « Filtres » — les six filtres rapides du pipe, cochables ensemble, avec ce que chacun ramènerait.
 * Un compteur s'affiche sur le bouton dès qu'un filtre est posé (Théo `.c2-n`), jamais « 0 ».
 */
export function PipelineFiltersMenu({
  options,
  active,
  counts,
  onToggle,
  onClear,
}: {
  options: readonly QuickFilter[]
  active: ReadonlySet<QuickFilter>
  counts: Readonly<Record<QuickFilter, number>>
  onToggle: (filter: QuickFilter) => void
  onClear: () => void
}) {
  const { t } = useTranslation('projects')
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={triggerClass}
          aria-label={t('toolbar.quickFiltersLabel')}
        >
          <ListFilter className="size-4" aria-hidden />
          {t('pipeTheo.filters.cta')}
          {active.size > 0 ? (
            <span className="inline-grid min-w-5 place-items-center rounded-full bg-[var(--bellum-accent-bg)] px-1.5 text-xs font-bold text-[var(--bellum-text-accent)]">
              {active.size}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-72">
        <DropdownMenuLabel>{t('pipeTheo.filters.caption')}</DropdownMenuLabel>
        {options.map(filter => (
          <DropdownMenuCheckboxItem
            key={filter}
            checked={active.has(filter)}
            onSelect={event => event.preventDefault()}
            onCheckedChange={() => onToggle(filter)}
          >
            <span className="flex w-full items-center justify-between gap-3">
              {t(filter === 'mine' ? 'pipeTheo.filters.mine' : `toolbar.${filter}`)}
              <span className="text-xs tabular-nums text-[var(--bellum-text-muted)]">{counts[filter]}</span>
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={active.size === 0} onSelect={onClear}>
          {t('pipeTheo.filters.clear')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** La bascule Kanban / Liste (Théo `.bo11-switch`). */
export function PipelineViewSwitch({
  value,
  onChange,
}: {
  value: 'kanban' | 'table'
  onChange: (next: 'kanban' | 'table') => void
}) {
  const { t } = useTranslation('projects')
  const items = [
    { key: 'kanban' as const, label: t('toolbar.viewKanban'), Icon: Columns3 },
    { key: 'table' as const, label: t('toolbar.viewTable'), Icon: List },
  ]
  return (
    <div
      role="group"
      aria-label={t('pipeTheo.view.label')}
      className="flex gap-0.5 rounded-control border border-[var(--bellum-border)] bg-card p-0.5"
    >
      {items.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn(
            'inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs pointer-coarse:min-h-11',
            value === key
              ? 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)]'
              : 'text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]',
          )}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  )
}

/**
 * « Hors pipe » — ce qui est sorti du Kanban (Théo `.c2-exits`) : perdues, en sommeil, archivées, chacune
 * avec sa porte. Une absence ne fait aucun segment ; rien sorti du pipe = aucune ligne.
 */
export function PipelineExits({
  lost,
  dormant,
  archived,
  onOpen,
}: {
  lost: number
  dormant: number
  archived: number | null
  onOpen: (state: 'lost' | 'dormant' | 'archived') => void
}) {
  const { t } = useTranslation('projects')
  const parts = [
    lost > 0 ? t('pipeTheo.exits.lost', { count: lost }) : null,
    dormant > 0 ? t('pipeTheo.exits.dormant', { count: dormant }) : null,
    archived ? t('pipeTheo.exits.archived', { count: archived }) : null,
  ].filter(Boolean)
  if (parts.length === 0) return null
  return (
    <Box
      data-testid="pipeline-exits"
      className="flex flex-wrap items-center gap-2.5 rounded-xl border border-dashed border-[var(--bellum-border-strong)] px-3.5 py-3 text-sm text-[var(--bellum-text-secondary)]"
    >
      <span>
        <strong className="mr-1 font-semibold text-[var(--bellum-text-primary)]">{t('pipeTheo.exits.label')}</strong>
        {parts.join(' · ')}
      </span>
      <span className="flex-1" />
      {lost > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="pointer-coarse:min-h-11"
          onClick={() => onOpen('lost')}
        >
          {t('pipeTheo.exits.seeLost')}
        </Button>
      ) : null}
      {dormant > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="pointer-coarse:min-h-11"
          onClick={() => onOpen('dormant')}
        >
          {t('pipeTheo.exits.seeDormant')}
        </Button>
      ) : null}
      {archived ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="pointer-coarse:min-h-11"
          onClick={() => onOpen('archived')}
        >
          {t('pipeTheo.exits.seeArchived')}
        </Button>
      ) : null}
    </Box>
  )
}

/** Un panneau hors pipe (Théo `.bo11-panel`) : titre, phrase, « Retour au pipe », puis sa liste. */
export function PipelinePanel({
  state,
  onBack,
  children,
}: {
  state: 'lost' | 'dormant' | 'archived'
  onBack: () => void
  children: React.ReactNode
}) {
  const { t } = useTranslation('projects')
  return (
    <section
      aria-labelledby={`pipe-panel-${state}`}
      className="rounded-xl border border-[var(--bellum-border)] bg-card p-4 md:p-5"
    >
      <Box display="flex" className="mb-4 flex-wrap items-start justify-between gap-3">
        <div>
          <Text element="h2" id={`pipe-panel-${state}`} size="lg" weight="semibold" className="tracking-tight">
            {t(`pipeTheo.panels.${state}.title`)}
          </Text>
          <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t(`pipeTheo.panels.${state}.intro`)}
          </Text>
        </div>
        <Button type="button" variant="ghost" size="sm" className="pointer-coarse:min-h-11" onClick={onBack}>
          {t('page.backToPipe')}
        </Button>
      </Box>
      {children}
    </section>
  )
}

/** Les affaires en sommeil (`dormant`) : sorties du Kanban sans être perdues ; chacune s'ouvre sur sa fiche. */
export function DormantProjectsList({ projects }: { projects: readonly ProjectReadRow[] }) {
  const { t } = useTranslation('projects')
  const dormant = projects.filter(project => project.stage === 'dormant')
  if (dormant.length === 0) {
    return (
      <Text size="sm" color="text-muted-foreground">
        {t('pipeTheo.panels.dormant.empty')}
      </Text>
    )
  }
  return (
    <ul aria-label={t('pipeTheo.panels.dormant.title')} className="divide-y divide-[var(--bellum-border)]">
      {dormant.map(project => (
        <li key={project.id} className="flex items-start gap-3 py-3.5">
          <div className="min-w-0 flex-1">
            <Link to="/projects/$id" params={{ id: project.id }} className="text-sm font-semibold hover:underline">
              {[project.company_name, project.label].filter(Boolean).join(' · ')}
            </Link>
            <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
              {t('pipeTheo.panels.dormant.since', { date: formatDate(project.updated_at) })}
            </Text>
          </div>
          <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
            <Link to="/projects/$id" params={{ id: project.id }}>
              {t('pipeTheo.panels.dormant.resume')}
            </Link>
          </Button>
        </li>
      ))}
    </ul>
  )
}

/** « Les signaux restent dans Signaux » (Théo `.bo11-summary`) : ce que Bellum a repéré seul vit dans Signaux. */
export function SignalsLead() {
  const { t } = useTranslation('projects')
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {t('pipeTheo.summary.signalsLead')}
      <Link
        to="/signals"
        className="font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
      >
        {t('pipeTheo.summary.signalsLink')}
      </Link>
    </span>
  )
}
