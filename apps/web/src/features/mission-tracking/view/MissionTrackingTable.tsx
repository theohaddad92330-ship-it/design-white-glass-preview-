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
  FilterChips,
  Input,
  Text,
} from '@bellum/ui'
import type { InvoiceReadiness } from '@bellum/contracts'
import { Link } from '@tanstack/react-router'
import { MoreHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { NextAction as NextActionLink } from '@/components/primitives/NextAction'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { assigneeNames, assigneesOf, type MissionView } from '@/features/missions/api'
import { supervisedForfaitLabel } from '@/features/missions/supervised-forfait'
import { formatDate, formatDateRange } from '@/lib/locale'
import {
  TRACKING_VIEWS,
  trackingConcerns,
  type CraStatus,
  type InvoicingStatus,
  type MissionTrackingRow,
  type NextAction,
  type PaymentStatus,
  type TrackingView,
} from '../derive'
import type { MissionTrackingColumnKey } from '../columns'
import { MissionTrackingColumnsPicker } from './MissionTrackingColumnsPicker'

const CRA_VARIANT: Record<CraStatus, 'default' | 'warning' | 'success' | 'secondary'> = {
  validated: 'success',
  pending_validation: 'default',
  action_needed: 'warning',
  not_applicable: 'secondary',
  unknown: 'secondary',
}

const INVOICING_VARIANT: Record<InvoicingStatus, 'default' | 'warning' | 'success' | 'secondary' | 'outline'> = {
  blocked: 'warning',
  ready: 'success',
  invoiced: 'secondary',
  not_due: 'secondary',
  unknown: 'secondary',
  // #2197.41 — contour, jamais le badge PLEIN réservé à ce qui est PROUVÉ par
  // un connecteur : même geste que `InvoiceReadinessTable.tsx`,
  // `MissionDetailTabs.tsx` et `AccountInvoiceReadinessCell.tsx`.
  invoiced_declared: 'outline',
}

const PAYMENT_VARIANT: Record<PaymentStatus, 'default' | 'warning' | 'success' | 'secondary'> = {
  paid: 'success',
  disputed: 'warning',
  overdue: 'warning',
  pending: 'default',
  // #1382 — « Pas encore facturé » est un FAIT, pas une alerte : la facture
  // n'est simplement pas partie. Le geste qui la fait partir est dans la
  // colonne « Facturation », pas ici.
  not_invoiced: 'secondary',
  not_applicable: 'secondary',
  unknown: 'secondary',
}

/**
 * LA GRANDE TABLE — une ligne par mission active, CRA + facturation +
 * paiement + prochaine action côte à côte. C'est le bloc que D-22-2 refusait
 * en 2026-08-29 : les cinq autres blocs de la maquette vivaient déjà chacun
 * sur son écran, et lui seul n'existait nulle part.
 *
 * ⚠️ Les trois colonnes du milieu distinguent TOUJOURS trois choses : « sans
 * objet » (le concept ne s'applique pas à cette ligne), « à faire » (une
 * action attend) et « non mesuré » (la donnée n'est pas sous la main pour ce
 * mois). Une case grise identique pour les trois annulerait tout le travail
 * de `derive.ts` — voir `UnknownValue` pour « non mesuré » et le badge
 * `secondary` réservé aux DEUX AUTRES cas, jamais confondus par leur LIBELLÉ.
 */
export function MissionTrackingTable({
  rows,
  visible,
  onToggleColumn,
  onResetColumns,
  search,
  onSearchChange,
  view,
  onViewChange,
  viewCounts,
  lauraQuestion,
}: {
  rows: readonly MissionTrackingRow<MissionView>[]
  visible: readonly MissionTrackingColumnKey[]
  onToggleColumn: (key: MissionTrackingColumnKey, visible: boolean) => void
  onResetColumns: () => void
  search: string
  onSearchChange: (value: string) => void
  /** #1378 — la file de travail, ou tout le portefeuille. */
  view: TrackingView
  onViewChange: (next: TrackingView) => void
  viewCounts: Record<TrackingView, number>
  /** #1384 — la question posée devant la FILE, pas devant une ligne. */
  lauraQuestion: string
}) {
  const { t } = useTranslation('missionTracking')
  const visibleColumns = new Set(visible)
  const needle = search.trim().toLowerCase()
  const filtered = needle
    ? rows.filter(row => {
        // #1350 — les affectations portent des OBJETS : sans `assigneeNames`, la
        // botte de foin recevrait « [object Object] » et la recherche par
        // consultant cesserait de trouver personne, sans rougir un test de type.
        const haystack = [row.mission.label, row.mission.accountName, ...assigneeNames(row.mission)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(needle)
      })
    : rows

  return (
    <Box className="flex flex-col gap-3">
      {/* ⚠️ UNE seule barre. Les deux vues, la recherche, les colonnes et Laura
          y tiennent ensemble : une seconde barre posée au-dessus aurait empilé
          deux rangées d'onglets, un défaut déjà payé ailleurs dans ce dépôt. */}
      <Box className="flex flex-wrap items-center gap-2">
        {/* #1378 — « Ajouter deux vues : "À traiter" | "Tout le suivi". Par
            défaut ouvrir "À traiter". » Comptées, comme toutes les pastilles du
            produit : sans le nombre, on ne sait pas si la file est vide parce
            que tout va bien ou parce qu'un filtre l'a vidée. */}
        <FilterChips
          size="sm"
          ariaLabel={t('table.viewsLabel')}
          options={TRACKING_VIEWS.map(key => ({
            value: key,
            label: t(`table.views.${key}`),
            hint: t(`table.viewHints.${key}`),
            count: viewCounts[key],
          }))}
          value={view}
          // ⚠️ Pas de `clearable` : une vue est TOUJOURS l'une des deux. Un
          // second clic qui rendrait `null` laisserait la table sans population
          // choisie, et l'écran sans réponse à sa propre question.
          onChange={next => {
            if (next !== null) onViewChange(next)
          }}
        />
        <Input
          value={search}
          onChange={event => onSearchChange(event.target.value)}
          placeholder={t('table.searchPlaceholder')}
          aria-label={t('table.searchPlaceholder')}
          className="max-w-sm"
        />
        <MissionTrackingColumnsPicker visible={visible} onToggle={onToggleColumn} onReset={onResetColumns} />
        {/* #1384 — Laura à l'entrée de l'écran, en poids `prominent` : c'est un
            écran de LISTE, et la question posée devant une file de travail est
            un arbitrage, pas une consultation. Le variant existe depuis le lot
            précédent — rien de neuf n'est écrit ici.

            ⚠️ Le BANDEAU proactif (« Laura a repéré 3 blocages ») n'est pas
            livré : il attend l'arbitrage Q2 du 04/09. Le bouton, lui, ne
            demande aucune décision. */}
        <Box className="ms-auto">
          <AskLaura question={lauraQuestion} label={t('table.askLaura')} variant="prominent" />
        </Box>
      </Box>

      <ResponsiveTable
        rows={filtered}
        rowKey={row => row.mission.id}
        scrollLabel={t('table.title')}
        empty={
          <Box className="rounded-md border border-dashed border-border p-4">
            <Text size="sm" color="text-muted-foreground">
              {t('table.empty')}
            </Text>
          </Box>
        }
        columns={[
          {
            key: 'mission',
            header: t('table.columns.mission'),
            mobile: 'title',
            // ⚠️ BORNÉE — mesuré en production le 04/09/2026. Sans borne, cette
            // colonne prenait 394 px sur les 1 206 visibles, presque le tiers,
            // et poussait « Prochaine action » à x=1469 dans un conteneur qui
            // finit à 1479 : la colonne que #1383 appelle « la plus actionnable
            // de la page » n'était plus atteignable sans faire défiler.
            //
            // La table défile — c'est la règle du dépôt, et son conteneur la
            // tient — mais une colonne d'action hors champ n'agit sur personne.
            // Le nom et le compte se tronquent, eux, sans rien perdre : ils
            // portent déjà leur valeur entière en infobulle et la ligne mène au
            // dossier.
            className: 'max-w-[15rem]',
            /**
             * #1381, #1385 — LE LOGO RÉEL, ET L'URGENCE EN TÊTE DE LIGNE.
             *
             * Le même composant et la même source que `/missions` et que la
             * frise : `CompanyAvatar` lit `accountLogoUrl`, retombe sur le
             * favicon du site, et sur l'initiale seulement si rien n'existe.
             *
             * ⚠️ Le point d'urgence n'est PAS une couleur seule : il porte un
             * `title` qui NOMME le motif. Une pastille rouge muette ne dit rien
             * à qui ne distingue pas les teintes, et rien du tout à un lecteur
             * d'écran.
             */
            render: row => (
              <Box className="flex min-w-0 max-w-[15rem] items-start gap-2">
                <UrgencyDot row={row} />
                {row.mission.accountName ? (
                  <CompanyAvatar
                    name={row.mission.accountName}
                    logoUrl={row.mission.accountLogoUrl}
                    website={row.mission.accountWebsite}
                  />
                ) : null}
                <Box className="flex min-w-0 flex-col">
                  <ObjectMention kind="mission" id={row.mission.id} name={row.mission.label} />
                  <Text size="xs" color="text-muted-foreground" className="truncate">
                    {row.mission.accountName ?? <UnknownValue reason={t('table.unknownClient')} />}
                  </Text>
                </Box>
              </Box>
            ),
          },
          ...(visibleColumns.has('consultant')
            ? [
                {
                  key: 'consultant',
                  header: t('table.columns.consultant'),
                  mobile: 'meta' as const,
                  render: (row: MissionTrackingRow<MissionView>) =>
                    row.mission.assignees == null ? (
                      <UnknownValue reason={t('table.unknownConsultant')} />
                    ) : row.mission.assignees.length === 0 ? (
                      // #3547 — un forfait encadré n'attend pas de consultant.
                      supervisedForfaitLabel(row.mission) ? (
                        <Badge variant="secondary">{supervisedForfaitLabel(row.mission)}</Badge>
                      ) : (
                        <Badge variant="warning">{t('table.unstaffed')}</Badge>
                      )
                    ) : (
                      // #1381 — « consultant clairement identifiable ». L'avatar
                      // est décoratif (`aria-hidden` dans le composant) : le NOM
                      // reste le texte de la cellule.
                      <Box className="flex min-w-0 items-center gap-2">
                        <ContactAvatar
                          name={assigneesOf(row.mission)[0]?.fullName}
                          photoUrl={assigneesOf(row.mission)[0]?.photoUrl}
                          size="xs"
                        />
                        <Text size="sm" className="truncate">
                          {assigneeNames(row.mission).join(', ')}
                        </Text>
                      </Box>
                    ),
                },
              ]
            : []),
          ...(visibleColumns.has('client')
            ? [
                {
                  key: 'client',
                  header: t('table.columns.client'),
                  mobile: 'meta' as const,
                  render: (row: MissionTrackingRow<MissionView>) =>
                    row.mission.accountName ?? <UnknownValue reason={t('table.unknownClient')} />,
                },
              ]
            : []),
          ...(visibleColumns.has('period')
            ? [
                {
                  key: 'period',
                  header: t('table.columns.period'),
                  mobile: 'meta' as const,
                  render: (row: MissionTrackingRow<MissionView>) => <PeriodCell mission={row.mission} />,
                },
              ]
            : []),
          {
            key: 'cra',
            header: t('table.columns.cra'),
            render: row => <CraCell status={row.cra} />,
          },
          {
            key: 'invoicing',
            header: t('table.columns.invoicing'),
            // #1382 — l'ÉTAT, et la RAISON en infobulle. La ligne de readiness
            // porte déjà ses bloqueurs ; les jeter à l'affichage faisait lire
            // « Bloqué » sans dire par quoi.
            render: row => <InvoicingCell status={row.invoicing} readiness={row.readiness} />,
          },
          {
            key: 'payment',
            header: t('table.columns.payment'),
            render: row => <PaymentCell status={row.payment} />,
          },
          {
            key: 'nextAction',
            header: t('table.columns.nextAction'),
            render: row => <NextActionCell action={row.nextAction} missionLabel={row.mission.label} />,
          },
          {
            key: 'menu',
            header: '',
            mobile: 'hidden',
            render: row => <RowMenu missionId={row.mission.id} />,
          },
        ]}
      />
    </Box>
  )
}

/**
 * LA PÉRIODE — #1381.
 *
 * « Transformer "08/05/2026 – 01/10/2026" en "8 mai → 1 oct. 2026" ». Deux
 * dates NUMÉRIQUES séparées par un tiret demandent d'être décodées ; la forme
 * courte se lit. Le calcul vit dans `formatDateRange` (GA-26), pas ici.
 *
 * ⚠️ Les trois absences ne se rendent pas pareil, et c'est la doctrine du
 * dépôt appliquée à une cellule : rien de saisi (« non mesuré »), un début sans
 * fin (une mission qui court — un fait, pas un trou), une fin sans début (une
 * saisie à corriger). Les replier sur « — … » ferait chercher trois pannes
 * différentes au même endroit.
 */
function PeriodCell({ mission }: { mission: MissionView }) {
  const { t } = useTranslation('missionTracking')
  const range = formatDateRange(mission.started_on, mission.ends_on)
  // ⚠️ `whitespace-nowrap` — mesuré en recette le 04/09/2026. Huit colonnes se
  // partagent la largeur, et la table en donnait SOIXANTE-SIX pixels à celle-ci :
  // « 17 août 2026 → 17 août 2027 » s'y cassait sur cinq lignes, une cellule de
  // 66 × 137. Sans consigne, une cellule de texte accepte n'importe quelle
  // largeur — c'est à elle de réclamer la sienne. Ce qui déborde alors défile
  // dans le conteneur de la table, jamais dans le corps de la page.
  if (range !== null)
    return (
      <Text size="sm" className="whitespace-nowrap">
        {range}
      </Text>
    )

  const start = formatDate(mission.started_on, { day: 'numeric', month: 'short', year: 'numeric' })
  const end = formatDate(mission.ends_on, { day: 'numeric', month: 'short', year: 'numeric' })
  if (start === null && end === null) return <UnknownValue reason={t('table.unknownPeriod')} />
  // Les deux formes partielles gardent leur retour à la ligne : « Depuis le
  // 8 mai 2026 — sans date de fin » est une PHRASE, pas une date, et lui
  // interdire de se replier lui donnerait à elle seule la moitié du tableau.
  if (start !== null) return <Text size="sm">{t('table.periodFrom', { date: start })}</Text>
  return <Text size="sm">{t('table.periodUntil', { date: end })}</Text>
}

/**
 * L'INDICATEUR D'URGENCE — #1385.
 *
 * « Ajouter un indicateur d'urgence discret sur les lignes à traiter. »
 * Discret : un point de 8 px en tête de ligne. Pas muet : son `title` NOMME le
 * motif le plus grave, parce qu'une couleur seule ne porte jamais le sens
 * (D79 — et un lecteur d'écran n'en lit aucune).
 *
 * ⚠️ Une ligne saine ne rend RIEN, pas un point gris. Un point sur chaque ligne
 * cesse d'être un signal — c'est exactement le bruit que #1378 demande de
 * retirer de cet écran.
 */
function UrgencyDot({ row }: { row: MissionTrackingRow<MissionView> }) {
  const { t } = useTranslation('missionTracking')
  const concern = trackingConcerns(row)[0]
  if (concern === undefined) return null
  const tone =
    concern === 'payment_overdue' || concern === 'payment_disputed'
      ? 'bg-[var(--bellum-danger)]'
      : concern === 'invoicing_blocked' || concern === 'cra_action'
        ? 'bg-[var(--bellum-warning)]'
        : 'bg-[var(--bellum-primary-500)]'
  return (
    <span
      className={`mt-1.5 size-2 shrink-0 rounded-full ${tone}`}
      title={t(`concerns.${concern}`)}
      aria-label={t(`concerns.${concern}`)}
      role="img"
    />
  )
}

function CraCell({ status }: { status: CraStatus }) {
  const { t } = useTranslation('missionTracking')
  // #1382 — « ne jamais afficher un état ambigu si Bellum connaît la cause ».
  // « Non mesuré » tout court répond à « combien ? », pas à « pourquoi je ne
  // sais pas ? » — et c'est la seconde qui dit s'il y a un geste à faire.
  if (status === 'unknown') return <UnknownValue reason={t('table.craUnknown')} />
  if (status === 'not_applicable') return <Badge variant={CRA_VARIANT[status]}>{t('status.cra.notApplicable')}</Badge>
  return <Badge variant={CRA_VARIANT[status]}>{t(`status.cra.${statusKey(status)}`)}</Badge>
}

function statusKey(status: Exclude<CraStatus, 'unknown' | 'not_applicable'>): string {
  return status === 'action_needed'
    ? 'actionNeeded'
    : status === 'pending_validation'
      ? 'pendingValidation'
      : 'validated'
}

/**
 * L'ÉTAT DE FACTURATION, ET SA CAUSE (#1382).
 *
 * « Bloquée » ne dit pas par quoi, et le lecteur ouvre trois écrans pour le
 * savoir. Le bloqueur le plus grave est DÉJÀ sur la ligne (`INVOICE_BLOCKERS`
 * les ordonne par gravité) : l'infobulle le nomme, et la colonne
 * « Prochaine action », juste à côté, mène à l'écran qui le lève.
 *
 * ⚠️ Le libellé du bloqueur se lit dans le namespace `missions`, où il vit
 * déjà pour l'écran de facturation — jamais recopié ici.
 */
function InvoicingCell({ status, readiness }: { status: InvoicingStatus; readiness: InvoiceReadiness | undefined }) {
  const { t } = useTranslation('missionTracking')
  if (status === 'unknown') return <UnknownValue reason={t('table.invoicingUnknown')} />
  const blocker = status === 'blocked' ? readiness?.blockers[0] : undefined
  const reason =
    blocker !== undefined
      ? t('status.invoicingBecause', { blocker: t(`missions:readiness.blockers.${blocker}`) })
      : t(`status.invoicingWhy.${status}`)
  return (
    <Badge variant={INVOICING_VARIANT[status]} title={reason}>
      {t(`status.invoicing.${status}`)}
    </Badge>
  )
}

function PaymentCell({ status }: { status: PaymentStatus }) {
  const { t } = useTranslation('missionTracking')
  // #1382 — le seul `unknown` qui reste est le VRAI : aucune ligne de
  // facturation sur le mois consulté. « Pas encore facturé » a désormais son
  // propre état (`not_invoiced`), parce qu'on en connaît parfaitement la cause.
  if (status === 'unknown') return <UnknownValue reason={t('table.paymentUnknown')} />
  return <Badge variant={PAYMENT_VARIANT[status]}>{t(`status.payment.${status}`)}</Badge>
}

/**
 * LA COLONNE « PROCHAINE ACTION », EN LIEN — l'élément le mieux noté de
 * toutes les maquettes du 26/08, et jusqu'ici rendu en TEXTE MORT sur sept
 * écrans du dépôt. Ici, elle MÈNE à l'écran qui répare.
 */
function NextActionCell({ action, missionLabel }: { action: NextAction; missionLabel: string }) {
  const { t } = useTranslation('missionTracking')
  if (!action)
    return (
      // #1383 — « Si aucune action n'existe réellement : "Aucune action
      // planifiée" + option secondaire "Demander à Laura" ».
      //
      // ⚠️ Le lien Laura est le lien DISCRET, jamais le bouton plein : une file
      // de trente lignes en porterait trente, et le geste principal d'une ligne
      // sans action est de passer à la suivante. Le variant `prominent` reste
      // pour l'entrée de l'écran (#1384).
      //
      // ⚠️ Et il n'invente aucune action : il POSE une question sur cette
      // mission, il ne propose pas un geste qu'Action OS ne connaît pas — ce
      // que le retour interdit en toutes lettres.
      <Box className="flex flex-col items-start gap-0.5">
        <Text size="sm" color="text-muted-foreground">
          {t('table.noNextAction')}
        </Text>
        <AskLaura
          question={t('table.askLauraAboutMission', { mission: missionLabel })}
          label={t('table.askLauraShort')}
        />
      </Box>
    )

  if (action.kind === 'blocker') {
    // #1383 — le MÊME composant que les six autres écrans qui portent cette
    // colonne. Cette cellule réassemblait la clé i18n et recopiait la route
    // depuis `BLOCKER_ACTIONS` : deux copies de la même correspondance, qui
    // divergent au premier bloqueur ajouté. `nextActionLink` la tient (GA-26),
    // et il rend un vrai `<a>` — ce qui se clique se tabule (GA-35).
    return <NextActionLink action={{ domain: 'invoice_blocker', action: action.blocker }} />
  }
  if (action.kind === 'reminder') {
    return (
      <Button asChild variant="link" size="sm" className="h-auto p-0">
        <Link to="/missions/encaissements">
          {t('missions:invoiceReadiness.reminders.rank', { index: action.index })}
        </Link>
      </Button>
    )
  }
  return (
    <Button asChild variant="link" size="sm" className="h-auto p-0">
      <Link to="/missions/encaissements">{t(`missions:collections.actions.${action.actionKey}`)}</Link>
    </Button>
  )
}

function RowMenu({ missionId }: { missionId: string }) {
  const { t } = useTranslation('missionTracking')
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('table.rowMenu')}>
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('table.rowMenu')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/missions/$id" params={{ id: missionId }}>
            {t('table.viewMission')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/missions/cra">{t('table.viewCra')}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/missions/facturation">{t('table.viewInvoicing')}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
