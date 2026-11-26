import { canMarkTimesheetNotApplicable, timesheetDecisionLock } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SearchEmptyState,
  TYPE_SCALE,
  Text,
  cn,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight, ChevronRight, Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CapabilityBanner } from '@/components/access/CapabilityBanner'
import { useRouteAccess } from '@/components/access/useRouteAccess'
import { CustomerPage } from '@/components/page/CustomerPage'
import { useDataExit } from '@/lib/data-exit'
import { downloadCSV } from '@/lib/export-csv'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import {
  useDueTimesheetEscalations,
  useDueTimesheetReminders,
  useExplainGap,
  useMarkTimesheetNotApplicable,
  useOpenTimesheets,
  useRecordTimesheetReminder,
  useRejectTimesheet,
  useRevokeTimesheetNotApplicable,
  useTimesheetMonth,
  useValidateByClient,
  type DueTimesheetEscalations,
  type DueTimesheetReminders,
  type TimesheetLine,
} from '../api'
import { FinanceChainStrip } from '../chain/view/FinanceChainStrip'
import {
  filterTimesheetLinesByState,
  summarizeTimesheetStates,
  timesheetLinesToCsv,
  type TimesheetStateFilter,
} from '../timesheet-states'
import { groupTimesheetLinesByMission } from '../timesheet-mission-groups'
import { MultiSelectMenu } from './MultiSelectMenu'
import { TimesheetReviewDrawer, type TimesheetReviewTarget } from './TimesheetReviewDrawer'
import { TimesheetsTable, lineKey } from './TimesheetsTable'

const STATUS_VARIANT: Record<string, 'default' | 'warning' | 'success' | 'secondary'> = {
  expected: 'secondary',
  missing: 'warning',
  draft: 'secondary',
  submitted: 'default',
  validated: 'success',
  disputed: 'warning',
  not_required: 'secondary',
  // Un relevé renvoyé à son auteur est un refus, pas une nuance de brouillon :
  // il porte la même teinte d'alerte que le litige.
  rejected: 'warning',
  // #2196.24 — la troisième relance a écoulé la cadence sans dépôt : le sujet
  // a besoin d'un humain, pas d'une quatrième relance. Même teinte que le
  // rejet et le litige — c'est le même registre « ça n'avance plus seul ».
  escalated: 'warning',
}

/** Le motif est borné comme `rejectTimesheetSchema` — un champ qui laisse taper
 *  ce que le serveur rejette ment à celui qui l'écrit. */
const REASON_MAX = 500

// Théo C missions-cra.R2 / A3 — les entrées du menu État et les quatre tuiles.
const STATE_OPTIONS: readonly TimesheetStateFilter[] = [
  'all',
  'blocking',
  'toReceive',
  'toCheck',
  'clientWait',
  'clientValidated',
  'rejected',
]
const STATE_TILES = ['toReceive', 'toCheck', 'clientWait', 'clientValidated'] as const

/**
 * #2196.18 — « prochaine action », dérivée du SEUL statut : le serveur ne rend
 * rien de plus, il n'y a rien de plus à recalculer. `null` sur un relevé
 * validé ou non requis — une valeur absente ne s'invente jamais (GA-18/GA-19),
 * l'écran ne montre alors AUCUNE de ces clés plutôt qu'une phrase creuse.
 */
const NEXT_ACTION_KEY: Partial<Record<string, string>> = {
  expected: 'cra.nextAction.awaitingDeposit',
  missing: 'cra.nextAction.awaitingDeposit',
  draft: 'cra.nextAction.awaitingDeposit',
  submitted: 'cra.nextAction.awaitingValidation',
  rejected: 'cra.nextAction.awaitingResubmission',
  disputed: 'cra.nextAction.resolveDispute',
  escalated: 'cra.nextAction.needsHuman',
}

/**
 * LE RELEVÉ D'ACTIVITÉ — la vue du 5 du mois (PDF 5 §7).
 *
 * Une ligne par mission ET par consultant. C'est la maille qui manquait : deux
 * personnes sur une même mission déposent deux relevés, et l'écran qui n'en
 * montrait qu'un faisait disparaître un mois entier de facturation.
 *
 * Trois choses ne se confondent jamais ici :
 *  - **attendu** (le mois court encore) et **manquant** (le mois est clos) ;
 *  - **zéro jour déclaré** et **aucun relevé** — la seconde s'affiche « — » ;
 *  - un **écart inconnu** et un **écart nul** — seul le second dit que ça colle.
 */
