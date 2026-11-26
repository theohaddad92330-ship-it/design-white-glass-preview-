import {
  isSegmentCollectionStale,
  SEGMENT_CAPABILITY_EPOCH,
  type Account,
  type AccountSignalLine,
  type ProjectReadRow,
  type SignalLinePeriod,
  type SignalLineType,
} from '@bellum/contracts'
import { Button, FilterChips, Input, LauraFace, TabNav, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronDown, Info, RefreshCw, Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccountPerimeter } from '@/features/accounts/hooks/useAccountPerimeter'
import { useAccountSignalLines } from '@/features/accounts/hooks/useAccountSignalLines'
import { useRefreshDimension } from '@/features/accounts/hooks/useRefreshDimension'
import { useContactsByAccount } from '@/features/contacts/hooks/useContactsByAccount'
import type { PlanActionInput } from '@/features/actions/planItems.api'
import { apiFetch } from '@/lib/api'
import { formatCount, formatDate } from '@/lib/locale'
import { TYPE_DOT, TYPE_TEXT, lineDateLabel } from './SignalLineBody'
import { GroupEntitiesNote } from './GroupEntitiesNote'
import { MarketObservedCard } from './MarketObservedCard'
import { SignalBrowserDialog, type SignalBrowserEntry } from './SignalBrowserDialog'
import { SignalCompactRow, type CompactPerson } from './SignalCompactRow'
import { signalLineToWatchlistItem, type SignalLineAccount } from '@/features/signals-library/model/account-history'
import { recruitmentFirst } from '@/features/watchlist/model/watchlist'
import { SignalPrograms } from '../veille/SignalPrograms'
import { signalLineToPlanAction } from '../veille/watchActions'
import { accountQualificationLeads, type LeadDecisionRow, type QualificationLeadCard } from './qualificationLeads'
import { type ContactReason, type ProposableContact } from './signal-contacts'
import {
  SIGNAL_TABLE_PAGE,
  countsByType,
  filterLines,
  groupTableRows,
  lauraSynthesis,
  linesOfPeriod,
  mostRecurringPeople,
  observedTjmRange,
  outcomeCounts,
  proposalForLine,
  recurringTheme,
  type SignalGroupKind,
  type SignalTableRow,
  lineNatureOf,
} from './signal-table'

/**
 * #4755 / #4756 / #4762 (lot 761, maquette validée par Louis le 31/10/2026) — L'ONGLET « SIGNAUX ET BESOINS »
 * EST UN SEUL TABLEAU.
 *
 * ⚠️ Renversement ASSUMÉ de #4022 / #4020 (une CARTE par fait, en sections empilées) : treize blocs, les mêmes
 * faits lus jusqu'à cinq fois, et les besoins passés de la base commune ou du CRM introuvables. Ici, UNE ligne par
 * fait daté (`GET /accounts/:id/signal-lines`), deux périodes présentées à l'identique — seule différence :
 * « Projet possible » (Confirmer / Écarter) en Actuel, l'issue et le TJM en Historique. #3624 / #3676 (un seul
 * écran) restent tenus.
 *
 *  · Les sources ne se nomment pas ; le lien « voir l'offre / l'avis / lire » reste. EXCEPTION (Louis 01/11/2026,
 *    #5010.1) : le SITE D'EMPLOI PUBLIC d'une offre (`line.origin`, liste fermée côté contrat) se nomme ; nos
 *    fournisseurs, jamais.
 *  · #5004.1 — chaque ligne porte sa NATURE en badge (`LineNatureBadge`, `lineNatureOf`) en plus de la colonne Type.
 *  · Aucune coupe : 20 lignes puis « voir plus », du même pas.
 *  · « À contacter » est le cœur (Louis) : 2 personnes au plus par ligne, toutes familles, deux périodes
 *    (`proposeContactsForSignal`) ; personne ne recoupe ⇒ « Trouver qui contacter », JAMAIS la liste générique.
 *  · Laura n'envoie rien : « Préparer le message » ouvre le brouillon, le commercial envoie.
 *  · Sous 768 px (la borne unique du dépôt, GA-28), le tableau devient des cartes empilées : UN seul balisage.
 */

type Props = {
  account: Account
  onOpenTab: (tab: 'overview' | 'contacts' | 'veille', contactSeed?: string) => void
  onAddToPlan: (action: PlanActionInput) => void
  /** Lot 764 — la période ouverte à l'arrivée (`?sp=past` depuis Signaux › Historique). */
  initialPeriod?: SignalLinePeriod
}

