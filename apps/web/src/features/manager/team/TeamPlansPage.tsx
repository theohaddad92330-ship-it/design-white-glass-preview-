import { useMemo, useState, type DragEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FilterChips,
  SelectField,
  Text,
} from '@bellum/ui'
import type { ManagerTeamPlans } from '@bellum/contracts'
import { dayKey } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { formatCalendarDate } from '@/lib/deadline'
import { useCreateTeamAction, useTeamPlans, useUpdateTeamAction } from '../hooks/useTeamViews'
import { initialOf } from './team-format'

export type TeamPlansStatus = 'todo' | 'overdue' | 'today' | 'delegated' | 'all'
export type TeamPlansLayout = 'list' | 'split' | 'week'

type Item = ManagerTeamPlans['items'][number]

/** La personne responsable d'une action : le délégataire s'il y en a un, sinon son auteur. */
const holderOf = (item: Item): string => item.assigned_to ?? item.owner_user_id

/** Lundi → vendredi de la semaine qui contient `today` (clés `YYYY-MM-DD`, calcul en calendrier local). */
function weekDays(today: Date): string[] {
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return dayKey(d)
  })
}

/**
 * Équipe › Plans & actions (Théo D team-plans).
 *
 * Du plan à l'action : trois lectures de la même file (Liste · Répartition ·
 * Semaine), six filtres d'état, « Préparer » qui ouvre le plan du compte (rien ne
 * part), glisser-déposer qui PROPOSE un changement à confirmer — et chaque action
 * reste modifiable au clavier (« Modifier »), sans drag.
 */