export function TimesheetsPage() {
  // Le contrat de route (BEL-ARCH-002) : ce qui DÉGRADE cet écran, nommé.
  const access = useRouteAccess({ path: '/missions/cra', section: 'missions', degradesWithout: ['email'] })
  const { t } = useTranslation('missions')
  const [month, setMonth] = useState<string>('')
  // Théo C missions-cra.A3 — « Ce qui bloque » est une option de TÊTE du menu
  // État (et non plus un segment à côté) : il croise deux états, le serveur le porte.
  // Théo missions-cra — MULTI-SÉLECTION partout : plusieurs états, plusieurs comptes (un OU par critère). « Ce
  // qui bloque » reste un segment à part : il croise deux états et le serveur le porte.
  const [states, setStates] = useState<string[]>([])
  const [accounts, setAccounts] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [blockingOnly, setBlockingOnly] = useState(false)
  const stateFilter: TimesheetStateFilter = blockingOnly ? 'blocking' : states.length > 0 ? 'toReceive' : 'all'
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [opened, setOpened] = useState<TimesheetLine | null>(null)
  const { data, isLoading, isError } = useTimesheetMonth(month || undefined, blockingOnly)
  const openTimesheets = useOpenTimesheets()
  // La CIBLE du tiroir, et non un booléen : la maille est mission × mois ×
  // consultant, et un mois sans dépôt n'a pas d'identifiant de relevé — c'est
  // pourtant celui-là qu'il faut pouvoir ouvrir.
  const [reviewing, setReviewing] = useState<TimesheetReviewTarget | null>(null)
  // #2196.30 — les relances DUES du mois affiché. Le calcul existait déjà,
  // testé, sans aucun appelant web (voir le docblock d'`api.ts`).
  // perf P6 — le mois est ATTENDU (`enabled`) : sans lui, la requête partait une
  // fois « sans mois » puis une seconde quand `data.month` arrivait — deux
  // appels pour la même réponse.
  const dueMonth = month || data?.month
  const dueReminders = useDueTimesheetReminders(dueMonth, { enabled: Boolean(dueMonth) })
  const reminderKey = (missionId: string, consultantId: string | null) => `${missionId}::${consultantId ?? ''}`
  const dueByLine = new Map(
    (dueReminders.data?.items ?? []).map(item => [reminderKey(item.line.missionId, item.line.consultantId), item]),
  )
  // #2972 — les relevés ESCALADÉS, et vers quel PORTEUR de mission le sujet
  // remonte. Même patron que `dueByLine` juste au-dessus.
  const dueEscalations = useDueTimesheetEscalations(dueMonth, { enabled: Boolean(dueMonth) })
  const escalationByLine = new Map(
    (dueEscalations.data ?? []).map(item => [reminderKey(item.line.missionId, item.line.consultantId), item]),
  )

  const { allowed, grant } = useDataExit()
  const summary = data?.summary
  // Les tuiles et le menu État lisent TOUT le mois : filtré par « Ce qui bloque »,
  // le serveur ne rend plus que les lignes bloquantes, et des tuiles calculées
  // dessus mentiraient. Alors elles disent « — », jamais 0.
  const monthStates = data !== undefined && !blockingOnly ? summarizeTimesheetStates(data.items) : null
  const needle = query.trim().toLowerCase()
  const visibleLines = (data?.items ?? []).filter(line => {
    if (
      states.length > 0 &&
      !states.some(state => filterTimesheetLinesByState([line], state as TimesheetStateFilter).length > 0)
    )
      return false
    if (accounts.length > 0 && !(line.accountName !== null && accounts.includes(line.accountName))) return false
    if (needle) {
      const haystack = [line.consultantName, line.missionLabel, line.accountName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    return true
  })
  const accountOptions = [
    ...new Set((data?.items ?? []).map(line => line.accountName).filter((name): name is string => !!name)),
  ]
    .sort((a, b) => a.localeCompare(b, 'fr'))
    .map(name => ({ value: name, label: name }))
  const toggleLine = (key: string) =>
    setSelected(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const selectedLines = visibleLines.filter(line => selected.has(lineKey(line)))
  const exportSelection = () => {
    // « Exporter la sélection » : les relevés cochés, ou à défaut tout ce qui est affiché — rien de plus.
    const csv = timesheetLinesToCsv(
      selectedLines.length > 0 ? selectedLines : visibleLines,
      [
        t('cra.exportHeader.consultant'),
        t('cra.exportHeader.mission'),
        t('cra.exportHeader.account'),
        t('cra.exportHeader.period'),
        t('cra.exportHeader.status'),
        t('cra.exportHeader.days'),
      ],
      status => t(`cra.states.${status}`),
    )
    if (grant) downloadCSV(csv, `releves-${dueMonth ?? 'mois'}.csv`, grant)
  }

  return (
    <CustomerPage titleInScreen pageTitle={t('cra.title')}>
      <Box className="space-y-4 py-4">
        {/* L'écran des relevés MARCHE sans messagerie — il ne peut simplement
            pas préparer les relances. Le bandeau le dit et n'empêche rien :
            refuser l'accès entier cacherait tout ce qui fonctionne, et c'est
            ce qui fait conclure à une panne.

            #1932.5 — et il le dit AVANT d'envoyer connecter : ce que cet écran
            fait déjà sans messagerie est une phrase, pas un sous-entendu. */}
        {/* #1826 — « supprime ce titre ». Ce que le retour pointait était un
            sous-titre ORPHELIN : la phrase de doctrine posée tout en haut du
            corps, sans aucun titre au-dessus d'elle — la barre d'onglets de
            section nomme déjà l'écran (« Relevés d'activité »), donc
            `PageHeader` masque son propre titre ici (`nameLivesInTabs`). Le
            réutiliser aurait RÉPÉTÉ mot pour mot le libellé de l'onglet actif
            (loi 4 du tome 7) — `cra.title` et le libellé de l'onglet sont la
            MÊME chaîne. La phrase, elle, n'est répétée nulle part ailleurs sur
            cet écran (contrairement à #1807 sur `/pilotage/finance`) : elle
            porte de la doctrine que rien d'autre ne dit (« "Attendu" n'est pas
            "manquant" » est la règle « non mesuré n'est jamais zéro »
            appliquée aux relevés). Elle rejoint donc un titre au lieu d'être
            supprimée — sa première phrase DEVIENT ce titre, différent du
            libellé de l'onglet, et la seconde reste sa légende. */}
        <Box display="flex" className="flex-wrap items-start justify-between gap-3">
          <Box className="flex min-w-0 flex-col gap-1">
            {/* #2456 — `element="h1"` : le titre de l'écran était DÉJÀ là, visible,
                mais rendu en `<p>`. L'entête de page se tait quand la barre d'onglets
                nomme déjà l'endroit (loi 4 du tome 7), si bien que le document n'avait
                aucun titre de niveau 1. Seule la balise change : rien ne bouge à l'œil. */}
            <Text element="h1" className={TYPE_SCALE.pageTitle}>
              {t('cra.heading')}
            </Text>
            {/* Théo C missions-cra.R1 — la phrase de Théo ; le rappel de doctrine
                (« attendu » n'est pas « manquant ») reste, en légende. */}
            <Text size="sm" color="text-muted-foreground">
              {t('cra.intro')}
            </Text>
            <Text size="xs" color="text-muted-foreground">
              {t('cra.subtitle')}
            </Text>
          </Box>
          {/* Théo missions-cra.N6 — « Exporter la sélection » : les relevés cochés, ou ce qui est affiché. */}
          {allowed && grant ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)] pointer-coarse:min-h-11"
              disabled={visibleLines.length === 0}
              onClick={exportSelection}
            >
              <Download className="size-4" aria-hidden />
              {t('cra.export')}
            </Button>
          ) : null}
        </Box>

        {/* L'écran MARCHE sans messagerie — il ne peut simplement pas préparer les relances. Le bandeau le
            dit sous le titre, et n'empêche rien. */}
        <CapabilityBanner access={access} stillPossible={t('cra.stillPossible')} />

        {/* Théo C missions-cra.N1 */}
        <FinanceChainStrip current="activity" />

        {/* Théo C missions-cra.R2 — quatre tuiles d'état. Une valeur non mesurée
            s'écrit « — », jamais 0. */}
        <ul data-slot="cra-tiles" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STATE_TILES.map(tile => {
            const count = monthStates ? monthStates.counts[tile] : null
            const pressed = states.length === 1 && states[0] === tile
            return (
              <li key={tile} className="min-w-0">
                {/* Théo .tile — la tuile est un BOUTON : elle pose le filtre « État » sur sa population. */}
                <button
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => {
                    setBlockingOnly(false)
                    setStates(pressed ? [] : [tile])
                  }}
                  className={cn(
                    'group flex h-full w-full flex-col items-start gap-2 rounded-2xl border bg-card p-4 text-left transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bg-surface-hover)] md:p-5',
                    pressed ? 'border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)]' : 'border-border',
                  )}
                >
                  <Text
                    element="span"
                    size="sm"
                    color="text-[var(--bellum-text-secondary)]"
                    className="flex items-center gap-1"
                  >
                    {t(`cra.tiles.${tile}.label`)}
                    <ChevronRight aria-hidden className="size-4" />
                  </Text>
                  <Text
                    element="span"
                    color={tile === 'clientValidated' ? 'text-[var(--bellum-text-accent)]' : undefined}
                    className="text-3xl font-semibold tabular-nums"
                  >
                    {count === null ? '—' : count}
                  </Text>
                  <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
                    {tile === 'clientValidated' && monthStates?.validatedDays != null
                      ? t('cra.tiles.clientValidated.days', { count: monthStates.validatedDays })
                      : t(`cra.tiles.${tile}.hint`)}
                  </Text>
                </button>
              </li>
            )
          })}
        </ul>

        {/* Théo missions-cra — la barre de filtres : la période, le compte, la recherche, l'état — tous en
            multi-sélection —, puis « Ce qui bloque » en segment, et « Ouvrir les relevés attendus ». */}
        {/* Théo .filters — chaque filtre porte son libellé AU-DESSUS (Période d'activité, Compte, Recherche,
            État) ; la rangée suivante porte l'état, le segment « Ce qui bloque » et les gestes. */}
        <Box data-slot="cra-filters" display="flex" className="flex-wrap items-end gap-3">
          <FilterField label={t('cra.filters.period')}>
            <Input
              type="month"
              value={month || (data?.month ?? '')}
              onChange={event => setMonth(event.target.value)}
              className="w-40"
              aria-label={t('cra.monthLabel')}
            />
          </FilterField>
          {accountOptions.length > 0 ? (
            <FilterField label={t('cra.filters.account')}>
              <MultiSelectMenu
                label={t('cra.filters.account')}
                options={accountOptions}
                values={accounts}
                onChange={setAccounts}
              />
            </FilterField>
          ) : null}
          <FilterField label={t('cra.filters.search')}>
            <Input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t('cra.filters.searchPlaceholder')}
              aria-label={t('cra.filters.search')}
              className="w-56"
            />
          </FilterField>
        </Box>
        <Box display="flex" className="flex-wrap items-center gap-2">
          <MultiSelectMenu
            label={t('cra.state.label')}
            options={STATE_OPTIONS.filter(option => option !== 'all' && option !== 'blocking').map(option => ({
              value: option,
              label: t(`cra.state.${option}`),
            }))}
            values={states}
            onChange={setStates}
          />
          <Box
            role="group"
            aria-label={t('cra.blockingGroup')}
            className="flex items-center gap-1 rounded-md border border-border p-0.5"
          >
            <Button
              type="button"
              size="sm"
              variant={blockingOnly ? 'ghost' : 'secondary'}
              aria-pressed={!blockingOnly}
              className="pointer-coarse:min-h-11"
              onClick={() => setBlockingOnly(false)}
            >
              {t('cra.state.all')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={blockingOnly ? 'secondary' : 'ghost'}
              aria-pressed={blockingOnly}
              className="pointer-coarse:min-h-11"
              onClick={() => setBlockingOnly(true)}
            >
              {summary && summary.blocking > 0
                ? t('cra.blockingWithCount', { count: summary.blocking })
                : t('cra.state.blocking')}
            </Button>
          </Box>
          <Button
            variant="ghost"
            size="sm"
            className="pointer-coarse:min-h-11"
            disabled={openTimesheets.isPending || !(month || data?.month)}
            onClick={() => openTimesheets.mutate(month || (data?.month as string))}
          >
            {t('cra.openExpected')}
          </Button>
          {visibleLines.length > 0 ? (
            <Box display="flex" className="ms-auto items-center gap-2">
              <Checkbox
                id="cra-select-all"
                checked={selectedLines.length === visibleLines.length}
                onCheckedChange={checked =>
                  setSelected(checked === true ? new Set(visibleLines.map(lineKey)) : new Set())
                }
              />
              <Label htmlFor="cra-select-all">{t('cra.table.selectAll')}</Label>
            </Box>
          ) : null}
        </Box>

        {summary ? (
          <Box display="flex" className="flex-wrap items-baseline gap-x-4 gap-y-1">
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('cra.counts', {
                awaiting: summary.awaiting,
                validated: summary.validated,
              })}
            </Text>
            {/* #2196.3 — « Reçus » (submitted) était fondu dans la phrase
                ci-dessus, sous un mot différent (« soumis ») : deux formes du
                même nombre auraient été la loi 4 que ce lot répare ailleurs
                (#2195.1). Il devient sa PROPRE pastille, sur le même patron
                que « rejetés » juste en dessous — visible seulement s'il y en
                a. */}
            {summary.submitted > 0 ? (
              <Text element="span" size="xs" color="text-muted-foreground">
                {t('cra.submittedCount', { count: summary.submitted })}
              </Text>
            ) : null}
            {/* #2196.6 — « En retard » (le mois est CLOS, rien n'est arrivé)
                vivait fondu dans « en attente » (le mois court encore) : les
                deux appellent un regard différent, et le second cas est celui
                que le docblock du service nomme « le plus coûteux du
                module ». */}
            {summary.late > 0 ? (
              <Text element="span" size="xs" color="text-[var(--warning-soft-text)]">
                {t('cra.lateCount', { count: summary.late })}
              </Text>
            ) : null}
            {summary.blocking > 0 ? (
              <Text element="span" size="xs" color="text-[var(--warning-soft-text)]">
                {t('cra.blockingCount', { count: summary.blocking })}
              </Text>
            ) : null}
            {/* Le compte des rejets ne s'affiche QUE s'il y en a : un « 0 rejeté »
                permanent apprend à ne plus lire la ligne. Un compte calculé que
                l'écran ne montre jamais est du code que personne n'appelle. */}
            {summary.rejected > 0 ? (
              <Text element="span" size="xs" color="text-[var(--warning-soft-text)]">
                {t('cra.rejectedCount', { count: summary.rejected })}
              </Text>
            ) : null}
            {/* #2196.24 — même patron : un relevé escaladé a besoin d'un
                humain, pas d'une pastille permanente à zéro. */}
            {summary.escalated > 0 ? (
              <Text element="span" size="xs" color="text-[var(--warning-soft-text)]">
                {t('cra.escalatedCount', { count: summary.escalated })}
              </Text>
            ) : null}
            {/* Théo C missions-cra.A1 — l'exception ne disparaît pas : elle se compte. */}
            {monthStates && monthStates.notApplicable > 0 ? (
              <Text element="span" size="xs" color="text-muted-foreground">
                {t('cra.notApplicableCount', { count: monthStates.notApplicable })}
              </Text>
            ) : null}
            <Text element="span" size="xs" color="text-muted-foreground">
              {/* « Aucun jour déclaré » et « zéro jour travaillé » ne se
                  corrigent pas de la même façon. */}
              {summary.declaredDays === null
                ? t('cra.noDeclaredDays')
                : t('cra.declaredDays', { count: summary.declaredDays })}
            </Text>
          </Box>
        ) : null}

        {isLoading ? (
          <Text size="sm" color="text-muted-foreground">
            {t('common:states.loading')}
          </Text>
        ) : isError ? (
          // Un échec de lecture ne se rend jamais comme « aucun relevé ».
          <SearchEmptyState title={t('cra.errorTitle')} description={t('cra.errorDescription')} />
        ) : visibleLines.length === 0 ? (
          // ⚠️ DEUX causes se cachaient sous une seule phrase, et la plus grave
          // était la plus rassurante : quand le filtre « Ce qui bloque » est
          // armé et que RIEN ne bloque, l'écran écrivait « Aucune mission sur ce
          // mois » au-dessus d'un mois plein de relevés sains. Une bonne
          // nouvelle rendue comme une panne.
          //
          // Le résumé tranche, parce qu'il porte sur TOUT le mois et non sur la
          // liste filtrée : `summary.total > 0` veut dire que le mois a des
          // lignes, donc que c'est le filtre qui les a retirées.
          //
          // ⚠️ `summary` ABSENT n'est pas « zéro ligne » : un résumé qu'on n'a
          // pas lu ne permet d'affirmer ni l'un ni l'autre, et la phrase repli
          // (« aucune mission sur ce mois ») est celle qui n'invente rien.
          !blockingOnly && stateFilter !== 'all' && summary !== undefined && summary.total > 0 ? (
            <SearchEmptyState
              title={t('cra.emptyStateTitle')}
              description={t('cra.emptyStateDescription', { count: summary.total })}
              action={
                <Button variant="outline" size="sm" onClick={() => setStates([])}>
                  {t('cra.emptyBlockingCta')}
                </Button>
              }
            />
          ) : blockingOnly && summary !== undefined && summary.total > 0 ? (
            <SearchEmptyState
              title={t('cra.emptyBlockingTitle')}
              description={t('cra.emptyBlockingDescription', { count: summary.total })}
              // Rien n'est cassé : le seul geste juste est de DÉFAIRE le filtre.
              // Envoyer ici vers un autre écran ferait chercher une panne qui
              // n'existe pas.
              action={
                <Button variant="outline" size="sm" onClick={() => setBlockingOnly(false)}>
                  {t('cra.emptyBlockingCta')}
                </Button>
              }
            />
          ) : (
            <SearchEmptyState
              title={t('cra.emptyTitle')}
              description={t('cra.emptyDescription')}
              // Un relevé n'existe QUE parce qu'une mission le porte : le mois
              // vide se répare sur la mission (ses dates, son statut), jamais
              // ici. `Link` et non un `div` cliquable : ce qui se clique se
              // tabule (GA-35).
              action={
                <Button asChild size="sm">
                  <Link to="/missions">{t('cra.emptyMissionsCta')}</Link>
                </Button>
              }
            />
          )
        ) : (
          <Box data-slot="cra-table" className="overflow-hidden rounded-2xl border border-border bg-card">
            <TimesheetsTable
              lines={visibleLines}
              selected={selected}
              onToggle={toggleLine}
              onOpen={setOpened}
              reminderDueKeys={new Set([...dueByLine.keys()])}
              nextActionKey={NEXT_ACTION_KEY}
              missionGroups={
                new Map(
                  groupTimesheetLinesByMission(visibleLines).map(group => [
                    group.missionId,
                    { count: group.lines.length, ready: group.readyToInvoice },
                  ]),
                )
              }
            />
          </Box>
        )}

        {/* Théo .after — deux cartes de pied : la règle de la chaîne de validation, et la suite (le prêt à
            facturer). Elles DISENT la doctrine, elles ne mesurent rien. */}
        <Box data-slot="cra-after" className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-3 rounded-2xl border border-border bg-card p-5 md:p-6">
            <Text element="h2" className={TYPE_SCALE.sectionTitle}>
              {t('cra.after.chainTitle')}
            </Text>
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('cra.after.chainBody1')}
            </Text>
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('cra.after.chainBody2')}
            </Text>
          </section>
          <section className="space-y-3 rounded-2xl border border-border bg-card p-5 md:p-6">
            <Text element="h2" className={TYPE_SCALE.sectionTitle}>
              {t('cra.after.nextTitle')}
            </Text>
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('cra.after.nextBody')}
            </Text>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="gap-1.5 border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)] pointer-coarse:min-h-11"
            >
              <Link to="/missions/facturation">
                <ArrowRight className="size-4" aria-hidden />
                {t('cra.after.nextCta')}
              </Link>
            </Button>
          </section>
        </Box>
      </Box>
      {/* LE TIROIR DE VALIDATION — il vit au niveau de la PAGE et non de la
          ligne : monté par ligne, chaque relevé du mois porterait son propre
          dialogue Radix, et vingt-cinq portails invisibles coûteraient un
          rendu complet à chaque frappe dans le champ de motif. */}
      <TimesheetReviewDrawer target={reviewing} onClose={() => setReviewing(null)} />
      {/* Théo missions-cra.R6 — la fenêtre « Relevé » : tout ce qu'on peut faire d'un relevé (expliquer l'écart, valider,
          rejeter, marquer non applicable, consigner une relance) vit ICI, à un clic de sa ligne. */}
      <Dialog open={opened !== null} onOpenChange={open => !open && setOpened(null)}>
        <DialogContent closeLabel={t('common:actions.close')} className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t('cra.table.dialogTitle', { name: opened?.consultantName ?? t('cra.noConsultant') })}
            </DialogTitle>
            <DialogDescription>{t('cra.table.dialogIntro')}</DialogDescription>
          </DialogHeader>
          {opened ? (
            <TimesheetRow
              line={opened}
              onReview={target => {
                setOpened(null)
                setReviewing(target)
              }}
              reminderDue={dueByLine.get(reminderKey(opened.missionId, opened.consultantId)) ?? null}
              escalation={escalationByLine.get(reminderKey(opened.missionId, opened.consultantId)) ?? null}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </CustomerPage>
  )
}