/**
 * Le type : libellé 12 px semi-gras ET pastille, dans UNE teinte d'accent (jeton `--accent-soft-text`, clair/sombre).
 * GA-67 (« une couleur porte un état, jamais une catégorie ») : pas une couleur par type — le libellé dit le type,
 * la teinte dit seulement « ceci est la colonne Type ».
 */

/** Lot 766 — même zone de clic de 44 px pour les boutons d'une barre de pastilles : visuel inchangé (32 px). */
const HIT_44_BUTTONS =
  "[&_button]:relative [&_button]:after:absolute [&_button]:after:inset-x-0 [&_button]:after:-inset-y-1.5 [&_button]:after:content-['']"

export function AccountSignalTable({ account, onOpenTab, onAddToPlan, initialPeriod = 'now' }: Props) {
  const { t } = useTranslation('projects')
  const signalLines = useAccountSignalLines(account.id)
  const contactsQuery = useContactsByAccount(account.id)
  const perimeter = useAccountPerimeter(account.id)
  const [period, setPeriod] = useState<SignalLinePeriod>(initialPeriod)
  const [type, setType] = useState<SignalLineType | null>(null)
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(SIGNAL_TABLE_PAGE)
  const [openId, setOpenId] = useState<string>()

  const allLines = useMemo(() => signalLines.data?.lines ?? [], [signalLines.data])
  const contacts = useMemo(() => contactsQuery.data ?? [], [contactsQuery.data])
  const periodLines = useMemo(() => linesOfPeriod(allLines, period), [allLines, period])
  const counts = useMemo(() => countsByType(periodLines), [periodLines])
  const visible = useMemo(() => filterLines(periodLines, { type, query }), [periodLines, type, query])

  // « À contacter » — UNE sélection par ligne, toutes familles, deux périodes (GA-26 : `proposeContactsForSignal`).
  const proposalsFull = useMemo(() => {
    const out = new Map<string, { people: ProposableContact[]; reasons: Map<string, ContactReason> }>()
    for (const line of periodLines)
      out.set(line.id, proposalForLine({ line, contacts, perimeter, accountName: account.company_name }))
    return out
  }, [periodLines, contacts, perimeter, account.company_name])
  const proposals = useMemo(
    () => new Map([...proposalsFull].map(([id, proposal]) => [id, proposal.people] as const)),
    [proposalsFull],
  )

  const leads = useLeadCards(account.id, contacts.length)

  if (signalLines.isLoading) {
    return (
      <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]" data-testid="signal-table-loading">
        {t('signalTable.loading')}
      </Text>
    )
  }
  if (signalLines.isError || !signalLines.data) {
    return (
      <Text element="p" size="sm" role="alert" data-testid="signal-table-error">
        {t('signalTable.error')}
      </Text>
    )
  }

  const compactPeople = (line: AccountSignalLine): CompactPerson[] =>
    (proposals.get(line.id) ?? []).map(person => ({
      person,
      reason: proposalsFull.get(line.id)?.reasons.get(person.id) ?? null,
      full: contacts.find(contact => contact.id === person.id) ?? null,
      onAddToPlan: () => onAddToPlan(signalLineToPlanAction(line, person.full_name ?? null)),
    }))
  const synthesis = lauraSynthesis(periodLines, period)
  // #5191 — ordre par défaut : les recrutements en tête, le reste dans l'ordre actuel (rien n'est masqué).
  const tableRows = recruitmentFirst(
    groupTableRows(visible, account.company_name),
    row => row.line.type === 'recrutement',
  )
  const pageRows = tableRows.slice(0, shown)
  const lineAccount: SignalLineAccount = {
    id: account.id,
    companyName: account.company_name,
    sector: account.sector,
    logoUrl: account.logo_url,
    website: account.website,
    headquarters: account.headquarters,
    address: account.address,
  }
  // La modale « 1 sur N » parcourt les lignes AFFICHÉES (les groupes d'établissements fermés n'ont pas de détail).
  const entries: SignalBrowserEntry[] = pageRows.flatMap(row =>
    row.closed
      ? []
      : [
          {
            item: signalLineToWatchlistItem(row.line, lineAccount),
            members: row.reformulations,
            people: compactPeople(row.line),
          },
        ],
  )
  const hidden = tableRows.length - pageRows.length

  return (
    <div data-testid="signal-table" className="flex flex-col gap-4">
      <Text element="h2" size="base" weight="semibold" className="sr-only">
        {t('accountOpportunity.screenTitle')}
      </Text>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
        <section
          aria-label={t('signalTable.aria')}
          className="flex min-w-0 flex-col gap-3 rounded-card border border-[var(--bellum-border)] bg-card p-4"
        >
          <TableHead
            accountId={account.id}
            period={period}
            onPeriod={next => {
              setPeriod(next)
              setType(null)
              setShown(SIGNAL_TABLE_PAGE)
            }}
            verifiedAt={signalLines.data.verified_at}
          />
          {synthesis ? (
            <div
              data-testid="signal-table-laura"
              className="flex items-start gap-2 rounded-lg bg-[var(--bellum-bg-lighter)] px-3 py-2"
            >
              <LauraFace size={22} decorative />
              <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
                {t(`signalTable.laura.${period}`, { count: synthesis.total })}
                {synthesis.topType
                  ? ` ${t('signalTable.laura.top', { type: t(`signalTable.types.${synthesis.topType}`), count: synthesis.topCount })}`
                  : ''}
                {synthesis.leads > 0 ? ` ${t('signalTable.laura.leads', { count: synthesis.leads })}` : ''}
              </Text>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <FilterChips
              ariaLabel={t('signalTable.filters.aria')}
              size="sm"
              value={type ?? 'all'}
              onChange={next => {
                setType(next === 'all' || next === null ? null : (next as SignalLineType))
                setShown(SIGNAL_TABLE_PAGE)
              }}
              options={[
                {
                  value: 'all',
                  label: t('signalTable.filters.all'),
                  ...(periodLines.length > 0 ? { count: periodLines.length } : {}),
                },
                ...[...counts.entries()].map(([key, count]) => ({
                  value: key,
                  label: t(`signalTable.types.${key}`),
                  count,
                })),
              ]}
            />
            <label className="relative flex min-w-0 items-center md:w-64">
              <Search
                className="pointer-events-none absolute left-2.5 size-4 text-[var(--bellum-text-muted)]"
                aria-hidden
              />
              <span className="sr-only">{t('signalTable.search')}</span>
              <Input
                type="search"
                value={query}
                placeholder={t('signalTable.search')}
                className="min-h-11 pl-8"
                data-testid="signal-table-search"
                onChange={event => {
                  setQuery(event.target.value)
                  setShown(SIGNAL_TABLE_PAGE)
                }}
              />
            </label>
          </div>

          {visible.length === 0 ? (
            <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]" data-testid="signal-table-empty">
              {periodLines.length === 0 ? t(`signalTable.empty.${period}`) : t('signalTable.empty.filtered')}
            </Text>
          ) : (
            <div className="flex flex-col gap-2">
              <GroupEntitiesNote lines={visible} />
              {/* Lot 773 (b) — « personne ne recoupe » + « Trouver qui contacter » : UNE fois pour le compte, jamais par ligne. */}
              {pageRows.some(row => !row.closed && (proposals.get(row.line.id) ?? []).length === 0) ? (
                <div
                  data-testid="signal-table-nobody"
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--bellum-bg-lighter)] px-3 py-1.5"
                >
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {t('signalTable.nobodyOnce')}
                  </Text>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => onOpenTab('contacts')}
                  >
                    {t('signalTable.findContact')}
                  </Button>
                </div>
              ) : null}
              <ul aria-label={t('signalTable.aria')} className="flex flex-col">
                {pageRows.map(({ line, closed, reformulations }) =>
                  closed ? (
                    <ClosedGroupRow key={line.id} line={line} kind={closed.kind} members={closed.members} />
                  ) : (
                    <SignalCompactRow
                      key={line.id}
                      line={line}
                      account={lineAccount}
                      members={reformulations}
                      people={compactPeople(line)}
                      nature={lineNatureOf(line, Boolean(line.lead_id && leads.get(line.lead_id)))}
                      onOpen={() => setOpenId(`${account.id}:${line.id}`)}
                    />
                  ),
                )}
              </ul>
              <SignalBrowserDialog entries={entries} openId={openId} onOpenChange={setOpenId} />
            </div>
          )}
          {hidden > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 self-start"
              data-testid="signal-table-more"
              onClick={() => setShown(current => current + SIGNAL_TABLE_PAGE)}
            >
              {t('signalTable.more', { count: Math.min(hidden, SIGNAL_TABLE_PAGE), total: hidden })}
            </Button>
          ) : null}
        </section>
        <SideColumn
          account={account}
          period={period}
          lines={periodLines}
          proposals={proposals}
          openDeals={signalLines.data.open_deals}
        />
      </div>
    </div>
  )
}

