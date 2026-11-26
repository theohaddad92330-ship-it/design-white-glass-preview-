import { Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button, Skeleton, Text } from '@bellum/ui'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { ScreenState } from '@/components/primitives/ScreenState'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { formatSignalDate } from '@/lib/signal-date'
import { usePlaceRegionsReady } from '@/lib/zones/place-region'
import type { AccountSignalLine, HistoryContact } from '@bellum/contracts'
import { formatTimeAgo } from '@/lib/relative-time'
import type { WatchlistItem } from '@/features/watchlist/model/watchlist'
import { buildAccountHistory, type AccountHistoryRow } from '../model/account-history'
import {
  applyHistoryFilters,
  EMPTY_HISTORY_FILTERS,
  historyFacets,
  type HistoryFilters,
} from '../model/history-filters'
import type { ParsedSearch } from '../model/signal-search'
import { HistoryFiltersBar } from './HistoryFiltersBar'
import { GroupEntitiesNote } from '@/features/accounts/view/account-detail/tabs/opportunities/GroupEntitiesNote'
import {
  SignalCompactRow,
  type CompactPerson,
} from '@/features/accounts/view/account-detail/tabs/opportunities/SignalCompactRow'
import { proposalForLine } from '@/features/accounts/view/account-detail/tabs/opportunities/signal-table'
import type { MissionContact } from '@/features/accounts/view/account-detail/tabs/opportunities/account-missions'
import {
  SignalBrowserDialog,
  type SignalBrowserEntry,
} from '@/features/accounts/view/account-detail/tabs/opportunities/SignalBrowserDialog'
import { signalLineToPlanAction } from '@/features/accounts/view/account-detail/tabs/veille/watchActions'
import { usePersistAccountPlan } from '@/features/accounts/hooks/usePersistAccountPlan'
import { useOptionalContactEngagement } from '@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext'
import { contactKeys, contactsApi } from '@/features/contacts/api'

/** Les compétences qu'une ligne nomme : les plus fréquentes, pas un mur. */
const SKILLS_SHOWN = 3

/** Lot 773 (d) — un dépli long montre 5 besoins, puis « Voir les N autres » (une recherche met les correspondances en tête). */
const NEEDS_FIRST = 5

/**
 * #4755 — L'ONGLET « HISTORIQUE » : ce que MES comptes ont montré par le passé, une ligne = un compte, dépliable.
 * Lot 764 — les lignes sont celles de l'onglet « Signaux et besoins » de chaque compte (toutes familles).
 *
 * « Norauto · 11 offres · Java, Spring · dernier besoin vu il y a 3 mois ». Une part absente ne s'écrit pas
 * (jamais « 0 offre », jamais un « dernier besoin » sans date lisible) ; un compte sans besoin passé n'a aucune
 * ligne. #4756 — la recherche plein texte et les filtres croisés (techno × zone × période × volume) vivent en
 * tête : le compte de résultats est dit, et « aucun résultat » est un état vide NOMMÉ.
 */