/** Théo .field — un filtre et son libellé au-dessus. Le contrôle garde son propre nom accessible. */
function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]">
        {label}
      </Text>
      {children}
    </div>
  )
}

function TimesheetRow({
  line,
  onReview,
  reminderDue,
  escalation,
}: {
  line: TimesheetLine
  onReview: (target: TimesheetReviewTarget) => void
  reminderDue: DueTimesheetReminders['items'][number] | null
  escalation?: DueTimesheetEscalations[number] | null
}) {
  const { t } = useTranslation('missions')
  const [explanation, setExplanation] = useState('')
  const [explaining, setExplaining] = useState(false)
  // Le rejet exige un MOTIF côté serveur : il passe donc par une invite, jamais
  // par un clic direct. Le même patron que « Annuler facturé » et « Fermer un
  // besoin » — un bouton qui part pour revenir en 400 fait recliquer.
  const [reason, setReason] = useState('')
  // #2415.7 — la quantité CONTESTÉE et la DEADLINE de correction, requises
  // comme le motif : le serveur les exige tous les trois.
  const [contestedDays, setContestedDays] = useState('')
  const [correctionDeadline, setCorrectionDeadline] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const explainGap = useExplainGap()
  const validate = useValidateByClient()
  const reject = useRejectTimesheet()
  // #2196.31 — « Marquer non applicable » : une EXCEPTION TRACÉE, motif
  // obligatoire (le serveur l'exige ; le bouton grisé évite l'aller-retour).
  // Proposée seulement là où le serveur l'accepterait — la frontière est
  // DÉRIVÉE du contrat (`canMarkTimesheetNotApplicable`), jamais recopiée.
  const [exceptionReason, setExceptionReason] = useState('')
  const [marking, setMarking] = useState(false)
  const markNotApplicable = useMarkTimesheetNotApplicable()
  const revokeNotApplicable = useRevokeTimesheetNotApplicable()
  const canMarkNotApplicable = !line.notApplicable && canMarkTimesheetNotApplicable(line.status)
  // #2196.30 — « Préparer une relance ». Le calcul (`dueReminders`) dit
  // qu'une relance est due ; le geste reste humain — ce bouton ne fait que
  // CONSIGNER qu'elle est partie, jamais l'envoyer (même frontière que côté
  // encaissements, `PaymentReminderDue`). Seulement sur une ligne qui a déjà
  // une existence en base : sans `timesheetId`, il n'y a rien à consigner —
  // le mois doit d'abord être ouvert.
  const recordReminder = useRecordTimesheetReminder()
  const reminderTimesheetId = reminderDue?.line.timesheetId ?? null

  // Un relevé DÉPOSÉ se rejette ; un relevé attendu, manquant ou déjà validé
  // par le client, non. Le serveur tient la même frontière — ceci ne fait que
  // ne pas proposer un geste qu'il refuserait.
  //
  // ⚠️ La frontière est DÉRIVÉE, plus recopiée : elle vivait ici en toutes
  // lettres, et le tiroir de validation allait l'écrire une seconde fois. Deux
  // chemins qui refont la même dérivation divergent, et celui des deux qu'on
  // croit décide de ce qu'on facture (GA-26).
  const { canReject } = timesheetDecisionLock(line)

  return (
    <Box className="rounded-md border border-border bg-card p-3">
      <Box display="flex" className="flex-wrap items-center justify-between gap-2">
        <Box display="flex" className="min-w-0 items-center gap-2">
          {/* F1 · Mention — le libellé ouvre le dossier de la mission (D200).
              Il était du texte mort : devant un relevé manquant, la question
              suivante est toujours « c'est quelle mission, et qui est dessus ? »,
              et il fallait repartir dans `/missions` pour y répondre. */}
          {line.missionLabel ? (
            <ObjectMention kind="mission" id={line.missionId} name={line.missionLabel} />
          ) : (
            <Text element="span" size="sm" weight="medium" className="truncate">
              {t('unknownMission')}
            </Text>
          )}
          {/* #2196.11 — le compte client. L'API le rendait déjà
              (`TimesheetLine.accountName`, utilisé ailleurs par le tiroir de
              validation), et aucune ligne de CETTE liste ne l'affichait —
              devant un relevé manquant, « chez qui ? » est la deuxième
              question, juste après « quelle mission ? ». Silencieux quand
              absent : ce n'est pas une alerte comme « personne d'affecté »
              juste en dessous, une mission sans compte porteur est une
              anomalie de données ailleurs, pas ici. */}
          {line.accountName ? (
            <Text element="span" size="xs" color="text-muted-foreground">
              {line.accountName}
            </Text>
          ) : null}
          {line.consultantName ? (
            <Text element="span" size="xs" color="text-muted-foreground">
              {line.consultantName}
            </Text>
          ) : (
            // Personne d'affecté : la ligne existe quand même, et le dit.
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('cra.noConsultant')}
            </Text>
          )}
          <Badge variant={STATUS_VARIANT[line.status] ?? 'secondary'}>{t(`cra.states.${line.status}`)}</Badge>
          {/* #2196.18 — la prochaine action, dérivée du statut. Silencieuse sur
              un relevé validé ou non requis : rien à faire n'est pas une
              information à afficher (GA-18/GA-19). */}
          {NEXT_ACTION_KEY[line.status] ? (
            <Text element="span" size="xs" color="text-muted-foreground">
              {t(NEXT_ACTION_KEY[line.status] as string)}
            </Text>
          ) : null}
          {/* #2972 — vers QUI le sujet remonte : le PORTEUR de la mission
              (`missions.owner_id`), jamais un envoi automatique. Silencieux
              tant que la mission n'a pas de porteur déclaré (GA-18/GA-19) :
              une fiche incomplète ne s'invente pas un destinataire. */}
          {line.status === 'escalated' && escalation?.ownerName ? (
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('cra.escalation.notify', { name: escalation.ownerName })}
            </Text>
          ) : null}
          {/* #2972 (lot V20b) — le MANAGER CLIENT est un second candidat réel
              (`missions.client_manager_contact_id`), affiché À CÔTÉ du porteur,
              jamais à sa place : router automatiquement l'un ou l'autre selon
              le type de contrat inventerait une règle métier non écrite. Les
              deux se nomment, un humain choisit qui prévenir. */}
          {line.status === 'escalated' && escalation?.clientManagerName ? (
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('cra.escalation.notifyManager', { name: escalation.clientManagerName })}
            </Text>
          ) : null}
          {/* #2972 — les deux derniers rôles du routage, chacun une DONNÉE réelle :
              l'ADV est le contact de FACTURATION de la mission (qui reçoit la
              facture), le partenaire le compte déclaré du consultant en
              sous-traitance. Nommés à côté, jamais choisis pour l'autre. */}
          {line.status === 'escalated' && escalation?.advName ? (
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('cra.escalation.notifyAdv', { name: escalation.advName })}
            </Text>
          ) : null}
          {line.status === 'escalated' && escalation?.partnerName ? (
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('cra.escalation.notifyPartner', { name: escalation.partnerName })}
            </Text>
          ) : null}
          {/* #2972 — le NIVEAU : relances envoyées au-delà du seuil d'escalade. */}
          {line.status === 'escalated' && escalation?.level ? (
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('cra.escalation.level', { level: escalation.level })}
            </Text>
          ) : null}
          {/* #2972 (lot V20b) — le DÉLAI : jours écoulés depuis la fin de la
              période (`daysSinceMonthEnd`, même dérivation que le retard des
              relances). Silencieux sous zéro — une valeur négative ne se
              montre jamais, GA-18/GA-19. */}
          {line.status === 'escalated' &&
          escalation?.delayDays !== null &&
          escalation?.delayDays !== undefined &&
          escalation.delayDays >= 0 ? (
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('cra.escalation.delay', { count: escalation.delayDays })}
            </Text>
          ) : null}
          {/* #2196.33/#2196.34 — rappel AVANT l'échéance (mois en cours,
              rien déposé), distinct du « en retard » qui suit le mois clos.
              Purement informationnel : aucun bouton, aucun rang de relance
              consommé. */}
          {line.preDeadlineReminder ? (
            <Text element="span" size="xs" color="text-muted-foreground">
              {line.preDeadlineReminder.kind === 'dueToday'
                ? t('cra.reminders.dueToday')
                : t('cra.reminders.beforeDeadline', { count: line.preDeadlineReminder.daysRemaining })}
            </Text>
          ) : null}
        </Box>
        <Text element="span" size="xs" color="text-muted-foreground">
          {line.days === null ? '—' : t('cra.days', { count: line.days })}
          {line.expectedDays !== null ? ` / ${t('cra.expected', { count: line.expectedDays })}` : ''}
        </Text>
      </Box>

      {/* #2415.5 — QUI a déclaré, distinct du consultant DONT c'est le mois :
          un ops peut déclarer un mois pour un autre consultant. `null` sur une
          ligne historique, d'avant cette trace — elle ne s'invente pas. */}
      {line.submittedByName ? (
        <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
          {t('cra.submittedBy', { name: line.submittedByName })}
        </Text>
      ) : null}

      {/* #2415.6 — la revue INTERNE, distincte de la validation client
          (`approverName` plus bas) : un geste séparé, `null` tant qu'il n'a
          pas été posé — jamais deviné. */}
      {line.internalReviewedByName ? (
        <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
          {t('cra.internalReviewedBy', { name: line.internalReviewedByName })}
        </Text>
      ) : null}

      {line.gapKind !== 'none' ? (
        <Box display="flex" className="mt-2 flex-wrap items-center gap-2">
          <Badge variant={line.blocksInvoicing ? 'warning' : 'outline'}>
            {line.gapKind === 'unknown'
              ? t('cra.gapUnknown')
              : t(`cra.gap.${line.gapKind}`, { count: Math.abs(line.gap ?? 0) })}
          </Badge>
          {line.gapExplanation ? (
            // L'explication ne masque PAS l'écart : elle l'accompagne. Cacher le
            // nombre donnerait un mois qui a l'air juste alors qu'il ne l'est pas.
            <Text element="span" size="xs" color="text-muted-foreground">
              {line.gapExplanation}
            </Text>
          ) : null}
        </Box>
      ) : null}

      {line.anomalies.length > 0 ? (
        <Box className="mt-2 space-y-1">
          {line.anomalies.map(anomaly => (
            <Text key={anomaly} element="p" size="xs" color="text-muted-foreground">
              {anomaly}
            </Text>
          ))}
        </Box>
      ) : null}

      <Box display="flex" className="mt-2 flex-wrap items-center gap-2">
        {/* LE DOSSIER — il s'ouvre sur TOUTE ligne, y compris un mois où
            personne n'a rien déposé : c'est celui-là qui coûte, et c'est le
            seul endroit où l'écran dit ce qu'il n'a PAS pu vérifier.
            `<button>` porté par `Button`, jamais un `<div onClick>` : ce qui se
            clique se tabule (GA-35), et la cible tient 44 px en pointeur
            grossier (GA-30). */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="pointer-coarse:min-h-11"
          onClick={() =>
            onReview({
              missionId: line.missionId,
              month: line.periodMonth.slice(0, 7),
              consultantId: line.consultantId,
            })
          }
        >
          {t('cra.review.open')}
        </Button>
        {/* Sans relevé déposé, il n'y a rien à expliquer ni à valider : les
            deux gestes visent une LIGNE, pas une mission. */}
        {line.timesheetId && line.blocksInvoicing && !explaining ? (
          <Button variant="outline" size="sm" onClick={() => setExplaining(true)}>
            {t('cra.explainGap')}
          </Button>
        ) : null}
        {line.timesheetId && line.status === 'submitted' ? (
          <Button
            variant="outline"
            size="sm"
            disabled={validate.isPending}
            onClick={() => validate.mutate(line.timesheetId as string)}
          >
            {t('cra.recordClientValidation')}
          </Button>
        ) : null}
        {canReject && !rejecting ? (
          <Button variant="outline" size="sm" onClick={() => setRejecting(true)}>
            {t('cra.reject')}
          </Button>
        ) : null}
        {canMarkNotApplicable && !marking ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="pointer-coarse:min-h-11"
            onClick={() => setMarking(true)}
          >
            {t('cra.notApplicable.mark')}
          </Button>
        ) : null}
        {reminderTimesheetId ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={recordReminder.isPending}
            onClick={() => recordReminder.mutate(reminderTimesheetId)}
          >
            {t('cra.reminders.prepare')}
          </Button>
        ) : null}
        {reminderTimesheetId ? (
          // Rien ne part tout seul : le produit PRÉPARE, un humain relance
          // ailleurs puis consigne ici — même phrase que côté encaissements.
          <Text element="span" size="xs" color="text-muted-foreground">
            {t('cra.reminders.nothingIsSent')}
          </Text>
        ) : null}
        {line.validatedByClientAt ? (
          <Text element="span" size="xs" color="text-muted-foreground">
            {t('cra.validatedByClient', { date: line.validatedByClientAt.slice(0, 10) })}
          </Text>
        ) : null}
        {/* #2196.16 — « approbateur ». Celui qui a ENREGISTRÉ la validation
            client (`validated_by`), jamais le contact client lui-même — la
            donnée était déjà écrite en base sans aucun appelant. Silencieux
            quand absent : ce n'est pas une alerte, c'est un fait pas encore
            arrivé. */}
        {line.approverName ? (
          <Text element="span" size="xs" color="text-muted-foreground">
            {t('cra.approvedBy', { name: line.approverName })}
          </Text>
        ) : null}
        {/* #2196.17 — « dernière relance ». Les deux champs (`remindersSent`,
            `lastReminderAt`) étaient déjà lus par le TIROIR de validation
            (`TimesheetReviewDrawer`) ; la LIGNE, elle, ne les montrait pas —
            alors que c'est elle qu'on regarde pour savoir si on a déjà relancé
            avant d'en préparer une autre. Mêmes clés i18n que le tiroir : même
            fait, même phrase, jamais deux libellés pour un seul compteur. */}
        {line.remindersSent > 0 ? (
          <Text element="span" size="xs" color="text-muted-foreground">
            {line.lastReminderAt
              ? t('cra.review.attachments.reminders', {
                  count: line.remindersSent,
                  date: line.lastReminderAt.slice(0, 10),
                })
              : t('cra.review.attachments.remindersUndated', { count: line.remindersSent })}
          </Text>
        ) : null}
      </Box>

      {/*
        La trace du rejet, et son MOTIF.
        Elle survit au redépôt : quand le statut est repassé à « soumis », on
        lit « rejeté le …, puis redéposé » plutôt que rien. Effacer le motif au
        redépôt ferait disparaître la seule réponse à « pourquoi ce mois a-t-il
        fait un aller-retour ? ».
      */}
      {line.rejectedAt ? (
        <Box className="mt-2 rounded-md border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] p-2">
          <Text element="p" size="xs" color="text-[var(--warning-soft-text)]">
            {line.status === 'rejected'
              ? t('cra.rejectedOn', { date: line.rejectedAt.slice(0, 10) })
              : t('cra.rejectedThenResubmitted', { date: line.rejectedAt.slice(0, 10) })}
          </Text>
          {line.rejectionReason ? (
            <Text element="p" size="xs" color="text-[var(--warning-soft-text)]">
              {line.rejectionReason}
            </Text>
          ) : null}
          {/* #2415.7 — combien de jours posent problème, et par quand
              corriger. `null` sur une ligne historique, d'avant cette trace :
              elle ne s'invente pas. */}
          {line.contestedDays !== null ? (
            <Text element="p" size="xs" color="text-[var(--warning-soft-text)]">
              {t('cra.rejectedContestedDays', { count: line.contestedDays })}
            </Text>
          ) : null}
          {line.correctionDeadline !== null ? (
            <Text element="p" size="xs" color="text-[var(--warning-soft-text)]">
              {t('cra.rejectedCorrectionDeadline', { date: line.correctionDeadline })}
            </Text>
          ) : null}
        </Box>
      ) : null}

      {/*
        #2196.31 — LA TRACE de l'exception : qui, quand, pourquoi. Elle se lit
        tant qu'elle vit ; « Annuler l'exception » la RÉVOQUE (jamais un
        effacement) et la déduction du contrat reprend.
      */}
      {line.notApplicable ? (
        <Box className="mt-2 rounded-md border border-border bg-muted/40 p-2">
          <Text element="p" size="xs" color="text-muted-foreground">
            {line.notApplicable.markedByName
              ? t('cra.notApplicable.markedBy', {
                  date: line.notApplicable.markedAt.slice(0, 10),
                  name: line.notApplicable.markedByName,
                })
              : t('cra.notApplicable.markedOn', { date: line.notApplicable.markedAt.slice(0, 10) })}
          </Text>
          <Text element="p" size="xs">
            {line.notApplicable.reason}
          </Text>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 pointer-coarse:min-h-11"
            disabled={revokeNotApplicable.isPending}
            onClick={() => revokeNotApplicable.mutate(line.notApplicable?.id as string)}
          >
            {t('cra.notApplicable.revoke')}
          </Button>
        </Box>
      ) : null}

      {marking ? (
        <Box className="mt-2 rounded-md border border-border p-3">
          <Text element="p" size="sm" weight="medium">
            {t('cra.notApplicable.title')}
          </Text>
          <Text element="p" size="xs" color="text-muted-foreground" className="mt-0.5">
            {t('cra.notApplicable.hint')}
          </Text>
          <Input
            className="mt-2"
            value={exceptionReason}
            maxLength={REASON_MAX}
            aria-label={t('cra.notApplicable.label')}
            onChange={event => setExceptionReason(event.target.value.slice(0, REASON_MAX))}
            placeholder={t('cra.notApplicable.placeholder')}
          />
          <Box display="flex" className="mt-2 gap-2">
            <Button
              size="sm"
              disabled={exceptionReason.trim().length === 0 || markNotApplicable.isPending}
              onClick={() => {
                markNotApplicable.mutate({
                  missionId: line.missionId,
                  month: line.periodMonth.slice(0, 7),
                  consultantId: line.consultantId,
                  reason: exceptionReason.trim(),
                })
                setMarking(false)
                setExceptionReason('')
              }}
            >
              {t('cra.notApplicable.confirm')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setMarking(false)
                setExceptionReason('')
              }}
            >
              {t('cra.rejectAbort')}
            </Button>
          </Box>
        </Box>
      ) : null}

      {explaining ? (
        <Box display="flex" className="mt-2 items-center gap-2">
          <Input
            value={explanation}
            onChange={event => setExplanation(event.target.value)}
            placeholder={t('cra.explainPlaceholder')}
            className="flex-1"
          />
          <Button
            size="sm"
            disabled={explanation.trim().length === 0 || explainGap.isPending}
            onClick={() => {
              explainGap.mutate({ id: line.timesheetId as string, explanation })
              setExplaining(false)
            }}
          >
            {t('common:actions.save')}
          </Button>
        </Box>
      ) : null}

      {rejecting ? (
        <Box className="mt-2 rounded-md border border-border p-3">
          <Text element="p" size="sm" weight="medium">
            {t('cra.rejectTitle')}
          </Text>
          <Text element="p" size="xs" color="text-muted-foreground" className="mt-0.5">
            {t('cra.rejectHint')}
          </Text>
          <Input
            className="mt-2"
            value={reason}
            maxLength={REASON_MAX}
            aria-label={t('cra.rejectLabel')}
            onChange={event => setReason(event.target.value.slice(0, REASON_MAX))}
            placeholder={t('cra.rejectPlaceholder')}
          />
          {/* #2415.7 — la quantité contestée et la deadline de correction,
              requises comme le motif : le serveur les exige tous les trois. */}
          <Input
            className="mt-2"
            type="number"
            min={0.5}
            max={line.days ?? 31}
            step={0.5}
            value={contestedDays}
            aria-label={t('cra.rejectContestedDaysLabel')}
            onChange={event => setContestedDays(event.target.value)}
            placeholder={t('cra.rejectContestedDaysPlaceholder')}
          />
          <Input
            className="mt-2"
            type="date"
            value={correctionDeadline}
            aria-label={t('cra.rejectCorrectionDeadlineLabel')}
            onChange={event => setCorrectionDeadline(event.target.value)}
          />
          <Box display="flex" className="mt-2 gap-2">
            {/* Désactivé tant que le motif, la quantité contestée ou la
                deadline manquent : le serveur rendrait 400, et un bouton qui
                part pour revenir en erreur fait recliquer. La règle est tenue
                par le serveur — ceci évite l'aller-retour. */}
            <Button
              size="sm"
              disabled={
                reason.trim().length === 0 ||
                !(Number(contestedDays) > 0) ||
                correctionDeadline.trim().length === 0 ||
                reject.isPending
              }
              onClick={() => {
                reject.mutate({
                  id: line.timesheetId as string,
                  reason: reason.trim(),
                  contestedDays: Number(contestedDays),
                  correctionDeadline,
                })
                setRejecting(false)
                setReason('')
                setContestedDays('')
                setCorrectionDeadline('')
              }}
            >
              {t('cra.rejectConfirm')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRejecting(false)
                setReason('')
                setContestedDays('')
                setCorrectionDeadline('')
              }}
            >
              {t('cra.rejectAbort')}
            </Button>
          </Box>
        </Box>
      ) : null}
    </Box>
  )
}
