import {
  MANAGER_PERIOD_DAYS,
  hasPermission,
  parseManagerPeriodDays,
  workspaceRoleValues,
  type ManagerMemberStats,
  type ManagerPeriodDays,
} from '@bellum/contracts'
import {
  CountBadge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  SelectField,
  TabNav,
  Text,
  cn,
} from '@bellum/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { Activity, ChevronDown, Layers, ListChecks, Search, SlidersHorizontal, Target, Users } from 'lucide-react'
import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { appLocale } from '@/lib/locale'
import { TEAM_SUBTABS, type TeamSubtab, type TeamTab } from '../../lib/team-tabs'

const MEMBER_ROLES: readonly string[] = workspaceRoleValues

/** Les onglets que l'espace Équipe SAIT rendre. Un onglet sans écran n'apparaît pas : il serait mort. */
export const TEAM_TAB_ICONS: Record<TeamTab, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  vue: Layers,
  objectifs: Target,
  plans: ListChecks,
  recherches: Search,
  activite: Activity,
  administration: SlidersHorizontal,
}

export function TeamTabBar({
  tab,
  tabs,
  openActions,
  period,
}: {
  tab: TeamTab
  tabs: readonly TeamTab[]
  openActions: number | null
  /** La période demandée dans l'adresse, si elle y est : elle suit l'utilisateur d'un onglet à l'autre. */
  period: ManagerPeriodDays | undefined
}) {
  const { t } = useTranslation('manager')
  return (
    <nav
      aria-label={t('board.tabs.label')}
      className="flex gap-1 overflow-x-auto border-b border-[var(--bellum-border)]"
    >
      {tabs.map(key => {
        const Icon = TEAM_TAB_ICONS[key]
        const active = key === tab
        const className = cn(
          'inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]',
          active
            ? 'border-[var(--bellum-primary-500)] text-[var(--bellum-text-primary)]'
            : 'border-transparent text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]',
        )
        const body = (
          <>
            <Icon aria-hidden className="size-4" />
            {t(`board.tabs.${key}`)}
            {key === 'plans' && openActions !== null && openActions > 0 ? <CountBadge count={openActions} /> : null}
          </>
        )
        // Administration est l'écran Réglages › Équipe : on y va, on ne le recopie pas.
        return key === 'administration' ? (
          <Link key={key} to="/settings/team" className={className}>
            {body}
          </Link>
        ) : (
          <Link
            key={key}
            to="/team"
            search={period === undefined ? { onglet: key } : { periode: period, onglet: key }}
            aria-current={active ? 'page' : undefined}
            className={className}
          >
            {body}
          </Link>
        )
      })}
    </nav>
  )
}

/** Le second niveau : des pastilles qui filtrent ce qu'on regarde dans l'onglet, jamais des blocs empilés. */
export function TeamSubTabs({ tab, sub }: { tab: TeamTab; sub: TeamSubtab | undefined }) {
  const { t } = useTranslation('manager')
  const navigate = useNavigate()
  if (!(tab in TEAM_SUBTABS) || !sub) return null
  const keys = TEAM_SUBTABS[tab as keyof typeof TEAM_SUBTABS] as readonly TeamSubtab[]
  return (
    <TabNav
      variant="pill"
      tabs={keys.map(key => ({ key, label: t(`board.sub.${key}`) }))}
      activeTab={sub}
      onTabChange={key =>
        void navigate({ to: '/team', search: prev => ({ ...prev, onglet: tab, sous: key as TeamSubtab }) })
      }
    />
  )
}

/**
 * Les filtres de page : la PORTÉE (toute l'équipe, ou une personne) et le MOIS des objectifs. Ils
 * restreignent ce que la page montre ; ils ne changent jamais le rôle ni les droits de qui lit.
 */
