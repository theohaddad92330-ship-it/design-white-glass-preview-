import { useState } from 'react'
import { PLAN_ACTION_CHANNELS, type ManagerSharedActions, type PlanActionChannel } from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  Textarea,
} from '@bellum/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CalendarDays, PenLine, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatCalendarDate } from '@/lib/deadline'
import { planItemsApi } from '@/features/actions/planItems.api'

type Item = ManagerSharedActions['items'][number]

export function isoDay(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

/** « Aujourd'hui », « Demain », « 21 oct. » — jamais une date inventée. */
function useDueLabel() {
  const { t } = useTranslation('manager')
  const now = new Date()
  const today = isoDay(now)
  const tomorrow = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  return (due: string | null) =>
    due === null
      ? t('sharedActions.noDue')
      : due === today
        ? t('equipe.plans.today')
        : due === tomorrow
          ? t('equipe.plans.tomorrow')
          : (formatCalendarDate(due, { day: 'numeric', month: 'short' }) ?? due)
}

/** Initiale teintée (jeton doux) — la personne, jamais une photo. */
export function Initial({ name, size = 'sm' }: { name: string; size?: 'sm' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center bg-[var(--accent-soft-bg)] font-semibold text-[var(--accent-soft-text)] ${
        size === 'lg' ? 'size-16 rounded-2xl text-2xl' : 'size-6 rounded-full text-xs'
      }`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

/**
 * Théo D `.t8-task` — une action de l'équipe : la case (ouvre le contexte), le
 * titre (idem), « compte · ce qu'il faut obtenir », la personne, l'échéance, et
 * « Préparer » (le dossier du compte, où Laura rédige). Une action en retard
 * porte le liseré et le badge « En retard ».
 */
export function TeamActionCard({ item, who }: { item: Item; who: string }) {
  const { t } = useTranslation('manager')
  const dueLabel = useDueLabel()
  const [open, setOpen] = useState(false)
  return (
    <li
      className={`border-l-2 px-5 py-4 ${item.overdue ? 'border-l-[var(--bellum-warning)]' : 'border-l-transparent'}`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('equipe.task.open', { label: item.label })}
          className="flex size-11 shrink-0 items-start justify-center pt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
        >
          <span aria-hidden="true" className="block h-7 w-4 rounded-md border border-[var(--bellum-text-muted)]" />
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="min-h-11 text-left text-sm font-semibold text-[var(--bellum-text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
            >
              {item.label}
            </button>
            {item.overdue ? (
              <span className="shrink-0 rounded-badge border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] px-2 py-0.5 text-xs text-[var(--warning-soft-text)]">
                {t('sharedActions.badgeOverdue')}
              </span>
            ) : null}
          </div>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            <Link
              to="/accounts/$id"
              params={{ id: item.account_id }}
              className="text-[var(--bellum-text-accent)] hover:underline"
            >
              {item.company_name}
            </Link>
          </Text>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-sm text-[var(--bellum-text-muted)]">
              <span className="flex items-center gap-1.5">
                <Initial name={who} />
                {who}
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarDays aria-hidden="true" className="size-4" />
                {dueLabel(item.due_date)}
              </span>
            </div>
            <Button asChild variant="soft" size="sm" icon={PenLine}>
              <Link to="/accounts/$id" params={{ id: item.account_id }}>
                {t('equipe.plans.prepare')}
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <TeamActionDetailDialog item={item} who={who} open={open} onOpenChange={setOpen} />
    </li>
  )
}

/** Le contexte d'une action : statut, responsable, échéance, dossier — et le chemin vers le dossier. */
function TeamActionDetailDialog({
  item,
  who,
  open,
  onOpenChange,
}: {
  item: Item
  who: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('manager')
  const { t: tc } = useTranslation('common')
  const dueLabel = useDueLabel()
  const rows: [string, string][] = [
    [t('equipe.task.owner'), who],
    [t('equipe.task.due'), dueLabel(item.due_date)],
    [t('equipe.task.account'), item.company_name],
  ]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{item.label}</DialogTitle>
          <DialogDescription>
            <span className="inline-flex flex-wrap gap-2">
              <span className="rounded-badge bg-[var(--accent-soft-bg)] px-2 py-0.5 text-xs text-[var(--accent-soft-text)]">
                {t('equipe.plans.lens.todo')}
              </span>
              {item.overdue ? (
                <span className="rounded-badge bg-[var(--warning-soft-bg)] px-2 py-0.5 text-xs text-[var(--warning-soft-text)]">
                  {t('sharedActions.badgeOverdue')}
                </span>
              ) : null}
              {item.assigned_to ? (
                <span className="rounded-badge bg-[var(--info-soft-bg)] px-2 py-0.5 text-xs text-[var(--info-soft-text)]">
                  {t('equipe.plans.lens.delegated')}
                </span>
              ) : null}
            </span>
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-card border border-[var(--bellum-border)] p-4">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0 space-y-1">
              <dt className="text-xs text-[var(--bellum-text-muted)]">{label}</dt>
              <dd className="truncate text-sm font-medium text-[var(--bellum-text-primary)]">{value}</dd>
            </div>
          ))}
        </dl>
        <DialogFooter>
          <Button variant="plain" onClick={() => onOpenChange(false)}>
            {tc('actions.close')}
          </Button>
          <Button asChild variant="default" icon={PenLine}>
            <Link to="/accounts/$id" params={{ id: item.account_id }}>
              {t('equipe.task.openAccount')}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Théo D `#dlg-create` — « Une prochaine action, un responsable » : action,
 * responsable, échéance, compte lié, type de préparation, objectif. Écrit par
 * LA porte de création d'une action (`planItemsApi.create`), jamais un second
 * moteur. L'objectif est obligatoire (#2871) ; « Action interne » (sans compte)
 * n'existe pas côté serveur (`account_id` requis) et n'est donc pas proposée.
 */
export function TeamCreateActionButton({
  members,
  accounts,
  defaultOwner,
}: {
  members: readonly { user_id: string; name: string }[]
  accounts: readonly { value: string; label: string }[]
  defaultOwner?: string
}) {
  const { t } = useTranslation('manager')
  const { t: tc } = useTranslation('common')
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [owner, setOwner] = useState(defaultOwner ?? members[0]?.user_id ?? '')
  const [due, setDue] = useState(isoDay(new Date()))
  const [account, setAccount] = useState(accounts[0]?.value ?? '')
  const [channel, setChannel] = useState<PlanActionChannel>('email')
  const [reason, setReason] = useState('')
  // #2395.8 — le résultat attendu est requis à la création.
  const [expectedOutcome, setExpectedOutcome] = useState('')
  const [pending, setPending] = useState(false)

  const ready = label.trim() && reason.trim() && expectedOutcome.trim() && account
  const submit = async () => {
    if (!ready) return
    setPending(true)
    try {
      await planItemsApi.create({
        account_id: account,
        label: label.trim(),
        reason: reason.trim(),
        expected_outcome: expectedOutcome.trim(),
        target: null,
        owner_name: members.find(m => m.user_id === owner)?.name ?? null,
        channel,
        due_date: due || null,
      })
      void queryClient.invalidateQueries({ queryKey: ['manager', 'team-stats'] })
      toast.success(t('equipe.create.created'))
      setLabel('')
      setReason('')
      setExpectedOutcome('')
      setOpen(false)
    } catch {
      toast.error(t('equipe.create.failed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button
        variant="default"
        icon={Plus}
        onClick={() => setOpen(true)}
        disabled={accounts.length === 0}
        title={accounts.length === 0 ? t('equipe.create.noAccount') : undefined}
      >
        {t('equipe.create.open')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={tc('actions.close')}>
          <DialogHeader>
            <DialogTitle>{t('equipe.create.title')}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={event => {
              event.preventDefault()
              void submit()
            }}
          >
            <label className="grid gap-1.5 text-sm text-[var(--bellum-text-secondary)]">
              {t('equipe.create.label')}
              <Input
                value={label}
                onChange={event => setLabel(event.target.value)}
                placeholder={t('equipe.create.labelPlaceholder')}
                required
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm text-[var(--bellum-text-secondary)]">
                {t('equipe.create.owner')}
                <Select value={owner} onValueChange={setOwner}>
                  <SelectTrigger aria-label={t('equipe.create.owner')} className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map(member => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-1.5 text-sm text-[var(--bellum-text-secondary)]">
                {t('equipe.create.due')}
                <Input type="date" value={due} onChange={event => setDue(event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm text-[var(--bellum-text-secondary)]">
                {t('equipe.create.account')}
                <Select value={account} onValueChange={setAccount}>
                  <SelectTrigger aria-label={t('equipe.create.account')} className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-1.5 text-sm text-[var(--bellum-text-secondary)]">
                {t('equipe.create.channel')}
                <Select value={channel} onValueChange={next => setChannel(next as PlanActionChannel)}>
                  <SelectTrigger aria-label={t('equipe.create.channel')} className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_ACTION_CHANNELS.map(value => (
                      <SelectItem key={value} value={value}>
                        {t(`equipe.create.channels.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
            <label className="grid gap-1.5 text-sm text-[var(--bellum-text-secondary)]">
              {t('equipe.create.reason')}
              <Textarea
                value={reason}
                onChange={event => setReason(event.target.value)}
                placeholder={t('equipe.create.reasonPlaceholder')}
                rows={3}
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm text-[var(--bellum-text-secondary)]">
              {t('equipe.create.expectedOutcome')}
              <Textarea
                value={expectedOutcome}
                onChange={event => setExpectedOutcome(event.target.value)}
                placeholder={t('equipe.create.expectedOutcomePlaceholder')}
                rows={2}
                required
              />
            </label>
            {label.trim() && reason.trim() && !expectedOutcome.trim() ? (
              <Text role="alert" size="xs" className="text-[var(--danger-soft-text)]">
                {t('equipe.create.expectedOutcomeRequired')}
              </Text>
            ) : null}
            <Text
              size="sm"
              className="rounded-card bg-[var(--bellum-surface-2)] p-3 text-[var(--bellum-text-secondary)]"
            >
              {t('equipe.create.note')}
            </Text>
            <DialogFooter>
              <Button type="button" variant="plain" onClick={() => setOpen(false)}>
                {tc('actions.cancel')}
              </Button>
              <Button type="submit" variant="default" disabled={!ready || pending}>
                {t('equipe.create.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
