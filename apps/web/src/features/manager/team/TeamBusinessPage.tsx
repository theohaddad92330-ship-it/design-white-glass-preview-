import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button, FilterChips, SelectField, Text } from '@bellum/ui'
import type { ManagerTeamBusiness } from '@bellum/contracts'
import { PROJECT_STAGES } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { formatCalendarDate } from '@/lib/deadline'
import { MonthObjectiveBlock } from '@/features/pilotage/view/MonthObjectiveBlock'
import { useAssignAccount } from '../hooks/useAssignAccount'
import { useUpsertMyObjective } from '../hooks/useObjectives'
import { useProposeObjective, useTeamBusiness } from '../hooks/useTeamViews'
import { formatEuro, initialOf, monthLabel } from './team-format'
import { TargetFormDialog, type TargetFormValues } from './TargetFormDialog'

export type TeamBusinessView = 'objectives' | 'deals' | 'portfolio'

const KNOWN_STAGES: readonly string[] = PROJECT_STAGES

type Member = ManagerTeamBusiness['members'][number]

/**
 * Équipe › Objectifs & affaires (Théo D team-business).
 *
 * Trois sous-vues : Objectifs du mois · Revue des affaires · Portefeuilles.
 * Rien d'inventé : un montant absent est « rien de signé » / « sans montant »,
 * jamais 0 € ; aucune probabilité de signature (doctrine).
 */
export function TeamBusinessPage({
  view,
  onViewChange,
}: {
  view: TeamBusinessView
  onViewChange: (v: TeamBusinessView) => void
}) {
  const { t } = useTranslation('manager')
  const query = useTeamBusiness()

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Text element="h1" size="2xl" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('team.business.title')}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('team.business.lead')}
        </Text>
      </header>

      <FilterChips
        size="sm"
        ariaLabel={t('team.business.viewsLabel')}
        options={(['objectives', 'deals', 'portfolio'] as const).map(key => ({
          value: key,
          // i18n keys: team.business.views.objectives | deals | portfolio
          label: t(`team.business.views.${key}`),
        }))}
        value={view}
        onChange={next => next && onViewChange(next)}
      />

      {query.isPending ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('team.loading')}
        </Text>
      ) : query.isError ? (
        <Text size="sm" role="alert" className="text-[var(--bellum-text-secondary)]">
          {t('team.loadError')}
        </Text>
      ) : view === 'objectives' ? (
        <ObjectivesView data={query.data} />
      ) : view === 'deals' ? (
        <DealsView data={query.data} />
      ) : (
        <PortfolioView data={query.data} />
      )}
    </div>
  )
}

// ── Objectifs du mois ────────────────────────────────────────────────────────

