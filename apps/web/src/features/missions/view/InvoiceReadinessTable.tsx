import {
  BLOCKER_ACTIONS,
  craStatusOf,
  isDisputeOpen,
  isInvoicedState,
  isSettled,
  type InvoiceBlocker,
  type InvoiceReadiness,
} from '@bellum/contracts'
import { Link } from '@tanstack/react-router'
import {
  Badge,
  Box,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Text,
  cn,
} from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Ellipsis } from 'lucide-react'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatDate, formatMonth } from '@/lib/locale'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { PaymentReminderDue } from './PaymentReminderDue'

// Un litige EN COURS, une facture PAS ENCORE marquée, un état BLOQUÉ — même
// dérivation que le panneau. Recopiée ici plutôt qu'importée par un troisième
// fichier qui la porterait : trois recopies divergeraient, deux ne le font
// jamais tant qu'elles restent à côté de leur source.
//
// #2197.41 — `invoiced_declared` porte `outline`, jamais `secondary` comme
// `invoiced` : le badge PLEIN reste réservé à ce qui est PROUVÉ par un
// connecteur, le contour à une déclaration non confirmée.
const STATE_VARIANT = {
  blocked: 'warning',
  ready: 'success',
  invoiced: 'secondary',
  not_due: 'secondary',
  invoiced_declared: 'outline',
} as const

/** La rangée unique — mission × mois — telle que la clé de sélection et la
 *  clé du tableau la calculent TOUTES LES DEUX de la même façon. */
export function readinessRowKey(item: Pick<InvoiceReadiness, 'missionId' | 'periodMonth'>): string {
  return `${item.missionId}-${item.periodMonth}`
}

/**
 * LA FORME TABLEAU de `/missions/facturation` (maquette du 26/08, PDF-22 §6).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI NE BOUGE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Chaque bloqueur porte déjà SA route de réparation (`BLOCKER_ACTIONS`), le
 * litige porte son motif, les cinq gestes d'écriture (marquer facturé,
 * encaisser, annuler, contester, lever) restent ceux du panneau — rien de ce
 * câblage n'est touché ici, seulement RÉORGANISÉ en colonnes : Mission et
 * Client sortent dans leurs propres colonnes (une seule fois chacun, jamais
 * recopiés), Statut CRA et Statut facture / Action gardent EXACTEMENT les
 * mêmes libellés, boutons et liens qu'avant ce lot.
 *
 * Le chevron OUVRE le dossier de la mission (D200, comme la mention F1) : ce
 * n'est pas un second geste, c'est la même destination que le nom de la
 * mission, offerte une seconde fois pour la ligne entière.
 */
/**
 * #2575 — colonnes SECONDAIRES : repliées sous 2xl (1 536 px). À 1 280 px le
 * tableau mesurait 1 834 px dans un parent de 1 206 px et « Statut / Action »
 * sortait du champ (recette prod 07/10/2026). Leur valeur reste une ligne plus
 * loin, sur la fiche mission que le chevron ouvre ; en mobile, la carte les
 * montre toutes (le repli ne touche que le mode tableau).
 */
const SECONDARY_COLUMN = 'hidden 2xl:table-cell 2xl:w-[9%]'

/** #2197.9 — « Société facturante » visible dès xl ; garde #2575 pour le reste. */
const LEGAL_ENTITY_COLUMN = 'hidden xl:table-cell xl:w-[9%]'

/**
 * #3709 (recette 07/10 soir) — le repli sous 2xl ne suffisait pas : à 1 206 px
 * de conteneur, le tableau mesurait encore 1 458 px et « Action » sortait du
 * champ. Client et Jours quittent donc leur colonne (mode tableau seulement) :
 * le client passe SOUS la mission, les jours SOUS la période — même valeur,
 * deux lignes au lieu de deux colonnes. La carte mobile garde ses champs.
 */
const FOLDED_COLUMN = 'hidden'

