import type { AccountListItem, ManagerMemberStats } from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FilterChips,
  SearchInput,
  SelectField,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useAccountsCache } from '@/features/accounts/hooks/useAccountsInfiniteScroll'
import { useDebounce } from '@/hooks/useDebounce'
import { useAssignAccount } from '../../hooks/useAssignAccount'

const SITUATIONS = ['followed', 'noAction', 'noOwner'] as const
type Situation = (typeof SITUATIONS)[number]

const PANEL = 'rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4 md:p-6'

function matches(account: AccountListItem, situation: Situation): boolean {
  if (situation === 'noOwner') return !account.owner
  if (situation === 'noAction') return !account.next_action_label
  return !!account.owner && !!account.next_action_label
}

/**
 * Objectifs & affaires › Portefeuilles — Théo D team-business (`t8-panel` « Le bon responsable,
 * la bonne prochaine action. »). Une ligne par compte de l'espace : le compte (lien vers sa
 * fiche), son responsable, sa prochaine action, et « Attribuer ». La liste est celle de
 * Comptes (`GET /accounts`, mêmes lignes, même porteur nommé côté serveur) ; « Attribuer »
 * passe par la porte d'attribution de l'équipe (`useAssignAccount`), jamais une seconde.
 *
 * Recherche par nom côté serveur ; la situation (suivis · sans action ouverte · sans
 * responsable) se lit sur les lignes chargées, en multi-sélection. Aucun compte : une phrase.
 */
export function TeamPortfolios({ members }: { members: ManagerMemberStats[] }) {
  const { t } = useTranslation('manager')
  const [query, setQuery] = useState('')
  const [debounced] = useDebounce(query.trim(), 300)
  const [situations, setSituations] = useState<Situation[]>([])
  const list = useAccounts({ limit: 50, ...(debounced ? { q: debounced } : {}) })
  const accounts = useAccountsCache(list.data)
  const total = list.data?.pages[0]?.pagination?.totalItems ?? accounts.length
  const shown =
    situations.length === 0 ? accounts : accounts.filter(account => situations.some(s => matches(account, s)))

  return (
    <section aria-labelledby="team-portfolios-title" data-board-block="portfolios" className={`${PANEL} space-y-4`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h2 id="team-portfolios-title" className="text-lg font-semibold text-[var(--bellum-text-primary)]">
            {t('board.portfolios.title')}
          </h2>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('board.portfolios.subtitle')}
          </Text>
        </div>
        <Link
          to="/accounts"
          className="inline-flex min-h-11 shrink-0 items-center rounded-control border border-[var(--bellum-border)] px-3 text-sm font-medium text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-row-hover)]"
        >
          {t('board.portfolios.openAccounts')}
        </Link>
      </div>

      <div data-testid="team-portfolios-toolbar" className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="w-full md:w-72">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t('board.portfolios.search')}
            ariaLabel={t('board.portfolios.search')}
          />
        </div>
        <FilterChips
          multiple
          size="sm"
          ariaLabel={t('board.portfolios.situation')}
          options={SITUATIONS.map(value => ({ value, label: t(`board.portfolios.situations.${value}`) }))}
          values={situations}
          onToggle={value =>
            setSituations(prev => (prev.includes(value) ? prev.filter(entry => entry !== value) : [...prev, value]))
          }
        />
        {!list.isLoading && !list.isError ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {situations.length === 0
              ? t('board.portfolios.count', { count: total })
              : t('board.portfolios.countShown', { count: shown.length })}
          </Text>
        ) : null}
      </div>

      {list.isLoading ? (
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('states.loading')}
        </Text>
      ) : list.isError ? (
        <Text size="sm" role="alert" className="text-[var(--bellum-text-secondary)]">
          {t('board.portfolios.loadError')}
        </Text>
      ) : shown.length === 0 ? (
        <Text size="sm" data-testid="team-portfolios-empty" className="text-[var(--bellum-text-secondary)]">
          {accounts.length === 0 ? t('board.portfolios.empty') : t('board.portfolios.emptyFiltered')}
        </Text>
      ) : (
        <ul className="divide-y divide-[var(--bellum-border)]">
          {shown.map(account => (
            <PortfolioRow key={account.id} account={account} members={members} />
          ))}
        </ul>
      )}
      {list.hasNextPage ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {t('board.portfolios.more')}
        </Button>
      ) : null}
    </section>
  )
}

