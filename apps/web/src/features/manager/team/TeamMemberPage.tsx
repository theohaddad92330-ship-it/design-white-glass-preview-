import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button, SelectField, Text } from '@bellum/ui'
import type { ManagerMember } from '@bellum/contracts'
import { PROJECT_STAGES, hasPermission } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { formatCalendarDate } from '@/lib/deadline'
import { useTeam } from '@/features/team/hooks/useTeam'
import { useAssignAccount } from '../hooks/useAssignAccount'
import {
  useMyObjectiveProposals,
  useProposeObjective,
  useRespondToProposal,
  useTeamMember,
} from '../hooks/useTeamViews'
import { formatEuro, initialOf, monthLabel } from './team-format'
import { TargetFormDialog, type TargetFormValues } from './TargetFormDialog'

const KNOWN_STAGES: readonly string[] = PROJECT_STAGES

/**
 * Équipe › Fiche d'un membre (Théo D team-member).
 *
 * Route par membre (`/team/member/$id`), en LECTURE de ce que la personne a
 * enregistré. Décision Louis 22/10 (Q3) : tout membre la lit — mais JAMAIS la
 * messagerie (c96), et la fiche le dit. Les intégrations sont nommées par
 * capacité, jamais par fournisseur.
 */
export function TeamMemberPage({ memberId }: { memberId: string }) {
  const { t } = useTranslation('manager')
  const query = useTeamMember(memberId)

  return (
    <div className="space-y-6">
      <Link
        to="/team"
        className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] hover:underline"
      >
        {t('team.member.back')}
      </Link>
      {query.isPending ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('team.loading')}
        </Text>
      ) : query.isError ? (
        <Text size="sm" role="alert" className="text-[var(--bellum-text-secondary)]">
          {t('team.member.loadError')}
        </Text>
      ) : (
        <MemberSheet data={query.data} />
      )}
    </div>
  )
}

function MemberSheet({ data }: { data: ManagerMember }) {
  const { t } = useTranslation('manager')
  const { user } = useSession()
  const { team } = useTeam()
  const canManage = team ? hasPermission(team.workspace.role, 'team:manage') : false
  const isMe = user?.id === data.member.user_id
  const month = monthLabel(data.period_month)
  const first = data.member.name.split(' ')[0] ?? data.member.name

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-full bg-[var(--bellum-accent-bg)] font-semibold text-[var(--bellum-text-accent)]"
          >
            {initialOf(data.member.name)}
          </span>
          <Text element="h1" size="2xl" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('team.member.title', { name: data.member.name })}
          </Text>
        </div>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('team.member.summary', {
            name: first,
            accounts: data.counts.accounts,
            deals: data.counts.open_opportunities,
            actions: data.counts.open_actions,
          })}
        </Text>
      </header>

      <ObjectiveBlock data={data} month={month} isMe={isMe} canManage={canManage} />

      <Block title={t('team.member.plan.title')}>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('team.member.plan.lead')}
        </Text>
        {canManage ? (
          <Link
            to="/team/plans"
            className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('team.member.plan.open')}
          </Link>
        ) : null}
      </Block>

      <Block title={t('team.member.actions.title')}>
        {data.actions.length === 0 ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('team.member.actions.empty')}
          </Text>
        ) : (
          <ul className="space-y-2">
            {data.actions.map(action => {
              const due = formatCalendarDate(action.due_date)
              return (
                <li
                  key={action.id}
                  className="rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3"
                >
                  <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                    {action.label}
                  </Text>
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {action.company_name} · {due ?? t('team.plans.noDue')}
                    {action.overdue ? ` · ${t('team.plans.badgeOverdue')}` : ''}
                  </Text>
                  <Link
                    to="/accounts/$id"
                    params={{ id: action.account_id }}
                    search={{ tab: 'plan' }}
                    className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] hover:underline"
                  >
                    {t('team.plans.prepare')}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Block>

      <PortfolioBlock data={data} canManage={canManage} />

      <Block title={t('team.member.deals.title')}>
        {data.opportunities.length === 0 ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('team.member.deals.empty')}
          </Text>
        ) : (
          <ul className="space-y-2">
            {data.opportunities.map(opp => (
              <li key={opp.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  to="/accounts/$id"
                  params={{ id: opp.account_id }}
                  className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-primary)] hover:underline"
                >
                  {opp.label} · {opp.company_name}
                </Link>
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  <StageLabel stage={opp.stage} /> ·{' '}
                  {opp.estimated_amount !== null ? formatEuro(opp.estimated_amount) : t('team.business.deals.noAmount')}
                </Text>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title={t('team.member.role.title')}>
        <Text size="sm" className="text-[var(--bellum-text-primary)]">
          {t(`roles.${data.member.role}`, { defaultValue: data.member.role })}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('team.member.role.delegationNote')}
        </Text>
        <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
          {t('team.member.role.mailboxGuard')}
        </Text>
        {/* Théo D team-member.A2 — le départ d'un membre et la reprise de son portefeuille restent dans Réglages › Équipe. */}
        {canManage ? (
          <Link
            to="/settings/team"
            className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('team.member.role.handover')}
          </Link>
        ) : null}
      </Block>

      <Block title={t('team.member.access.title')}>
        {data.integrations.length === 0 ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('team.member.access.none')}
          </Text>
        ) : (
          <ul className="space-y-1">
            {data.integrations.map(integration => (
              <li key={integration.kind} className="text-sm text-[var(--bellum-text-primary)]">
                {/* i18n keys: team.member.access.kind.mailbox | crm */}
                {t(`team.member.access.kind.${integration.kind}`)}
                {integration.connected_by_member ? ` · ${t('team.member.access.byMember', { name: first })}` : ''}
              </li>
            ))}
          </ul>
        )}
        <Link
          to="/integrations"
          className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] hover:underline"
        >
          {t('team.member.access.open')}
        </Link>
      </Block>
    </div>
  )
}

