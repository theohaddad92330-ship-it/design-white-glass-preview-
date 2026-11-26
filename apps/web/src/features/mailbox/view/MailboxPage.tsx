import { REPLIES_TO_TREAT_REQUEST, type MailSearchIntent, type MailThread, type MailboxStatus } from '@bellum/contracts'
import {
  Box,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  FilterChips,
  Input,
  Spinner,
  Text,
  TYPE_SCALE,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight, ChevronDown, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CapabilityBanner } from '@/components/access/CapabilityBanner'
import { CustomerPage } from '@/components/page/CustomerPage'
import { AskLaura } from '@/components/primitives/AskLaura'
import { ApiError } from '@/lib/api-error'
import {
  connectorFailureIsActionable,
  connectorFailureSpeaksForItself,
  connectorFailureState,
} from '@/lib/connector-failure'
import {
  useMailSearch,
  useMailSearches,
  useMailboxSignature,
  useMailboxStatus,
  useMyMessageDrafts,
  useTrackedThreads,
} from '../api'
import { mailboxFirstThreadToTreat, mailboxHeroSegments } from '../hero'
import { BeeperConversations } from '@/features/beeper/view/BeeperConversations'
import { DraftDialog, type DraftKind } from './DraftDialog'
import { LinkAccountDialog } from './LinkAccountDialog'
import { LinkedTaskDialog } from './LinkedTaskDialog'
import { SnoozeThreadDialog } from './SnoozeThreadDialog'
import { splitThreadsByTab } from '../lib/thread-tabs'
import { MailboxM2Views, MailboxViewTabs, type ThreadGestures } from './m2/MailboxM2Views'
import type { MailboxView } from '../lib/mailbox-views'
import { accountOptionsOf, counterpartNameOf, filterInboxThreads, mergeIntentResults } from '../lib/inbox-workspace'
import { userTimeZone } from '../lib/scheduled-send-time'
import { useProfile } from '@/features/profiles/hooks/useProfile'
import { guideAnchorProps } from '@/features/guide/guide-anchors'
import { MailboxStatusLine } from './m1/MailboxStatusLine'
import { MailFiltersDialog, type MailFilters } from './m1/MailFiltersDialog'
import { NewMessageDialog } from './m1/NewMessageDialog'
import { ThreadList } from './m1/ThreadList'
import { ThreadReader } from './m1/ThreadReader'
import { MailWorkspace } from './shared/MailWorkspace'

/**
 * L'écran qui RÉPARE — une seule orthographe, pour tout ce fichier.
 *
 * `/settings/integrations` n'est plus une route (#4359) : `lib/legacy-addresses.ts` la réécrit vers `/integrations`,
 * pour les retours OAuth déjà en vol. L'écran qui porte « Connecter » vit à `/integrations`, et c'est là qu'on envoie.
 *
 * #1836 — la DÉRIVATION des échecs de connecteur (« lequel des échecs ? ») vit dans `@/lib/connector-failure` ; cet
 * écran ne décide plus que de ses MOTS. Le corps d'erreur porte `provider` : il n'arrive jamais ici (GA-45).
 */
const INTEGRATIONS_ROUTE = '/integrations'

/**
 * Théo B m1 — les intentions, dans l'ordre de la rangée « Intention » de la page appliquée : d'abord ce qui exige une
 * réaction (non lus, sans réponse), puis ce qu'on cherche (budget, TJM, CV, appels d'offres) ; les autres sous
 * « + N intentions ». Aucune intention n'est retirée (m1.A1) : `free` n'est pas une puce, c'est la recherche quand
 * aucune intention n'est choisie.
 */
const INTENT_CHIPS: MailSearchIntent[] = [
  'unread',
  'no_reply',
  'budget',
  'tjm',
  'cv',
  'tender',
  'positive_reply',
  'job_description',
  'contract',
  'invoice',
  'meeting',
  'out_of_office',
  'attachments',
]
const VISIBLE_INTENTS = 6

const NO_FILTERS: MailFilters = { counterpart: '', silenceDays: null, unreadOnly: false }