export function InvoiceReadinessTable({
  items,
  canReadFinance,
  selected,
  onToggleSelect,
  pending,
  onMarkInvoiced,
  onRecordPayment,
  onCancelInvoiced,
  onOpenDispute,
  onResolveDispute,
  onRecordReminder,
  empty,
  scrollLabel,
}: {
  items: readonly InvoiceReadiness[]
  canReadFinance: boolean
  selected: ReadonlySet<string>
  onToggleSelect: (item: InvoiceReadiness) => void
  pending: boolean
  onMarkInvoiced: (item: InvoiceReadiness) => void
  onRecordPayment: (item: InvoiceReadiness) => void
  onCancelInvoiced: (item: InvoiceReadiness) => void
  onOpenDispute: (item: InvoiceReadiness) => void
  onResolveDispute: (item: InvoiceReadiness) => void
  onRecordReminder: (item: InvoiceReadiness) => void
  empty: React.ReactNode
  scrollLabel: string
}) {
  const { t } = useTranslation('missions')
  const isMobile = useIsMobile()

  return (
    <ResponsiveTable
      rows={items}
      rowKey={readinessRowKey}
      empty={empty}
      scrollLabel={scrollLabel}
      fixedLayout
      columns={[
        {
          key: 'select',
          header: '',
          mobile: 'hidden',
          className: 'w-12',
          render: item => (
            <Checkbox
              checked={selected.has(readinessRowKey(item))}
              onCheckedChange={() => onToggleSelect(item)}
              aria-label={t('readiness.table.selectRow')}
            />
          ),
        },
        {
          key: 'mission',
          header: t('readiness.table.mission'),
          mobile: 'title',
          className: 'w-[22%]',
          render: item => (
            <Box className="min-w-0">
              {item.missionLabel ? (
                <ObjectMention kind="mission" id={item.missionId} name={item.missionLabel} lines={2} />
              ) : (
                <Text element="span" size="sm" weight="medium">
                  {t('unknownMission')}
                </Text>
              )}
              {isMobile ? null : (
                <Text element="p" size="xs" color="text-muted-foreground">
                  {item.accountName ?? t('unknownAccount')}
                </Text>
              )}
            </Box>
          ),
        },
        {
          key: 'client',
          className: FOLDED_COLUMN,
          header: t('readiness.table.client'),
          mobile: 'meta',
          // Mode tableau : le client vit sous la mission, pas deux fois.
          render: item =>
            isMobile ? (
              <Text element="span" size="sm" color="text-muted-foreground">
                {item.accountName ?? t('unknownAccount')}
              </Text>
            ) : null,
        },
        {
          // #2197.9 — décision de Louis du 16/09/2026 (soir) : « tout
          // ajouter, en dur ». La société qui ÉMET (`legal_entities`, pas
          // `account_entities` qui reçoit) existait déjà sur la mission
          // (`MissionDetailPanel.tsx`) mais jamais sur cet écran.
          key: 'legalEntity',
          // #2197.9 — visible dès xl (1 280 px) : recette prod 31/10, invisible à 1 512 px.
          // Les autres secondaires (TJM, CRA, responsable) restent en 2xl (#2575/#3709).
          className: LEGAL_ENTITY_COLUMN,
          header: t('readiness.table.legalEntity'),
          mobile: 'field',
          render: item =>
            item.legalEntityName ? (
              <Text size="sm">{item.legalEntityName}</Text>
            ) : (
              <UnknownValue reason={t('readiness.table.legalEntityUnknown')} />
            ),
        },
        {
          // Théo .base — « BASE DU MOIS » : les jours, puis le mois. Le TJM garde SA colonne (#2197.13).
          key: 'period',
          className: 'w-[14%]',
          header: t('readiness.table.base'),
          mobile: 'field',
          render: item => (
            <Box>
              <Text size="sm">
                {item.days === null ? t('readiness.noTimesheet') : t('readiness.days', { count: item.days })}
              </Text>
              <Text element="p" size="xs" color="text-muted-foreground">
                {formatMonth(item.periodMonth.slice(0, 7)) ?? item.periodMonth}
              </Text>
            </Box>
          ),
        },
        {
          // #2197.12 — les jours restent visibles MÊME quand le montant est
          // déjà chiffré : avant ce lot, `AmountCell` ne les montrait que
          // lorsque `preparedAmountCents` était `null`, les cachant dès
          // qu'un TJM existait.
          key: 'days',
          className: FOLDED_COLUMN,
          header: t('readiness.table.days'),
          mobile: 'field',
          render: item =>
            !isMobile ? null : item.days === null ? (
              <Text size="sm" color="text-muted-foreground">
                {t('readiness.noTimesheet')}
              </Text>
            ) : (
              <Text size="sm">{t('readiness.days', { count: item.days })}</Text>
            ),
        },
        {
          // #2197.13 — le TJM (`dailyRateCents`) n'est PAS gardé par le droit
          // financier ailleurs dans ce dépôt : il reste visible sans
          // `canReadFinance`, contrairement à la colonne montant juste après.
          key: 'dailyRate',
          className: SECONDARY_COLUMN,
          header: t('readiness.table.dailyRate'),
          mobile: 'field',
          render: item =>
            item.dailyRateCents == null ? (
              <Text size="sm" color="text-muted-foreground">
                {t('readiness.rateUnknown')}
              </Text>
            ) : (
              <Text size="sm">{t('readiness.rate', { value: Math.round(item.dailyRateCents / 100) })}</Text>
            ),
        },
        {
          key: 'amount',
          className: 'w-[13%]',
          // #2197.14 — cette colonne dit HT (missions.json), jamais TTC :
          // `preparedAmountCents` (jours × TJM) n'a jamais porté de TVA, le
          // même montant se nomme déjà « HT » dans l'aperçu du connecteur
          // (`readiness.connector.previewAmount`).
          header: t('readiness.table.amount'),
          mobile: 'field',
          render: item => <AmountCell item={item} canReadFinance={canReadFinance} />,
        },
        {
          // Théo missions-preparation.R5 — « Couverture de commande » : la référence du bon de commande, et ce qui
          // empêche de s'y appuyer (absent, hors période). Un montant de commande n'est pas servi par cette lecture :
          // il n'est pas inventé, la référence seule est écrite.
          key: 'orderCoverage',
          className: 'w-[12%]',
          header: t('readiness.table.orderCoverage'),
          mobile: 'field',
          render: item => {
            const problem = item.blockers.includes('missing_po')
              ? t('readiness.table.orderMissing')
              : item.blockers.includes('po_period_mismatch')
                ? t('readiness.table.orderOutOfPeriod')
                : null
            return (
              <Box className="min-w-0">
                {item.poNumber ? (
                  <Text size="sm">{item.poNumber}</Text>
                ) : (
                  <UnknownValue reason={t('readiness.table.orderUnknown')} />
                )}
                {problem ? (
                  <Text element="p" size="xs" color="text-[var(--warning-soft-text)]">
                    {problem}
                  </Text>
                ) : null}
              </Box>
            )
          },
        },
        {
          key: 'craStatus',
          className: SECONDARY_COLUMN,
          header: t('readiness.table.craStatus'),
          mobile: 'field',
          render: item => <CraStatusCell item={item} />,
        },
        {
          key: 'status',
          className: 'w-[20%] 2xl:w-[24%]', // #2197.9 — cède 4 pts à la société facturante à xl
          header: t('readiness.table.controls'),
          mobile: 'field',
          render: item => <ReadinessDetailCell item={item} />,
        },
        {
          // Théo — UN geste par ligne (le plus utile), les autres sous « ⋯ ». Aucun geste ne disparaît.
          key: 'actions',
          className: 'w-[13rem]',
          header: '',
          mobile: 'field',
          render: item => (
            <ReadinessActionsCell
              item={item}
              pending={pending}
              onMarkInvoiced={() => onMarkInvoiced(item)}
              onRecordPayment={() => onRecordPayment(item)}
              onCancelInvoiced={() => onCancelInvoiced(item)}
              onOpenDispute={() => onOpenDispute(item)}
              onResolveDispute={() => onResolveDispute(item)}
              onRecordReminder={() => onRecordReminder(item)}
            />
          ),
        },
        {
          // #2197.19 — LE CHARGÉ D'AFFAIRES (`ownerName`), déjà exposé par le
          // contrat pour nommer l'owner du blocage « bon de commande »
          // (#2566.2) mais jamais rendu comme sa propre colonne. Même clé
          // que la colonne « Owner » de `MissionsTable.tsx` — un réglage vit
          // à un seul endroit (GA-26).
          key: 'owner',
          className: SECONDARY_COLUMN,
          header: t('table.owner'),
          mobile: 'field',
          render: item =>
            item.ownerName ? (
              <Text size="sm">{item.ownerName}</Text>
            ) : (
              <UnknownValue reason={t('table.ownerUnknown')} />
            ),
        },
        {
          key: 'chevron',
          header: '',
          mobile: 'hidden',
          className: 'w-[4.5rem]',
          render: item => (
            <Link
              to="/missions/$id"
              params={{ id: item.missionId }}
              aria-label={t('readiness.table.openDetail')}
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)]"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ),
        },
      ]}
    />
  )
}

