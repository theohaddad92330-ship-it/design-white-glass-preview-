import { useMemo, useState } from 'react'
import type { ManagerMemberStats, ManagerSharedActions } from '@bellum/contracts'
import { Button, Checkbox, FilterChips, Input, Popover, PopoverContent, PopoverTrigger, Text } from '@bellum/ui'
import { CalendarDays, ChevronsUpDown, Columns3, List, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useManagerStats } from '@/features/manager/hooks/useManagerStats'
import { isoDay, TeamActionCard, TeamCreateActionButton } from './TeamEquipeActions'
import { TeamEquipeShell } from './TeamEquipeShell'

type Item = ManagerSharedActions['items'][number]
type PlansLens = 'todo' | 'late' | 'today' | 'delegated'
type PlansMode = 'list' | 'split' | 'week'

const LENSES: readonly PlansLens[] = ['todo', 'late', 'today', 'delegated']

/** Les actions de l'équipe que la lentille retient — pure, testée. */
export function filterActions(
  items: readonly Item[],
  lens: PlansLens,
  today: string,
  query: string,
  accounts: readonly string[],
): Item[] {
  const needle = query.trim().toLowerCase()
  return items.filter(item => {
    if (lens === 'late' && !item.overdue) return false
    if (lens === 'today' && item.due_date !== today) return false
    if (lens === 'delegated' && item.assigned_to === null) return false
    if (accounts.length > 0 && !accounts.includes(item.account_id)) return false
    if (needle && !`${item.label} ${item.company_name}`.toLowerCase().includes(needle)) return false
    return true
  })
}

/**
 * Théo D team-plans — « Du plan à l'action », dans l'ordre de la maquette : les
 * lentilles (À faire · En retard · Aujourd'hui · Déléguées) et « Créer une
 * action » ; la recherche, le filtre de comptes (multi-sélection) et
 * l'affichage (Liste · Répartition · Semaine) ; puis la liste dense des actions
 * dans un seul panneau. « Terminées » et « Toutes » ne sont pas proposées : la
 * file partagée ne porte que les actions OUVERTES (`shared_actions`), une
 * lentille vide à dessein mentirait.
 */