function ObjectivesView({ data }: { data: ManagerTeamBusiness }) {
  const { t } = useTranslation('manager')
  const { user } = useSession()
  const propose = useProposeObjective()
  const upsertMine = useUpsertMyObjective()
  const [editing, setEditing] = useState<{ member: Member; mode: 'mine' | 'propose' } | null>(null)
  const month = monthLabel(data.period_month)
  const { cap } = data

  const percent =
    cap.signed_amount !== null && cap.target_amount !== null && cap.target_amount > 0
      ? Math.round((cap.signed_amount / cap.target_amount) * 100)
      : null
  const remaining =
    cap.signed_amount !== null && cap.target_amount !== null && cap.target_amount > cap.signed_amount
      ? cap.target_amount - cap.signed_amount
      : null

  const me = data.members.find(m => m.user_id === user?.id)

  const submit = (values: TargetFormValues, reason: string) => {
    if (!editing) return
    if (editing.mode === 'mine') {
      upsertMine.mutate(
        { period_month: data.period_month, ...values },
        {
          onSuccess: () => {
            toast.success(t('team.target.savedMine'))
            setEditing(null)
          },
          onError: () => toast.error(t('team.target.failed')),
        },
      )
      return
    }
    propose.mutate(
      { user_id: editing.member.user_id, period_month: data.period_month, ...values, reason: reason || undefined },
      {
        onSuccess: () => {
          toast.success(t('team.target.proposed', { name: editing.member.name }))
          setEditing(null)
        },
        onError: () => toast.error(t('team.target.proposeFailed')),
      },
    )
  }

  return (
    <div className="space-y-6">
      <section
        aria-label={t('team.business.cap.eyebrow', { month })}
        className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4"
      >
        <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
          {t('team.business.cap.eyebrow', { month })}
        </Text>
        <Text element="h2" size="xl" weight="semibold" className="mt-1 text-[var(--bellum-text-primary)]">
          {cap.signed_amount !== null
            ? t('team.business.cap.signed', { amount: formatEuro(cap.signed_amount) })
            : t('team.business.cap.nothingSigned')}
        </Text>
        <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {cap.target_amount !== null
            ? t('team.business.cap.target', { amount: formatEuro(cap.target_amount) })
            : t('team.business.cap.noTarget')}
          {percent !== null ? ` · ${t('team.business.cap.percent', { percent })}` : ''}
          {remaining !== null ? ` · ${t('team.business.cap.remaining', { amount: formatEuro(remaining) })}` : ''}
        </Text>
        <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
          {t('team.business.cap.contributors', { count: cap.contributors_with_target, total: cap.members_total })}
          {cap.won_without_amount > 0
            ? ` · ${t('team.business.cap.wonWithoutAmount', { count: cap.won_without_amount })}`
            : ''}
        </Text>
        <Text size="xs" className="mt-2 text-[var(--bellum-text-secondary)]">
          {t('team.business.cap.footnote')}
        </Text>
      </section>

      {/* Théo D team-business.A1 — couverture du pipe et rythme requis, sous le cap (même bloc que Pilotage). */}
      <MonthObjectiveBlock />

      <section aria-label={t('team.business.confuse.title')} className="space-y-2">
        <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
          {t('team.business.confuse.title')}
        </Text>
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {(['cap', 'won', 'cashed'] as const).map((key, index) => (
            <li key={key} className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3">
              <Text size="xs" className="tabular-nums text-[var(--bellum-text-muted)]">{`0${index + 1}`}</Text>
              {/* i18n keys: team.business.confuse.cap | won | cashed (+ …Hint) */}
              <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
                {t(`team.business.confuse.${key}`)}
              </Text>
              <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
                {t(`team.business.confuse.${key}Hint`)}
              </Text>
              {key === 'cashed' ? (
                <Link
                  to="/missions/encaissements"
                  className="mt-1 inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] hover:underline"
                >
                  {t('team.business.confuse.cashedLink')}
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section aria-label={t('team.business.chosen.title')} className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <Text element="h2" size="base" weight="semibold" className="text-[var(--bellum-text-primary)]">
              {t('team.business.chosen.title')}
            </Text>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('team.business.chosen.lead')}
            </Text>
          </div>
          {me && me.target_revenue === null ? (
            <Button
              type="button"
              variant="soft"
              className="min-h-11"
              onClick={() => setEditing({ member: me, mode: 'mine' })}
            >
              {t('team.business.chosen.defineMine')}
            </Button>
          ) : null}
        </div>
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {data.members.map(member => (
            <MemberObjectiveCard
              key={member.user_id}
              member={member}
              month={month}
              isMe={member.user_id === user?.id}
              onEdit={mode => setEditing({ member, mode })}
            />
          ))}
        </ul>
      </section>

      {editing ? (
        <TargetFormDialog
          mode={editing.mode}
          memberName={editing.member.name}
          monthLabel={month}
          initial={{
            target_revenue: editing.member.target_revenue,
            target_meetings: editing.member.target_meetings,
            target_accounts: editing.member.target_accounts,
          }}
          pending={propose.isPending || upsertMine.isPending}
          onSubmit={submit}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}

function MemberObjectiveCard({
  member,
  month,
  isMe,
  onEdit,
}: {
  member: Member
  month: string
  isMe: boolean
  onEdit: (mode: 'mine' | 'propose') => void
}) {
  const { t } = useTranslation('manager')
  return (
    <li className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 place-items-center rounded-full bg-[var(--bellum-accent-bg)] text-sm font-semibold text-[var(--bellum-text-accent)]"
        >
          {initialOf(member.name)}
        </span>
        <div className="min-w-0">
          <Text size="sm" weight="semibold" className="truncate text-[var(--bellum-text-primary)]">
            {member.name}
          </Text>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t(`roles.${member.role}`, { defaultValue: member.role })}
          </Text>
        </div>
      </div>
      <Text size="base" weight="semibold" className="mt-3 text-[var(--bellum-text-primary)]">
        {member.signed_amount !== null
          ? t('team.business.member.signed', { amount: formatEuro(member.signed_amount), month })
          : t('team.business.member.nothingSigned', { month })}
      </Text>
      <dl className="mt-1 space-y-0.5 text-[var(--bellum-text-secondary)]">
        <Row label={t('team.business.member.targetLabel')}>
          {member.target_revenue !== null
            ? formatEuro(member.target_revenue)
            : t('team.business.member.targetUndeclared')}
        </Row>
        <Row label={t('team.business.member.meetingsLabel')}>
          {member.target_meetings !== null
            ? t('team.business.member.ratio', { done: member.achieved_meetings, target: member.target_meetings })
            : t('team.business.member.noTarget', { done: member.achieved_meetings })}
        </Row>
        <Row label={t('team.business.member.accountsLabel')}>
          {member.target_accounts !== null
            ? t('team.business.member.ratio', { done: member.achieved_accounts, target: member.target_accounts })
            : t('team.business.member.noTarget', { done: member.achieved_accounts })}
        </Row>
      </dl>
      {member.pending_proposal ? (
        <Text size="xs" className="mt-2 text-[var(--warning-soft-text)]">
          {t('team.business.member.pendingProposal')}
        </Text>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11" onClick={() => onEdit(isMe ? 'mine' : 'propose')}>
          {isMe ? t('team.business.member.adjustMine') : t('team.business.member.propose')}
        </Button>
        <Link
          to="/team/member/$id"
          params={{ id: member.user_id }}
          className="inline-flex min-h-11 items-center px-2 text-sm text-[var(--bellum-text-accent)] hover:underline"
        >
          {t('team.business.member.openSheet')}
        </Link>
      </div>
    </li>
  )
}

function Row({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="text-xs">{label}</dt>
      <dd className="text-sm tabular-nums text-[var(--bellum-text-primary)]">{children}</dd>
    </div>
  )
}

// ── Revue des affaires ───────────────────────────────────────────────────────

function DealsView({ data }: { data: ManagerTeamBusiness }) {
  const { t } = useTranslation('manager')
  const { t: tProjects } = useTranslation('projects')
  const [explain, setExplain] = useState(false)
  const nameOf = (id: string | null) => data.members.find(m => m.user_id === id)?.name ?? null
  const stageLabel = (stage: string) => (KNOWN_STAGES.includes(stage) ? tProjects(`stage.states.${stage}`) : stage)

  return (
    <section aria-label={t('team.business.deals.title')} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Text element="h2" size="base" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('team.business.deals.title')}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('team.business.deals.lead')}
          </Text>
        </div>
        <Link
          to="/projects"
          className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] hover:underline"
        >
          {t('team.business.deals.fullPipeline')}
        </Link>
      </div>
      <Text size="sm" className="text-[var(--bellum-text-primary)]">
        {data.deals_total === 0
          ? t('team.business.deals.none')
          : data.deals_amount !== null
            ? t('team.business.deals.summary', { count: data.deals_total, amount: formatEuro(data.deals_amount) })
            : t('team.business.deals.summaryNoAmount', { count: data.deals_total })}
        {data.deals_without_amount > 0 && data.deals_amount !== null
          ? ` · ${t('team.business.deals.withoutAmount', { count: data.deals_without_amount })}`
          : ''}
      </Text>
      <Button
        type="button"
        variant="plain"
        className="min-h-11"
        aria-expanded={explain}
        onClick={() => setExplain(v => !v)}
      >
        {t('team.business.deals.understand')}
      </Button>
      {explain ? (
        <Text size="sm" className="rounded-lg bg-[var(--bellum-surface-2)] p-3 text-[var(--bellum-text-secondary)]">
          {t('team.business.deals.understandBody')}
        </Text>
      ) : null}

      {data.deals_total > 0 ? (
        <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-[var(--bellum-border)]">
          <table className="w-full min-w-[44rem] text-left">
            <thead className="bg-[var(--bellum-surface-2)]">
              <tr>
                {(['deal', 'owner', 'stage', 'amount', 'decision'] as const).map(col => (
                  <th
                    key={col}
                    scope="col"
                    className="px-3 py-2 text-xs font-semibold text-[var(--bellum-text-secondary)]"
                  >
                    {/* i18n keys: team.business.deals.col.deal | owner | stage | amount | decision */}
                    {t(`team.business.deals.col.${col}`)}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">{t('team.business.deals.col.action')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.deals.map(deal => {
                const close = formatCalendarDate(deal.expected_close_on)
                return (
                  <tr key={deal.opportunity_id} className="border-t border-[var(--bellum-border)] align-top">
                    <td className="px-3 py-2">
                      <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                        {deal.label}
                      </Text>
                      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                        {deal.company_name}
                      </Text>
                    </td>
                    <td className="px-3 py-2 text-sm text-[var(--bellum-text-primary)]">
                      {nameOf(deal.owner_user_id) ?? t('team.business.deals.noOwner')}
                    </td>
                    <td className="px-3 py-2 text-sm text-[var(--bellum-text-primary)]">{stageLabel(deal.stage)}</td>
                    <td className="px-3 py-2 text-sm tabular-nums text-[var(--bellum-text-primary)]">
                      {deal.estimated_amount !== null
                        ? formatEuro(deal.estimated_amount)
                        : t('team.business.deals.noAmount')}
                    </td>
                    <td className="px-3 py-2">
                      <Text size="sm" className="text-[var(--bellum-text-primary)]">
                        {deal.next_action_label ?? t('team.business.deals.noNextDecision')}
                      </Text>
                      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                        {close
                          ? t('team.business.deals.targetDecision', { date: close })
                          : t('team.business.deals.decisionToSpecify')}
                      </Text>
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        to="/accounts/$id"
                        params={{ id: deal.account_id }}
                        className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] hover:underline"
                      >
                        {t('team.business.deals.review')}
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('team.business.deals.footnote')}
      </Text>
      {/* Théo D team-business.A2 — le pipe valorisé par catégorie déclarée et la date de signature s'éditent dans Pilotage. */}
      <Link
        to="/pilotage/pipe"
        className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] hover:underline"
      >
        {t('team.business.deals.byCategory')}
      </Link>
    </section>
  )
}

// ── Portefeuilles ────────────────────────────────────────────────────────────

type PortfolioFilter = 'all' | 'no_action' | 'unassigned'

function PortfolioView({ data }: { data: ManagerTeamBusiness }) {
  const { t } = useTranslation('manager')
  const assign = useAssignAccount()
  const [filter, setFilter] = useState<PortfolioFilter>('all')
  const [assigning, setAssigning] = useState<string | null>(null)

  const rows = useMemo(
    () =>
      data.accounts.filter(a =>
        filter === 'no_action' ? a.next_action === null : filter === 'unassigned' ? a.assigned_to === null : true,
      ),
    [data.accounts, filter],
  )
  const nameOf = (id: string | null) => data.members.find(m => m.user_id === id)?.name ?? null

  return (
    <section aria-label={t('team.business.portfolio.title')} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Text element="h2" size="base" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('team.business.portfolio.title')}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('team.business.portfolio.lead')}
          </Text>
        </div>
        <Link
          to="/accounts"
          className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] hover:underline"
        >
          {t('team.business.portfolio.openAccounts')}
        </Link>
      </div>
      <FilterChips
        size="sm"
        ariaLabel={t('team.business.portfolio.filterLabel')}
        options={(['all', 'no_action', 'unassigned'] as const).map(key => ({
          value: key,
          // i18n keys: team.business.portfolio.filter.all | no_action | unassigned
          label: t(`team.business.portfolio.filter.${key}`),
        }))}
        value={filter}
        onChange={next => next && setFilter(next)}
      />
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('team.business.portfolio.count', { count: data.accounts_total })}
      </Text>
      {/* Théo D team-business.A3 — la carte de couverture par segment et par persona reste sur la vue d'ensemble. */}
      <Link
        to="/team"
        className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] hover:underline"
      >
        {t('team.business.portfolio.coverageMap')}
      </Link>
      <ul className="space-y-2">
        {rows.map(account => {
          const holder = nameOf(account.assigned_to)
          const due = formatCalendarDate(account.next_action?.due_date)
          return (
            <li
              key={account.id}
              className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    to="/accounts/$id"
                    params={{ id: account.id }}
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--bellum-text-primary)] hover:underline"
                  >
                    {account.company_name}
                  </Link>
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {[account.city, account.sector].filter(Boolean).join(' · ')}
                  </Text>
                </div>
                <Text size="sm" className="text-[var(--bellum-text-primary)]">
                  {holder ?? t('team.business.portfolio.noOwner')}
                </Text>
              </div>
              <Text size="sm" className="mt-1 text-[var(--bellum-text-primary)]">
                {account.next_action
                  ? `${account.next_action.label}${due ? ` · ${due}` : ''}`
                  : `${t('team.business.portfolio.noAction')} · ${t('team.business.portfolio.noActionHint')}`}
              </Text>
              <div className="mt-2">
                {assigning === account.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[var(--bellum-text-secondary)]">
                      {t('team.business.portfolio.assignTo')}
                    </span>
                    <SelectField
                      ariaLabel={t('team.business.portfolio.assignTo')}
                      value={account.assigned_to ?? ''}
                      disabled={assign.isPending}
                      emptyOption={{ label: t('team.business.portfolio.noOwner') }}
                      options={data.members.map(m => ({ value: m.user_id, label: m.name }))}
                      onChange={value => {
                        assign.mutate({ accountId: account.id, assignedTo: value === '' ? null : value })
                        setAssigning(null)
                      }}
                    />
                  </div>
                ) : (
                  <Button type="button" variant="outline" className="min-h-11" onClick={() => setAssigning(account.id)}>
                    {t('team.business.portfolio.assign')}
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