export function SignalsHistory({
  items,
  loading,
  error = false,
  contactsByAccount,
  query,
  draft,
  onDraftChange,
  total,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: {
  items: WatchlistItem[]
  loading: boolean
  /** La lecture a échoué : l'écran le DIT — jamais « aucun besoin passé » à la place d'une panne. */
  error?: boolean
  /** Lot 768 — les personnes proposables de chaque compte, lues avec l'historique (jamais une requête par compte). */
  contactsByAccount?: ReadonlyMap<string, readonly HistoryContact[]>
  /**
   * Lot 768 — la recherche appartient à la page (un champ pour les deux onglets, dans l'URL) : `query` est la
   * requête appliquée (après le délai), `draft` ce qui est tapé. Absents, l'écran garde sa propre requête.
   */
  query?: string
  draft?: string
  onDraftChange?: (value: string) => void
  /**
   * Lot 785 (#5213) — l'Historique arrive PAR PAGES de comptes. `total` = comptes de la MÊME requête serveur
   * (recherche comprise) ; `hasMore` = des comptes restent à charger. Absents : tout est là (comportement d'avant).
   */
  total?: number
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
}) {
  const { t } = useTranslation('signalsLibrary')
  const [filters, setFilters] = useState<HistoryFilters>(EMPTY_HISTORY_FILTERS)
  const everyRow = useMemo(() => buildAccountHistory(items), [items])
  // Lot 772 — le référentiel des communes arrive à la demande : la zone de chaque besoin se relit à son arrivée.
  const placesReady = usePlaceRegionsReady()
  const facets = useMemo(() => historyFacets(items), [items, placesReady])
  const appliedQuery = query ?? filters.query
  const shownQuery = draft ?? filters.query
  const result = useMemo(
    () => applyHistoryFilters(items, { ...filters, query: appliedQuery }),
    [items, filters, appliedQuery, placesReady],
  )
  const barFilters = useMemo(() => ({ ...filters, query: shownQuery }), [filters, shownQuery])
  const changeBar = (next: HistoryFilters) => {
    setFilters(next)
    if (next.query !== shownQuery) onDraftChange?.(next.query)
  }
  const clearSearch = () => {
    setFilters(current => ({ ...current, query: '' }))
    onDraftChange?.('')
  }
  const resetAll = () => {
    setFilters(EMPTY_HISTORY_FILTERS)
    onDraftChange?.('')
  }
  const hasQuery = result.search !== null
  // Le tri n'est pas un filtre : choisir « Anciens » n'allume pas « Effacer les filtres ».
  const active = JSON.stringify({ ...barFilters, sort: null }) !== JSON.stringify(EMPTY_HISTORY_FILTERS)

  // Lot 785 — la recherche texte est faite par le serveur ; les autres axes (techno × zone × période × volume…) se
  // lisent sur les besoins CHARGÉS : tant qu'un axe est posé et que des pages restent, on les charge TOUTES — jamais
  // un filtre appliqué à une moitié de l'historique, jamais un compte qui dit « 12 » sur 1 325.
  const crossFilterOn =
    JSON.stringify({ ...barFilters, sort: null, query: '' }) !== JSON.stringify({ ...EMPTY_HISTORY_FILTERS, query: '' })
  const loadingAll = hasMore && (crossFilterOn || result.rows.length === 0)
  useEffect(() => {
    if (loadingAll && !loadingMore && !loading) onLoadMore?.()
  }, [loadingAll, loadingMore, loading, onLoadMore, items.length])

  if (loading) {
    // Lot 772 — la requête met quelques secondes : le squelette d'une LISTE de comptes (la forme de ce qui vient), jamais
    // une carte d'état centrée sur un écran vide.
    return (
      <div className={PAGE_GUTTER_X} data-testid="history-loading" role="status" aria-busy="true">
        <Text size="xs" className="mb-2 block text-[var(--bellum-text-secondary)]">
          {t('history.loading')}
        </Text>
        <ul aria-hidden className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <li
              key={index}
              data-testid="history-skeleton-row"
              className="flex min-h-14 items-center gap-3 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 py-2"
            >
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  if (error) {
    return (
      <div className={PAGE_GUTTER_X} data-testid="history-error">
        <ScreenState state="error" message={t('history.loadError')} />
      </div>
    )
  }
  // Lot 788 (#5203) — la recherche est faite par le serveur : une requête sans compte vide `items`, ce qui n'est PAS
  // « aucun besoin passé ». Tant qu'une recherche est posée, le champ reste et l'écran dit « aucun besoin ne correspond ».
  if (everyRow.length === 0 && appliedQuery.trim() === '' && shownQuery.trim() === '') {
    return (
      <div className={PAGE_GUTTER_X}>
        <ScreenState
          state="empty_never"
          title={t('history.emptyTitle')}
          message={t('history.emptyMessage')}
          action={{ label: t('list.emptyAllAction'), to: '/discover' }}
        />
      </div>
    )
  }
  return (
    <>
      <HistoryFiltersBar
        filters={barFilters}
        onChange={changeBar}
        techs={facets.techs}
        families={facets.families}
        sectors={facets.sectors}
        sources={facets.sources}
        zones={facets.zones}
        // Un seul « Effacer les filtres » à l'écran (GA-26) : quand il n'y a AUCUN résultat, l'état
        // vide porte déjà le geste, juste sous les yeux — la barre retire le sien.
        active={active && result.rows.length > 0}
        onReset={resetAll}
      />
      {result.rows.length === 0 ? (
        <div className={PAGE_GUTTER_X} data-testid="history-no-result">
          {/* Lot 768 — une recherche sans résultat le DIT, avec son geste « Effacer la recherche ». */}
          {hasQuery ? (
            <ScreenState
              state="empty_true"
              title={t('history.noSearchTitle', { query: appliedQuery.trim() })}
              message={t('history.noSearchMessage')}
              action={{ label: t('history.searchClear'), onClick: clearSearch }}
            />
          ) : (
            <ScreenState
              state="empty_true"
              title={t('history.noResultTitle')}
              message={t('history.noResultMessage')}
              action={{ label: t('history.filters.reset'), onClick: resetAll }}
            />
          )}
          {result.undatedExcluded > 0 ? <UndatedNote count={result.undatedExcluded} /> : null}
        </div>
      ) : (
        <>
          <Text
            size="xs"
            role="status"
            data-testid="history-count"
            className={`${PAGE_GUTTER_X} text-[var(--bellum-text-secondary)]`}
          >
            {t('history.summary', {
              // Lot 785 — des pages restent : le chiffre est le TOTAL serveur de la même requête (jamais celui des
              // seules lignes chargées) ; tout chargé, il redevient celui des lignes rendues.
              count: hasMore && total !== undefined ? total : result.rows.length,
              // Lot 768 — avec une recherche : « N comptes · M besoins correspondent ».
              needs: hasMore
                ? t('history.shownOfTotal', { shown: result.rows.length, total })
                : hasQuery
                  ? result.matchNeeds > 0
                    ? t('history.matchNeeds', { count: result.matchNeeds })
                    : t('history.matchFacts', { count: result.matchFacts })
                  : result.needCount > 0
                    ? t('history.needsTotal', { count: result.needCount })
                    : t('history.factsTotal', { count: result.factCount }),
            })}
          </Text>
          {result.undatedExcluded > 0 ? (
            <div className={PAGE_GUTTER_X}>
              <UndatedNote count={result.undatedExcluded} />
            </div>
          ) : null}
          <ul
            data-testid="history-list"
            aria-label={t('history.listAria')}
            className={`${PAGE_GUTTER_X} flex flex-col gap-2`}
          >
            {result.rows.map(row => (
              <HistoryRow
                key={row.accountId}
                row={row}
                search={result.search}
                contacts={contactsByAccount?.get(row.accountId)}
              />
            ))}
          </ul>
          {hasMore && !loadingAll ? (
            <div className={`${PAGE_GUTTER_X} flex justify-center`}>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                data-testid="history-more-accounts"
                disabled={loadingMore}
                onClick={() => onLoadMore?.()}
              >
                {t('history.moreAccounts', { shown: result.rows.length, total })}
              </Button>
            </div>
          ) : null}
          {loadingAll ? (
            <Text
              size="xs"
              role="status"
              data-testid="history-loading-all"
              className={`${PAGE_GUTTER_X} text-[var(--bellum-text-secondary)]`}
            >
              {t('history.loadingAll')}
            </Text>
          ) : null}
        </>
      )}
      <Text size="xs" className={`${PAGE_GUTTER_X} text-center text-[var(--bellum-text-secondary)]`}>
        {t('history.footer')}
      </Text>
    </>
  )
}

/** Un besoin sans date lisible n'entre dans aucune tranche : l'écran le dit, il ne le glisse dans aucune. */
function UndatedNote({ count }: { count: number }) {
  const { t } = useTranslation('signalsLibrary')
  return (
    <Text size="xs" data-testid="history-undated" className="text-[var(--bellum-text-secondary)]">
      {t('history.undated', { count })}
    </Text>
  )
}

function summaryOf(row: AccountHistoryRow, t: (key: string, options?: Record<string, unknown>) => string): string {
  const parts = [
    // Jamais « 0 besoin » : un compte qui n'a que des faits dit « N faits ».
    row.needCount > 0 ? t('history.needs', { count: row.needCount }) : t('history.facts', { count: row.factCount }),
    row.skills.length > 0 ? row.skills.slice(0, SKILLS_SHOWN).join(', ') : null,
    row.lastNeedMs === null ? null : t('history.lastSeen', { ago: formatTimeAgo(row.lastNeedMs) }),
  ]
  return parts.filter((part): part is string => part !== null && part !== '').join(' · ')
}

function HistoryRow({
  row,
  search,
  contacts,
}: {
  row: AccountHistoryRow
  search: ParsedSearch | null
  contacts: readonly HistoryContact[] | undefined
}) {
  const { t } = useTranslation('signalsLibrary')
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const [head] = row.items

  return (
    <li
      data-testid="history-row"
      className="rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(current => !current)}
        className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left"
      >
        <CompanyAvatar name={row.companyName} size="sm" logoUrl={head?.logoUrl} website={head?.website} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-[var(--bellum-text-primary)]">{row.companyName}</span>
          <span className="text-xs text-[var(--bellum-text-secondary)]">{summaryOf(row, t)}</span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-[var(--bellum-text-muted)] transition-transform ${open ? '' : '-rotate-90'}`}
          aria-hidden
        />
      </button>
      {open ? <HistoryPanel id={panelId} row={row} search={search} contacts={contacts} /> : null}
    </li>
  )
}

/** Le minimum que l'API sert → ce que lit `proposalForLine` (aucune adresse, aucun téléphone). */
const asProposable = (contact: HistoryContact): MissionContact => ({
  id: contact.id,
  full_name: contact.full_name,
  title: contact.title,
  email: null,
  phone: null,
  location: contact.location,
  excluded_at: null,
  hidden: false,
  place: contact.place,
})

/**
 * Lot 773 — LE DÉPLI d'un compte : des lignes compactes (le MÊME composant que l'onglet du compte, GA-26), les
 * reformulations d'un même fait repliées en « ×N sources », 5 besoins puis « Voir les N autres ». « Personne de connu
 * ne recoupe » + « Trouver qui contacter » : UNE fois en tête, jamais par ligne, jamais une liste générique.
 * Lot 768 — la règle de « qui contacter » est celle de l'onglet du compte (`proposalForLine`) ; le périmètre
 * géographique n'est pas relu ici (une requête par compte). « Préparer le message » charge la fiche de LA personne
 * choisie, au clic ; « Au plan » écrit l'action du compte.
 */
function HistoryPanel({
  id,
  row,
  search,
  contacts,
}: {
  id: string
  row: AccountHistoryRow
  search: ParsedSearch | null
  contacts: readonly HistoryContact[] | undefined
}) {
  const { t } = useTranslation('signalsLibrary')
  const { t: tProjects } = useTranslation('projects')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const engagement = useOptionalContactEngagement()
  const plan = usePersistAccountPlan(row.accountId)
  const [all, setAll] = useState(false)
  const [openId, setOpenId] = useState<string>()
  const [factsOpen, setFactsOpen] = useState(false)
  const candidates = useMemo(() => (contacts ?? []).map(asProposable), [contacts])
  const verified = useMemo(
    () => new Set((contacts ?? []).filter(contact => contact.email_verified).map(contact => contact.id)),
    [contacts],
  )
  const proposals = useMemo(
    () =>
      new Map(
        row.groups.flatMap(group =>
          group.head.signalLine
            ? [
                [
                  group.head.id,
                  proposalForLine({
                    line: group.head.signalLine,
                    contacts: candidates,
                    perimeter: undefined,
                    accountName: row.companyName,
                  }),
                ] as const,
              ]
            : [],
        ),
      ),
    [row.groups, candidates, row.companyName],
  )

  const prepare = async (contactId: string) => {
    try {
      const full = await queryClient.fetchQuery({
        queryKey: contactKeys.detail(contactId),
        queryFn: () => contactsApi.getOne(contactId),
      })
      engagement?.openEngagement([full], 'email')
    } catch {
      toast.error(t('history.prepareFailed'))
    }
  }
  const peopleOf = (item: WatchlistItem): CompactPerson[] => {
    const line = item.signalLine
    const proposal = proposals.get(item.id)
    if (!line || !proposal) return []
    return proposal.people.map(person => ({
      person,
      reason: proposal.reasons.get(person.id) ?? null,
      full: null,
      emailVerified: verified.has(person.id),
      onPrepare: engagement ? () => void prepare(person.id) : undefined,
      onAddToPlan: () =>
        plan
          .addAction(signalLineToPlanAction(line, person.full_name ?? null))
          .then(() => navigate({ to: '/accounts/$id', params: { id: row.accountId }, search: { tab: 'plan' } }))
          .catch(() => toast.error(t('history.planFailed'))),
    }))
  }
  const someoneMissing = row.groups.some(
    group => group.head.signalLine !== undefined && (proposals.get(group.head.id)?.people.length ?? 0) === 0,
  )
  const shownGroups = all ? row.groups : row.groups.slice(0, NEEDS_FIRST)
  const hiddenGroups = row.groups.length - shownGroups.length
  const members = (group: (typeof row.groups)[number]) =>
    group.members.flatMap(member => (member.signalLine ? [member.signalLine] : []))
  // #5191 — « 1 sur N » parcourt les lignes AFFICHÉES du compte : besoins visibles, puis faits dépliés. Une ligne sans
  // `signalLine` (signal de la Veille) s'ouvre aussi : ses personnes sont proposées par la modale elle-même.
  const entries: SignalBrowserEntry[] = [
    ...shownGroups.map(group => ({
      item: group.head,
      members: members(group),
      people: group.head.signalLine ? peopleOf(group.head) : undefined,
    })),
    ...(factsOpen ? row.facts : []).map(item => ({ item, members: [], people: item.signalLine ? [] : undefined })),
  ]

  return (
    <div id={id} className="flex flex-col gap-2 border-t border-[var(--bellum-border)] px-3 py-2">
      <GroupEntitiesNote lines={row.items.flatMap(item => (item.signalLine ? [item.signalLine] : []))} />
      {someoneMissing ? (
        <div
          data-testid="history-nobody"
          className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--bellum-bg-lighter)] px-3 py-1.5"
        >
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {tProjects('signalTable.nobodyOnce')}
          </Text>
          <Button type="button" size="sm" variant="outline" className="min-h-11" asChild>
            <Link to="/accounts/$id" params={{ id: row.accountId }} search={{ tab: 'contacts' }}>
              {tProjects('signalTable.findContact')}
            </Link>
          </Button>
        </div>
      ) : null}
      {row.groups.length > 0 ? (
        <ul className="flex flex-col" data-testid="history-needs">
          {shownGroups.map(group => (
            <HistoryLine
              key={group.head.id}
              item={group.head}
              members={members(group)}
              people={peopleOf(group.head)}
              search={search}
              onOpen={() => setOpenId(group.head.id)}
            />
          ))}
        </ul>
      ) : null}
      {hiddenGroups > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 self-start"
          data-testid="history-more"
          onClick={() => setAll(true)}
        >
          {t('history.moreNeeds', { count: hiddenGroups })}
        </Button>
      ) : null}
      {row.facts.length > 0 ? (
        <details data-testid="history-facts" onToggle={event => setFactsOpen(event.currentTarget.open)}>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-[var(--bellum-text-secondary)]">
            {t('history.factsGroup', { count: row.facts.length })}
          </summary>
          <ul className="flex flex-col">
            {row.facts.map(item => (
              <HistoryLine
                key={item.id}
                item={item}
                members={[]}
                people={[]}
                search={search}
                onOpen={() => setOpenId(item.id)}
              />
            ))}
          </ul>
        </details>
      ) : null}
      <Link
        to="/accounts/$id"
        params={{ id: row.accountId }}
        // Lot 764 — l'onglet « Signaux et besoins » du compte, ouvert sur sa période Historique.
        search={{ tab: 'veille', sp: 'past' }}
        className="inline-flex min-h-11 items-center self-start text-sm font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
      >
        {t('actions.openAccount')}
      </Link>
      <SignalBrowserDialog entries={entries} openId={openId} onOpenChange={setOpenId} />
    </div>
  )
}

/** Un besoin (ou un fait) du dépli : la ligne compacte partagée ; un signal de la Veille sans ligne API reste une phrase. */
function HistoryLine({
  item,
  members,
  people,
  search,
  onOpen,
}: {
  item: WatchlistItem
  members: readonly AccountSignalLine[]
  people: readonly CompactPerson[]
  search: ParsedSearch | null
  onOpen: () => void
}) {
  const line = item.signalLine
  if (line) {
    return (
      <SignalCompactRow
        line={line}
        account={{
          id: item.accountId,
          companyName: item.companyName,
          sector: item.sector,
          logoUrl: item.logoUrl,
          website: item.website,
          headquarters: item.accountLocation,
        }}
        members={members}
        people={people}
        highlight={search}
        testId="history-line"
        onOpen={onOpen}
      />
    )
  }
  // #5191 — un signal de la Veille (sans ligne du lecteur unique) s'ouvre dans la MÊME modale.
  return (
    <li data-testid="history-line" className="border-b border-[var(--bellum-border)] last:border-b-0">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={onOpen}
        className="flex min-h-11 w-full flex-col justify-center gap-0.5 py-1.5 text-left"
      >
        <span className="text-sm text-[var(--bellum-text-primary)]">{item.displayLabel ?? item.signalLabel}</span>
        <span className="text-xs text-[var(--bellum-text-muted)]">{formatSignalDate(item.signalDate)}</span>
      </button>
    </li>
  )
}
