import { Dialog, DialogContent, DialogDescription, DialogTitle, Text, cn } from '@bellum/ui'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { approvalAuthorship } from '@/features/action-os/approvalAuthorship'
import { formatDate } from '@/lib/locale'
import { TodayCard } from './TodayCard'
import { GROUP_ICON } from './todayIcons'
import { dueDate, sectionOfDue } from './todayDates'

type TodayCardProps = Parameters<typeof TodayCard>[0]

/**
 * Refonte Théo (C · actions-aujourdhui, `.a14-task-row`) — une tâche de la file, en UNE
 * rangée dense : le symbole de son geste, son intitulé, « compte · geste · provenance »,
 * puis son échéance (en retard : teintée). Un clic ouvre la tâche : la MÊME carte
 * (`TodayCard`) — brouillon rédigé par Laura, Valider / Fait / Reporter / Confier / Passer —
 * dans une fenêtre, jamais un second jeu de gestes. Ouvrir ne traite rien : « Fait » reste
 * un geste déclaratif, et rien ne part sans le commercial.
 */
export function TodayTaskRow({
  open,
  onOpenChange,
  ...card
}: TodayCardProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation('actions')
  const { item, now } = card
  const Icon = GROUP_ICON[item.group]
  const due = dueDate(item.dueAt)
  const late = sectionOfDue(item.dueAt, now) === 'overdue'
  const who = item.accountName ?? item.contactName
  const meta = [who, t(`today.groups.${item.group}`)].filter(Boolean).join(' · ')
  return (
    <>
      <button
        type="button"
        data-slot="today-task-row"
        aria-label={t('today.row.open', { title: item.title })}
        onClick={() => onOpenChange(true)}
        className="grid w-full min-h-14 grid-cols-[2.25rem_minmax(0,1fr)_auto_1.25rem] items-center gap-3 px-4 py-3 text-left transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)]"
      >
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-control bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]"
        >
          <Icon className="size-4" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <Text element="span" size="sm" weight="semibold" className="truncate">
            {item.title}
          </Text>
          <Text element="span" size="xs" className="truncate text-[var(--bellum-text-secondary)]">
            {meta}
            {/* Théo A7 — la provenance, en accent : pourquoi la ligne existe, sans colonne de plus. */}
            <span className="text-[var(--bellum-text-accent)]">
              {' · '}
              {/* #2200.13 — une demande tracée dit ce que dit sa fenêtre : la formule d'auteur partagée. */}
              {item.why?.kind === 'trace'
                ? approvalAuthorship(t, item.why).join(' · ')
                : t(`today.row.source.${item.source}`)}
            </span>
          </Text>
        </span>
        <Text
          element="span"
          size="xs"
          weight="medium"
          className={cn(
            'tabular-nums',
            late ? 'text-[var(--danger-soft-text)]' : 'text-[var(--bellum-text-secondary)]',
          )}
        >
          {due ? formatDate(due, { day: 'numeric', month: 'short' }) : null}
        </Text>
        <ChevronRight className="size-4 text-[var(--bellum-text-muted)]" aria-hidden="true" />
      </button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent closeLabel={t('common:actions.close')} className="max-w-2xl">
          <DialogTitle className="sr-only">{item.title}</DialogTitle>
          <DialogDescription className="sr-only">{meta}</DialogDescription>
          <TodayCard {...card} />
        </DialogContent>
      </Dialog>
    </>
  )
}
