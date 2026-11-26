import {
  nextOutgoingPaymentAction,
  outgoingPaymentBucket,
  OUTGOING_PAYMENT_REASON_MAX,
  OUTGOING_PAYMENT_STATUSES,
  paymentOverdueDays,
  receivableKey,
  type OutgoingPayment,
  type OutgoingPaymentAction,
  type OutgoingPaymentBucket,
  type OutgoingPaymentStatus,
  type OutgoingPaymentTotals,
  type ReceivableAssignment,
} from '@bellum/contracts'
import {
  Avatar,
  AvatarFallback,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@bellum/ui'
import { Download, MoreHorizontal, Send } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { downloadCSV } from '@/lib/export-csv'
import { type DataExitGrant, useDataExit, workspaceRuleRefusalText } from '@/lib/data-exit'
import { CustomerPage } from '@/components/page/CustomerPage'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { useFactoringView } from '../../factoring/api'
import {
  outgoingPaymentsApi,
  useGeneratePayment,
  useOutgoingPayments,
  useRejectPayment,
  useRemindPayments,
  useSettlePayment,
  useValidatePayment,
} from '../api'
import { usePaymentColumns } from '../usePaymentColumns'
import { PaymentColumnsPicker } from './PaymentColumnsPicker'

/**
 * GESTION DES PAIEMENTS — la moitié « l'argent est-il SORTI ? ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN ÉCRAN À PART, ET PAS UNE COLONNE DE PLUS SUR LES ENCAISSEMENTS
 * ─────────────────────────────────────────────────────────────────────────────
 * `/missions/encaissements` suit l'argent qui RENTRE du client. Celui-ci suit
 * l'argent qui SORT vers le consultant. **Les deux ne montrent pas la même
 * population et ne partagent aucune colonne** — l'un a une échéance de
 * règlement et un litige client, l'autre une validation de relevé et une
 * facture de sous-traitant. Le dépôt écrit déjà pourquoi ils ne se mélangent
 * pas ; ce lot ajoute le MIROIR, jamais le remplacement.
 *
 * Ce qui EST repris de lui, à dessein, parce que deux écrans jumeaux qui
 * répondraient différemment feraient douter des deux : les seaux, le retard en
 * jours, l'action par ligne, le menu « … », et la règle qu'aucun montant absent
 * ne s'affiche « 0 ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN NE FAIT PAS, ET POURQUOI IL NE LE FERA PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  - **aucun ordre de virement, aucune coordonnée bancaire.** Bellum ne signe
 *    rien, ne paie rien et ne stocke aucun IBAN — le refus est écrit trois fois
 *    dans le dépôt, et ce lot ne le lève pas. « Marquer payé » CONSTATE ce
 *    qu'un humain a fait dans sa banque ;
 *  - **aucun envoi.** « Relancer les paiements » CONSIGNE. Un mécanisme d'envoi
 *    gouverné existe ailleurs, et ce lot n'en écrit pas un second ;
 *  - **aucun delta inventé.** La maquette affiche « +12 % vs mois dernier » ;
 *    rien dans le dépôt ne porte aujourd'hui de photo mensuelle, donc la tuile
 *    dit « non mesuré » et NOMME pourquoi. « +0 % » serait un chiffre faux, et
 *    le plus rassurant des trois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA COLONNE CESSION (31/08/2026) — BRANCHÉE sur le domaine affacturage
 * ─────────────────────────────────────────────────────────────────────────────
 * `OutgoingPayment` ne porte AUCUN champ de cession — cet écran ne sème rien
 * dans `receivable_assignments` et n'appelle aucune route d'écriture du
 * domaine affacturage. Il LIT `useFactoringView()` (`features/factoring`, déjà
 * ouverte sans `finance:read` depuis ce même lot) et rapproche chaque ligne par
 * la clé mission × mois — `receivableKey`, la MÊME fonction que le domaine
 * cession utilise pour rapprocher une créance facturée d'une cession, jamais
 * une seconde recopiée à la main.
 *
 * ⚠️ Le statut du réglage n'est PAS redemandé au serveur des paiements : deux
 * chemins qui répondraient chacun à « cette cession a-t-elle été transmise ? »
 * finiraient par diverger. C'est le domaine affacturage qui tient ce fait, et
 * cet écran ne fait que le LIRE à côté du sien.
 */
// Théo C missions-encaissements.A4 — `embedded` : l'écran est FONDU dans Encaissements
// (section « Ce qui sort »), sans sa propre coque de page.
export function PaymentsPage({ now, embedded = false }: { now?: Date; embedded?: boolean } = {}) {
  const { t, i18n } = useTranslation('payments')
  // #2081.14 — l'export CSV est une SORTIE de données : masqué quand la règle
  // d'espace « qui peut exporter » le réserve aux administrateurs (décidé par
  // l'API, qui refuse aussi la route elle-même).
  const dataExit = useDataExit()
  const reference = useMemo(() => now ?? new Date(), [now])

  const [month, setMonth] = useState(() => previousMonth(reference))
  const [status, setStatus] = useState<OutgoingPaymentStatus | 'all'>('all')
  const [accountId, setAccountId] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [rejecting, setRejecting] = useState<OutgoingPayment | null>(null)

  const filters = useMemo(
    () => ({
      month,
      ...(status === 'all' ? {} : { status }),
      ...(accountId === 'all' ? {} : { accountId }),
      ...(search.trim() ? { search: search.trim() } : {}),
    }),
    [month, status, accountId, search],
  )

  const { page, canReadFinance, isLoading } = useOutgoingPayments(filters)
  const columns = usePaymentColumns()

  /**
   * Les cessions, indexées par la même clé que celle qui rapproche une
   * créance facturée d'une cession dans le domaine affacturage.
   *
   * ⚠️ Une requête qui échoue (droit manquant, panne) laisse la carte VIDE —
   * jamais une erreur qui casserait tout l'écran des paiements pour une
   * colonne annexe. La cellule se lit alors « cession manquante », ce qui
   * reste le rendu le plus honnête tant qu'on n'a pas la réponse.
   *
   * Une seule cession retenue par clé : la PREMIÈRE rencontrée, et
   * `assignments` arrive déjà triée `period_month DESC, created_at DESC` côté
   * service — c'est donc la plus RÉCENTE des cessions concurrentes sur le même
   * mois (un refus suivi d'une reprise, par exemple).
   */
  const { data: factoring } = useFactoringView()
  const cessionByPayment = useMemo(() => {
    const map = new Map<string, ReceivableAssignment>()
    for (const assignment of factoring?.assignments ?? []) {
      const key = receivableKey(assignment)
      if (!map.has(key)) map.set(key, assignment)
    }
    return map
  }, [factoring])

  const generate = useGeneratePayment()
  const validate = useValidatePayment()
  const settle = useSettlePayment()
  const reject = useRejectPayment()
  const remind = useRemindPayments()
  const pending = generate.isPending || validate.isPending || settle.isPending || reject.isPending || remind.isPending

  const rows = useMemo(() => sortByUrgency(page?.items ?? [], reference), [page, reference])
  /**
   * Le résumé, ou RIEN.
   *
   * ⚠️ Jamais `page?.summary.rejected ?? 0` : avant que la réponse n'arrive, on
   * ne sait pas s'il y a des paiements refusés — et « 0 refusé » est alors une
   * affirmation qu'on n'a pas les moyens de faire. C'est le zéro de chargement,
   * et il est d'autant plus trompeur qu'il rassure (GA-19).
   */
  const summary = page?.summary ?? null

  /**
   * Les clients du filtre, tirés des lignes du mois — jamais d'un second appel.
   *
   * Un filtre qui proposerait des comptes absents de la liste ferait cliquer
   * vers un écran vide, et « aucun résultat » se lirait « panne ».
   */
  const accounts = useMemo(() => {
    const seen = new Map<string, string>()
    for (const item of page?.items ?? []) {
      if (item.accountId && item.accountName) seen.set(item.accountId, item.accountName)
    }
    return [...seen.entries()].sort((left, right) => left[1].localeCompare(right[1]))
  }, [page])

  /** Ce que « Relancer les paiements » va toucher : les lignes EN RETARD qu'on
   *  a sous les yeux, et elles seules. Un lot qui traverserait tout l'espace ne
   *  serait plus un geste — ce serait une routine, et elle passerait par une
   *  porte avec sa prévisualisation figée. */
  const remindable = useMemo(
    () =>
      rows
        .filter(row => row.id !== null && outgoingPaymentBucket(row, reference) === 'overdue')
        .map(row => row.id as string),
    [rows, reference],
  )

  const Shell = embedded ? Fragment : CustomerPage
  const shellProps = embedded ? {} : { pageTitle: t('title') }

  return (
    <Shell {...shellProps}>
      <Box className="space-y-4 py-4">
        <Box className="rounded-md border border-border bg-card/50 p-3">
          <Text size="sm" color="text-muted-foreground">
            {t('banner')}
          </Text>
        </Box>

        <Box display="flex" className="flex-wrap items-center gap-2">
          <Input
            type="month"
            value={month}
            onChange={event => setMonth(event.target.value)}
            aria-label={t('month')}
            className="w-auto"
          />
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={t('search')}
            aria-label={t('search')}
            className="min-w-0 flex-1 sm:max-w-xs"
          />
          <Select value={status} onValueChange={value => setStatus(value as OutgoingPaymentStatus | 'all')}>
            <SelectTrigger className="w-auto min-w-40" aria-label={t('columns.status')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allStatuses')}</SelectItem>
              {OUTGOING_PAYMENT_STATUSES.map(value => (
                <SelectItem key={value} value={value}>
                  {t(`status.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-auto min-w-40" aria-label={t('columns.account')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allClients')}</SelectItem>
              {accounts.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PaymentColumnsPicker visible={columns.visible} onToggle={columns.toggle} onReset={columns.reset} />
          {dataExit.grant ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => dataExit.grant && void downloadCsv(filters, month, t, dataExit.grant)}
            >
              <Download className="mr-2 size-4" aria-hidden="true" />
              {t('export')}
            </Button>
          ) : null}
          <Button
            size="sm"
            disabled={pending || remindable.length === 0}
            title={remindable.length === 0 ? t('remindNothing') : t('remindAllHint')}
            onClick={() => remind.mutate(remindable)}
          >
            <Send className="mr-2 size-4" aria-hidden="true" />
            {t('remindAll')}
          </Button>
        </Box>

        {isLoading ? (
          // ⚠️ Aucun chiffre pendant le chargement. « 0 € en retard » le temps
          // d'une requête fait refermer l'onglet avant que la vérité n'arrive —
          // c'est le zéro de chargement, et il ment.
          <Text size="sm" color="text-muted-foreground">
            {t('common:states.loading')}
          </Text>
        ) : (
          <>
            {!canReadFinance ? (
              // Le NOMBRE de paiements n'est pas une donnée financière : un
              // gestionnaire doit pouvoir aller chercher ce qui bloque. Le
              // MONTANT en est une — et « 0 € » à sa place se lirait « rien à
              // payer ». La phrase est dite UNE fois, jamais par ligne.
              <Text element="p" size="xs" color="text-muted-foreground">
                {t('financeHidden')}
              </Text>
            ) : null}

            <Box className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(['paid', 'pending', 'overdue', 'toValidate'] as const).map(bucket => (
                <BucketTile
                  key={bucket}
                  label={t(`buckets.${bucket}`)}
                  totals={summary?.[bucket] ?? EMPTY_TOTALS}
                  canReadFinance={canReadFinance}
                  locale={i18n.language}
                  note={
                    bucket === 'toValidate' && summary !== null && summary.withoutScheduledDate > 0
                      ? t('withoutScheduledDate', { count: summary.withoutScheduledDate })
                      : null
                  }
                />
              ))}
            </Box>

            {/* ⚠️ LE DELTA QUE LA MAQUETTE PORTE, ET QU'ON N'INVENTE PAS.
                « +12 % vs mois dernier » n'a AUCUNE source aujourd'hui : rien
                dans le dépôt ne prend de photo mensuelle des paiements. La
                phrase est dite UNE fois sous les quatre tuiles plutôt que
                répétée dans chacune — quatre « non mesuré » côte à côte
                deviennent du décor, et on cesse de les lire. « +0 % » serait
                un chiffre faux, et le plus rassurant des trois. */}
            <Box display="flex" className="flex-wrap items-baseline gap-1">
              <Text element="span" size="xs" color="text-muted-foreground">
                {t('noDelta')}
              </Text>
              <UnknownValue reason={t('noDeltaReason')} />
            </Box>

            {summary !== null && summary.rejected > 0 ? (
              // Les refusés n'entrent dans AUCUNE tuile : ils ne sont ni sortis,
              // ni en attente de sortir. Les compter en attente promettrait un
              // décaissement que quelqu'un vient explicitement de refuser.
              <Text element="p" size="xs" color="text-muted-foreground">
                {t('rejectedCount', { count: summary.rejected })}
              </Text>
            ) : null}

            <ResponsiveTable
              rows={rows}
              rowKey={row => row.id ?? `${row.missionId}-${row.consultantId ?? 'none'}-${row.periodMonth}`}
              scrollLabel={t('title')}
              empty={
                <Box className="rounded-md border border-dashed border-border p-4">
                  <Text size="sm" color="text-muted-foreground">
                    {isFiltered(filters) ? t('emptyFiltered') : t('empty')}
                  </Text>
                  <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
                    {isFiltered(filters) ? t('emptyFilteredWhy') : t('emptyWhy')}
                  </Text>
                </Box>
              }
              columns={[
                ...(columns.isVisible('consultant')
                  ? [
                      {
                        key: 'consultant',
                        header: t('columns.consultant'),
                        mobile: 'title' as const,
                        render: (row: OutgoingPayment) => <ConsultantCell row={row} />,
                      },
                    ]
                  : []),
                ...(columns.isVisible('month')
                  ? [
                      {
                        key: 'month',
                        header: t('columns.month'),
                        mobile: 'meta' as const,
                        render: (row: OutgoingPayment) => formatMonth(row.periodMonth, i18n.language),
                      },
                    ]
                  : []),
                ...(columns.isVisible('validation')
                  ? [
                      {
                        key: 'validation',
                        header: t('columns.validation'),
                        render: (row: OutgoingPayment) => <ValidationCell row={row} locale={i18n.language} />,
                      },
                    ]
                  : []),
                ...(columns.isVisible('account')
                  ? [
                      {
                        key: 'account',
                        header: t('columns.account'),
                        mobile: 'meta' as const,
                        render: (row: OutgoingPayment) =>
                          row.accountName ?? <UnknownValue reason={t('unknownAccount')} />,
                      },
                    ]
                  : []),
                ...(columns.isVisible('mission')
                  ? [
                      {
                        key: 'mission',
                        header: t('columns.mission'),
                        mobile: 'meta' as const,
                        render: (row: OutgoingPayment) =>
                          row.missionLabel ? (
                            <ObjectMention kind="mission" id={row.missionId} name={row.missionLabel} />
                          ) : (
                            <UnknownValue reason={t('unknownAccount')} />
                          ),
                      },
                    ]
                  : []),
                /* La colonne CESSION, comme sur la maquette : entre le client
                   et le montant dû. Elle est BRANCHÉE sur le domaine
                   affacturage (`features/factoring`), joint par mission × mois
                   — la même clé que `receivableKey`. */
                ...(columns.isVisible('cession')
                  ? [
                      {
                        key: 'cession',
                        header: t('columns.cession'),
                        render: (row: OutgoingPayment) => (
                          <CessionCell assignment={cessionByPayment.get(receivableKey(row))} locale={i18n.language} />
                        ),
                      },
                    ]
                  : []),
                ...(columns.isVisible('payable')
                  ? [
                      {
                        key: 'payable',
                        header: t('columns.payable'),
                        render: (row: OutgoingPayment) => (
                          <AmountCell row={row} canReadFinance={canReadFinance} locale={i18n.language} />
                        ),
                      },
                    ]
                  : []),
                ...(columns.isVisible('scheduledOn')
                  ? [
                      {
                        key: 'scheduledOn',
                        header: t('columns.scheduledOn'),
                        render: (row: OutgoingPayment) =>
                          row.scheduledOn ? (
                            formatDay(row.scheduledOn, i18n.language)
                          ) : (
                            // ⚠️ Réparable en une saisie, et le taire ferait
                            // passer le paiement pour « sous contrôle ».
                            <UnknownValue reason={t('noScheduledDate')} />
                          ),
                      },
                    ]
                  : []),
                ...(columns.isVisible('status')
                  ? [
                      {
                        key: 'status',
                        header: t('columns.status'),
                        render: (row: OutgoingPayment) => <StatusBadge row={row} now={reference} />,
                      },
                    ]
                  : []),
                ...(columns.isVisible('overdue')
                  ? [
                      {
                        key: 'overdue',
                        header: t('columns.overdue'),
                        render: (row: OutgoingPayment) => <OverdueCell row={row} now={reference} />,
                      },
                    ]
                  : []),
                ...(columns.isVisible('nextAction')
                  ? [
                      {
                        key: 'nextAction',
                        header: t('columns.nextAction'),
                        render: (row: OutgoingPayment) => (
                          <NextActionCell
                            row={row}
                            now={reference}
                            pending={pending}
                            onGenerate={() =>
                              generate.mutate({
                                missionId: row.missionId,
                                consultantId: row.consultantId,
                                month: row.periodMonth.slice(0, 7),
                              })
                            }
                            onValidate={() => row.id && validate.mutate({ paymentId: row.id })}
                            onRemind={() => row.id && remind.mutate([row.id])}
                          />
                        ),
                      },
                    ]
                  : []),
                ...(columns.isVisible('reminders')
                  ? [
                      {
                        key: 'reminders',
                        header: t('columns.reminders'),
                        // `0` est ici une VRAIE valeur : aucune relance consignée.
                        render: (row: OutgoingPayment) => row.remindersSent,
                      },
                    ]
                  : []),
                {
                  key: 'actions',
                  header: t('rowMenu'),
                  render: (row: OutgoingPayment) => (
                    <RowMenu
                      row={row}
                      pending={pending}
                      onSettle={() => row.id && settle.mutate({ paymentId: row.id })}
                      onReject={() => setRejecting(row)}
                      onRemind={() => row.id && remind.mutate([row.id])}
                    />
                  ),
                },
              ]}
            />

            {rows.length > 0 ? (
              // La phrase qui tient la doctrine, à la fin de la file : rien ne
              // part d'ici, ni un virement, ni une relance.
              <Text element="p" size="xs" color="text-muted-foreground">
                {t('nothingIsSent')}
              </Text>
            ) : null}
          </>
        )}

        {rejecting ? (
          <RejectDialog
            pending={reject.isPending}
            onCancel={() => setRejecting(null)}
            onConfirm={reason => {
              if (rejecting.id) reject.mutate({ paymentId: rejecting.id, reason })
              setRejecting(null)
            }}
          />
        ) : null}
      </Box>
    </Shell>
  )
}

/** Un seau vide, le temps que la réponse arrive. Il n'affiche AUCUN montant :
 *  c'est `count: 0` qui est vrai, et le montant reste `null`. */
const EMPTY_TOTALS: OutgoingPaymentTotals = { count: 0, totalAmountCents: null, withoutAmount: 0 }

/** Un filtre est-il posé ? Un vide FILTRÉ n'est pas un mois vide, et les deux
 *  ne se réparent pas de la même façon (GA-106). */
function isFiltered(filters: { status?: string; accountId?: string; search?: string }): boolean {
  return Boolean(filters.status || filters.accountId || filters.search)
}

/**
 * L'ordre de la file : ce qui appelle un geste d'abord.
 *
 * Les retards en tête, du plus ancien au plus récent — c'est le consultant qui
 * attend le plus longtemps. Puis ce qui reste à valider, puis ce qui n'est pas
 * encore dû, puis ce qui est sorti, puis les refusés. Trier par mois mettrait en
 * haut la ligne qui vient d'être créée, c'est-à-dire la seule sur laquelle il
 * n'y a rien à faire.
 */
function sortByUrgency(items: readonly OutgoingPayment[], now: Date): OutgoingPayment[] {
  const rank: Record<OutgoingPaymentBucket | 'rejected', number> = {
    overdue: 0,
    toValidate: 1,
    pending: 2,
    paid: 3,
    rejected: 4,
  }
  return [...items].sort((left, right) => {
    const byBucket =
      rank[outgoingPaymentBucket(left, now) ?? 'rejected'] - rank[outgoingPaymentBucket(right, now) ?? 'rejected']
    if (byBucket !== 0) return byBucket
    return (
      (paymentOverdueDays(right.scheduledOn, now) ?? Number.NEGATIVE_INFINITY) -
      (paymentOverdueDays(left.scheduledOn, now) ?? Number.NEGATIVE_INFINITY)
    )
  })
}

/**
 * LE STATUT AFFICHÉ — le SEAU, jamais l'état brut.
 *
 * ⚠️ Ce n'est pas une commodité : `valide` veut dire « quelqu'un a assumé ce
 * paiement », et sur une ligne dont la date prévue est passée de trente-six
 * jours, l'afficher « En attente » est FAUX — c'est même le mensonge qui compte,
 * puisque c'est cette colonne qu'on balaie pour trouver ce qui traîne. La
 * maquette dit la même chose : sa colonne STATUT PAIEMENT porte « Payé »,
 * « En attente », « En retard » et « En attente validation », qui sont les
 * quatre seaux — pas les cinq états du cycle.
 *
 * L'état brut n'est pas perdu pour autant : `non_genere` et `a_valider` sont
 * deux façons distinctes de n'être pas assumé, et c'est la colonne « Action
 * suivante » qui les sépare — « Préparer le paiement » contre « Vérifier le
 * paiement » (#2408.78 : le verbe de l'issue, même geste de validation).
 */
type DisplayStatus = OutgoingPaymentBucket | 'rejected'

function displayStatus(row: OutgoingPayment, now: Date): DisplayStatus {
  return outgoingPaymentBucket(row, now) ?? 'rejected'
}

/** La couleur passe par une VARIANTE de badge : une classe de la palette
 *  Tailwind ne suivrait pas le thème, et aucune nuance fixe ne passe AA des
 *  deux côtés. */
const STATUS_VARIANT: Readonly<Record<DisplayStatus, 'success' | 'secondary' | 'warning' | 'danger'>> = {
  paid: 'success',
  pending: 'secondary',
  overdue: 'warning',
  toValidate: 'secondary',
  rejected: 'danger',
}

function StatusBadge({ row, now }: { row: OutgoingPayment; now: Date }) {
  const { t } = useTranslation('payments')
  const status = displayStatus(row, now)
  return <Badge variant={STATUS_VARIANT[status]}>{t(`displayStatus.${status}`)}</Badge>
}

/**
 * Un compteur : un nombre, et un montant QUAND il est lisible.
 *
 * ⚠️ Trois absences distinctes, trois rendus distincts — les replier l'une sur
 * l'autre est exactement ce qui produit « 0 € » partout :
 *  - le seau est VIDE : le nombre suffit ;
 *  - le lecteur n'a pas le droit : la phrase le dit une fois, en entête ;
 *  - le seau a des lignes mais aucun montant chiffré : « non mesuré », nommé.
 *
 * ⚠️ **Aucun delta.** La maquette porte « +12 % vs mois dernier » ; rien dans le
 * dépôt ne prend aujourd'hui de photo mensuelle, donc la tuile NOMME l'absence.
 * « +0 % » serait un chiffre faux, et le plus rassurant des trois.
 */
function BucketTile({
  label,
  totals,
  canReadFinance,
  locale,
  note,
}: {
  label: string
  totals: OutgoingPaymentTotals
  canReadFinance: boolean
  locale: string
  note: string | null
}) {
  const { t } = useTranslation('payments')
  return (
    <Box className="min-w-0 rounded-md border border-border bg-card p-3">
      <Text element="p" size="xs" color="text-muted-foreground">
        {label}
      </Text>
      {canReadFinance && totals.count > 0 ? (
        totals.totalAmountCents === null ? (
          <UnknownValue reason={t('noAmount')} />
        ) : (
          <Text element="p" size="lg" weight="medium">
            {formatEuros(totals.totalAmountCents, locale)}
          </Text>
        )
      ) : null}
      <Text element="p" size="xs" color="text-muted-foreground">
        {t('paymentCount', { count: totals.count })}
        {canReadFinance && totals.withoutAmount > 0 ? ` · ${t('withoutAmount', { count: totals.withoutAmount })}` : ''}
      </Text>
      {note ? (
        <Text element="p" size="xs" color="text-[var(--warning-soft-text)]">
          {note}
        </Text>
      ) : null}
    </Box>
  )
}

/**
 * Le consultant, avec son avatar et son métier.
 *
 * ⚠️ L'avatar est une INITIALE, jamais une photo : une photo est un critère
 * protégé, et si elle a le droit de s'afficher sur une fiche, elle n'a rien à
 * faire dans une file où l'on décide qui est payé en premier.
 */
function ConsultantCell({ row }: { row: OutgoingPayment }) {
  const { t } = useTranslation('payments')
  if (!row.consultantName) return <UnknownValue reason={t('unknownConsultant')} />
  return (
    <Box display="flex" className="min-w-0 items-center gap-2">
      <Avatar className="size-8 shrink-0">
        <AvatarFallback>{initials(row.consultantName)}</AvatarFallback>
      </Avatar>
      <Box className="min-w-0">
        <Text element="p" size="sm" weight="medium">
          {row.consultantName}
        </Text>
        {row.consultantTitle ? (
          <Text element="p" size="xs" color="text-muted-foreground">
            {row.consultantTitle}
          </Text>
        ) : null}
      </Box>
    </Box>
  )
}

/**
 * La VALIDATION du relevé — la colonne qui autorise le paiement.
 *
 * C'est la jointure que l'écran des encaissements dit ne pas avoir. Ici elle
 * existe : quand elle manque, la cellule le NOMME plutôt que d'afficher un
 * vide qu'on prendrait pour « rien à signaler ».
 */
function ValidationCell({ row, locale }: { row: OutgoingPayment; locale: string }) {
  const { t } = useTranslation('payments')
  if (!row.timesheetValidatedAt) return <UnknownValue reason={t('noValidation')} />
  return (
    <Box className="min-w-0">
      <Badge variant="success">{t('status.paye')}</Badge>
      <Text element="p" size="xs" color="text-muted-foreground">
        {formatDay(row.timesheetValidatedAt, locale)}
      </Text>
    </Box>
  )
}

/**
 * LA CESSION — ce que le domaine affacturage sait de ce mois pour ce CLIENT
 * (pas ce consultant : une cession porte sur la créance entière de la
 * mission, pas sur un paiement individuel).
 *
 * ⚠️ Une cession `assigned` ou `settled` a été TRANSMISE au factor — c'est
 * l'ENCOURS cédé de la maquette, « Cession reçue ». `prepared` est un état
 * intermédiaire que la maquette ne montre pas mais que ce dépôt ne tait pas
 * pour autant : un dossier PRÊT n'est pas encore parti. `rejected`/`recalled`
 * sont des FAITS, pas une absence — les confondre avec « manquante »
 * effacerait qu'un geste a eu lieu.
 */
function CessionCell({ assignment, locale }: { assignment: ReceivableAssignment | undefined; locale: string }) {
  const { t } = useTranslation('payments')
  if (!assignment) return <UnknownValue reason={t('cession.missingReason')} />
  if (assignment.status === 'prepared') return <Badge variant="secondary">{t('cession.prepared')}</Badge>
  if (assignment.status === 'assigned' || assignment.status === 'settled') {
    const date = assignment.assignedOn ?? assignment.settledOn
    return (
      <Box className="min-w-0">
        <Badge variant="success">{t('cession.received')}</Badge>
        {date ? (
          <Text element="p" size="xs" color="text-muted-foreground">
            {formatDay(date, locale)}
          </Text>
        ) : null}
      </Box>
    )
  }
  // `rejected` ou `recalled` : le factor a rendu la créance. Un fait, pas une
  // absence — la ligne le NOMME plutôt que de retomber sur « manquante ».
  return <Badge variant="danger">{t(`cession.${assignment.status}`)}</Badge>
}

/**
 * Le montant DÛ — et ce qui est réellement SORTI quand les deux diffèrent.
 *
 * Dû et sorti sont deux montants distincts, et leur écart EST l'information :
 * un acompte, une retenue, une erreur de saisie laissent exactement cette trace.
 */
function AmountCell({
  row,
  canReadFinance,
  locale,
}: {
  row: OutgoingPayment
  canReadFinance: boolean
  locale: string
}) {
  const { t } = useTranslation('payments')
  // Le serveur vide déjà les montants sans `finance:read` ; cette condition est
  // le dernier rempart si une réponse plus ancienne que ce code arrive encore
  // chiffrée. La cellule reste VIDE plutôt que de répéter la phrase d'entête sur
  // chaque ligne : vingt copies de la même explication n'informent personne.
  if (!canReadFinance) return null
  if (row.payableAmountCents === null) return <UnknownValue reason={t('noAmount')} />
  const settled = row.settledAmountCents
  return (
    <Box className="min-w-0">
      <Text element="span" size="sm">
        {formatEuros(row.payableAmountCents, locale)}
      </Text>
      {settled !== null && settled !== row.payableAmountCents ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('settledPart', { value: formatEuros(settled, locale) })}
        </Text>
      ) : null}
    </Box>
  )
}

/**
 * L'échéance, en jours de retard.
 *
 * ⚠️ Rien n'est affiché sur un paiement sorti ou pas encore dû : « 0 jour » se
 * lirait « il vient d'échoir ».
 *
 * ⚠️ Rien non plus sans date prévue — et ce n'est PAS un silence : la colonne
 * d'à côté nomme déjà la date manquante, et la prochaine action dit de la
 * saisir. Répéter la même phrase dans trois cellules de la même ligne est ce
 * qui fait qu'on ne la lit plus dans aucune.
 */
function OverdueCell({ row, now }: { row: OutgoingPayment; now: Date }) {
  const { t } = useTranslation('payments')
  if (row.paidOn || row.status === 'rejete') return null
  const days = paymentOverdueDays(row.scheduledOn, now)
  if (days === null || days <= 0) return null
  return <Badge variant={days >= 15 ? 'danger' : 'warning'}>{t('overdueDays', { count: days })}</Badge>
}

/**
 * Ce qu'un HUMAIN va faire ensuite — et un bouton quand le geste est ICI.
 *
 * ⚠️ Aucune de ces actions ne fait sortir un euro. « Relancer le paiement »
 * CONSIGNE ; « vérifier » assume une décision ; « préparer » matérialise l'objet.
 * Ce qui n'a pas de geste dans Bellum est une PHRASE, pas un bouton mort :
 * « attendre la validation du relevé » se fait sur l'écran des relevés, et
 * promettre un bouton qui ne ferait rien est pire qu'un texte.
 */
function NextActionCell({
  row,
  now,
  pending,
  onGenerate,
  onValidate,
  onRemind,
}: {
  row: OutgoingPayment
  now: Date
  pending: boolean
  onGenerate: () => void
  onValidate: () => void
  onRemind: () => void
}) {
  const { t } = useTranslation('payments')
  const action = nextOutgoingPaymentAction(row, now)
  if (action === null) return null

  /**
   * Les TROIS actions dont le geste vit sur cet écran. Les autres restent des
   * PHRASES : « attendre la validation du relevé » se fait sur l'écran des
   * relevés, « rattacher la facture » sur la fiche de la mission. Un bouton qui
   * ne ferait rien est pire qu'un texte qui dit où aller.
   */
  const gesture: Partial<Record<OutgoingPaymentAction['kind'], () => void>> = {
    generate_payment: onGenerate,
    validate_payment: onValidate,
    remind_payment: onRemind,
  }
  const run = gesture[action.kind]
  if (!run) return <Text size="sm">{t(`actions.${action.kind}`)}</Text>
  return (
    <Button variant="secondary" size="sm" disabled={pending} onClick={run}>
      {t(`actions.${action.kind}`)}
    </Button>
  )
}

/**
 * Les gestes de la ligne, dans un menu NOMMÉ.
 *
 * Un bouton qui ne montre qu'une icône porte un nom (GA-32) ; ce qui se clique
 * se tabule (GA-35) — `DropdownMenuTrigger` rend un vrai bouton.
 *
 * ⚠️ Sur un paiement qui n'a pas encore de ligne en base (`id === null`), le
 * menu ne propose RIEN : il n'y a pas d'objet à faire avancer, et l'action de
 * la ligne est justement de le préparer. Proposer « marquer payé » sur un
 * paiement non généré partirait pour revenir en 400.
 */
function RowMenu({
  row,
  pending,
  onSettle,
  onReject,
  onRemind,
}: {
  row: OutgoingPayment
  pending: boolean
  onSettle: () => void
  onReject: () => void
  onRemind: () => void
}) {
  const { t } = useTranslation('payments')
  if (row.id === null) return null
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('rowMenu')} disabled={pending}>
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('rowMenu')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {row.status !== 'paye' && row.status !== 'rejete' ? (
          <DropdownMenuItem onSelect={() => onSettle()}>{t('settle')}</DropdownMenuItem>
        ) : null}
        {row.status !== 'paye' && row.status !== 'rejete' ? (
          <DropdownMenuItem onSelect={() => onRemind()}>{t('actions.remind_payment')}</DropdownMenuItem>
        ) : null}
        {/* On ne refuse qu'une fois, et jamais un paiement déjà sorti : le
            refuser après coup ne le ferait pas revenir. */}
        {row.status !== 'paye' && row.status !== 'rejete' ? (
          <DropdownMenuItem onSelect={() => onReject()}>{t('reject')}</DropdownMenuItem>
        ) : null}
        {row.status === 'rejete' && row.rejectionReason ? (
          <DropdownMenuLabel>{t('rejectionReason', { reason: row.rejectionReason })}</DropdownMenuLabel>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * L'invite de REFUS — le motif est obligatoire, côté serveur comme ici.
 *
 * « Refusé » sans rien d'autre ne se relit pas six mois plus tard, quand le
 * consultant demandera pourquoi il a été payé avec deux mois de retard. Le champ
 * est borné comme le contrat le borne : un formulaire qui laisse taper ce que le
 * serveur rejette ment à celui qui l'écrit.
 */
function RejectDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const { t } = useTranslation('payments')
  const [reason, setReason] = useState('')
  return (
    <Box className="rounded-md border border-border p-3">
      <Text size="sm" weight="medium" className="block">
        {t('rejectTitle')}
      </Text>
      <Text element="p" size="xs" color="text-muted-foreground" className="mt-0.5">
        {t('rejectHint')}
      </Text>
      <Input
        className="mt-2"
        value={reason}
        maxLength={OUTGOING_PAYMENT_REASON_MAX}
        onChange={event => setReason(event.target.value)}
        placeholder={t('rejectPlaceholder')}
        aria-label={t('rejectTitle')}
      />
      <Box display="flex" className="mt-2 gap-2">
        <Button size="sm" disabled={pending || reason.trim().length === 0} onClick={() => onConfirm(reason.trim())}>
          {t('rejectConfirm')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('rejectAbort')}
        </Button>
      </Box>
    </Box>
  )
}

/**
 * L'export — il passe par l'API et son droit financier, jamais par les lignes
 * déjà chargées.
 *
 * Recomposer le CSV côté navigateur produirait un fichier construit sur des
 * montants DÉJÀ RÉDIGÉS : un lecteur sans `finance:read` téléchargerait un
 * fichier où toutes les colonnes de montant seraient vides, et il le lirait
 * comme un fichier complet. Le serveur, lui, REFUSE — ce qui dit la vérité.
 */
async function downloadCsv(
  filters: Record<string, string | undefined>,
  month: string,
  t: (key: string) => string,
  grant: DataExitGrant,
): Promise<void> {
  try {
    const csv = await outgoingPaymentsApi.exportCsv(filters)
    downloadCSV(csv, `paiements-${month}.csv`, grant)
  } catch (error) {
    // #2081.14 — un refus de la règle d'espace se DIT, jamais sous une erreur générique.
    toast.error(workspaceRuleRefusalText(error) ?? ((error as Error).message || t('toasts.exportFailed')))
  }
}

/** Les initiales d'un nom, deux au plus. Un avatar n'est pas une identité :
 *  il aide à retrouver une ligne, il ne classe personne. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Des centimes, en euros entiers et dans la langue du lecteur. Les centimes
 *  d'un paiement de quatorze mille euros n'aident personne à décider. */
function formatEuros(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
    Math.round(cents / 100),
  )
}

/** `YYYY-MM-DD` → le mois, dans la langue du lecteur. */
function formatMonth(periodMonth: string, locale: string): string {
  const date = new Date(`${periodMonth.slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime())
    ? periodMonth
    : date.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

/**
 * `YYYY-MM-DD` → date locale.
 *
 * Midi et non minuit : `new Date('2026-10-05')` est lu en UTC, et affiché dans
 * un fuseau en retard il rend le 4 octobre. Une date de paiement datée de la
 * veille fait douter du calcul entier.
 */
function formatDay(day: string, locale: string): string {
  const date = new Date(`${day.slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? day : date.toLocaleDateString(locale)
}

/** Le mois PRÉCÉDENT, au format `YYYY-MM` — le même défaut que le serveur, et
 *  le même que l'écran des relevés : le 5 du mois, la question est celle
 *  d'avant. Partir du 1er en UTC évite le piège du 31 mars moins un mois. */
function previousMonth(now: Date): string {
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  cursor.setUTCMonth(cursor.getUTCMonth() - 1)
  return cursor.toISOString().slice(0, 7)
}