function AmountCell({ item, canReadFinance }: { item: InvoiceReadiness; canReadFinance: boolean }) {
  const { t } = useTranslation('missions')
  if (!canReadFinance) {
    // La phrase COMPLÈTE (« Montants réservés — demande l'accès financier »)
    // vit une seule fois, dans l'entête : la répéter identique sur CHAQUE
    // ligne romprait « rien n'apparaît deux fois sous la même forme » (loi 4)
    // et rendrait `getByText` ambigu pour qui cherche la phrase de l'entête.
    return (
      <Text size="sm" color="text-muted-foreground">
        {t('readiness.table.financeHiddenShort')}
      </Text>
    )
  }
  if (item.preparedAmountCents === null) {
    // #2197.12/.13 — la RAISON (aucun relevé, ou un TJM manquant) se lit
    // désormais dans les colonnes dédiées « Jours » et « TJM », juste à
    // côté : la répéter ICI romprait « rien n'apparaît deux fois sous la
    // même forme » (loi 4) et rendrait `getByText` ambigu entre les deux
    // colonnes.
    return <UnknownValue />
  }
  return (
    <Text size="sm" weight="semibold" className="tabular-nums">
      {t('readiness.amount', { value: Math.round(item.preparedAmountCents / 100) })}
    </Text>
  )
}

