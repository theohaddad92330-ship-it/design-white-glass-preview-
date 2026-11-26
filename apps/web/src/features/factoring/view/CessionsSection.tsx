import type {
  FactoringContract,
  FactoringSettlement,
  FactoringView,
  ReceivableAssignment,
  ReconciliationState,
} from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Text,
} from '@bellum/ui'
import { MoreHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { appLocale, formatDate, formatMonth } from '@/lib/locale'
import { formatCents } from '@/lib/money'
import {
  useCloseAssignment,
  useCreateFactoringContract,
  useFactoringView,
  useMarkAssigned,
  useMarkSettled,
  usePrepareAssignment,
  useReconcileSettlement,
} from '../api'

/**
 * LES CESSIONS — « qu'est-ce qui est chez le factor, et a-t-il payé ce qu'il
 * doit ? » (31/08/2026)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CET ÉCRAN EXISTE ALORS QU'IL ÉTAIT REFUSÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le domaine était refusé par `c29_affacturage`, et l'annexe des écrans cibles
 * demandait de JETER la colonne « Cession ». Louis a levé le refus le
 * 31/08/2026. La raison est dans les maquettes du 26/08 : la cession y porte le
 * premier chiffre de la répartition des paiements — c'est le goulot n°1 de la
 * trésorerie d'une ESN qui affacture, et rien ne le montrait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE L'ÉCRAN NE FAIT PAS, ET NE FERA PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  · **il n'émet aucune facture.** Une cession porte sur une créance déjà
 *    facturée dans l'outil comptable ;
 *  · **il ne demande AUCUNE coordonnée bancaire.** Le formulaire de contrat
 *    porte un nom, une référence, un taux et un plafond — et la phrase qui le
 *    dit est à l'écran, parce qu'un utilisateur qui cherche où saisir son IBAN
 *    doit savoir qu'il ne le trouvera pas ;
 *  · **il n'envoie rien au factor.** « Préparer la cession » prépare ; c'est
 *    l'utilisateur qui transmet, et l'écran consigne qu'il l'a fait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX RÈGLES D'AFFICHAGE QUI GOUVERNENT TOUT LE FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 *  · **aucune valeur absente ne s'affiche « 0 »** : un encours non chiffré, un
 *    taux non saisi et un écart non mesurable rendent chacun leur `UnknownValue`
 *    NOMMÉ. « 0 € cédé » se lirait « rien n'est chez le factor », et « 0 %
 *    de commission » « affacturage gratuit » ;
 *  · **aucun chiffre pendant le chargement.** Quatre compteurs à zéro le temps
 *    d'une requête font refermer l'onglet avant que la vérité n'arrive.
 */
/** Une créance facturée qu'aucune cession ne couvre. Non exportée : seul cet
 *  écran la lit, et un type exporté que personne n'importe est une promesse
 *  d'API que rien ne tient (`pnpm lint:exports:types`). */
type MissingRow = FactoringView['missing'][number]

// Théo C missions-finance.A2 — la section « Cessions » de Missions › Finance (amendement 22/10) :
// l'écran `/missions/cessions` est redirigé vers `/missions/finance#cessions`, ses chiffres et ses gestes restent.
export function CessionsSection() {
  const { t } = useTranslation('factoring')
  const { data, isLoading, isError } = useFactoringView()

  const createContract = useCreateFactoringContract()
  const prepare = usePrepareAssignment()
  const markAssigned = useMarkAssigned()
  const markSettled = useMarkSettled()
  const closeAssignment = useCloseAssignment()
  const reconcile = useReconcileSettlement()

  const [addingContract, setAddingContract] = useState(false)
  const [preparing, setPreparing] = useState<MissingRow | null>(null)
  const [closing, setClosing] = useState<{ row: ReceivableAssignment; status: 'rejected' | 'recalled' } | null>(null)

  // Les cessions qu'un règlement peut solder : celles qui sont chez le factor.
  // Proposer d'y rapprocher une cession préparée ou refusée offrirait un geste
  // que le serveur accepterait sans que la ligne ait de sens.
  const matchable = useMemo(
    () => (data?.assignments ?? []).filter(row => row.status === 'assigned' || row.status === 'settled'),
    [data],
  )

  return (
    <section id="cessions" aria-labelledby="cessions-title" className="scroll-mt-4">
      <Box className="space-y-4 py-4">
        <h2 id="cessions-title" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <Box className="rounded-md border border-border bg-card/50 p-3">
          <Text size="sm" color="text-muted-foreground">
            {t('banner')}
          </Text>
        </Box>

        {isError ? (
          // Une panne de lecture n'est PAS un écran vide. Sans cette phrase,
          // une requête en échec s'afficherait « aucune cession » et se
          // lirait « ton ESN ne cède rien » — le silence que cet écran existe
          // pour rompre.
          <Box className="rounded-md border border-dashed border-border p-4">
            <Text element="p" size="sm">
              {t('loadError')}
            </Text>
          </Box>
        ) : isLoading || !data ? (
          <Text size="sm" color="text-muted-foreground">
            {t('common:states.loading')}
          </Text>
        ) : (
          <>
            {!data.canReadFinance ? (
              // Le NOMBRE de cessions, leur mission, leur statut et l'état de
              // réconciliation ne sont pas des données financières : un
              // gestionnaire doit pouvoir aller chercher ce qui bloque. Les
              // MONTANTS par cession en sont — la phrase est dite UNE fois,
              // jamais par ligne (vingt copies de la même explication
              // n'informent personne).
              <Text element="p" size="xs" color="text-muted-foreground">
                {t('financeHidden')}
              </Text>
            ) : null}

            <SummaryTiles view={data} />

            <ContractsSection
              contracts={data.contracts}
              outstandingCents={data.summary.outstanding.amountCents}
              adding={addingContract}
              pending={createContract.isPending}
              onAdd={() => setAddingContract(true)}
              onCancel={() => setAddingContract(false)}
              onSubmit={input => {
                createContract.mutate(input)
                setAddingContract(false)
              }}
            />

            <AssignmentsTable
              rows={data.assignments}
              canReadFinance={data.canReadFinance}
              pending={markAssigned.isPending || markSettled.isPending || closeAssignment.isPending}
              onMarkAssigned={row => markAssigned.mutate(row.id)}
              onMarkSettled={row => markSettled.mutate(row.id)}
              onClose={(row, status) => setClosing({ row, status })}
            />

            <MissingTable
              rows={data.missing}
              canReadFinance={data.canReadFinance}
              canPrepare={data.contracts.some(contract => contract.status !== 'ended')}
              onPrepare={row => setPreparing(row)}
            />

            <SettlementsToMatch
              rows={data.unreconciledSettlements}
              candidates={matchable}
              pending={reconcile.isPending}
              onReconcile={(settlementId, assignmentId) => reconcile.mutate({ settlementId, assignmentId })}
            />
          </>
        )}

        {preparing && data ? (
          <PrepareForm
            row={preparing}
            contracts={data.contracts.filter(contract => contract.status !== 'ended')}
            pending={prepare.isPending}
            onCancel={() => setPreparing(null)}
            onConfirm={input => {
              prepare.mutate(input)
              setPreparing(null)
            }}
          />
        ) : null}

        {closing ? (
          <CloseForm
            status={closing.status}
            pending={closeAssignment.isPending}
            onCancel={() => setClosing(null)}
            onConfirm={reason => {
              closeAssignment.mutate({ id: closing.row.id, input: { status: closing.status, reason } })
              setClosing(null)
            }}
          />
        ) : null}
      </Box>
    </section>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  L'entête                                                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Le plafond d'encours ACCORDÉ, tous contrats en cours confondus.
 *
 * ⚠️ Une DÉRIVATION vit à un seul endroit : `SummaryTiles` et `ContractsSection`
 * en ont chacun besoin — la première pour l'ALERTE agrégée, la seconde pour la
 * ligne par contrat — et deux calculs recopiés divergeraient au premier
 * contrat suspendu ou terminé.
 *
 * L'accumulateur part de `null` et non de 0, et il n'y retombe jamais par un
 * `?? 0` : tant qu'aucun contrat n'a de plafond saisi, la somme n'existe pas.
 * Un total amorcé à zéro annoncerait « plafond : 0 € », et tout encours
 * deviendrait un dépassement.
 */
function totalOutstandingLimitCents(contracts: readonly FactoringContract[]): number | null {
  return contracts.reduce<number | null>((total, contract) => {
    if (contract.status === 'ended' || contract.outstandingLimitCents === null) return total
    return total === null ? contract.outstandingLimitCents : total + contract.outstandingLimitCents
  }, null)
}

/**
 * Les quatre chiffres de l'entête, dans l'ordre de la maquette du 26/08 :
 * l'encours, l'attente, le manquant, l'écart.
 *
 * ⚠️ L'ÉCART est le seul qui peut être NÉGATIF, et il ne porte pas de couleur
 * de gravité : « le factor a versé 150 € de moins » n'est pas une alerte, c'est
 * un fait à vérifier — la ligne concernée, elle, porte son badge.
 *
 * ⚠️ Les QUATRE totaux restent visibles sans `finance:read` (voir le
 * contrat) : seul l'ÉCART, dérivé du réglé de chaque cession, se rédige. Sans
 * plafond SAISI, aucune alerte ne se déclenche — pas de seuil deviné.
 */
function SummaryTiles({ view }: { view: FactoringView }) {
  const { t } = useTranslation('factoring')
  const limitCents = totalOutstandingLimitCents(view.contracts)
  const outstandingCents = view.summary.outstanding.amountCents
  const overLimitCents =
    limitCents !== null && outstandingCents !== null && outstandingCents > limitCents
      ? outstandingCents - limitCents
      : null

  return (
    <Box className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        label={t('tiles.outstanding')}
        amountCents={view.summary.outstanding.amountCents}
        count={t('tiles.assignmentCount', { count: view.summary.outstanding.count })}
        withoutAmount={view.summary.outstanding.withoutAmount}
        note={limitCents === null ? null : t('tiles.limitShare', { value: formatCents(limitCents) })}
        alert={overLimitCents === null ? null : t('tiles.overLimit', { value: formatCents(overLimitCents) })}
      />
      <Tile
        label={t('tiles.awaiting')}
        amountCents={view.summary.awaiting.amountCents}
        count={t('tiles.assignmentCount', { count: view.summary.awaiting.count })}
        withoutAmount={view.summary.awaiting.withoutAmount}
        note={view.summary.unmeasurable > 0 ? t('tiles.unmeasurable', { count: view.summary.unmeasurable }) : null}
      />
      <Tile
        label={t('tiles.missing')}
        amountCents={view.summary.missing.amountCents}
        count={t('tiles.receivableCount', { count: view.summary.missing.count })}
        withoutAmount={view.summary.missing.withoutAmount}
        note={null}
      />
      <Tile
        label={t('tiles.variance')}
        amountCents={view.summary.varianceCents}
        count={t('tiles.assignmentCount', { count: view.assignments.length })}
        withoutAmount={0}
        hidden={!view.canReadFinance}
        note={view.canReadFinance && view.summary.varianceCents === null ? t('tiles.noVariance') : null}
      />
    </Box>
  )
}

function Tile({
  label,
  amountCents,
  count,
  withoutAmount,
  note,
  alert = null,
  hidden = false,
}: {
  label: string
  amountCents: number | null
  count: string
  withoutAmount: number
  note: string | null
  /** Une ALERTE porte la couleur sémantique (`*-soft-text`, jamais la teinte
   *  fixe) et prend le pas sur `note` — les deux ne se disent jamais en même
   *  temps sur la même tuile. */
  alert?: string | null
  /**
   * Le lecteur n'a pas `finance:read` : le montant se TAIT plutôt que
   * d'afficher un `UnknownValue` — la phrase qui l'explique est dite UNE fois,
   * en entête d'écran (`financeHidden`), pas quatre fois sous quatre tuiles.
   */
  hidden?: boolean
}) {
  const { t } = useTranslation('factoring')
  return (
    <Box className="min-w-0 rounded-md border border-border bg-card p-3">
      <Text element="p" size="xs" color="text-muted-foreground">
        {label}
      </Text>
      {hidden ? null : amountCents === null ? (
        <UnknownValue reason={t('tiles.noAmount')} />
      ) : (
        <Text element="p" size="lg" weight="medium">
          {formatCents(amountCents)}
        </Text>
      )}
      <Text element="p" size="xs" color="text-muted-foreground">
        {count}
        {withoutAmount > 0 ? ` · ${t('tiles.withoutAmount', { count: withoutAmount })}` : ''}
      </Text>
      {alert ? (
        <Text element="p" size="xs" color="text-[var(--warning-soft-text)]" className="mt-0.5 font-medium">
          {alert}
        </Text>
      ) : note ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {note}
        </Text>
      ) : null}
    </Box>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Les contrats factor                                                       */
/* ══════════════════════════════════════════════════════════════════════════ */

const CONTRACT_STATUS_VARIANT: Readonly<Record<FactoringContract['status'], 'success' | 'warning' | 'secondary'>> = {
  active: 'success',
  suspended: 'warning',
  ended: 'secondary',
}

function ContractsSection({
  contracts,
  outstandingCents,
  adding,
  pending,
  onAdd,
  onCancel,
  onSubmit,
}: {
  contracts: readonly FactoringContract[]
  outstandingCents: number | null
  adding: boolean
  pending: boolean
  onAdd: () => void
  onCancel: () => void
  onSubmit: (input: {
    factorName: string
    contractReference?: string
    commissionRateBps?: number
    outstandingLimitCents?: number
  }) => void
}) {
  const { t } = useTranslation('factoring')
  return (
    <Box className="space-y-2">
      <Box display="flex" className="flex-wrap items-center justify-between gap-2">
        <Text element="h2" size="sm" weight="medium">
          {t('contracts.title')}
        </Text>
        {!adding ? (
          <Button type="button" size="sm" variant="ghost" onClick={onAdd}>
            {t('contracts.add')}
          </Button>
        ) : null}
      </Box>

      {contracts.length === 0 && !adding ? (
        <Box className="rounded-md border border-dashed border-border p-4">
          <Text size="sm" color="text-muted-foreground">
            {t('contracts.empty')}
          </Text>
        </Box>
      ) : null}

      <Box className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {contracts.map(contract => (
          <Box key={contract.id} className="min-w-0 rounded-md border border-border bg-card p-3">
            <Box display="flex" className="flex-wrap items-center justify-between gap-2">
              <Text size="sm" weight="medium">
                {contract.factorName}
              </Text>
              <Badge variant={CONTRACT_STATUS_VARIANT[contract.status]}>
                {t(`contracts.status.${contract.status}`)}
              </Badge>
            </Box>
            <Text element="p" size="xs" color="text-muted-foreground">
              {contract.contractReference ?? t('contracts.noReference')}
            </Text>
            <Box display="flex" className="mt-1 flex-wrap gap-x-3 gap-y-1">
              <Text element="span" size="xs">
                {t('contracts.rate')} :{' '}
                {contract.commissionRateBps === null ? (
                  <UnknownValue reason={t('contracts.noRate')} />
                ) : (
                  formatRate(contract.commissionRateBps)
                )}
              </Text>
              <Text element="span" size="xs">
                {t('contracts.limit')} :{' '}
                {contract.outstandingLimitCents === null ? (
                  <UnknownValue reason={t('contracts.noLimit')} />
                ) : (
                  formatCents(contract.outstandingLimitCents)
                )}
              </Text>
            </Box>
            {contract.outstandingLimitCents !== null && outstandingCents !== null ? (
              <Text
                element="p"
                size="xs"
                color={
                  outstandingCents > contract.outstandingLimitCents
                    ? 'text-[var(--warning-soft-text)]'
                    : 'text-muted-foreground'
                }
                className={outstandingCents > contract.outstandingLimitCents ? 'font-medium' : undefined}
              >
                {t('tiles.outstanding')} : {formatCents(outstandingCents)}{' '}
                {t('tiles.limitShare', { value: formatCents(contract.outstandingLimitCents) })}
                {outstandingCents > contract.outstandingLimitCents
                  ? ` — ${t('tiles.overLimit', { value: formatCents(outstandingCents - contract.outstandingLimitCents) })}`
                  : ''}
              </Text>
            ) : null}
          </Box>
        ))}
      </Box>

      {adding ? <ContractForm pending={pending} onCancel={onCancel} onSubmit={onSubmit} /> : null}
    </Box>
  )
}

/**
 * Le formulaire de contrat — et ce qu'il NE demande pas.
 *
 * Quatre champs, aucun IBAN. La phrase `contracts.bankNote` est affichée
 * exprès : un utilisateur qui cherche où saisir ses coordonnées bancaires doit
 * apprendre qu'il ne les trouvera pas, plutôt que de conclure à un champ
 * manquant et de les écrire dans la référence du contrat.
 */
function ContractForm({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean
  onCancel: () => void
  onSubmit: (input: {
    factorName: string
    contractReference?: string
    commissionRateBps?: number
    outstandingLimitCents?: number
  }) => void
}) {
  const { t } = useTranslation('factoring')
  const [factorName, setFactorName] = useState('')
  const [reference, setReference] = useState('')
  const [rate, setRate] = useState('')
  const [limit, setLimit] = useState('')

  const rateBps = parseRateBps(rate)
  const limitCents = parseAmountCents(limit)

  return (
    <Box className="rounded-md border border-border p-3">
      <Box className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <LabelledInput
          label={t('contracts.factorName')}
          placeholder={t('contracts.factorNamePlaceholder')}
          value={factorName}
          onChange={setFactorName}
        />
        <LabelledInput
          label={t('contracts.reference')}
          placeholder={t('contracts.referencePlaceholder')}
          value={reference}
          onChange={setReference}
        />
        <LabelledInput
          label={`${t('contracts.rate')} (${t('contracts.rateUnit')})`}
          placeholder={t('contracts.ratePlaceholder')}
          value={rate}
          onChange={setRate}
        />
        <LabelledInput
          label={`${t('contracts.limit')} (${t('contracts.limitUnit')})`}
          placeholder={t('contracts.limitPlaceholder')}
          value={limit}
          onChange={setLimit}
        />
      </Box>
      <Text element="p" size="xs" color="text-muted-foreground" className="mt-2">
        {t('contracts.bankNote')}
      </Text>
      <Box display="flex" className="mt-2 gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending || factorName.trim().length === 0}
          onClick={() =>
            onSubmit({
              factorName: factorName.trim(),
              // ⚠️ Un champ VIDE ne part pas à zéro : il ne part pas du tout.
              // « 0 % » et « non saisi » sont deux valeurs différentes, et le
              // serveur les distingue déjà.
              ...(reference.trim().length > 0 ? { contractReference: reference.trim() } : {}),
              ...(rateBps === null ? {} : { commissionRateBps: rateBps }),
              ...(limitCents === null ? {} : { outstandingLimitCents: limitCents }),
            })
          }
        >
          {t('contracts.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t('contracts.cancel')}
        </Button>
      </Box>
    </Box>
  )
}

function LabelledInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Box className="min-w-0">
      <Text element="p" size="xs" color="text-muted-foreground">
        {label}
      </Text>
      <Input
        className="mt-1"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={event => onChange(event.target.value)}
      />
    </Box>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Les cessions                                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

const ASSIGNMENT_STATUS_VARIANT: Readonly<
  Record<ReceivableAssignment['status'], 'success' | 'secondary' | 'warning' | 'danger'>
> = {
  prepared: 'secondary',
  assigned: 'warning',
  settled: 'success',
  rejected: 'danger',
  recalled: 'danger',
}

/**
 * La couleur du rapprochement porte un ÉTAT, jamais une catégorie.
 *
 * `not_due` et `unmeasurable` sont volontairement NEUTRES : « rien n'est
 * attendu » et « on ne sait pas » ne sont pas des alertes, et les peindre en
 * orange ferait chercher un problème là où il n'y en a pas.
 */
const RECONCILIATION_VARIANT: Readonly<Record<ReconciliationState, 'success' | 'secondary' | 'warning' | 'danger'>> = {
  not_due: 'secondary',
  unmeasurable: 'secondary',
  awaiting: 'warning',
  matched: 'success',
  short: 'danger',
  over: 'warning',
}

function AssignmentsTable({
  rows,
  canReadFinance,
  pending,
  onMarkAssigned,
  onMarkSettled,
  onClose,
}: {
  rows: readonly ReceivableAssignment[]
  /** Le montant cédé se TAIT sans `finance:read`, plutôt que d'afficher un
   *  `UnknownValue` : la raison est dite UNE fois en entête (`financeHidden`). */
  canReadFinance: boolean
  pending: boolean
  onMarkAssigned: (row: ReceivableAssignment) => void
  onMarkSettled: (row: ReceivableAssignment) => void
  onClose: (row: ReceivableAssignment, status: 'rejected' | 'recalled') => void
}) {
  const { t } = useTranslation('factoring')
  return (
    <Box className="space-y-2">
      <Text element="h2" size="sm" weight="medium">
        {t('assignments.title')}
      </Text>
      <ResponsiveTable
        rows={rows}
        rowKey={row => row.id}
        scrollLabel={t('assignments.title')}
        empty={
          <Box className="rounded-md border border-dashed border-border p-4">
            <Text size="sm" color="text-muted-foreground">
              {t('assignments.empty')}
            </Text>
            <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
              {t('assignments.emptyWhy')}
            </Text>
          </Box>
        }
        columns={[
          {
            key: 'account',
            header: t('assignments.columns.account'),
            mobile: 'title',
            render: row => row.accountName ?? <UnknownValue reason={t('assignments.unknownAccount')} />,
          },
          {
            key: 'mission',
            header: t('assignments.columns.mission'),
            mobile: 'meta',
            render: row =>
              row.missionLabel ? (
                <ObjectMention kind="mission" id={row.missionId} name={row.missionLabel} />
              ) : (
                <UnknownValue reason={t('assignments.unknownMission')} />
              ),
          },
          {
            key: 'month',
            header: t('assignments.columns.month'),
            mobile: 'meta',
            render: row => formatMonth(row.periodMonth.slice(0, 7)) ?? row.periodMonth,
          },
          {
            key: 'factor',
            header: t('assignments.columns.factor'),
            render: row => row.factorName,
          },
          {
            key: 'amount',
            header: t('assignments.columns.amount'),
            render: row =>
              !canReadFinance ? null : row.assignedAmountCents === null ? (
                <UnknownValue reason={t('assignments.noAmount')} />
              ) : (
                formatCents(row.assignedAmountCents)
              ),
          },
          {
            key: 'rate',
            header: t('assignments.columns.rate'),
            render: row => <RateCell row={row} />,
          },
          {
            key: 'status',
            header: t('assignments.columns.status'),
            render: row => (
              <Badge variant={ASSIGNMENT_STATUS_VARIANT[row.status]}>{t(`assignments.status.${row.status}`)}</Badge>
            ),
          },
          {
            key: 'reconciliation',
            header: t('assignments.columns.reconciliation'),
            render: row => (
              <Badge variant={RECONCILIATION_VARIANT[row.reconciliation.state]}>
                {t(`assignments.reconciliation.${row.reconciliation.state}`)}
              </Badge>
            ),
          },
          {
            key: 'variance',
            header: t('assignments.columns.variance'),
            render: row => <VarianceCell row={row} />,
          },
          {
            key: 'actions',
            header: t('assignments.columns.actions'),
            render: row => (
              <AssignmentMenu
                row={row}
                pending={pending}
                onMarkAssigned={() => onMarkAssigned(row)}
                onMarkSettled={() => onMarkSettled(row)}
                onClose={status => onClose(row, status)}
              />
            ),
          },
        ]}
      />
    </Box>
  )
}

/** Le taux appliqué, et le fait qu'il soit DÉROGATOIRE quand il l'est : c'est
 *  la seule façon de comprendre pourquoi deux cessions du même contrat ne
 *  rendent pas la même commission. */
function RateCell({ row }: { row: ReceivableAssignment }) {
  const { t } = useTranslation('factoring')
  if (row.commissionRateBps === null) return <UnknownValue reason={t('assignments.noRate')} />
  return (
    <Box className="min-w-0">
      <Text element="span" size="sm">
        {formatRate(row.commissionRateBps)}
      </Text>
      {row.commissionAmountCents === null ? null : (
        <Text element="p" size="xs" color="text-muted-foreground">
          {formatCents(row.commissionAmountCents)}
        </Text>
      )}
    </Box>
  )
}

/**
 * L'écart, et rien quand il n'y en a pas à dire.
 *
 * ⚠️ Une cession `awaiting` n'affiche AUCUN écart : « −390 000 € » serait exact
 * et se lirait « le factor nous doit tout », c'est-à-dire le diagnostic d'un
 * impayé sur une cession qui vient de partir. Le badge d'à côté dit déjà
 * « en attente ».
 */
function VarianceCell({ row }: { row: ReceivableAssignment }) {
  const { t } = useTranslation('factoring')
  const { expectedNetCents, settledCents, varianceCents } = row.reconciliation
  if (varianceCents === null) {
    return expectedNetCents === null ? null : (
      <Text size="xs" color="text-muted-foreground">
        {t('assignments.expected', { value: formatCents(expectedNetCents) })}
      </Text>
    )
  }
  return (
    <Box className="min-w-0">
      <Text element="span" size="sm">
        {formatCents(varianceCents)}
      </Text>
      <Text element="p" size="xs" color="text-muted-foreground">
        {t('assignments.settled', { value: formatCents(settledCents) })}
      </Text>
    </Box>
  )
}

/**
 * Les gestes d'une cession, dans un menu NOMMÉ.
 *
 * ⚠️ Chaque geste n'apparaît QUE là où il a un sens : le serveur refuse déjà de
 * transmettre une cession qui n'est pas préparée, et montrer le bouton quand
 * même ferait cliquer sur une erreur. Une cession refusée ou reprise n'a plus
 * aucun geste — c'est un fait, pas un état de travail.
 */
function AssignmentMenu({
  row,
  pending,
  onMarkAssigned,
  onMarkSettled,
  onClose,
}: {
  row: ReceivableAssignment
  pending: boolean
  onMarkAssigned: () => void
  onMarkSettled: () => void
  onClose: (status: 'rejected' | 'recalled') => void
}) {
  const { t } = useTranslation('factoring')
  const closed = row.status === 'rejected' || row.status === 'recalled'
  if (closed) return null
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label={t('assignments.rowMenu')} disabled={pending}>
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('assignments.rowMenu')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {row.status === 'prepared' ? (
          <DropdownMenuItem onSelect={() => onMarkAssigned()}>{t('assignments.markAssigned')}</DropdownMenuItem>
        ) : null}
        {row.status === 'assigned' ? (
          <DropdownMenuItem onSelect={() => onMarkSettled()}>{t('assignments.markSettled')}</DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => onClose('rejected')}>{t('assignments.reject')}</DropdownMenuItem>
        {row.status !== 'prepared' ? (
          <DropdownMenuItem onSelect={() => onClose('recalled')}>{t('assignments.recall')}</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  « Cession manquante »                                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

function MissingTable({
  rows,
  canReadFinance,
  canPrepare,
  onPrepare,
}: {
  rows: readonly MissingRow[]
  /** Le montant facturé se TAIT sans `finance:read` — même champ que
   *  `/missions/encaissements` (D45) : la raison est dite une fois en entête. */
  canReadFinance: boolean
  canPrepare: boolean
  onPrepare: (row: MissingRow) => void
}) {
  const { t } = useTranslation('factoring')
  return (
    <Box className="space-y-2">
      <Text element="h2" size="sm" weight="medium">
        {t('missing.title')}
      </Text>
      <Text element="p" size="xs" color="text-muted-foreground">
        {t('missing.hint')}
      </Text>
      <ResponsiveTable
        rows={rows}
        rowKey={row => `${row.missionId}-${row.periodMonth}`}
        scrollLabel={t('missing.title')}
        empty={
          <Box className="rounded-md border border-dashed border-border p-4">
            <Text size="sm" color="text-muted-foreground">
              {t('missing.empty')}
            </Text>
          </Box>
        }
        columns={[
          {
            key: 'account',
            header: t('missing.columns.account'),
            mobile: 'title',
            render: row => row.accountName ?? <UnknownValue reason={t('assignments.unknownAccount')} />,
          },
          {
            key: 'mission',
            header: t('missing.columns.mission'),
            mobile: 'meta',
            render: row =>
              row.missionLabel ? (
                <ObjectMention kind="mission" id={row.missionId} name={row.missionLabel} />
              ) : (
                <UnknownValue reason={t('assignments.unknownMission')} />
              ),
          },
          {
            key: 'month',
            header: t('missing.columns.month'),
            mobile: 'meta',
            render: row => formatMonth(row.periodMonth.slice(0, 7)) ?? row.periodMonth,
          },
          {
            key: 'amount',
            header: t('missing.columns.amount'),
            render: row =>
              !canReadFinance ? null : row.invoicedAmountCents === null ? (
                <UnknownValue reason={t('missing.noAmount')} />
              ) : (
                formatCents(row.invoicedAmountCents)
              ),
          },
          {
            key: 'dueOn',
            header: t('missing.columns.dueOn'),
            render: row => formatDate(row.dueOn) ?? <UnknownValue reason={t('missing.noDueDate')} />,
          },
          {
            key: 'actions',
            header: t('missing.columns.actions'),
            render: row =>
              // Sans contrat en cours, le geste n'aurait aucune cible : le
              // serveur le refuserait, et un bouton qui échoue au clic est pire
              // qu'un bouton absent.
              canPrepare ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => onPrepare(row)}>
                  {t('missing.prepare')}
                </Button>
              ) : null,
          },
        ]}
      />
    </Box>
  )
}

function PrepareForm({
  row,
  contracts,
  pending,
  onCancel,
  onConfirm,
}: {
  row: MissingRow
  contracts: readonly FactoringContract[]
  pending: boolean
  onCancel: () => void
  onConfirm: (input: { contractId: string; missionId: string; month: string; assignedAmountCents?: number }) => void
}) {
  const { t } = useTranslation('factoring')
  const [contractId, setContractId] = useState(contracts[0]?.id ?? '')
  // Le montant facturé est PRÉ-REMPLI parce que c'est ce qu'on cède neuf fois
  // sur dix — et il reste modifiable, parce qu'une cession partielle existe.
  const [amount, setAmount] = useState(
    row.invoicedAmountCents === null ? '' : String(Math.round(row.invoicedAmountCents / 100)),
  )
  const chosen = contracts.find(contract => contract.id === contractId)
  const amountCents = parseAmountCents(amount)

  return (
    <Box className="rounded-md border border-border p-3">
      <Text size="sm" weight="medium" className="block">
        {t('missing.prepareTitle', { month: formatMonth(row.periodMonth.slice(0, 7)) ?? row.periodMonth })}
      </Text>
      <Text element="p" size="xs" color="text-muted-foreground" className="mt-0.5">
        {t('missing.prepareHint')}
      </Text>

      <Text element="p" size="xs" color="text-muted-foreground" className="mt-2">
        {t('missing.chooseContract')}
      </Text>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="ghost" aria-label={t('missing.chooseContract')}>
            {chosen?.factorName ?? t('contracts.empty')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>{t('missing.chooseContract')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {contracts.map(contract => (
            <DropdownMenuItem key={contract.id} onSelect={() => setContractId(contract.id)}>
              {contract.factorName}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Box className="mt-2 max-w-xs">
        <LabelledInput
          label={`${t('missing.amountLabel')} (${t('contracts.limitUnit')})`}
          placeholder={t('contracts.limitPlaceholder')}
          value={amount}
          onChange={setAmount}
        />
      </Box>
      <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
        {t('missing.amountHint')}
      </Text>

      <Box display="flex" className="mt-2 gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending || contractId.length === 0}
          onClick={() =>
            onConfirm({
              contractId,
              missionId: row.missionId,
              month: row.periodMonth.slice(0, 7),
              // Vide = non saisi. La ligne le DIRA, plutôt que d'afficher 0 €.
              ...(amountCents === null ? {} : { assignedAmountCents: amountCents }),
            })
          }
        >
          {t('missing.prepareConfirm')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t('missing.prepareAbort')}
        </Button>
      </Box>
    </Box>
  )
}

/**
 * Le MOTIF d'un refus ou d'une reprise — obligatoire ici, dans le contrat zod
 * et dans la contrainte SQL. Trois portes pour la même règle, parce que « le
 * factor a refusé » sans rien d'autre ne se relit pas six mois plus tard.
 */
function CloseForm({
  status,
  pending,
  onCancel,
  onConfirm,
}: {
  status: 'rejected' | 'recalled'
  pending: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const { t } = useTranslation('factoring')
  const [reason, setReason] = useState('')
  return (
    <Box className="rounded-md border border-border p-3">
      <Text size="sm" weight="medium" className="block">
        {t('assignments.closeTitle')}
      </Text>
      <Text element="p" size="xs" color="text-muted-foreground" className="mt-0.5">
        {t('assignments.closeHint')}
      </Text>
      <Input
        className="mt-2"
        value={reason}
        placeholder={t('assignments.closePlaceholder')}
        aria-label={t(`assignments.${status === 'rejected' ? 'reject' : 'recall'}`)}
        onChange={event => setReason(event.target.value)}
      />
      <Box display="flex" className="mt-2 gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending || reason.trim().length === 0}
          onClick={() => onConfirm(reason.trim())}
        >
          {t('assignments.closeConfirm')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t('assignments.closeAbort')}
        </Button>
      </Box>
    </Box>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Les règlements à rapprocher                                               */
/* ══════════════════════════════════════════════════════════════════════════ */

function SettlementsToMatch({
  rows,
  candidates,
  pending,
  onReconcile,
}: {
  rows: readonly FactoringSettlement[]
  candidates: readonly ReceivableAssignment[]
  pending: boolean
  onReconcile: (settlementId: string, assignmentId: string) => void
}) {
  const { t } = useTranslation('factoring')
  return (
    <Box className="space-y-2">
      <Text element="h2" size="sm" weight="medium">
        {t('settlements.title')}
      </Text>
      <Text element="p" size="xs" color="text-muted-foreground">
        {t('settlements.hint')}
      </Text>
      <ResponsiveTable
        rows={rows}
        rowKey={row => row.id}
        scrollLabel={t('settlements.title')}
        empty={
          <Box className="rounded-md border border-dashed border-border p-4">
            <Text size="sm" color="text-muted-foreground">
              {t('settlements.empty')}
            </Text>
          </Box>
        }
        columns={[
          {
            key: 'receivedOn',
            header: t('settlements.columns.receivedOn'),
            mobile: 'title',
            render: row => formatDate(row.receivedOn) ?? row.receivedOn,
          },
          {
            key: 'amount',
            header: t('settlements.columns.amount'),
            // `amountCents` n'est jamais `null` : on consigne un règlement
            // parce qu'on a vu un montant. Il peut être NÉGATIF — une créance
            // reprise fait repartir de l'argent.
            render: row => formatCents(row.amountCents),
          },
          {
            key: 'reference',
            header: t('settlements.columns.reference'),
            mobile: 'meta',
            render: row => row.reference ?? <UnknownValue reason={t('settlements.noReference')} />,
          },
          {
            key: 'actions',
            header: t('settlements.columns.actions'),
            render: row =>
              candidates.length === 0 ? (
                <Text size="xs" color="text-muted-foreground">
                  {t('settlements.noCandidate')}
                </Text>
              ) : (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={t('settlements.reconcileMenu')}
                      disabled={pending}
                    >
                      {t('settlements.reconcile')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>{t('settlements.reconcileMenu')}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {candidates.map(candidate => (
                      <DropdownMenuItem key={candidate.id} onSelect={() => onReconcile(row.id, candidate.id)}>
                        {candidate.accountName ?? candidate.missionLabel ?? candidate.periodMonth}
                        {' · '}
                        {formatMonth(candidate.periodMonth.slice(0, 7)) ?? candidate.periodMonth}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
          },
        ]}
      />
    </Box>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Les conversions de saisie                                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Un taux en points de base → un pourcentage lisible.
 *
 * ⚠️ La division vit ICI et nulle part ailleurs : trois écrans qui écriraient
 * `bps / 100` finiraient par en écrire un `bps / 10000`.
 *
 * ⚠️ La locale est celle de l'APPLICATION (`appLocale`), jamais celle du
 * moteur : « 2,5 % » et « 2.5 % » ne se lisent pas dans la même langue, et un
 * navigateur en anglais sur une application en français rendrait le second.
 */
function formatRate(bps: number): string {
  return `${new Intl.NumberFormat(appLocale(), { maximumFractionDigits: 2 }).format(bps / 100)} %`
}

/**
 * Une saisie en pourcentage → des points de base. `null` sur une saisie VIDE ou
 * illisible : le champ ne part alors pas du tout, plutôt que de partir à zéro.
 */
function parseRateBps(value: string): number | null {
  const cleaned = value.trim().replace(',', '.')
  if (cleaned.length === 0) return null
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null
  return Math.round(parsed * 100)
}

/** Une saisie en euros → des centimes. `null` sur une saisie vide ou illisible. */
function parseAmountCents(value: string): number | null {
  const cleaned = value.trim().replace(/\s/g, '').replace(',', '.')
  if (cleaned.length === 0) return null
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100)
}