export function TeamPlansPage({
  status,
  layout,
  onStatusChange,
  onLayoutChange,
}: {
  status: TeamPlansStatus
  layout: TeamPlansLayout
  onStatusChange: (s: TeamPlansStatus) => void
  onLayoutChange: (l: TeamPlansLayout) => void
}) {
  const { t } = useTranslation('manager')
  const { user } = useSession()
  const query = useTeamPlans()
  const [accountId, setAccountId] = useState('')
  const [creating, setCreating] = useState(false)
  // Un changement PROPOSÉ (par glisser ou par « Modifier ») attend sa confirmation.
  const [pending, setPending] = useState<{ item: Item; holder: string; dueDate: string | null } | null>(null)

  const today = dayKey(new Date())

  const visible = useMemo(() => {
    const items = query.data?.items ?? []
    return items.filter(item => {
      if (accountId && item.account_id !== accountId) return false
      if (status === 'overdue') return item.overdue
      if (status === 'today') return item.due_date === today
      if (status === 'delegated') return item.delegated_by !== null
      return true
    })
  }, [query.data, status, accountId, today])

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Text element="h1" size="2xl" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('team.plans.title')}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('team.plans.lead')}
          </Text>
        </div>
        <Button type="button" className="min-h-11" onClick={() => setCreating(true)} disabled={!query.data}>
          {t('team.plans.create')}
        </Button>
      </header>

      {query.isPending ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('team.loading')}
        </Text>
      ) : query.isError ? (
        <Text size="sm" role="alert" className="text-[var(--bellum-text-secondary)]">
          {t('team.loadError')}
        </Text>
      ) : (
        <>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('team.plans.summary', {
              open: query.data.open,
              overdue: query.data.overdue,
              delegated: query.data.delegated,
            })}
          </Text>
          <div className="flex flex-wrap items-center gap-3">
            <FilterChips
              size="sm"
              ariaLabel={t('team.plans.statusLabel')}
              options={(['todo', 'overdue', 'today', 'delegated', 'all'] as const).map(key => ({
                value: key,
                // i18n keys: team.plans.status.todo | overdue | today | delegated | all
                label: t(`team.plans.status.${key}`),
              }))}
              value={status}
              onChange={next => next && onStatusChange(next)}
            />
            <label className="flex items-center gap-2">
              <span className="text-xs text-[var(--bellum-text-secondary)]">{t('team.plans.accountFilter')}</span>
              <SelectField
                ariaLabel={t('team.plans.accountFilter')}
                value={accountId}
                emptyOption={{ label: t('team.plans.allAccounts') }}
                options={query.data.accounts.map(x => ({ value: x.id, label: x.company_name }))}
                onChange={setAccountId}
              />
            </label>
            <FilterChips
              size="sm"
              ariaLabel={t('team.plans.layoutLabel')}
              options={(['list', 'split', 'week'] as const).map(key => ({
                value: key,
                // i18n keys: team.plans.layout.list | split | week
                label: t(`team.plans.layout.${key}`),
              }))}
              value={layout}
              onChange={next => next && onLayoutChange(next)}
            />
          </div>

          {visible.length === 0 ? (
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {query.data.open === 0 ? t('team.plans.empty') : t('team.plans.emptyFiltered')}
            </Text>
          ) : layout === 'list' ? (
            <ul className="space-y-2">
              {visible.map(item => (
                <ActionRow
                  key={item.id}
                  item={item}
                  data={query.data}
                  onEdit={() => setPending({ item, holder: holderOf(item), dueDate: item.due_date })}
                />
              ))}
            </ul>
          ) : layout === 'split' ? (
            <SplitView
              items={visible}
              data={query.data}
              onEdit={(item, holder) => setPending({ item, holder, dueDate: item.due_date })}
            />
          ) : (
            <WeekView
              items={visible}
              data={query.data}
              today={new Date()}
              onEdit={(item, dueDate) => setPending({ item, holder: holderOf(item), dueDate })}
            />
          )}

          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('team.plans.dragNote')}
          </Text>
          {/* Théo D team-plans.A2 — l'historique des actions et les automatisations restent à un clic. */}
          <div className="flex flex-wrap gap-4">
            <Link
              to="/actions"
              className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] hover:underline"
            >
              {t('team.plans.history')}
            </Link>
            <Link
              to="/actions/automatisations"
              className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] hover:underline"
            >
              {t('team.plans.automations')}
            </Link>
          </div>
        </>
      )}

      {pending && query.data ? (
        <ConfirmChangeDialog
          key={pending.item.id}
          item={pending.item}
          data={query.data}
          initialHolder={pending.holder}
          initialDueDate={pending.dueDate}
          currentUserId={user?.id ?? null}
          onClose={() => setPending(null)}
        />
      ) : null}
      {creating && query.data ? (
        <CreateActionDialog data={query.data} currentUserId={user?.id ?? null} onClose={() => setCreating(false)} />
      ) : null}
    </div>
  )
}

function nameOf(data: ManagerTeamPlans, id: string | null): string | null {
  return id ? (data.members.find(m => m.user_id === id)?.name ?? null) : null
}

function ActionRow({
  item,
  data,
  onEdit,
  draggable = false,
}: {
  item: Item
  data: ManagerTeamPlans
  onEdit?: () => void
  draggable?: boolean
}) {
  const { t } = useTranslation('manager')
  const due = formatCalendarDate(item.due_date)
  const holder = nameOf(data, holderOf(item))
  const by = nameOf(data, item.delegated_by)
  return (
    <li
      className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3"
      {...(draggable ? draggableProps(item.id) : {})}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {item.label}
            {item.overdue ? (
              <span className="ml-2 rounded-full bg-[color-mix(in_srgb,var(--bellum-warning-text)_16%,transparent)] px-2 py-0.5 text-xs font-normal text-[var(--warning-soft-text)]">
                {t('team.plans.badgeOverdue')}
              </span>
            ) : null}
          </Text>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            <Link to="/accounts/$id" params={{ id: item.account_id }} className="underline">
              {item.company_name}
            </Link>
            {by ? ` · ${t('team.plans.delegatedBy', { name: by })}` : ''}
          </Text>
        </div>
        <div className="flex items-center gap-3 text-sm text-[var(--bellum-text-primary)]">
          {holder ? (
            <span className="inline-flex items-center gap-1">
              <span
                aria-hidden="true"
                className="grid size-6 place-items-center rounded-full bg-[var(--bellum-accent-bg)] text-xs font-semibold text-[var(--bellum-text-accent)]"
              >
                {initialOf(holder)}
              </span>
              {holder}
            </span>
          ) : null}
          <span className="tabular-nums">{due ?? t('team.plans.noDue')}</span>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Link
          to="/accounts/$id"
          params={{ id: item.account_id }}
          search={{ tab: 'plan' }}
          className="inline-flex min-h-11 items-center rounded-md border border-[var(--bellum-border)] px-3 text-sm text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-surface-2)]"
        >
          {t('team.plans.prepare')}
        </Link>
        {onEdit ? (
          <Button type="button" variant="plain" className="min-h-11" onClick={onEdit}>
            {t('team.plans.edit')}
          </Button>
        ) : null}
      </div>
    </li>
  )
}

