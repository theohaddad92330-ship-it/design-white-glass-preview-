import {
  craStatusOf,
  isCraBlocked,
  isInvoicedState,
  CRA_STATUS_VALUES,
  type CraStatusValue,
  type InvoiceReadiness,
} from '@bellum/contracts'
import { Link } from '@tanstack/react-router'
import {
  Box,
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
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatCount, formatMonth } from '@/lib/locale'
import { AskLaura } from '@/components/primitives/AskLaura'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { useDeclareLauraBusy } from '@/features/laura/useLauraBusy'
import {
  invoiceReadinessApi,
  useBulkRecordReminder,
  useCancelInvoiced,
  useInvoiceReadiness,
  useMarkInvoiced,
  useOpenDispute,
  useRecordPayment,
  useRecordReminder,
  useResolveDispute,
} from '../api'
import { InvoiceReadinessMonthSelect } from './InvoiceReadinessMonthSelect'
import { MultiSelectMenu } from './MultiSelectMenu'
import { preparationTiles } from '../preparation-tiles'
import { InvoiceReadinessTable, readinessRowKey } from './InvoiceReadinessTable'
import { PaymentDialog } from './PaymentDialog'
import { toast } from 'sonner'
import { downloadCSV } from '@/lib/export-csv'
import { type DataExitGrant, useDataExit, workspaceRuleRefusalText } from '@/lib/data-exit'

/**
 * Une ligne que le compteur « N non chiffrés » désigne.
 *
 * ⚠️ **Ce prédicat est le MIROIR de `summarizeReadiness` et doit le rester.**
 * Les deux exclusions ne sont pas cosmétiques : un mois facturé ailleurs et un
 * mois non dû ont eux aussi un montant `null`, et les compter ici gonflerait un
 * compteur d'anomalies avec deux cas où la question du chiffrage ne se pose
 * pas. La divergence entre ce filtre et le compteur du serveur est le seul
 * risque de ce geste : `InvoiceReadinessPanel.test.tsx` la garde contre le vrai
 * `summarizeReadiness`.
 */
function isWithoutAmount(item: InvoiceReadiness): boolean {
  // #2197.41 — un DÉCLARÉ sort de la surveillance exactement comme un PROUVÉ :
  // `isInvoicedState` couvre les deux, sinon un mois déclaré sans montant
  // gonflerait le compteur « non chiffré » alors qu'il n'a plus rien à faire.
  if (isInvoicedState(item.state) || item.state === 'not_due') return false
  return item.preparedAmountCents === null
}

/** Un seul filtre à la fois — les tuiles, la colonne « CRA manquants » et le
 *  menu déroulant « Statut CRA » se DÉFONT les uns les autres plutôt que de se
 *  cumuler : composer plusieurs filtres actifs sans le dire nulle part est ce
 *  qui rend un tableau filtré indistinguable d'un tableau vide. */
type ActiveFilter =
  | { kind: 'craStatus'; value: CraStatusValue }
  | { kind: 'craBlocked' }
  | { kind: 'supplierMissing' }
  | { kind: 'ready' }
  | { kind: 'blocked' }

function sameFilter(a: ActiveFilter | null, b: ActiveFilter): boolean {
  if (!a || a.kind !== b.kind) return false
  if (a.kind === 'craStatus' && b.kind === 'craStatus') return a.value === b.value
  return true
}

function matchesActiveFilter(item: InvoiceReadiness, filter: ActiveFilter | null): boolean {
  if (!filter) return true
  if (filter.kind === 'craStatus') return craStatusOf(item) === filter.value
  if (filter.kind === 'craBlocked') return isCraBlocked(item)
  if (filter.kind === 'supplierMissing') return item.supplierInvoiceStatus === 'missing'
  if (filter.kind === 'blocked') return item.state === 'blocked'
  return item.state === 'ready'
}

const PAGE_SIZE = 10

/**
 * REVENUE PROTECTION — ce qui empêche de facturer, mois par mois.
 *
 * L'écran s'arrête à « prêt à facturer » : aucun bouton n'émet quoi que ce soit,
 * et il n'y en aura pas. Une facture engage une numérotation continue et une
 * obligation de conservation ; ce qu'un produit peut faire sans risque, c'est
 * dire ce qui manque — et c'est justement ce que personne ne fait.
 *
 * Deux mots comptent dans cette vue : le montant est PRÉPARATOIRE (ni un dû, ni
 * une facture), et le compteur « non chiffré » est affiché à côté du total.
 * Sans lui, un total partiel se lit comme un total.
 */