/**
 * « Messagerie » — Théo B m1 (page appliquée `b/m1-messagerie.html`).
 *
 * Ordre de la page : en-tête (surtitre, titre, phrase · Demander à Laura, Sources, Nouveau message) → ligne d'état de
 * la boîte → les quatre vues (À traiter · Brouillons · À venir · Historique) → recherche, comptes, Filtres → rangée
 * « Intention » → l'espace de travail : la liste « Échanges à suivre » à gauche, le volet de lecture à droite. Sur
 * mobile, la liste PUIS le fil ouvert, avec « ← Retour aux messages ».
 *
 * L'écran s'ouvre aussi depuis « Aujourd'hui » : `initialIntent` et `highlightThreadId` portent le fil que l'action
 * désignait. Il est mis en avant et affiché dans le volet ; rien n'est préparé ni envoyé d'office.
 */
export function MailboxPage({
  initialIntent,
  initialCounterpart,
  highlightThreadId = null,
  view = 'inbox',
  sequenceId,
  onViewChange,
}: {
  initialIntent?: MailSearchIntent
  /** #3718 — l'interlocuteur d'une fiche contact (« Traiter la réponse ») : la recherche s'ouvre restreinte à lui. */
  initialCounterpart?: string
  highlightThreadId?: string | null
  /** Théo B m2-brouillons.R1 — la vue ouverte : « À traiter » (défaut), « Brouillons », « À venir » ou « Historique ». */
  view?: MailboxView
  /** Théo B m2-brouillons.N5 — restreint « Brouillons » aux messages d'UNE séquence. */
  sequenceId?: string
  onViewChange?: (view: MailboxView) => void
} = {}) {
  const { t, i18n } = useTranslation('mailbox')
  // Théo M2 — envoi programmé — l'heure d'un envoi se lit dans le fuseau du PROFIL, pas celui de l'appareil.
  const timeZone = userTimeZone(useProfile().data?.timezone)
  const { data: status, isLoading: statusLoading } = useMailboxStatus()
  // Multi-sélection (décision Louis). Aucune intention choisie = tous les échanges récents.
  const [intents, setIntents] = useState<MailSearchIntent[]>(
    initialIntent && initialIntent !== 'free' ? [initialIntent] : [],
  )
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [filters, setFilters] = useState<MailFilters>({ ...NO_FILTERS, counterpart: initialCounterpart ?? '' })
  const [accountIds, setAccountIds] = useState<string[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [newMessageOpen, setNewMessageOpen] = useState(false)
  // Le fil affiché dans le volet. `null` = le fil désigné par « Aujourd'hui », sinon le premier de la liste.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Mobile : la liste, PUIS le fil ouvert. Sur bureau, les deux côte à côte.
  const [mobileReading, setMobileReading] = useState(false)
  const [draftThread, setDraftThread] = useState<MailThread | null>(null)
  // #2104.5 — « Répondre » et « Relancer » sont deux gestes distincts ; `kind` porte lequel jusqu'au brouillon.
  const [draftKind, setDraftKind] = useState<DraftKind>('reply')
  // #2393.7 — dialogues PARTAGÉS, un fil à la fois (`LinkAccountDialog` tire tout le portefeuille à l'ouverture).
  const [linkThread, setLinkThread] = useState<MailThread | null>(null)
  const [snoozeThread, setSnoozeThread] = useState<MailThread | null>(null)
  const [taskThread, setTaskThread] = useState<MailThread | null>(null)

  const readable = Boolean(status?.connected && status.capabilities.read)
  const shared = {
    ...(submittedQuery ? { query: submittedQuery } : {}),
    ...(filters.counterpart ? { counterpart: filters.counterpart } : {}),
    ...(filters.silenceDays ? { silenceDays: filters.silenceDays } : {}),
    limit: 40,
  }
  const searches = useMailSearches(
    (intents.length > 0 ? intents : (['free'] as MailSearchIntent[])).map(intent => ({ intent, ...shared })),
    readable && view === 'inbox',
  )
  // Les fils suivis et les brouillons : déjà lus par les compteurs des onglets (même cache) ; ici pour « Tous les comptes ».
  const tracked = useTrackedThreads(readable && view !== 'inbox')
  const myDrafts = useMyMessageDrafts()
  // Un filtre de comptes appartient à SA vue : changer de vue le retire.
  useEffect(() => setAccountIds([]), [view])
  // Lue seulement quand la messagerie répond : sans connexion, « quelle signature ? » n'a pas de réponse.
  const signature = useMailboxSignature(readable)

  // #2113.17/.18 — LE RÉSUMÉ ET LE GESTE DE L'EN-TÊTE, indépendants des filtres de la liste.
  const heroToTreat = useMailSearch({ ...REPLIES_TO_TREAT_REQUEST }, readable)
  const heroFollowUps = useMailSearch({ intent: 'no_reply', limit: 40 }, readable)
  const heroSegments = mailboxHeroSegments({
    toTreat: heroToTreat.data?.threads ?? [],
    followUps: heroFollowUps.data?.threads ?? [],
  })
  const heroFirstThread = mailboxFirstThreadToTreat({
    toTreat: heroToTreat.data?.threads ?? [],
    followUps: heroFollowUps.data?.threads ?? [],
  })

  const openDraft = (thread: MailThread, kind: DraftKind) => {
    setDraftKind(kind)
    setDraftThread(thread)
  }

  const header = (
    <Box className="flex flex-wrap items-start justify-between gap-3">
      <Box className="flex min-w-0 flex-col gap-1">
        {/* Théo B m1.R1 — surtitre, « Messagerie », sa phrase d'usage. #2456 — le titre de l'écran est un `<h1>`. */}
        <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-secondary)]">
          {t('page.kicker')}
        </Text>
        <Text element="h1" className={TYPE_SCALE.pageTitle}>
          {t('page.title')}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('page.subtitle')}
        </Text>
        {/* #2113.17 — le résumé dynamique : jamais un « 0 réponse » (GA-18/GA-19). */}
        {heroSegments.length > 0 ? (
          <Box className="mt-1 flex flex-wrap items-center gap-2">
            <Text size="sm" weight="medium" data-testid="mailbox-hero-summary">
              {heroSegments.map(segment => t(`hero.summary.${segment.key}`, { count: segment.count })).join(' · ')}
            </Text>
            {/* #2113.18 — ouvre directement le brouillon (déjà rédigé par Laura) du premier fil qui attend. */}
            {heroFirstThread ? (
              <Button
                size="sm"
                variant="outline"
                className="pointer-coarse:min-h-11"
                data-testid="mailbox-hero-cta"
                onClick={() => openDraft(heroFirstThread, 'reply')}
              >
                {t('hero.treatFirst')}
              </Button>
            ) : null}
          </Box>
        ) : null}
      </Box>
      <Box className="flex flex-wrap items-center gap-2">
        {/* #1401.2 / m1.A9 — « Demander à Laura », la question déjà écrite ; c'est le commercial qui l'envoie. */}
        <AskLaura question={t('page.askLaura')} label={t('page.askLauraLabel')} />
        {/* Théo B m1.R11 — « Sources » mène à Intégrations. */}
        <Button asChild size="sm" variant="outline" className="pointer-coarse:min-h-11">
          <Link to={INTEGRATIONS_ROUTE}>{t('header.sources')}</Link>
        </Button>
        {/* Théo B m1.R9 — « Nouveau message » : à qui veux-tu écrire ? */}
        <Button size="sm" className="pointer-coarse:min-h-11" onClick={() => setNewMessageOpen(true)}>
          {t('header.newMessage')}
        </Button>
      </Box>
    </Box>
  )

  if (statusLoading) {
    return (
      <CustomerPage titleInScreen pageTitle={t('page.title')}>
        <Box className="flex h-64 items-center justify-center">
          <Spinner />
        </Box>
      </CustomerPage>
    )
  }

  // Deux états distincts, deux réparations distinctes : connecter, ou reconnecter. La FORME vient du bandeau de
  // capacité partagé (GA-79), les MOTS restent ceux de cet écran.
  if (!status?.connected || !status.capabilities.read) {
    const missingScope = Boolean(status?.connected)
    return (
      <CustomerPage titleInScreen pageTitle={t('page.title')}>
        <Box className="flex w-full flex-col gap-5">
          {header}
          {/* #2214.24 — la cible de SECOURS du guide « Boîte mail » : sans messagerie branchée, c'est ce bandeau. */}
          <div {...guideAnchorProps('boite-mail.brancher')}>
            <CapabilityBanner
              access={{ state: 'no_integration', missing: [] }}
              title={missingScope ? t('missingScope.title') : t('notConnected.title')}
              description={missingScope ? t('missingScope.subtitle') : t('notConnected.subtitle')}
              action={{ label: missingScope ? t('missingScope.cta') : t('notConnected.cta') }}
            />
          </div>
          {/* #4406.4 — Beeper ne dépend pas de la boîte mail : ses conversations restent lisibles sans elle. */}
          <BeeperConversations />
        </Box>
        {/* Monté seulement à l'ouverture : le répertoire n'est lu que quand on choisit à qui écrire. */}
        {newMessageOpen ? <NewMessageDialog open onOpenChange={setNewMessageOpen} /> : null}
      </CustomerPage>
    )
  }

  const loading = searches.some(search => search.isLoading)
  const failed = searches.find(search => search.isError)
  const rows = mergeIntentResults(
    searches.map((search, index) => ({
      intent: intents[index] ?? 'free',
      threads: search.data?.threads ?? [],
    })),
  )
  const foundBy = new Map(rows.map(row => [row.thread.threadId, row.foundBy]))
  // Un fil traité ou non pertinent vit dans « Historique » : il ne reste pas dans « À traiter ».
  const todo = splitThreadsByTab(rows.map(row => row.thread)).todo
  const accounts = accountOptionsOf(todo)
  const threads = filterInboxThreads(todo, { accountIds, unreadOnly: filters.unreadOnly })
  const truncated = searches.some(search => search.data?.truncated)
  const fetchedAt = Math.max(0, ...searches.map(search => search.dataUpdatedAt))
  const highlighted = highlightThreadId && threads.some(thread => thread.threadId === highlightThreadId)
  const selected =
    threads.find(thread => thread.threadId === selectedId) ??
    (highlighted ? threads.find(thread => thread.threadId === highlightThreadId) : undefined) ??
    threads[0] ??
    null
  const activeFilters = (filters.counterpart ? 1 : 0) + (filters.silenceDays ? 1 : 0) + (filters.unreadOnly ? 1 : 0)
  const clearAll = () => {
    setIntents([])
    setQuery('')
    setSubmittedQuery('')
    setFilters(NO_FILTERS)
    setAccountIds([])
  }

  // Théo B m2 — dans les autres vues, « Tous les comptes » propose les comptes de CES éléments (fils suivis, brouillons) ;
  // la sélection y porte sur le nom, le seul que portent aussi les brouillons.
  const m2Accounts = [
    ...new Set([
      ...(tracked.data?.threads ?? []).map(thread => thread.account?.name ?? ''),
      ...(myDrafts.data?.items ?? []).map(item => item.accountName ?? ''),
    ]),
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .map(name => ({ id: name, name }))
  const needle = submittedQuery.toLocaleLowerCase()
  const matchesQuery = (fields: (string | null | undefined)[]) =>
    !needle || fields.some(field => field?.toLocaleLowerCase().includes(needle))
  const gestures: ThreadGestures = {
    onPrepareDraft: openDraft,
    onSnooze: setSnoozeThread,
    onCreateTask: setTaskThread,
    onLinkAccount: setLinkThread,
  }

  return (
    <CustomerPage titleInScreen pageTitle={t('page.title')}>
      <Box {...guideAnchorProps('boite-mail.fils')} className="flex w-full flex-col gap-5">
        {header}

        {/* #1398.1 / m1.A5 — d'où viennent ces fils, ce que Laura peut y faire, la réponse d'absence. */}
        <MailboxStatusLine status={status} fetchedAt={fetchedAt} language={i18n.language} />

        {/* #1398.3 — ce que la messagerie n'autorise pas, nommé AVANT la rédaction ; se tait quand tout est accordé. */}
        <MailboxCapabilities capabilities={status.capabilities} />

        {/* Théo B m2-brouillons.R1 — les quatre vues, chacune un vrai onglet qui n'affiche que son contenu. */}
        <MailboxViewTabs view={view} onChange={next => onViewChange?.(next)} />

        {/* Théo B m1 / m2 — la barre d'outils des quatre vues : recherche toujours visible, comptes, Filtres. */}
        <Box className="flex flex-wrap items-center gap-2" data-testid="mailbox-toolbar">
          <form
            {...guideAnchorProps('boite-mail.rechercher')}
            role="search"
            className="relative flex min-w-0 flex-1 basis-64 items-center"
            onSubmit={event => {
              event.preventDefault()
              setSubmittedQuery(query.trim())
            }}
          >
            <Search className="absolute left-3 size-4 text-[var(--bellum-text-secondary)]" aria-hidden />
            <Input
              type="search"
              className="pl-9"
              aria-label={t('toolbar.searchAria')}
              placeholder={t('toolbar.searchPlaceholder')}
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </form>
          <AccountFilter
            accounts={view === 'inbox' ? accounts : m2Accounts}
            selected={accountIds}
            onToggle={id =>
              setAccountIds(previous =>
                previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id],
              )
            }
          />
          {/* « Filtres » règle la recherche de la boîte (interlocuteur, silence, non lus) : il vit avec « À traiter ». */}
          {view === 'inbox' ? (
            <Button variant="outline" className="min-h-11" aria-haspopup="dialog" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal className="size-4" aria-hidden />
              {activeFilters > 0 ? t('toolbar.filtersCount', { count: activeFilters }) : t('toolbar.filters')}
            </Button>
          ) : null}
        </Box>

        {view !== 'inbox' ? (
          <MailboxM2Views
            view={view}
            sequenceId={sequenceId}
            timeZone={timeZone}
            language={i18n.language}
            mailboxAddress={status.address ?? null}
            gestures={gestures}
            matchesThread={thread =>
              (accountIds.length === 0 || accountIds.includes(thread.account?.name ?? '')) &&
              matchesQuery([counterpartNameOf(thread), thread.counterpart, thread.subject, thread.account?.name])
            }
            matchesDraft={row =>
              (accountIds.length === 0 || accountIds.includes(row.accountName ?? '')) &&
              matchesQuery([row.contactName, row.contactEmail, row.subject, row.accountName])
            }
            onNewMessage={() => setNewMessageOpen(true)}
          />
        ) : (
          <>
            {/* Théo B m1.A1 — chercher par intention métier, en multi-sélection. */}
            <FilterChips
              multiple
              ariaLabel={t('intentsAria')}
              legend={t('toolbar.intentLegend')}
              options={INTENT_CHIPS.map(value => ({ value, label: t(`intents.${value}`) }))}
              values={intents}
              onToggle={value =>
                setIntents(previous =>
                  previous.includes(value) ? previous.filter(item => item !== value) : [...previous, value],
                )
              }
              collapse={{
                after: VISIBLE_INTENTS,
                moreLabel: hidden => t('toolbar.moreIntents', { count: hidden }),
                lessLabel: t('toolbar.lessIntents'),
              }}
            />

            {loading ? (
              <Box className="flex h-40 items-center justify-center">
                <Spinner />
              </Box>
            ) : failed ? (
              <SearchFailure error={failed.error} onRetry={() => void failed.refetch()} />
            ) : threads.length === 0 ? (
              <Box
                data-testid="mailbox-empty"
                className="flex flex-col items-start gap-2 rounded-card border border-dashed border-[var(--bellum-border)] p-6"
              >
                <Text element="h2" size="sm" weight="semibold">
                  {t('empty.title')}
                </Text>
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t('empty.subtitle')}
                </Text>
                {intents.length > 0 || submittedQuery || activeFilters > 0 || accountIds.length > 0 ? (
                  <Button variant="outline" className="min-h-11" onClick={clearAll}>
                    {t('m2.empty.clear')}
                  </Button>
                ) : null}
              </Box>
            ) : (
              <MailWorkspace
                reading={mobileReading}
                list={
                  <ThreadList
                    threads={threads}
                    selectedId={selected?.threadId ?? null}
                    highlightedId={highlighted ? highlightThreadId : null}
                    language={i18n.language}
                    truncated={Boolean(truncated)}
                    onSelect={thread => {
                      setSelectedId(thread.threadId)
                      setMobileReading(true)
                    }}
                  />
                }
                reader={
                  selected ? (
                    <ThreadReader
                      thread={selected}
                      foundBy={foundBy.get(selected.threadId) ?? null}
                      language={i18n.language}
                      mailboxAddress={status.address ?? null}
                      onBack={() => setMobileReading(false)}
                      onPrepareDraft={kind => openDraft(selected, kind)}
                      onLinkAccount={() => setLinkThread(selected)}
                      onSnooze={() => setSnoozeThread(selected)}
                      onCreateTask={() => setTaskThread(selected)}
                    />
                  ) : null
                }
              />
            )}

            {/* #4406.4 — les conversations Beeper, lues EN DIRECT ; rien ne s'affiche sans branchement. */}
            <BeeperConversations />
          </>
        )}
      </Box>

      <MailFiltersDialog open={filtersOpen} onOpenChange={setFiltersOpen} value={filters} onApply={setFilters} />
      {/* Monté seulement à l'ouverture : le répertoire n'est lu que quand on choisit à qui écrire. */}
      {newMessageOpen ? <NewMessageDialog open onOpenChange={setNewMessageOpen} /> : null}

      <DraftDialog
        thread={draftThread}
        kind={draftKind}
        open={Boolean(draftThread)}
        onOpenChange={open => (open ? undefined : setDraftThread(null))}
        // La signature réelle est résolue côté SERVEUR ; l'écran annonce laquelle des deux phrases s'applique.
        signature={signature.data?.signature ?? null}
        capabilities={status.capabilities}
      />

      {snoozeThread ? (
        <SnoozeThreadDialog
          thread={snoozeThread}
          open
          timeZone={timeZone}
          onOpenChange={open => (open ? undefined : setSnoozeThread(null))}
        />
      ) : null}
      {taskThread ? (
        <LinkedTaskDialog thread={taskThread} open onOpenChange={open => (open ? undefined : setTaskThread(null))} />
      ) : null}
      {/* #2393.7 / #2104.6 — le rattachement manuel, monté SEULEMENT à l'ouverture. */}
      {linkThread ? (
        <LinkAccountDialog thread={linkThread} open onOpenChange={open => (open ? undefined : setLinkThread(null))} />
      ) : null}
    </CustomerPage>
  )
}