export function TeamFilters({
  members,
  memberId,
  onMember,
  month,
  onMonth,
  months,
  period,
  onPeriod,
  showPeriod,
}: {
  members: ManagerMemberStats[]
  memberId: string
  onMember: (next: string) => void
  month: string
  onMonth: (next: string) => void
  months: readonly string[]
  period: ManagerPeriodDays
  onPeriod: (next: ManagerPeriodDays) => void
  showPeriod: boolean
}) {
  const { t } = useTranslation('manager')
  const locale = appLocale()
  const label = (value: string) =>
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${value}-01T00:00:00Z`),
    )
  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name, locale, { sensitivity: 'base' }))
  return (
    <div role="group" aria-label={t('board.filters.label')} className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <label className="flex items-center gap-2">
        <Users aria-hidden className="size-4 text-[var(--bellum-text-muted)]" />
        <Text
          size="sm"
          className="shrink-0 whitespace-nowrap text-[var(--bellum-text-secondary)]"
          title={t('board.filters.scope')}
        >
          {t('board.filters.scope')}
        </Text>
        <SelectField
          size="sm"
          value={memberId}
          ariaLabel={t('board.filters.scope')}
          emptyOption={{ label: t('board.filters.everyone') }}
          options={sorted.map(member => ({ value: member.user_id, label: member.name }))}
          onChange={onMember}
        />
      </label>
      <label className="flex items-center gap-2">
        <Target aria-hidden className="size-4 text-[var(--bellum-text-muted)]" />
        <Text
          size="sm"
          className="shrink-0 whitespace-nowrap text-[var(--bellum-text-secondary)]"
          title={t('board.filters.objectives')}
        >
          {t('board.filters.objectives')}
        </Text>
        <SelectField
          size="sm"
          value={month}
          ariaLabel={t('board.filters.objectives')}
          options={months.map(value => ({ value, label: label(value) }))}
          onChange={onMonth}
        />
      </label>
      {showPeriod ? (
        <label className="flex items-center gap-2">
          <Activity aria-hidden className="size-4 text-[var(--bellum-text-muted)]" />
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('board.filters.period')}
          </Text>
          <SelectField
            size="sm"
            value={String(period)}
            ariaLabel={t('board.period.label')}
            options={MANAGER_PERIOD_DAYS.map(days => ({ value: String(days), label: t(`board.period.days_${days}`) }))}
            onChange={next => onPeriod(parseManagerPeriodDays(next))}
          />
        </label>
      ) : null}
    </div>
  )
}

/**
 * « Maëlle · Direction » — qui lit, et avec quel rôle. Un clic ouvre la comparaison des parcours :
 * une vue, pas un droit. La fenêtre dit ce que chaque rôle ouvre dans l'espace Équipe ; elle ne
 * donne et ne retire aucun accès à qui la lit.
 */
export function TeamActorChip({
  members,
  viewerId,
  viewerName,
  viewerRole,
}: {
  members: ManagerMemberStats[]
  viewerId: string | null
  viewerName: string | null
  viewerRole: ManagerMemberStats['role'] | null
}) {
  const { t, i18n } = useTranslation(['manager', 'common'])
  if (!viewerName || !viewerRole) return null
  const roleLabel = (role: string) => (MEMBER_ROLES.includes(role) ? t(`manager:roles.${role}`) : role)
  const sorted = [...members].sort((a, b) =>
    a.name.localeCompare(b.name, i18n.language === 'fr' ? 'fr-FR' : 'en-GB', { sensitivity: 'base' }),
  )
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-3 text-sm font-medium text-[var(--accent-soft-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
        >
          <span
            aria-hidden
            className="flex size-6 items-center justify-center rounded-full bg-[var(--bellum-surface-1)] text-xs font-semibold"
          >
            {viewerName.charAt(0).toUpperCase()}
          </span>
          {`${viewerName} · ${roleLabel(viewerRole)}`}
          <ChevronDown aria-hidden className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('manager:board.actor.title')}</DialogTitle>
          <DialogDescription>{t('manager:board.actor.description')}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {sorted.map(member => (
            <li
              key={member.user_id}
              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-[var(--bellum-text-primary)]">
                  {member.name}
                  {member.user_id === viewerId ? ` (${t('manager:board.actor.you')})` : ''}
                </span>
                <span className="block text-xs text-[var(--bellum-text-secondary)]">{roleLabel(member.role)}</span>
              </span>
              <span className="text-xs text-[var(--bellum-text-secondary)]">
                {hasPermission(member.role, 'team:manage')
                  ? t('manager:board.actor.sees')
                  : t('manager:board.actor.doesNotSee')}
              </span>
            </li>
          ))}
        </ul>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          <strong className="text-[var(--bellum-text-primary)]">{t('manager:board.actor.noteTitle')}</strong>{' '}
          {t('manager:board.actor.note')}
        </Text>
      </DialogContent>
    </Dialog>
  )
}