function StageLabel({ stage }: { stage: string }) {
  const { t } = useTranslation('projects')
  return <>{KNOWN_STAGES.includes(stage) ? t(`stage.states.${stage}`) : stage}</>
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      aria-label={title}
      className="space-y-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4"
    >
      <Text element="h2" size="base" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {title}
      </Text>
      {children}
    </section>
  )
}

function ObjectiveBlock({
  data,
  month,
  isMe,
  canManage,
}: {
  data: ManagerMember
  month: string
  isMe: boolean
  canManage: boolean
}) {
  const { t } = useTranslation('manager')
  const propose = useProposeObjective()
  const respond = useRespondToProposal()
  const mine = useMyObjectiveProposals()
  const [proposing, setProposing] = useState(false)
  const { objective } = data
  const pendingForMe = isMe ? (mine.data ?? []) : []

  const submit = (values: TargetFormValues, reason: string) => {
    propose.mutate(
      { user_id: data.member.user_id, period_month: data.period_month, ...values, reason: reason || undefined },
      {
        onSuccess: () => {
          toast.success(t('team.target.proposed', { name: data.member.name }))
          setProposing(false)
        },
        onError: () => toast.error(t('team.target.proposeFailed')),
      },
    )
  }

  return (
    <Block title={isMe ? t('team.member.objective.titleMine') : t('team.member.objective.title')}>
      <Text size="base" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {objective.signed_amount !== null
          ? t('team.business.member.signed', { amount: formatEuro(objective.signed_amount), month })
          : t('team.business.member.nothingSigned', { month })}
      </Text>
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {objective.target_revenue !== null
          ? t('team.member.objective.target', { amount: formatEuro(objective.target_revenue) })
          : t('team.business.member.targetUndeclared')}
      </Text>
      {objective.pending_proposal ? (
        <Text size="xs" className="text-[var(--warning-soft-text)]">
          {t('team.business.member.pendingProposal')}
        </Text>
      ) : null}

      {pendingForMe.map(proposal => (
        <div
          key={proposal.id}
          className="rounded-lg border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] p-3"
        >
          <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
            {t('team.member.objective.proposalForYou')}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {[
              proposal.target_revenue !== null ? formatEuro(proposal.target_revenue) : null,
              proposal.target_meetings !== null
                ? t('team.member.objective.meetings', { count: proposal.target_meetings })
                : null,
              proposal.target_accounts !== null
                ? t('team.member.objective.accounts', { count: proposal.target_accounts })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {proposal.reason ? (
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {proposal.reason}
            </Text>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-h-11"
              disabled={respond.isPending}
              onClick={() => respond.mutate({ id: proposal.id, decision: 'accepted' })}
            >
              {t('team.member.objective.accept')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={respond.isPending}
              onClick={() => respond.mutate({ id: proposal.id, decision: 'refused' })}
            >
              {t('team.member.objective.refuse')}
            </Button>
          </div>
        </div>
      ))}

      {canManage && !isMe ? (
        <Button type="button" variant="soft" className="min-h-11" onClick={() => setProposing(true)}>
          {t('team.member.objective.propose')}
        </Button>
      ) : null}
      {proposing ? (
        <TargetFormDialog
          mode="propose"
          memberName={data.member.name}
          monthLabel={month}
          initial={{
            target_revenue: objective.target_revenue,
            target_meetings: objective.target_meetings,
            target_accounts: objective.target_accounts,
          }}
          pending={propose.isPending}
          onSubmit={submit}
          onClose={() => setProposing(false)}
        />
      ) : null}
    </Block>
  )
}

function PortfolioBlock({ data, canManage }: { data: ManagerMember; canManage: boolean }) {
  const { t } = useTranslation('manager')
  const assign = useAssignAccount()
  const team = useTeam()
  const [assigning, setAssigning] = useState<string | null>(null)
  const members = team.team?.members ?? []

  return (
    <Block title={t('team.member.portfolio.title')}>
      {data.accounts.length === 0 ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('team.member.portfolio.empty')}
        </Text>
      ) : (
        <ul className="space-y-2">
          {data.accounts.map(account => {
            const due = formatCalendarDate(account.next_action?.due_date)
            return (
              <li key={account.id} className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    to="/accounts/$id"
                    params={{ id: account.id }}
                    className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-primary)] hover:underline"
                  >
                    {account.company_name}
                  </Link>
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {account.next_action
                      ? `${account.next_action.label}${due ? ` · ${due}` : ''}`
                      : `${t('team.business.portfolio.noAction')} · ${t('team.business.portfolio.noActionHint')}`}
                  </Text>
                </div>
                {canManage ? (
                  assigning === account.id ? (
                    <SelectField
                      ariaLabel={t('team.business.portfolio.assignTo')}
                      value={data.member.user_id}
                      disabled={assign.isPending}
                      emptyOption={{ label: t('team.business.portfolio.noOwner') }}
                      options={members.map(m => ({ value: m.userId, label: m.fullName ?? m.email ?? m.userId }))}
                      onChange={value => {
                        assign.mutate({ accountId: account.id, assignedTo: value === '' ? null : value })
                        setAssigning(null)
                      }}
                    />
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => setAssigning(account.id)}
                    >
                      {t('team.business.portfolio.assign')}
                    </Button>
                  )
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </Block>
  )
}