/** « Tous les comptes » — multi-sélection, sur les comptes PRÉSENTS dans la file (aucun compte qui ne filtre rien). */
function AccountFilter({
  accounts,
  selected,
  onToggle,
}: {
  accounts: { id: string; name: string }[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  const { t } = useTranslation('mailbox')
  const label =
    selected.length === 0
      ? t('toolbar.allAccounts')
      : selected.length === 1
        ? (accounts.find(account => account.id === selected[0])?.name ?? t('toolbar.accounts', { count: 1 }))
        : t('toolbar.accounts', { count: selected.length })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="min-h-11"
          aria-label={t('toolbar.accountsAria', { value: label })}
          disabled={accounts.length === 0 && selected.length === 0}
        >
          {label}
          <ChevronDown className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {accounts.map(account => (
          <DropdownMenuCheckboxItem
            key={account.id}
            checked={selected.includes(account.id)}
            onSelect={event => event.preventDefault()}
            onCheckedChange={() => onToggle(account.id)}
          >
            {account.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Ce que la messagerie AUTORISE, et ce qu'elle n'autorise pas (#1398.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `MailboxStatus.capabilities` porte CINQ droits — lire, préparer, envoyer,
 * étiqueter, répondre en absence — et il est chargé par `useMailboxStatus()`
 * depuis le premier jour. L'écran en lisait DEUX : `connected` et `read`, tous
 * deux comme portes d'entrée. Les trois autres arrivaient dans la mémoire du
 * navigateur et n'atteignaient aucun pixel.
 *
 * Le coût n'est pas cosmétique : un compte connecté avant un élargissement de
 * portées garde sa concession étroite, et « je n'ai pas le droit d'envoyer » se
 * découvrait APRÈS avoir rédigé — au moment où la nouvelle coûte le plus cher.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * - Il ne s'affiche pas quand les cinq sont accordées : un bandeau permanent ne
 *   se lit plus, et il n'y a alors rien à réparer.
 * - Il ne NOMME AUCUN ÉDITEUR. `/features/mailbox/` n'est pas dans les chemins
 *   que GA-44 excepte, et le refus est déjà tenu côté serveur. Le geste mène à
 *   Intégrations, le seul écran qui a le droit de nommer l'outil.
 * - Il n'annonce AUCUNE heure de synchronisation : aucun champ de `MailboxStatus`
 *   n'en porte, et en inventer une serait exactement ce que ce lot corrige.
 * - Il ne redessine pas d'encadré : la forme est celle de `CapabilityBanner`
 *   (GA-78 / GA-79), seuls les MOTS sont ceux de cet écran.
 */
const MAILBOX_CAPABILITIES = ['read', 'draft', 'send', 'labels', 'outOfOffice'] as const

function MailboxCapabilities({ capabilities }: { capabilities: MailboxStatus['capabilities'] }) {
  const { t } = useTranslation('mailbox')
  const granted = MAILBOX_CAPABILITIES.filter(key => capabilities[key])
  const missing = MAILBOX_CAPABILITIES.filter(key => !capabilities[key])

  return (
    <CapabilityBanner
      // `ready` quand rien ne manque : le bandeau se retire lui-même.
      access={{
        state: missing.length === 0 ? 'ready' : 'degraded',
        missing: [...missing],
      }}
      missingLabels={missing.map(key => t(`capabilities.${key}`))}
      title={t('capabilities.title')}
      // Ce qui MARCHE est nommé aussi : « une partie est indisponible » sans
      // dire laquelle envoie chercher la panne partout.
      description={t('capabilities.granted', { list: granted.map(key => t(`capabilities.${key}`)).join(', ') })}
      action={{ label: t('capabilities.cta') }}
    />
  )
}

/**
 * Ce que la recherche dit quand elle n'a pas abouti.
 *
 * Le MÊME vocabulaire que la porte d'entrée ci-dessus — c'est le point : deux
 * moitiés du même écran disaient la même chose avec deux qualités différentes.
 *
 * « Réessayer » n'apparaît que sur une vraie panne, et le chemin vers
 * Intégrations n'apparaît que sur les deux cas qu'Intégrations répare : un
 * bouton qui ne répare rien est pire qu'un message nu.
 */
function SearchFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation('mailbox')
  const state = connectorFailureState(error)
  const failure = error instanceof ApiError ? error : null

  const title =
    state === 'scope_missing'
      ? t('missingScope.title')
      : state === 'authorization_expired'
        ? t('authorizationExpired.title')
        : state === 'not_connected'
          ? t('notConnected.title')
          : t('error.title')

  // La phrase du serveur telle quelle quand il en porte une : elle NOMME les
  // portées manquantes. Le repli couvre un corps sans `message`, qu'un écran
  // muet ferait passer pour un bug d'affichage.
  const message = connectorFailureSpeaksForItself(state)
    ? failure?.message?.trim() ||
      (state === 'scope_missing' ? t('missingScope.subtitle') : t('authorizationExpired.subtitle'))
    : state === 'not_connected'
      ? t('notConnected.subtitle')
      : // « Cassé » et « aucun fil » ne doivent pas se ressembler.
        t('error.subtitle')

  return (
    <Box className="flex flex-col items-start gap-3 rounded-lg border border-[var(--bellum-border)] p-4">
      <Text size="sm" weight="medium">
        {title}
      </Text>
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {message}
      </Text>
      {!connectorFailureIsActionable(state) ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          {t('error.retry')}
        </Button>
      ) : (
        <Link
          to={INTEGRATIONS_ROUTE}
          className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
        >
          {state === 'scope_missing' || state === 'authorization_expired'
            ? t('missingScope.cta')
            : t('notConnected.cta')}
          <ArrowRight className="size-3.5 shrink-0" aria-hidden />
        </Link>
      )}
    </Box>
  )
}
