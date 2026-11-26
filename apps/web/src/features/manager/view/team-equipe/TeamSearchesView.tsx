import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Compass, Radar } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatCalendarDate } from '@/lib/deadline'
import { useSavedViews } from '@/features/governance/api'
import { savedViewToSearch, type SavedSearch } from '@/features/discover/lib/discover-saved-searches'
import { Initial } from './TeamEquipeActions'
import { TeamEquipeShell } from './TeamEquipeShell'

/** Le jour de la dernière lecture, ou celui de l'enregistrement — jamais une date inventée. */
function dayOf(search: SavedSearch): string | null {
  const iso = search.lastRunAt ?? (search.savedAt > 0 ? new Date(search.savedAt).toISOString() : null)
  return iso ? formatCalendarDate(iso.slice(0, 10), { day: 'numeric', month: 'short' }) : null
}

/**
 * Théo D team-recherches — « Ne laisse pas une recherche dormir » : les
 * périmètres enregistrés de Découvrir, ceux de l'équipe (partagés) comme les
 * miens, chacun rouvrable. Une recherche n'est pas une affaire : aucun score,
 * aucun coût, aucune probabilité.
 */
export function TeamSearchesView() {
  const { t } = useTranslation('manager')
  const views = useSavedViews('discover')
  const searches = (views.data ?? []).map(savedViewToSearch)
  const shell = (body: React.ReactNode) => (
    <TeamEquipeShell active="searches" title={t('equipe.searches.title')} tagline={t('equipe.searches.tagline')}>
      {body}
    </TeamEquipeShell>
  )
  if (views.isLoading) return shell(<Text size="sm">{t('states.loading')}</Text>)
  if (views.isError) return shell(<Text size="sm">{t('errors.load')}</Text>)

  return shell(
    <div className="space-y-6">
      <section
        aria-label={t('equipe.searches.eyebrow')}
        className="flex flex-wrap items-center gap-6 rounded-card border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] p-6 md:p-8"
      >
        <span
          aria-hidden="true"
          className="flex size-20 shrink-0 items-center justify-center rounded-2xl border border-[var(--bellum-accent-line)] bg-card text-[var(--bellum-text-accent)]"
        >
          <Radar className="size-9" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <Text size="xs" weight="semibold" className="uppercase tracking-widest text-[var(--bellum-text-muted)]">
            {t('equipe.searches.eyebrow')}
          </Text>
          <Text element="h2" size="2xl" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {searches.length > 0 ? t('equipe.searches.kept', { count: searches.length }) : t('equipe.searches.none')}
            <br />
            <span className="text-[var(--bellum-text-accent)]">{t('equipe.searches.choose')}</span>
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('equipe.searches.note')}
          </Text>
        </div>
        <Button asChild variant="default" icon={Compass}>
          <Link to="/discover">{t('equipe.searches.new')}</Link>
        </Button>
      </section>

      {searches.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Text element="h2" size="lg" weight="semibold" className="sr-only">
              {t('equipe.searches.listTitle')}
            </Text>
            <Text size="sm" className="text-[var(--bellum-text-muted)]">
              {t('equipe.searches.scope')}
            </Text>
          </div>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {searches.map(search => (
              <SearchCard key={search.id} search={search} />
            ))}
          </ul>
        </>
      ) : null}
    </div>,
  )
}

/**
 * Théo D `.t8-study-card` — le type et le jour, le périmètre en titre, son
 * objectif, puis (sous le filet) ce qui a bougé depuis la dernière lecture, la
 * personne qui l'a conservée et « Examiner ». Aucun score, aucun coût.
 */
function SearchCard({ search }: { search: SavedSearch }) {
  const { t } = useTranslation('manager')
  const [open, setOpen] = useState(false)
  const day = dayOf(search)
  return (
    <li className="flex flex-col gap-4 rounded-card border border-[var(--bellum-border)] bg-card p-5">
      <div className="flex items-center justify-between text-sm text-[var(--bellum-text-muted)]">
        <span className="flex items-center gap-2">
          <Compass aria-hidden="true" className="size-4" />
          {t('equipe.searches.kind')}
        </span>
        {day ? <span>{day}</span> : null}
      </div>
      <div className="flex-1 space-y-2">
        <Text element="h3" size="xl" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {search.label}
        </Text>
        {search.objective ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {search.objective}
          </Text>
        ) : null}
      </div>
      <div className="space-y-4 border-t border-[var(--bellum-border)] pt-4">
        {search.newItems !== null && search.newItems > 0 ? (
          <Text size="sm" className="flex items-baseline gap-3 text-[var(--bellum-text-secondary)]">
            <span className="text-3xl font-semibold text-[var(--bellum-text-primary)]">{search.newItems}</span>
            {t('equipe.searches.newsShort', { count: search.newItems })}
          </Text>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          {search.ownerName ? (
            <span className="flex items-center gap-2 text-sm text-[var(--bellum-text-secondary)]">
              <Initial name={search.ownerName} />
              {search.ownerName.split(' ')[0]}
            </span>
          ) : (
            <span />
          )}
          <Button
            variant="soft"
            size="sm"
            icon={ArrowRight}
            onClick={() => setOpen(true)}
            aria-label={t('equipe.searches.examineAria', { label: search.label })}
          >
            {t('equipe.searches.examine')}
          </Button>
        </div>
      </div>
      <SearchDialog search={search} open={open} onOpenChange={setOpen} />
    </li>
  )
}

/** Théo D `#dlg-study*` — la recherche ouverte : type, jour et personne, objectif, et « Reprendre dans Découvrir ». */
function SearchDialog({
  search,
  open,
  onOpenChange,
}: {
  search: SavedSearch
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('manager')
  const { t: tc } = useTranslation('common')
  const meta = [dayOf(search), search.ownerName?.split(' ')[0]].filter(Boolean).join(' · ')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{search.label}</DialogTitle>
          <DialogDescription>
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="rounded-badge bg-[var(--accent-soft-bg)] px-2 py-0.5 text-xs text-[var(--accent-soft-text)]">
                {t('equipe.searches.kind')}
              </span>
              {meta ? <span>{meta}</span> : null}
            </span>
          </DialogDescription>
        </DialogHeader>
        {search.objective ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {search.objective}
          </Text>
        ) : null}
        {search.newItems !== null && search.newItems > 0 ? (
          <Text size="sm" className="text-[var(--bellum-text-accent)]">
            {t('equipe.searches.news', { count: search.newItems })}
          </Text>
        ) : null}
        <Text size="sm" className="rounded-card bg-[var(--bellum-surface-2)] p-3 text-[var(--bellum-text-secondary)]">
          {t('equipe.searches.note')}
        </Text>
        <DialogFooter>
          <Button variant="plain" onClick={() => onOpenChange(false)}>
            {tc('actions.close')}
          </Button>
          <Button asChild variant="default" icon={Compass}>
            <Link to="/discover">{t('equipe.searches.resume')}</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