/**
 * « Statut CRA » — la colonne que la fiche de lecture met en tête des
 * éléments à garder. `craStatusOf` est la SEULE dérivation (le fichier
 * contrat le dit) : ce composant ne fait que la LIRE et la peindre.
 */
function CraStatusCell({ item }: { item: InvoiceReadiness }) {
  const { t } = useTranslation('missions')
  const status = craStatusOf(item)
  if (status === null) {
    // Un mois NON DÛ (forfait, jalon) ne porte pas de relevé mensuel — ce
    // n'est pas « validé », c'est une question qui ne se pose pas.
    return (
      <Text size="sm" color="text-muted-foreground">
        {t('readiness.states.not_due')}
      </Text>
    )
  }
  const variant = CRA_STATUS_VARIANT[status]
  return <Badge variant={variant}>{t(`readiness.craStatus.${status}`)}</Badge>
}

const CRA_STATUS_VARIANT = {
  not_submitted: 'secondary',
  to_validate: 'warning',
  validated: 'success',
  conflict: 'danger',
} as const

/**
 * #2408.76 — TOUS les bloqueurs de la ligne routent-ils déjà vers
 * `/missions/cra` (côté contrat, `BLOCKER_ACTIONS`) ? Aucune catégorie
 * inventée : c'est la partition qui existe déjà pour poser le badge de
 * bloqueur et sa route de réparation, seulement relue ici pour choisir le
 * verbe du bouton de relance. Un tableau VIDE n'est jamais « tout CRA » —
 * `every` sur `[]` vaudrait `true` et ferait dire « Demander le CRA » à une
 * ligne sans aucun bloqueur, qui ne montre d'ailleurs pas ce bouton.
 */