export function InvoiceReadinessPanel({
  /**
   * La porte de l'état vide, quand le panneau est monté DANS l'écran des
   * missions (lentille « Prêt à facturer ») plutôt que sur sa propre route.
   *
   * Le panneau a deux hôtes : `/missions/facturation` et `/missions`. Depuis le
   * second, un `<Link to="/missions">` ne changerait rien à l'écran — et un
   * bouton qui ne fait rien est pire qu'un état vide muet. L'hôte passe donc la
   * bascule qu'il est seul à connaître ; à défaut, le panneau navigue.
   */
  onShowMissions,
  hideDisclaimer = false,
}: { onShowMissions?: () => void; hideDisclaimer?: boolean } = {}) {
  const { t } = useTranslation('missions')
  // #2081.14 — l'export CSV est une SORTIE de données : masqué quand la règle
  // d'espace « qui peut exporter » le réserve aux administrateurs (décidé par
  // l'API, qui refuse aussi la route elle-même).
  const dataExit = useDataExit()
  /**
   * LE SÉLECTEUR DE MOIS — le défaut n°1 de ce dépôt, sur cet écran même :
   * `useInvoiceReadiness(month?)` acceptait déjà un mois, et ce panneau
   * l'appelait SANS argument. `month` reste `undefined` tant que personne n'a
   * choisi — l'écran garde alors le défaut SERVEUR (le mois précédent, D781) —
   * et devient l'argument RÉEL de la requête dès qu'il change. Le test
   * `InvoiceReadinessPanel.test.tsx — le sélecteur de mois transmet son choix`
   * garde ce fil : sans lui, le défaut reviendrait sous une autre forme.
   */
  const [month, setMonth] = useState<string | undefined>(undefined)
  const { data, isLoading, isError, refetch } = useInvoiceReadiness(month)
  /**
   * Ce que cet écran DÉCLARE montrer à Laura (bulle).
   *
   * ⚠️ Le mois vient de `data.month`, c'est-à-dire de ce que le SERVEUR a
   * réellement servi, et non de l'état local `month` — qui vaut `undefined`
   * tant que personne n'a choisi. Déclarer l'état local ferait dire à Laura
   * « aucun mois » sur un écran qui en affiche un dans son titre : c'est le
   * même défaut que ce panneau a déjà payé une fois, dans l'autre sens.
   *
   * La déclaration vit ICI et non sur `InvoicingPage` pour la même raison : la
   * page ne connaît pas le mois, le panneau si. Un écran déclare ce qu'il
   * MONTRE, et c'est celui qui l'affiche qui le sait.
   */
  useLauraContext({
    kind: 'invoicing',
    label: t('invoicing.title'),
    entityId: null,
    facets: data?.month ? [{ label: t('readiness.month.label'), value: formatMonth(data.month) ?? data.month }] : [],
    state: isLoading ? 'loading' : 'ready',
  })
  // Le compteur « N non chiffrés » ne peut pas MENER quelque part — les deux
  // causes d'un montant absent (aucun relevé, aucun TJM) se réparent sur deux
  // écrans différents, et un lien unique serait faux une fois sur deux. Il
  // amène donc aux LIGNES concernées, qui portent chacune leur porte exacte.
  const [onlyWithoutAmount, setOnlyWithoutAmount] = useState(false)
  const [search, setSearch] = useState('')
  // Théo missions-preparation — MULTI-SÉLECTION : plusieurs comptes, plusieurs responsables (un OU par critère).
  const [accountFilter, setAccountFilter] = useState<string[]>([])
  const [ownerFilter, setOwnerFilter] = useState<string[]>([])
  const [activeFilter, setActiveFilter] = useState<ActiveFilter | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [page, setPage] = useState(1)
  const markInvoiced = useMarkInvoiced()
  const [marking, setMarking] = useState<InvoiceReadiness | null>(null)
  // L'annulation d'un « facturé » exige un MOTIF côté serveur : elle passe donc
  // par une invite, jamais par un clic direct. Un aller simple posé par erreur
  // sort le mois des relances, et plus personne ne réclame le paiement.
  const [cancelling, setCancelling] = useState<InvoiceReadiness | null>(null)
  // #2419.4 — un paiement partiel ne sort pas de la file : le règlement passe
  // par une invite de MONTANT, la même que sur l'écran d'encaissement. Un clic
  // direct écrivait `paid_at` sans `paid_amount_cents`, et le produit ne
  // pouvait donc jamais savoir qu'un client n'avait réglé qu'une part.
  const [settling, setSettling] = useState<InvoiceReadiness | null>(null)
  const recordPayment = useRecordPayment()
  const cancelInvoiced = useCancelInvoiced()
  const recordReminder = useRecordReminder()
  const bulkRemind = useBulkRecordReminder()
  // Le LITIGE (BEL-MIS-011) exige lui aussi un MOTIF côté serveur : il passe
  // donc par une invite, comme l'annulation d'un « facturé ». Le lever, en
  // revanche, n'a rien à justifier — exiger une phrase pour clore ferait
  // laisser des litiges ouverts, et un litige ouvert fait taire les relances.
  const [disputing, setDisputing] = useState<InvoiceReadiness | null>(null)
  const openDispute = useOpenDispute()
  const resolveDispute = useResolveDispute()
  // #2403.14 / #2403.15 — AUCUNE INTERRUPTION PENDANT UNE ACTION CRITIQUE.
  // Ces quatre invites (marquer facturé, régler, annuler un « facturé »,
  // ouvrir un litige) sont des ÉCRITURES financières — et trois des quatre
  // (`CancelInvoicedDialog`, `PaymentDialog`, `DisputeDialog`) sont des
  // encarts EN LIGNE, pas des `<Dialog role="dialog">` : `useIsModalOpen`
  // (dans `useLauraBusy`) ne les voit pas. Sans cette déclaration explicite,
  // une carte Laura pouvait s'afficher pendant la saisie d'un motif de litige.
  useDeclareLauraBusy(
    marking !== null || settling !== null || cancelling !== null || disputing !== null,
    'invoice-critical-action',
  )

  if (isLoading) {
    return (
      <Text size="sm" color="text-muted-foreground">
        {t('common:states.loading')}
      </Text>
    )
  }
  if (isError) {
    return (
      <Box className="rounded-md border border-dashed border-destructive/40 p-4">
        <Text size="sm" color="text-muted-foreground">
          {t('readiness.loadError')}
        </Text>
      </Box>
    )
  }

  const summary = data?.summary
  const items = data?.items ?? []
  /**
   * Le droit financier du LECTEUR, tel que le serveur le lui a répondu.
   *
   * ⚠️ Défaut FERMÉ (`=== true`) et non `?? true` : une réponse d'API plus
   * ancienne que ce code — le front part sur Vercel en une minute, l'API sur
   * Railway en plusieurs — ne porte pas encore le champ. Pendant cette fenêtre,
   * un défaut ouvert afficherait les montants à tout le monde, c'est-à-dire
   * exactement la fuite qu'on referme. Le défaut fermé, lui, masque un montant
   * à quelqu'un qui y avait droit pendant deux minutes, et le dit.
   */
  const canReadFinance = data?.canReadFinance === true
  // ⚠️ Sous rédaction, TOUTES les lignes ont un montant `null` : ce filtre
  // compterait alors l'absence de droit et annoncerait « 6 non chiffrés » sur
  // un mois parfaitement chiffré. Il ne s'applique donc qu'avec le droit.
  const withoutAmountRows = canReadFinance ? items.filter(isWithoutAmount) : []
  // Le filtre ne s'offre que s'il a de quoi montrer : proposer un geste qui
  // viderait la liste serait un piège, pas un chemin.
  const canFilterWithoutAmount = withoutAmountRows.length > 0
  const visibleItems = onlyWithoutAmount && canFilterWithoutAmount ? withoutAmountRows : items

  // La recherche et le filtre actif portent sur `visibleItems` — donc APRÈS
  // « non chiffrés » — pour que les deux gestes se composent au lieu de se
  // remplacer en silence.
  const query = search.trim().toLowerCase()
  const searched = query
    ? visibleItems.filter(
        item =>
          (item.missionLabel ?? '').toLowerCase().includes(query) ||
          (item.accountName ?? '').toLowerCase().includes(query) ||
          (item.invoiceReference ?? '').toLowerCase().includes(query),
      )
    : visibleItems
  const filtered = searched
    .filter(item => matchesActiveFilter(item, activeFilter))
    .filter(
      item => accountFilter.length === 0 || (item.accountName != null && accountFilter.includes(item.accountName)),
    )
    .filter(item => ownerFilter.length === 0 || (item.ownerName != null && ownerFilter.includes(item.ownerName)))
  // Les valeurs RÉELLEMENT présentes dans le mois, jamais un catalogue théorique.
  const distinctOf = (pick: (item: InvoiceReadiness) => string | null | undefined) =>
    [...new Set(items.map(pick).filter((value): value is string => !!value))]
      .sort((a, b) => a.localeCompare(b, 'fr'))
      .map(value => ({ value, label: value }))
  const accountOptions = distinctOf(item => item.accountName)
  const ownerOptions = distinctOf(item => item.ownerName)

  // ⚠️ Les TUILES et les COMPTEURS du menu déroulant portent sur `items` —
  // le mois ENTIER tel que le serveur l'a rendu — jamais sur `filtered` : un
  // compteur qui compterait sa propre sortie ne pourrait plus jamais annoncer
  // que le filtre en cache.
  const supplierMissingCount = items.filter(item => item.supplierInvoiceStatus === 'missing').length
  // `summary` peut être absent le temps d'une réponse dégradée — la garder
  // `null` plutôt que `?? 0` : un total qui se replierait sur zéro se
  // lirait « rien à envoyer » quand la vérité est « pas mesuré ».
  const readyToSendCount = summary ? summary.ready : null
  const craBlockedCount = items.filter(isCraBlocked).length
  // Théo C missions-preparation.R1 — les quatre tuiles montants.
  const theoTiles = preparationTiles(items, summary, canReadFinance)
  const craCounts = CRA_STATUS_VALUES.reduce(
    (acc, value) => {
      acc[value] = items.filter(item => craStatusOf(item) === value).length
      return acc
    },
    { not_submitted: 0, to_validate: 0, validated: 0, conflict: 0 } as Record<CraStatusValue, number>,
  )

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function toggleFilter(next: ActiveFilter) {
    setPage(1)
    setActiveFilter(current => (sameFilter(current, next) ? null : next))
  }

  function toggleSelect(item: InvoiceReadiness) {
    const key = readinessRowKey(item)
    setSelected(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const remindableSelected = items.filter(item => selected.has(readinessRowKey(item)) && isCraBlocked(item))

  return (
    <Box className="space-y-4">
      {items.length > 0 ? (
        // Théo C missions-preparation.R1 — QUATRE tuiles montants. « Brouillons »
        // s'écrit « Préparées » : une facture est préparée, jamais créée ni émise
        // par Bellum (c17, c80). Prêt et À débloquer filtrent ; les deux autres
        // se lisent seulement.
        <Box data-slot="readiness-tiles" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <PreparationTile
            label={t('readiness.theoTiles.ready.label')}
            value={
              theoTiles.ready.amountCents === null
                ? null
                : t('readiness.theoTiles.ready.amount', {
                    value: formatCount(Math.round(theoTiles.ready.amountCents / 100)),
                  })
            }
            hint={
              theoTiles.ready.count === null
                ? t('readiness.tiles.notMeasured')
                : t('readiness.theoTiles.ready.hint', { count: theoTiles.ready.count })
            }
            active={activeFilter?.kind === 'ready'}
            accent
            onClick={() => toggleFilter({ kind: 'ready' })}
          />
          <PreparationTile
            label={t('readiness.theoTiles.blocked.label')}
            value={theoTiles.blocked === null ? null : String(theoTiles.blocked)}
            hint={t('readiness.theoTiles.blocked.hint')}
            active={activeFilter?.kind === 'blocked'}
            onClick={() => toggleFilter({ kind: 'blocked' })}
          />
          <PreparationTile
            label={t('readiness.theoTiles.prepared.label')}
            value={theoTiles.prepared === null ? null : String(theoTiles.prepared)}
            hint={t('readiness.theoTiles.prepared.hint')}
          />
          <PreparationTile
            label={t('readiness.theoTiles.issued.label')}
            value={theoTiles.issued === null ? null : String(theoTiles.issued.count)}
            hint={t('readiness.theoTiles.issued.hint')}
          />
        </Box>
      ) : null}

      {/* LE BANDEAU — recherche, mois, filtre CRA, actions de masse,
          actualisation. Le mois reste offert même sur un mois vide : c'est le
          seul geste qui en sort. */}
      <Box data-slot="readiness-filters" display="flex" className="flex-wrap items-end gap-3">
        <ReadinessField label={t('readiness.filters.period')}>
          <InvoiceReadinessMonthSelect
            value={month}
            onChange={value => {
              setMonth(value)
              setPage(1)
            }}
          />
        </ReadinessField>
        {accountOptions.length > 0 ? (
          <ReadinessField label={t('readiness.filters.account')}>
            <MultiSelectMenu
              label={t('readiness.filters.account')}
              options={accountOptions}
              values={accountFilter}
              onChange={next => {
                setAccountFilter(next)
                setPage(1)
              }}
            />
          </ReadinessField>
        ) : null}
        {ownerOptions.length > 0 ? (
          <ReadinessField label={t('readiness.filters.owner')}>
            <MultiSelectMenu
              label={t('readiness.filters.owner')}
              options={ownerOptions}
              values={ownerFilter}
              onChange={next => {
                setOwnerFilter(next)
                setPage(1)
              }}
            />
          </ReadinessField>
        ) : null}
        <ReadinessField label={t('readiness.search.label')}>
          <Input
            value={search}
            onChange={event => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder={t('readiness.search.placeholder')}
            aria-label={t('readiness.search.label')}
            className="h-10 w-64"
          />
        </ReadinessField>
      </Box>
      <Box display="flex" className="flex-wrap items-center gap-2">
        {items.length > 0 ? (
          <Select
            // `""` en permanence : le déclencheur garde son libellé fixe
            // (« Statut CRA »), comme la maquette le montre. Choisir une
            // valeur DÉCLENCHE le filtre sans jamais devenir la valeur
            // affichée — `SelectItem value="__all__"` le REMET à zéro.
            value=""
            onValueChange={value => {
              setPage(1)
              if (value === '__all__') setActiveFilter(null)
              else toggleFilter({ kind: 'craStatus', value: value as CraStatusValue })
            }}
          >
            <SelectTrigger aria-label={t('readiness.craStatus.label')} className="h-10 w-48">
              <SelectValue placeholder={t('readiness.craStatus.label')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('readiness.craStatus.all')}</SelectItem>
              {CRA_STATUS_VALUES.map(value => (
                <SelectItem key={value} value={value}>
                  {`(${craCounts[value]}) ${t(`readiness.craStatus.${value}`)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {items.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            aria-pressed={activeFilter?.kind === 'craStatus' && activeFilter.value === 'not_submitted'}
            onClick={() => toggleFilter({ kind: 'craStatus', value: 'not_submitted' })}
          >
            {t('readiness.bulk.missingTimesheets')}
          </Button>
        ) : null}
        {items.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            disabled={remindableSelected.length === 0 || bulkRemind.isPending}
            onClick={() =>
              bulkRemind.mutate({
                items: remindableSelected.map(item => ({
                  missionId: item.missionId,
                  month: item.periodMonth.slice(0, 7),
                  blockers: item.blockers,
                })),
              })
            }
          >
            {remindableSelected.length > 0
              ? `${t('readiness.bulk.remindTimesheets')} (${remindableSelected.length})`
              : t('readiness.bulk.remindTimesheets')}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          {t('readiness.refresh')}
        </Button>
      </Box>

      <Box data-slot="readiness-scope" display="flex" className="flex-wrap items-baseline gap-x-4 gap-y-1">
        <Text element="span" size="sm" weight="medium">
          {t('readiness.title', { month: formatMonth(data?.month) ?? '' })}
        </Text>
        {summary ? (
          <>
            <Text element="span" size="xs" color="text-muted-foreground">
              {/* `invoiced` était compté par le serveur et affiché nulle part :
                  l'entête disait « 0 prêt · 0 bloqué » au-dessus d'une ligne
                  facturée, ce qui se lit « rien ce mois-ci ». */}
              {t('readiness.counts', {
                ready: summary.ready,
                blocked: summary.blocked,
                invoiced: summary.invoiced,
                // #2197.41 — le DÉCLARÉ, séparé du PROUVÉ : la clé i18n
                // porte déjà `{{invoicedDeclared}}`, ce passage manquait.
                invoicedDeclared: summary.invoicedDeclared,
              })}
            </Text>
            {/* Le total préparatoire ne s'affiche QUE si le lecteur a le droit
                financier ET que le serveur a su le chiffrer. Les deux `null`
                se ressemblent dans la donnée et pas du tout à l'écran : le
                premier se dit « réservé », le second se compte plus bas. */}
            {canReadFinance && summary.preparedAmountCents !== null ? (
              <Text element="span" size="xs" color="text-muted-foreground">
                {t('readiness.prepared', { value: Math.round(summary.preparedAmountCents / 100) })}
              </Text>
            ) : null}
            {!canReadFinance ? (
              // La phrase qui manquait. Sans elle, une colonne de montants vide
              // se lit « ce mois n'est pas chiffrable », et quelqu'un part
              // chercher un relevé qui est déjà là.
              <Text element="span" size="xs" color="text-muted-foreground">
                {t('readiness.financeHidden')}
              </Text>
            ) : null}
            {canReadFinance && summary.withoutAmount > 0 ? (
              // Sans ce compteur, un total partiel se lit comme un total. Et
              // depuis le 28/08 il MÈNE à ses propres lignes : un chiffre juste
              // qui laisse chercher les six lignes qu'il désigne fait refermer
              // l'écran. `<button type="button">` et non un `span` cliquable :
              // ce qui se clique se tabule (GA-35).
              canFilterWithoutAmount ? (
                <button
                  type="button"
                  aria-pressed={onlyWithoutAmount}
                  onClick={() => setOnlyWithoutAmount(value => !value)}
                  className={
                    onlyWithoutAmount
                      ? 'rounded-sm underline underline-offset-2'
                      : 'rounded-sm underline-offset-2 hover:underline'
                  }
                >
                  <Text element="span" size="xs" color="text-muted-foreground">
                    {t('readiness.withoutAmount', { count: summary.withoutAmount })}
                  </Text>
                </button>
              ) : (
                <Text element="span" size="xs" color="text-muted-foreground">
                  {t('readiness.withoutAmount', { count: summary.withoutAmount })}
                </Text>
              )
            ) : null}
            {canReadFinance && summary.blockedAmountCents !== null && summary.blockedAmountCents > 0 ? (
              // Le montant BLOQUÉ, annoncé SÉPARÉMENT : l'additionner au
              // préparatoire annoncerait une facturation qui n'aura pas lieu.
              <Text element="span" size="xs" color="text-[var(--warning-soft-text)]">
                {t('readiness.blockedAmount', { value: Math.round(summary.blockedAmountCents / 100) })}
              </Text>
            ) : null}
            {/* #2197.6 — « Factures préparées » : ni financier ni gardé par
                `canReadFinance`, c'est un COMPTE de brouillons/dépôts
                connecteur, pas un montant. Absent (0) : rien à annoncer, pas
                de « 0 » (GA-18/GA-19, doctrine « on n'affiche pas ce qu'on
                n'a pas »). */}
            {summary.preparedInvoicesCount > 0 ? (
              <Text element="span" size="xs" color="text-muted-foreground">
                {t('readiness.preparedInvoicesCount', { count: summary.preparedInvoicesCount })}
              </Text>
            ) : null}
            {/* #2197.7 — « Écart période » : le motif `unexplained_gap`
                existait déjà PAR LIGNE, jamais résumé. Même garde à zéro que
                juste au-dessus. */}
            {summary.unexplainedGapCount > 0 ? (
              <Text element="span" size="xs" color="text-[var(--warning-soft-text)]">
                {t('readiness.unexplainedGapCount', { count: summary.unexplainedGapCount })}
              </Text>
            ) : null}
            {/* #2783 — « dont avenants » sur ce mois, à l'échelle de l'espace :
                COMPTÉS, jamais chiffrés (voir `ReadinessSummary.amendmentsAccepted`,
                même distinction que `finance.forecastHorizons.amendments`).
                Même garde à zéro que ses voisins — l'absence ne fait aucune
                ligne (GA-18/GA-19). Décidés et simulés jamais fondus. */}
            {summary.amendmentsAccepted > 0 ? (
              <Text element="span" size="xs" color="text-muted-foreground">
                {t('readiness.amendments.accepted', { count: summary.amendmentsAccepted })}
              </Text>
            ) : null}
            {summary.amendmentsSimulated > 0 ? (
              <Text element="span" size="xs" color="text-muted-foreground">
                {t('readiness.amendments.simulated', { count: summary.amendmentsSimulated })}
              </Text>
            ) : null}
          </>
        ) : null}
      </Box>

      {items.length > 0 ? (
        // LES TUILES — trois, jamais quatre : « brouillon » n'existe pas
        // (Bellum n'émet aucune facture, c17_facturation) et ne se dérive
        // d'aucune donnée. Chacune FILTRE au clic (même geste que « N non
        // chiffrés » plus haut) : un indicateur qui ne mène nulle part ne
        // sert à rien.
        <Box display="flex" className="flex-wrap gap-2">
          <ReadinessTile
            label={t('readiness.tiles.supplierInvoiceMissing')}
            value={supplierMissingCount}
            active={activeFilter?.kind === 'supplierMissing'}
            onClick={() => toggleFilter({ kind: 'supplierMissing' })}
          />
          <ReadinessTile
            label={t('readiness.tiles.readyToSend')}
            value={readyToSendCount}
            active={activeFilter?.kind === 'ready'}
            onClick={() => toggleFilter({ kind: 'ready' })}
          />
          <ReadinessTile
            label={t('readiness.tiles.craBlocked')}
            value={craBlockedCount}
            active={activeFilter?.kind === 'craBlocked'}
            onClick={() => toggleFilter({ kind: 'craBlocked' })}
          />
        </Box>
      ) : null}

      <Box display="flex" className="items-center justify-between gap-2">
        {/* R3b — sur sa propre route, le bandeau de la page dit déjà « n'émet
            aucune facture » : une seule note, pas deux. */}
        {hideDisclaimer ? (
          <span />
        ) : (
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('readiness.disclaimer')}
          </Text>
        )}
        <Box display="flex" className="items-center gap-2">
          {/* #2197.43 — « Demander à Laura » existait sur les renouvellements
              (`RenewalsPage`) et le planning (`PlanningPage`) mais pas ici : la
              bulle recevait déjà le mois par `useLauraContext`, sans qu'aucun
              lien n'ouvre la conversation avec une question pré-remplie. Poids
              par défaut (`inline`) : cet écran est une file de travail qu'on
              consulte, pas l'arbitrage pleine page des renouvellements.
              ⚠️ Gatée sur `items.length > 0`, comme l'export juste en dessous :
              un mois sans mission n'a rien à prioriser, et l'état vide MÈNE
              déjà aux Missions (`emptyCta`) — une seconde porte muette ferait
              deux réponses à la même question vide. */}
          {items.length > 0 ? (
            <AskLaura question={t('readiness.lauraQuestion')} label={t('readiness.lauraCta')} />
          ) : null}
          {items.length > 0 && dataExit.grant ? (
            // L'export passe par le client HTTP authentifié : un lien nu partirait
            // sans cookie et rendrait un 401 déguisé en fichier vide.
            <Button
              variant="outline"
              size="sm"
              onClick={() => dataExit.grant && void downloadCsv(data?.month, dataExit.grant)}
            >
              {t('readiness.export')}
            </Button>
          ) : null}
        </Box>
      </Box>

      {items.length === 0 ? (
        // ⚠️ « Rien à surveiller sur ce mois. » SONNE comme une bonne nouvelle
        // et n'en est pas une. La requête ne rend aucune ligne quand aucune
        // mission ne couvre le mois — mission encore en brouillon, terminée
        // avant, ou pas encore commencée. C'est donc une question ouverte, et
        // elle se répond sur la fiche des missions, jamais ici.
        <Box className="rounded-md border border-dashed border-border p-4">
          <Text size="sm" color="text-muted-foreground">
            {t('readiness.empty')}
          </Text>
          <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
            {t('readiness.emptyWhy')}
          </Text>
          <Box className="mt-3">
            {onShowMissions ? (
              <Button variant="outline" size="sm" onClick={onShowMissions}>
                {t('readiness.emptyCta')}
              </Button>
            ) : (
              // `Link` et non un `div` cliquable : ce qui se clique se tabule
              // (GA-35), et un vrai `href` s'ouvre aussi au clic du milieu.
              <Button asChild variant="outline" size="sm">
                <Link to="/missions">{t('readiness.emptyCta')}</Link>
              </Button>
            )}
          </Box>
        </Box>
      ) : (
        <>
          <Box data-slot="readiness-table" className="overflow-hidden rounded-2xl border border-border bg-card">
            <InvoiceReadinessTable
              items={pageItems}
              canReadFinance={canReadFinance}
              selected={selected}
              onToggleSelect={toggleSelect}
              scrollLabel={t('readiness.table.status')}
              pending={
                markInvoiced.isPending ||
                recordPayment.isPending ||
                cancelInvoiced.isPending ||
                openDispute.isPending ||
                resolveDispute.isPending
              }
              onMarkInvoiced={item => setMarking(item)}
              onRecordPayment={item => setSettling(item)}
              onCancelInvoiced={item => setCancelling(item)}
              onOpenDispute={item => setDisputing(item)}
              onResolveDispute={item =>
                resolveDispute.mutate({ missionId: item.missionId, month: item.periodMonth.slice(0, 7) })
              }
              onRecordReminder={item =>
                recordReminder.mutate({
                  missionId: item.missionId,
                  month: item.periodMonth.slice(0, 7),
                  blockers: item.blockers,
                })
              }
              empty={
                // Les lignes EXISTENT (`items.length > 0`) : ce qui manque est le
                // résultat d'un filtre, jamais le mois lui-même. Le confondre avec
                // « Rien à surveiller sur ce mois » enverrait rouvrir les missions
                // pour un problème que la recherche, elle seule, peut réparer.
                <Box className="rounded-md border border-dashed border-border p-4">
                  <Text size="sm" color="text-muted-foreground">
                    {t('readiness.table.noResults')}
                  </Text>
                </Box>
              }
            />
          </Box>
          {filtered.length > 0 ? (
            <Box display="flex" className="items-center justify-between gap-2">
              <Text size="xs" color="text-muted-foreground">
                {t('readiness.pagination.range', {
                  from: (safePage - 1) * PAGE_SIZE + 1,
                  to: Math.min(safePage * PAGE_SIZE, filtered.length),
                  total: filtered.length,
                })}
              </Text>
              <Box display="flex" className="items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={safePage <= 1}
                  aria-label={t('readiness.pagination.previous')}
                  onClick={() => setPage(current => Math.max(1, current - 1))}
                >
                  ‹
                </Button>
                <Text size="xs" color="text-muted-foreground">
                  {t('readiness.pagination.page', { page: safePage, pages: pageCount })}
                </Text>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={safePage >= pageCount}
                  aria-label={t('readiness.pagination.next')}
                  onClick={() => setPage(current => Math.min(pageCount, current + 1))}
                >
                  ›
                </Button>
                <Text size="xs" color="text-muted-foreground">
                  {t('readiness.pagination.perPage', { count: PAGE_SIZE })}
                </Text>
              </Box>
            </Box>
          ) : null}
        </>
      )}

      {cancelling ? (
        <CancelInvoicedDialog
          pending={cancelInvoiced.isPending}
          onCancel={() => setCancelling(null)}
          onConfirm={reason => {
            cancelInvoiced.mutate({
              missionId: cancelling.missionId,
              month: cancelling.periodMonth.slice(0, 7),
              reason,
            })
            setCancelling(null)
          }}
        />
      ) : null}

      {disputing ? (
        <DisputeDialog
          pending={openDispute.isPending}
          onCancel={() => setDisputing(null)}
          onConfirm={reason => {
            openDispute.mutate({
              missionId: disputing.missionId,
              month: disputing.periodMonth.slice(0, 7),
              reason,
            })
            setDisputing(null)
          }}
        />
      ) : null}

      {marking ? (
        <MarkInvoicedDialog
          item={marking}
          pending={markInvoiced.isPending}
          onCancel={() => setMarking(null)}
          onConfirm={input => {
            markInvoiced.mutate({ missionId: marking.missionId, month: marking.periodMonth.slice(0, 7), ...input })
            setMarking(null)
          }}
        />
      ) : null}

      {settling ? (
        <PaymentDialog
          pending={recordPayment.isPending}
          onCancel={() => setSettling(null)}
          onConfirm={amountCents => {
            // Un montant absent ne s'envoie PAS à zéro : la propriété est
            // omise, et le serveur consigne un règlement non mesuré.
            recordPayment.mutate({
              missionId: settling.missionId,
              month: settling.periodMonth.slice(0, 7),
              ...(amountCents === null ? {} : { amountCents }),
            })
            setSettling(null)
          }}
        />
      ) : null}
    </Box>
  )
}

/**
 * Télécharge l'export du mois.
 *
 * Le fichier est récupéré par le client HTTP authentifié puis remis au
 * navigateur : un `<a href>` nu partirait sans cookie de session et rendrait un
 * 401 que l'utilisateur ouvrirait comme un fichier vide.
 */
async function downloadCsv(month: string | undefined, grant: DataExitGrant): Promise<void> {
  try {
    const csv = await invoiceReadinessApi.exportCsv(month)
    downloadCSV(csv, `facturation-${month ?? 'mois'}.csv`, grant)
  } catch (error) {
    // #2081.14 — un refus de la règle d'espace se DIT (« Réservé par la règle
    // d'espace : … »), jamais sous une erreur générique.
    toast.error(workspaceRuleRefusalText(error) ?? (error instanceof Error ? error.message : String(error)))
  }
}

/**
 * « Préparer la facture » (#2408.77, ex « Marqué comme facturé ailleurs ») —
 * avec ce qu'il faut pour s'y retrouver.
 *
 * Le bouton et le titre de cette boîte ont changé de mot, pas le geste :
 * ouvrir la boîte EST la préparation, la déclaration elle-même reste un
 * second clic explicite sur `confirmInvoiced` (« Enregistrer »). Les trois
 * champs sont FACULTATIFS et restent vides quand on ne les donne pas.
 * Inventer une échéance ferait apparaître un impayé au bout de trente jours
 * pour une facture dont personne n'a dit quand elle était due.
 */
function MarkInvoicedDialog({
  item,
  pending,
  onCancel,
  onConfirm,
}: {
  item: InvoiceReadiness
  pending: boolean
  onCancel: () => void
  onConfirm: (input: { reference?: string; amountCents?: number; dueOn?: string }) => void
}) {
  const { t } = useTranslation('missions')
  const [reference, setReference] = useState('')
  const [amount, setAmount] = useState(
    item.preparedAmountCents === null ? '' : String(Math.round(item.preparedAmountCents / 100)),
  )
  const [dueOn, setDueOn] = useState('')

  return (
    <Dialog open onOpenChange={open => !open && onCancel()}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('readiness.markInvoiced')}</DialogTitle>
          <DialogDescription>{item.missionLabel ?? t('unknownMission')}</DialogDescription>
        </DialogHeader>

        {/* #2944 (#2197.29, recette écran 26/09) — L'ENTITÉ FACTURANTE, en
            tête de cette boîte : le correctif du matin avait nommé l'entité
            dans la prévisualisation du CONNECTEUR (`MissionDetailTabs.tsx`,
            `InvoiceConnectorGate`) mais jamais ICI, la boîte que
            `/missions/facturation` monte réellement. Même clé i18n que la
            colonne « Société facturante » du tableau (#2197.9) — un réglage
            vit à un seul endroit (GA-26), jamais un second texte. Absente :
            on le DIT (jamais une raison sociale inventée) ET on offre le
            chemin pour la renseigner — le réglage vit sur la fiche mission
            (`BillingEntityRow`, `MissionDetailPanel.tsx`), jamais recalculé
            ici. */}
        <Box className="space-y-0.5">
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('readiness.table.legalEntity')}
          </Text>
          {item.legalEntityName ? (
            <Text size="sm">{item.legalEntityName}</Text>
          ) : (
            <Box display="flex" className="flex-wrap items-center gap-2">
              <UnknownValue reason={t('readiness.table.legalEntityUnknown')} />
              <Link
                to="/missions/$id"
                params={{ id: item.missionId }}
                className="text-xs text-[var(--bellum-text-secondary)] underline underline-offset-2"
              >
                {t('readiness.markInvoicedSetLegalEntity')}
              </Link>
            </Box>
          )}
        </Box>

        <Text element="p" size="xs" color="text-muted-foreground">
          {t('readiness.markInvoicedHelp')}
        </Text>

        <Box className="space-y-2">
          <Input
            value={reference}
            onChange={event => setReference(event.target.value)}
            placeholder={t('readiness.referencePlaceholder')}
            aria-label={t('readiness.reference')}
          />
          <Input
            value={amount}
            onChange={event => setAmount(event.target.value)}
            inputMode="numeric"
            placeholder={t('readiness.amountPlaceholder')}
            aria-label={t('readiness.amountLabel')}
          />
          <Input
            type="date"
            value={dueOn}
            onChange={event => setDueOn(event.target.value)}
            aria-label={t('readiness.dueOn')}
          />
        </Box>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              const euros = Number(amount)
              onConfirm({
                // Un champ vide reste VIDE : `undefined` et non 0, sans quoi une
                // facture sans montant se lirait « facturée zéro euro ».
                reference: reference.trim() || undefined,
                amountCents: amount.trim() && Number.isFinite(euros) ? Math.round(euros * 100) : undefined,
                dueOn: dueOn || undefined,
              })
            }}
          >
            {t('readiness.confirmInvoiced')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Une TUILE — la maquette du 26/08 en montre quatre, « brouillon » compris ;
 * celle-ci n'en rend que TROIS, parce que Bellum n'émet aucune facture
 * (c17_facturation) et qu'un « brouillon » de facture client n'existe nulle
 * part dans ce dépôt. `null` dit « non mesuré » — jamais « 0 », qui se lirait
 * comme une mesure vraie.
 *
 * Cliquable, comme le compteur « N non chiffrés » du bandeau au-dessus : un
 * indicateur qui ne mène nulle part ne sert à rien.
 */
function ReadinessTile({
  label,
  value,
  active,
  onClick,
}: {
  label: string
  value: number | null
  active: boolean
  onClick: () => void
}) {
  const { t } = useTranslation('missions')
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-w-[9rem] rounded-md border p-3 text-left transition-colors ${
        active
          ? 'border-[var(--bellum-text-accent)] bg-[var(--bg-elevated)]'
          : 'border-border hover:bg-[var(--bg-elevated)]'
      }`}
    >
      <Text element="span" size="xs" color="text-muted-foreground" className="block">
        {label}
      </Text>
      {value === null ? (
        <Text element="span" size="lg" weight="medium" color="text-muted-foreground" className="block">
          {t('readiness.tiles.notMeasured')}
        </Text>
      ) : (
        <Text element="span" size="lg" weight="medium" className="block">
          {value}
        </Text>
      )}
    </button>
  )
}

/** Une tuile de Théo : filtrante si on lui donne un `onClick`, lecture seule sinon. `value: null` = non mesuré. */
/** Théo .field — un filtre, son libellé au-dessus. */
function ReadinessField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]">
        {label}
      </Text>
      {children}
    </div>
  )
}

function PreparationTile({
  label,
  value,
  hint,
  active = false,
  accent = false,
  onClick,
}: {
  label: string
  value: string | null
  hint: string
  active?: boolean
  accent?: boolean
  onClick?: () => void
}) {
  const body = (
    <>
      <Text element="span" size="xs" color="text-muted-foreground" className="block">
        {label}
      </Text>
      <Text
        element="span"
        color={accent ? 'text-[var(--bellum-text-accent)]' : undefined}
        className="block text-3xl font-semibold tabular-nums"
      >
        {value ?? '—'}
      </Text>
      <Text element="span" size="xs" color="text-muted-foreground" className="block">
        {hint}
      </Text>
    </>
  )
  // Théo .tile — carte large, grand chiffre ; active = aplat d'accent.
  const frame = `flex h-full w-full flex-col gap-2 rounded-2xl border bg-card p-4 text-left md:p-5 ${
    active ? 'border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)]' : 'border-border'
  }`
  return onClick ? (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`${frame} min-h-11 hover:bg-[var(--bg-elevated)]`}
    >
      {body}
    </button>
  ) : (
    <div className={frame}>{body}</div>
  )
}

/**
 * L'invite d'annulation d'un « facturé ».
 *
 * Le MOTIF est obligatoire, côté serveur comme ici : une annulation sans raison
 * est exactement ce qu'on ne saura pas relire dans six mois, quand on cherchera
 * pourquoi ce mois n'a jamais été encaissé.
 */
function CancelInvoicedDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const { t } = useTranslation('missions')
  const [reason, setReason] = useState('')
  return (
    <Box className="mt-3 rounded-md border border-border p-3">
      <Text size="sm" weight="medium" className="block">
        {t('readiness.cancelInvoicedTitle')}
      </Text>
      <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
        {t('readiness.cancelInvoicedHint')}
      </Text>
      <Input
        className="mt-2"
        value={reason}
        onChange={event => setReason(event.target.value)}
        placeholder={t('readiness.cancelInvoicedPlaceholder')}
      />
      <Box display="flex" className="mt-2 gap-2">
        <Button size="sm" disabled={pending || reason.trim().length === 0} onClick={() => onConfirm(reason.trim())}>
          {t('readiness.cancelInvoicedConfirm')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('readiness.cancelInvoicedAbort')}
        </Button>
      </Box>
    </Box>
  )
}

/**
 * L'invite de LITIGE.
 *
 * Le MOTIF est obligatoire, côté serveur comme ici : « en litige » sans rien
 * d'autre ne se relit pas six mois plus tard, quand on cherchera pourquoi cette
 * facture a mis quatre mois à rentrer. Le bouton reste inerte tant que rien
 * n'est saisi — le même comportement que l'annulation d'un « facturé », et pour
 * la même raison.
 */
function DisputeDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const { t } = useTranslation('missions')
  const [reason, setReason] = useState('')
  return (
    <Box className="mt-3 rounded-md border border-border p-3">
      <Text size="sm" weight="medium" className="block">
        {t('readiness.disputeTitle')}
      </Text>
      <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
        {t('readiness.disputeHint')}
      </Text>
      <Input
        className="mt-2"
        value={reason}
        onChange={event => setReason(event.target.value)}
        placeholder={t('readiness.disputePlaceholder')}
      />
      <Box display="flex" className="mt-2 gap-2">
        <Button size="sm" disabled={pending || reason.trim().length === 0} onClick={() => onConfirm(reason.trim())}>
          {t('readiness.disputeConfirm')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('readiness.disputeAbort')}
        </Button>
      </Box>
    </Box>
  )
}