function PortfolioRow({ account, members }: { account: AccountListItem; members: ManagerMemberStats[] }) {
  const { t } = useTranslation('manager')
  const initials = account.company_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('')
  return (
    <li
      data-account={account.id}
      className="grid gap-3 py-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_auto] md:items-center"
    >
      <Link
        to="/accounts/$id"
        params={{ id: account.id }}
        className="flex min-h-11 min-w-0 items-center gap-3 hover:underline"
      >
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-xs font-semibold text-[var(--bellum-text-secondary)]"
        >
          {initials}
        </span>
        <span className="min-w-0">
          <strong className="block truncate text-sm font-semibold text-[var(--bellum-text-primary)]">
            {account.company_name}
          </strong>
          {account.sector ? (
            <small className="block truncate text-xs text-[var(--bellum-text-secondary)]">{account.sector}</small>
          ) : null}
        </span>
      </Link>
      <span className="text-sm">
        {account.owner ? (
          <span className="inline-flex items-center gap-2 text-[var(--bellum-text-primary)]">
            <span
              aria-hidden
              className="flex size-6 items-center justify-center rounded-full border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-xs font-semibold text-[var(--accent-soft-text)]"
            >
              {account.owner.name.charAt(0).toUpperCase()}
            </span>
            {account.owner.name}
          </span>
        ) : (
          <span className="inline-flex min-h-6 items-center rounded-badge border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] px-2 text-xs font-medium text-[var(--warning-soft-text)]">
            {t('board.portfolios.noOwner')}
          </span>
        )}
      </span>
      <span className="min-w-0 text-sm">
        <strong className="block truncate font-medium text-[var(--bellum-text-primary)]">
          {account.next_action_label ?? t('board.portfolios.noAction')}
        </strong>
        <span className="block truncate text-xs text-[var(--bellum-text-secondary)]">
          {account.next_action_label
            ? (account.next_action_horizon ?? t('board.portfolios.noHorizon'))
            : t('board.portfolios.noActionHint')}
        </span>
      </span>
      <AssignDialog account={account} members={members} />
    </li>
  )
}

/** « Attribuer » — le nouveau responsable, confirmé. Rien ne change sans « Confirmer l'attribution ». */
function AssignDialog({ account, members }: { account: AccountListItem; members: ManagerMemberStats[] }) {
  const { t } = useTranslation(['manager', 'common'])
  const [open, setOpen] = useState(false)
  const [owner, setOwner] = useState(account.owner?.user_id ?? '')
  const assign = useAssignAccount()
  const confirm = () =>
    assign.mutate({ accountId: account.id, assignedTo: owner || null }, { onSuccess: () => setOpen(false) })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="min-h-11 justify-self-start md:justify-self-end">
          {t('manager:board.portfolios.assign')}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('manager:board.portfolios.assignTitle', { company: account.company_name })}</DialogTitle>
          <DialogDescription>{t('manager:board.portfolios.assignBody')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <span className="block text-sm font-medium text-[var(--bellum-text-primary)]">
            {t('manager:board.portfolios.newOwner')}
          </span>
          <SelectField
            value={owner}
            ariaLabel={t('manager:board.portfolios.newOwner')}
            options={[
              { value: '', label: t('manager:board.portfolios.noOwner') },
              ...members.map(member => ({ value: member.user_id, label: member.name })),
            ]}
            onChange={setOwner}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            type="button"
            onClick={confirm}
            disabled={assign.isPending || owner === (account.owner?.user_id ?? '')}
          >
            {t('manager:board.portfolios.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