function isCraOnlyBlocked(item: InvoiceReadiness): boolean {
  return item.blockers.length > 0 && item.blockers.every(blocker => BLOCKER_ACTIONS[blocker].route === '/missions/cra')
}

/**
 * Le contenu qui vivait dans `ReadinessRow` avant ce lot — état, litige,
 * bloqueurs (chacun avec sa route de réparation), relance d'encaissement due,
 * et les cinq gestes d'écriture. Inchangé, seulement REHÉBERGÉ dans la
 * colonne « Statut facture / Action » plutôt que dans une carte pleine
 * largeur : c'est ce qui garde intacts les tests qui l'interrogent par texte.
 */
function ReadinessDetailCell({ item }: { item: InvoiceReadiness }) {
  const { t } = useTranslation('missions')
  const disputed = isDisputeOpen(item)
  return (
    <Box className="space-y-2">
      <Box display="flex" className="flex-wrap items-center gap-2">
        <Badge variant={STATE_VARIANT[item.state]}>{t(`readiness.states.${item.state}`)}</Badge>
        {/* La facture ENTRANTE du sous-traitant (30/08/2026, §9). Elle
            n'est jamais un client — voir la note en tête du fichier
            contrat — et elle ne remplace pas le badge d'état ci-dessus :
            elle s'ajoute, comme le badge de litige. */}
        {item.supplierInvoiceStatus === 'missing' ? (
          <Badge variant="warning">{t('readiness.table.supplierInvoiceMissing')}</Badge>
        ) : null}
        {item.supplierInvoiceStatus === 'received' ? (
          <Badge variant="secondary">{t('readiness.table.supplierInvoiceReceived')}</Badge>
        ) : null}
        {disputed ? <Badge variant="danger">{t('readiness.disputed')}</Badge> : null}
      </Box>

      {/* #2197.41 — QUI a déclaré, et QUAND : une déclaration humaine n'est
          pas une preuve de connecteur, et l'écran le dit partout où la valeur
          voyage. `invoicedByName` est absent seulement si le profil du
          déclarant n'a pas pu être résolu — jamais un nom deviné. */}
      {item.state === 'invoiced_declared' ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {item.invoicedByName
            ? t('readiness.declaredBy', { name: item.invoicedByName, date: formatDate(item.invoicedAt) })
            : t('readiness.declaredByUnknown')}
        </Text>
      ) : null}

      {item.blockers.length > 0 ? (
        <Box display="flex" className="flex-wrap gap-1">
          {item.blockers.map((blocker: InvoiceBlocker) => {
            const target = BLOCKER_ACTIONS[blocker]
            return (
              <Link key={blocker} to={target.route}>
                <Badge variant="outline" className="cursor-pointer underline-offset-2 hover:underline">
                  {t(`readiness.blockers.${blocker}`)} · {t(`readiness.actions.${target.action}`)}
                </Badge>
              </Link>
            )
          })}
        </Box>
      ) : null}
      {/* #2566.2 — le blocage « bon de commande » NOMME son owner : sans lui,
          le blocage se lit comme une fatalité plutôt que comme un geste que
          quelqu'un de précis peut faire. */}
      {item.blockers.includes('po_period_mismatch') && item.ownerName ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('readiness.poBlockerOwner', { name: item.ownerName })}
        </Text>
      ) : null}

      {disputed && item.disputeReason ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('readiness.disputeNote', { reason: item.disputeReason })}
        </Text>
      ) : null}

      {item.remindersSent > 0 ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {/* #2419.8 — « envoyée » exige la preuve du connecteur
              (`message_id`) ; sans elle, la relance reste CONSIGNÉE — jamais
              inventée. Aujourd'hui `lastReminderMessageId` est TOUJOURS
              `null` (aucun connecteur de messagerie sur cet écran, `c31`),
              donc ce texte dit encore « consignée(s) » partout. */}
          {item.lastReminderMessageId
            ? t('readiness.remindersSent', { count: item.remindersSent })
            : t('readiness.reminders', { count: item.remindersSent })}
        </Text>
      ) : null}

      <PaymentReminderDue item={item} />
    </Box>
  )
}