/** Les projets possibles du compte, par clé — les MÊMES lectures que la file des pistes (aucune lecture neuve). */
function useLeadCards(accountId: string, contactCount: number): Map<string, QualificationLeadCard> {
  const projects = useQuery({
    queryKey: ['projects', 'by-account', accountId],
    queryFn: () => apiFetch<ProjectReadRow[]>({ path: `/projects?account_id=${accountId}` }),
  })
  const decisions = useQuery({
    queryKey: ['qualification-leads', 'decisions', accountId],
    queryFn: () => apiFetch<LeadDecisionRow[]>({ path: `/accounts/${accountId}/qualification-leads/decisions` }),
  })
  return useMemo(() => {
    const result = accountQualificationLeads({
      rows: projects.data ?? [],
      decisions: decisions.data ?? [],
      contactCount,
    })
    return new Map(result.active.map(card => [card.key, card]))
  }, [projects.data, decisions.data, contactCount])
}

function TableHead({
  accountId,
  period,
  onPeriod,
  verifiedAt,
}: {
  accountId: string
  period: SignalLinePeriod
  onPeriod: (period: SignalLinePeriod) => void
  verifiedAt: string | null
}) {
  const { t } = useTranslation('projects')
  const refresh = useRefreshDimension(accountId)
  const verifiedOn = formatDate(verifiedAt, { dateStyle: 'long' })
  // UNE seule ligne de fraîcheur : « Vérifié le … », l'aveu de collecte antérieure s'il y a lieu, et Actualiser.
  const capabilityAt = SEGMENT_CAPABILITY_EPOCH.signals
  const stale = Boolean(capabilityAt) && isSegmentCollectionStale(verifiedAt, capabilityAt as string)
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <nav
        aria-label={t('accountOpportunity.theo.viewsAria')}
        data-testid="signals-views"
        className="-my-1.5 w-fit max-w-full rounded-lg border border-[var(--bellum-border)] bg-card p-0.5"
      >
        <TabNav
          className={`py-2.5 ${HIT_44_BUTTONS}`}
          tabs={(['now', 'past'] as const).map(key => ({ key, label: t(`signalTable.period.${key}`) }))}
          activeTab={period}
          onTabChange={key => onPeriod(key as SignalLinePeriod)}
          size="sm"
          variant="pill"
        />
      </nav>
      <div className="flex flex-wrap items-center gap-2" data-testid="signal-table-freshness">
        {verifiedOn ? (
          <Text size="sm" color="text-[var(--bellum-text-muted)]" data-testid="opportunity-verified-on">
            {t('accountOpportunity.verifiedOn', { date: verifiedOn })}
          </Text>
        ) : null}
        {stale ? <StaleNotice /> : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          icon={RefreshCw}
          className="min-h-11"
          disabled={refresh.isPending}
          onClick={() => refresh.mutate('signals')}
        >
          {t('accountOpportunity.refreshSignals')}
        </Button>
      </div>
    </div>
  )
}