const DRAG_TYPE = 'text/plain'

function draggableProps(id: string) {
  return {
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData(DRAG_TYPE, id)
      event.dataTransfer.effectAllowed = 'move'
    },
  }
}

function dropProps(onDropId: (id: string) => void) {
  return {
    onDragOver: (event: DragEvent) => event.preventDefault(),
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      const id = event.dataTransfer.getData(DRAG_TYPE)
      if (id) onDropId(id)
    },
  }
}

function SplitView({
  items,
  data,
  onEdit,
}: {
  items: Item[]
  data: ManagerTeamPlans
  onEdit: (item: Item, holder: string) => void
}) {
  const { t } = useTranslation('manager')
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {data.members.map(member => {
        const mine = items.filter(i => holderOf(i) === member.user_id)
        return (
          <section
            key={member.user_id}
            aria-label={member.name}
            className="rounded-xl border border-dashed border-[var(--bellum-border)] p-3"
            {...dropProps(id => {
              const item = items.find(i => i.id === id)
              if (item && holderOf(item) !== member.user_id) onEdit(item, member.user_id)
            })}
          >
            <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
              {t('team.plans.splitHeading', { name: member.name, count: mine.length })}
            </Text>
            <ul className="mt-2 space-y-2">
              {mine.map(item => (
                <ActionRow
                  key={item.id}
                  draggable
                  item={item}
                  data={data}
                  onEdit={() => onEdit(item, holderOf(item))}
                />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function WeekView({
  items,
  data,
  today,
  onEdit,
}: {
  items: Item[]
  data: ManagerTeamPlans
  today: Date
  onEdit: (item: Item, dueDate: string | null) => void
}) {
  const { t } = useTranslation('manager')
  const days = weekDays(today)
  const inWeek = new Set(days)
  const other = items.filter(i => !i.due_date || !inWeek.has(i.due_date))
  const dayLabel = (key: string) => formatCalendarDate(key, { weekday: 'long', day: 'numeric' }) ?? key

  const onDropOn = (id: string, dueDate: string | null) => {
    const item = items.find(i => i.id === id)
    if (item && item.due_date !== dueDate) onEdit(item, dueDate)
  }

  return (
    <div className="space-y-3">
      {days.map(key => {
        const list = items.filter(i => i.due_date === key)
        return (
          <section
            key={key}
            aria-label={dayLabel(key)}
            className="rounded-xl border border-dashed border-[var(--bellum-border)] p-3"
            {...dropProps(id => onDropOn(id, key))}
          >
            <Text size="sm" weight="semibold" className="capitalize text-[var(--bellum-text-primary)]">
              {dayLabel(key)}
            </Text>
            {list.length === 0 ? (
              <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
                {t('team.plans.weekNoAction')}
              </Text>
            ) : (
              <ul className="mt-2 space-y-2">
                {list.map(item => (
                  <ActionRow
                    key={item.id}
                    draggable
                    item={item}
                    data={data}
                    onEdit={() => onEdit(item, item.due_date)}
                  />
                ))}
              </ul>
            )}
          </section>
        )
      })}
      <section
        aria-label={t('team.plans.weekOther')}
        className="rounded-xl border border-dashed border-[var(--bellum-border)] p-3"
        {...dropProps(id => onDropOn(id, null))}
      >
        <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('team.plans.weekOther')}
        </Text>
        <ul className="mt-2 space-y-2">
          {other.map(item => (
            <ActionRow key={item.id} draggable item={item} data={data} onEdit={() => onEdit(item, item.due_date)} />
          ))}
        </ul>
      </section>
    </div>
  )
}

/**
 * Le glisser-déposer PROPOSE, la confirmation ÉCRIT. Même dialogue pour le geste au
 * clavier (« Modifier ») : responsable, échéance, et — pour confier à un autre membre —
 * la note de contexte que le serveur exige (#4158.31).
 */
function ConfirmChangeDialog({
  item,
  data,
  initialHolder,
  initialDueDate,
  currentUserId,
  onClose,
}: {
  item: Item
  data: ManagerTeamPlans
  initialHolder: string
  initialDueDate: string | null
  currentUserId: string | null
  onClose: () => void
}) {
  const { t } = useTranslation('manager')
  const update = useUpdateTeamAction()
  const [holder, setHolder] = useState(initialHolder)
  const [dueDate, setDueDate] = useState(initialDueDate ?? '')
  const [note, setNote] = useState('')
  const holderChanged = holder !== holderOf(item)
  const dueChanged = (dueDate || null) !== item.due_date
  const needsNote = holderChanged && holder !== currentUserId
  const canConfirm = (holderChanged || dueChanged) && (!needsNote || note.trim() !== '')

  const confirm = () => {
    update.mutate(
      {
        id: item.id,
        patch: {
          ...(holderChanged ? { assigned_to: holder, handoff_note: needsNote ? note.trim() : undefined } : {}),
          ...(dueChanged ? { due_date: dueDate || null } : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success(t('team.plans.confirm.done'))
          onClose()
        },
        onError: () => toast.error(t('team.plans.confirm.failed')),
      },
    )
  }

  return (
    <Dialog open onOpenChange={open => (!open ? onClose() : undefined)}>
      <DialogContent closeLabel={t('team.plans.confirm.close')}>
        <DialogHeader>
          <DialogTitle>{t('team.plans.confirm.title')}</DialogTitle>
          <DialogDescription>{item.label}</DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1">
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('team.plans.confirm.holder')}
          </Text>
          <SelectField
            ariaLabel={t('team.plans.confirm.holder')}
            value={holder}
            options={data.members.map(x => ({ value: x.user_id, label: x.name }))}
            onChange={setHolder}
          />
        </label>
        <label className="flex flex-col gap-1">
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('team.plans.confirm.due')}
          </Text>
          <input
            type="date"
            value={dueDate}
            onChange={event => setDueDate(event.target.value)}
            className="min-h-11 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 text-sm text-[var(--bellum-text-primary)]"
          />
        </label>
        {needsNote ? (
          <label className="flex flex-col gap-1">
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('team.plans.confirm.note')}
            </Text>
            <textarea
              value={note}
              maxLength={1000}
              onChange={event => setNote(event.target.value)}
              className="min-h-20 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-2 text-sm text-[var(--bellum-text-primary)]"
            />
          </label>
        ) : null}
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('team.plans.confirm.notice')}
        </Text>
        <DialogFooter>
          <Button type="button" variant="ghost" className="min-h-11" onClick={onClose} disabled={update.isPending}>
            {t('team.plans.confirm.cancel')}
          </Button>
          <Button type="button" className="min-h-11" onClick={confirm} disabled={!canConfirm || update.isPending}>
            {t('team.plans.confirm.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** « Créer une action » — « Préparer n'est pas envoyer » : aucun message ni invitation ne part. */
function CreateActionDialog({
  data,
  currentUserId,
  onClose,
}: {
  data: ManagerTeamPlans
  currentUserId: string | null
  onClose: () => void
}) {
  const { t } = useTranslation('manager')
  const create = useCreateTeamAction()
  const [label, setLabel] = useState('')
  const [reason, setReason] = useState('')
  // #2395.8 — le résultat attendu est requis à la création.
  const [expectedOutcome, setExpectedOutcome] = useState('')
  const [accountId, setAccountId] = useState(data.accounts[0]?.id ?? '')
  const [holder, setHolder] = useState(currentUserId ?? data.members[0]?.user_id ?? '')
  const [dueDate, setDueDate] = useState(dayKey(new Date()))
  const canCreate = label.trim() !== '' && reason.trim() !== '' && expectedOutcome.trim() !== '' && accountId !== ''

  const submit = () => {
    create.mutate(
      {
        accountId,
        label: label.trim(),
        reason: reason.trim(),
        expectedOutcome: expectedOutcome.trim(),
        dueDate: dueDate || null,
        assignedTo: holder || null,
        currentUserId,
      },
      {
        onSuccess: () => {
          toast.success(t('team.plans.createDialog.done'))
          onClose()
        },
        onError: () => toast.error(t('team.plans.createDialog.failed')),
      },
    )
  }

  return (
    <Dialog open onOpenChange={open => (!open ? onClose() : undefined)}>
      <DialogContent closeLabel={t('team.plans.createDialog.close')} className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('team.plans.createDialog.title')}</DialogTitle>
          <DialogDescription>{t('team.plans.createDialog.lead')}</DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1">
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('team.plans.createDialog.label')}
          </Text>
          <input
            value={label}
            maxLength={500}
            onChange={event => setLabel(event.target.value)}
            className="min-h-11 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 text-sm text-[var(--bellum-text-primary)]"
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('team.plans.createDialog.holder')}
            </Text>
            <SelectField
              ariaLabel={t('team.plans.createDialog.holder')}
              value={holder}
              options={data.members.map(x => ({ value: x.user_id, label: x.name }))}
              onChange={setHolder}
            />
          </label>
          <label className="flex flex-col gap-1">
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('team.plans.createDialog.due')}
            </Text>
            <input
              type="date"
              value={dueDate}
              onChange={event => setDueDate(event.target.value)}
              className="min-h-11 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 text-sm text-[var(--bellum-text-primary)]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('team.plans.createDialog.account')}
            </Text>
            <SelectField
              ariaLabel={t('team.plans.createDialog.account')}
              value={accountId}
              options={data.accounts.map(x => ({ value: x.id, label: x.company_name }))}
              onChange={setAccountId}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('team.plans.createDialog.reason')}
          </Text>
          <textarea
            value={reason}
            maxLength={2000}
            onChange={event => setReason(event.target.value)}
            className="min-h-20 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-2 text-sm text-[var(--bellum-text-primary)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('team.plans.createDialog.expectedOutcome')}
          </Text>
          <textarea
            value={expectedOutcome}
            maxLength={1000}
            onChange={event => setExpectedOutcome(event.target.value)}
            className="min-h-16 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-2 text-sm text-[var(--bellum-text-primary)]"
          />
        </label>
        {!canCreate && label.trim() !== '' && reason.trim() !== '' && expectedOutcome.trim() === '' ? (
          <Text role="alert" size="xs" className="text-[var(--danger-soft-text)]">
            {t('team.plans.createDialog.expectedOutcomeRequired')}
          </Text>
        ) : null}
        <Text size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
          {t('team.plans.createDialog.noticeTitle')}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('team.plans.createDialog.notice')}
        </Text>
        <DialogFooter>
          <Button type="button" variant="ghost" className="min-h-11" onClick={onClose} disabled={create.isPending}>
            {t('team.plans.createDialog.cancel')}
          </Button>
          <Button type="button" className="min-h-11" onClick={submit} disabled={!canCreate || create.isPending}>
            {t('team.plans.createDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