type ReadinessAction = { key: string; label: string; run: () => void }

/**
 * Théo missions-preparation — LE GESTE DE LA LIGNE. Le premier geste applicable est le bouton ; les autres
 * vivent dans le menu « ⋯ » à côté. Ce sont exactement les gestes d'avant (mêmes mutations, mêmes
 * conditions) : seule leur disposition change.
 */
function ReadinessActionsCell({
  item,
  onMarkInvoiced,
  onRecordPayment,
  onCancelInvoiced,
  onOpenDispute,
  onResolveDispute,
  onRecordReminder,
  pending,
}: {
  item: InvoiceReadiness
  onMarkInvoiced: () => void
  onRecordPayment: () => void
  onCancelInvoiced: () => void
  onOpenDispute: () => void
  onResolveDispute: () => void
  onRecordReminder: () => void
  pending: boolean
}) {
  const { t } = useTranslation('missions')
  const disputed = isDisputeOpen(item)
  const invoiced = isInvoicedState(item.state)
  // L'ordre dit la priorité : un litige ouvert d'abord, puis débloquer, puis préparer, puis encaisser.
  const actions: ReadinessAction[] = [
    disputed ? { key: 'resolveDispute', label: t('readiness.resolveDispute'), run: onResolveDispute } : null,
    item.blockers.length > 0
      ? {
          key: 'reminder',
          // #2408.76 — même geste, même mutation : seul le VERBE change quand la ligne n'a QUE des bloqueurs CRA.
          label: isCraOnlyBlocked(item) ? t('table.actions.requestCra') : t('readiness.recordReminder'),
          run: onRecordReminder,
        }
      : null,
    !invoiced ? { key: 'markInvoiced', label: t('readiness.markInvoiced'), run: onMarkInvoiced } : null,
    // #2419.4 — un paiement partiel ne sort pas de la file : le critère est le SOLDE, pas la date.
    invoiced && !isSettled(item)
      ? { key: 'recordPayment', label: t('readiness.recordPayment'), run: onRecordPayment }
      : null,
    invoiced ? { key: 'cancelInvoiced', label: t('readiness.cancelInvoiced'), run: onCancelInvoiced } : null,
    invoiced && !disputed ? { key: 'openDispute', label: t('readiness.openDispute'), run: onOpenDispute } : null,
  ].filter((action): action is ReadinessAction => action !== null)
  const [primary, ...rest] = actions
  if (!primary) return null
  const ready = item.state === 'ready' && primary.key === 'markInvoiced'
  return (
    <Box display="flex" className="items-center justify-end gap-1">
      <Button
        type="button"
        size="sm"
        variant={ready ? 'default' : 'outline'}
        disabled={pending}
        onClick={primary.run}
        className={cn(
          'pointer-coarse:min-h-11',
          !ready && 'border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)]',
        )}
      >
        {primary.label}
      </Button>
      {rest.length > 0 ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t('readiness.table.moreActions', { label: item.missionLabel ?? t('unknownMission') })}
              className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            >
              <Ellipsis className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {rest.map(action => (
              <DropdownMenuItem key={action.key} disabled={pending} onSelect={action.run}>
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </Box>
  )
}