/** Lot 766 — le badge « collecte antérieure » s'explique (bouton, clavier). Aucun rejeu : Actualiser reste le geste. */
function StaleNotice() {
  const { t } = useTranslation('projects')
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        icon={Info}
        aria-expanded={open}
        className="min-h-11 px-1 text-xs text-[var(--warning-soft-text)]"
        onClick={() => setOpen(value => !value)}
      >
        {t('signalTable.stale')}
      </Button>
      {open ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="signal-stale-help">
          {t('signalTable.staleHelp')}
        </Text>
      ) : null}
    </div>
  )
}

/** #5031 — « N établissements fermés » : UNE ligne repliable, datée de la plus récente ; rien n'est supprimé. */
function ClosedGroupRow({
  line,
  kind,
  members,
}: {
  line: AccountSignalLine
  kind: SignalGroupKind
  members: readonly AccountSignalLine[]
}) {
  const { t } = useTranslation('projects')
  const [open, setOpen] = useState(false)
  return (
    <li
      data-testid="signal-row"
      data-period={line.period}
      className="border-b border-[var(--bellum-border)] last:border-b-0"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className="flex min-h-11 w-full items-center gap-3 py-1.5 text-left"
      >
        <span className={`flex shrink-0 items-center gap-2 text-xs font-semibold md:w-32 ${TYPE_TEXT}`}>
          <span aria-hidden className={`size-2 shrink-0 rounded-full ${TYPE_DOT}`} />
          {t(`signalTable.types.${line.type}`)}
        </span>
        <Text size="sm" weight="semibold" className="min-w-0 flex-1 truncate">
          {t(kind === 'accounts' ? 'signalTable.accountsGroup' : 'signalTable.closedGroup', { count: members.length })}
        </Text>
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="shrink-0">
          {lineDateLabel(line)}
        </Text>
        <ChevronDown
          className={`size-4 shrink-0 text-[var(--bellum-text-muted)] transition-transform ${open ? '' : '-rotate-90'}`}
          aria-hidden
        />
      </button>
      {open ? (
        <ul className="flex flex-col gap-1 pb-3 pl-2">
          {members.map(member => (
            <li
              key={member.id}
              data-testid="signal-closed-member"
              className="text-xs text-[var(--bellum-text-secondary)]"
            >
              {member.title} · {lineDateLabel(member)}
              {member.detail ? ` · ${member.detail}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function SideColumn({
  account,
  period,
  lines,
  proposals,
  openDeals,
}: {
  account: Account
  period: SignalLinePeriod
  lines: readonly AccountSignalLine[]
  proposals: ReadonlyMap<string, readonly ProposableContact[]>
  openDeals: number
}) {
  const { t } = useTranslation('projects')
  const people = mostRecurringPeople(proposals)
  const outcomes = outcomeCounts(lines)
  const theme = recurringTheme(lines)
  const tjm = observedTjmRange(lines)
  const glance: string[] =
    period === 'now'
      ? // GA-26 (lot 766) : « N signaux … M projets possibles » se lit dans le bandeau de l'onglet, une seule fois.
        []
      : [
          outcomes.won > 0 ? t('signalTable.side.past.won', { count: outcomes.won }) : null,
          outcomes.lost > 0 ? t('signalTable.side.past.lost', { count: outcomes.lost }) : null,
          outcomes.none > 0 ? t('signalTable.side.past.none', { count: outcomes.none }) : null,
          theme ? t('signalTable.side.past.theme', { label: theme.label, count: theme.lines }) : null,
          tjm
            ? tjm.min === tjm.max
              ? t('signalTable.side.past.tjmOne', { amount: formatCount(tjm.min) })
              : t('signalTable.side.past.tjm', { min: formatCount(tjm.min), max: formatCount(tjm.max) })
            : null,
        ].filter((value): value is string => value !== null)
  return (
    <aside
      aria-label={t('signalTable.side.aria')}
      data-testid="signal-table-side"
      className="flex min-w-0 flex-col gap-3"
    >
      {glance.length > 0 || (period === 'now' && openDeals > 0) ? (
        <SideCard title={t('signalTable.side.glance')}>
          <ul className="flex flex-col gap-1">
            {glance.map(item => (
              <li key={item}>
                <Text size="sm">{item}</Text>
              </li>
            ))}
          </ul>
          {period === 'now' && openDeals > 0 ? (
            <Button type="button" size="sm" variant="ghost" className="min-h-11 self-start px-1" asChild>
              <Link to="/projects">{t('signalTable.side.now.deals', { count: openDeals })}</Link>
            </Button>
          ) : null}
        </SideCard>
      ) : null}
      {people.length > 0 ? (
        <SideCard title={t('signalTable.side.people')}>
          <ul className="flex flex-col gap-1">
            {people.map(entry => (
              <li key={entry.contact.id} className="flex items-center justify-between gap-2">
                <Text size="sm" className="min-w-0 truncate">
                  {entry.contact.full_name}
                </Text>
                <Text size="xs" color="text-[var(--bellum-text-muted)]" className="shrink-0 tabular-nums">
                  {t('signalTable.side.peopleLines', { count: entry.lines })}
                </Text>
              </li>
            ))}
          </ul>
        </SideCard>
      ) : null}
      <MarketObservedCard accountId={account.id} />
      {/* #3677 — les programmes publics (sans date : aucune ligne du tableau) restent lisibles ICI, avec l'ancre
          `#dossier-programs` que le lien « détail » de la carte Stratégie 5P (`openProgramsDetail`) vise. */}
      <SignalPrograms account={account} embedded />
    </aside>
  )
}

function SideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-card border border-[var(--bellum-border)] bg-card p-3">
      <Text element="h3" size="sm" weight="semibold">
        {title}
      </Text>
      {children}
    </section>
  )
}