export function TeamPlansView() {
  const { t } = useTranslation('manager')
  const { data, isLoading, error } = useManagerStats(7)
  const [lens, setLens] = useState<PlansLens>('todo')
  const [mode, setMode] = useState<PlansMode>('list')
  const [query, setQuery] = useState('')
  const [accounts, setAccounts] = useState<readonly string[]>([])

  const now = new Date()
  const today = isoDay(now)
  const tomorrow = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  const actions = data?.shared_actions
  const members: ManagerMemberStats[] = data?.members ?? []
  const nameOf = (id: string) => members.find(m => m.user_id === id)?.name.split(' ')[0] ?? id
  const whoOf = (item: Item) => nameOf(item.assigned_to ?? item.owner_user_id)

  const visible = useMemo(
    () => filterActions(actions?.items ?? [], lens, today, query, accounts),
    [actions, lens, today, query, accounts],
  )
  const accountOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const item of actions?.items ?? []) seen.set(item.account_id, item.company_name)
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [actions])

  const shell = (body: React.ReactNode) => (
    <TeamEquipeShell active="plans" title={t('equipe.plans.title')} tagline={t('equipe.plans.tagline')}>
      {body}
    </TeamEquipeShell>
  )
  if (isLoading) return shell(<Text size="sm">{t('states.loading')}</Text>)
  if (error || !data) return shell(<Text size="sm">{t('errors.load')}</Text>)

  const groups: { key: string; label: string; items: Item[] }[] =
    mode === 'split'
      ? members
          .map(m => ({
            key: m.user_id,
            label: m.name.split(' ')[0] ?? m.name,
            items: visible.filter(i => (i.assigned_to ?? i.owner_user_id) === m.user_id),
          }))
          .filter(g => g.items.length > 0)
      : mode === 'week'
        ? [
            { key: 'late', label: t('equipe.plans.weekLate'), items: visible.filter(i => i.overdue) },
            {
              key: 'today',
              label: t('equipe.plans.today'),
              items: visible.filter(i => !i.overdue && i.due_date === today),
            },
            {
              key: 'tomorrow',
              label: t('equipe.plans.tomorrow'),
              items: visible.filter(i => !i.overdue && i.due_date === tomorrow),
            },
            {
              key: 'later',
              label: t('equipe.plans.weekLater'),
              items: visible.filter(i => !i.overdue && i.due_date !== null && i.due_date > tomorrow),
            },
            { key: 'none', label: t('sharedActions.noDue'), items: visible.filter(i => i.due_date === null) },
          ].filter(g => g.items.length > 0)
        : []

  const toggleAccount = (value: string) =>
    setAccounts(current => (current.includes(value) ? current.filter(v => v !== value) : [...current, value]))

  return shell(
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          ariaLabel={t('equipe.plans.lensLabel')}
          options={LENSES.map(value => ({ value, label: t(`equipe.plans.lens.${value}`) }))}
          value={lens}
          onChange={next => next && setLens(next)}
        />
        <TeamCreateActionButton members={members} accounts={accountOptions} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--bellum-text-muted)]"
          />
          <Input
            type="search"
            value={query}
            aria-label={t('equipe.plans.search')}
            placeholder={t('equipe.plans.search')}
            onChange={event => setQuery(event.target.value)}
            className="min-h-11 pl-9"
          />
        </div>
        {accountOptions.length > 1 ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" icon={ChevronsUpDown} iconPosition="right" className="min-h-11">
                {accounts.length === 0
                  ? t('equipe.plans.allAccounts')
                  : t('equipe.plans.someAccounts', { count: accounts.length })}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-2">
              <fieldset aria-label={t('equipe.plans.accounts')} className="max-h-72 overflow-y-auto">
                {accountOptions.map(option => (
                  <label
                    key={option.value}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-2 text-sm hover:bg-[var(--bellum-surface-2)]"
                  >
                    <Checkbox
                      checked={accounts.includes(option.value)}
                      onCheckedChange={() => toggleAccount(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </fieldset>
              {accounts.length > 0 ? (
                <Button variant="plain" size="sm" className="mt-1 w-full" onClick={() => setAccounts([])}>
                  {t('equipe.plans.allAccounts')}
                </Button>
              ) : null}
            </PopoverContent>
          </Popover>
        ) : null}
        <div
          role="group"
          aria-label={t('equipe.plans.modeLabel')}
          className="ml-auto flex gap-1 rounded-card border border-[var(--bellum-border)] p-1"
        >
          {(
            [
              ['list', List],
              ['split', Columns3],
              ['week', CalendarDays],
            ] as const
          ).map(([value, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] ${
                mode === value
                  ? 'bg-[var(--accent-soft-bg)] font-medium text-[var(--accent-soft-text)]'
                  : 'text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]'
              }`}
            >
              <Icon aria-hidden="true" className="size-4" />
              {t(`equipe.plans.mode.${value}`)}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <Text
          size="sm"
          className="rounded-card border border-[var(--bellum-border)] p-4 text-[var(--bellum-text-secondary)]"
        >
          {actions?.open === 0 ? t('sharedActions.empty') : t('sharedActions.emptyFiltered')}
        </Text>
      ) : mode === 'list' ? (
        <ul className="divide-y divide-[var(--bellum-border)] overflow-hidden rounded-card border border-[var(--bellum-border)] bg-card">
          {visible.map(item => (
            <TeamActionCard key={item.id} item={item} who={whoOf(item)} />
          ))}
        </ul>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map(group => (
            <section
              key={group.key}
              aria-label={group.label}
              className="overflow-hidden rounded-card border border-[var(--bellum-border)] bg-card"
            >
              <header className="flex items-center justify-between border-b border-[var(--bellum-border)] px-5 py-3">
                <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
                  {group.label}
                </Text>
                <Text size="sm" className="text-[var(--bellum-text-muted)]">
                  {group.items.length}
                </Text>
              </header>
              <ul className="divide-y divide-[var(--bellum-border)]">
                {group.items.map(item => (
                  <TeamActionCard key={item.id} item={item} who={whoOf(item)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {actions && actions.open > actions.items.length ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('sharedActions.truncated', { count: actions.items.length, total: actions.open })}
        </Text>
      ) : null}
    </section>,
  )
}
