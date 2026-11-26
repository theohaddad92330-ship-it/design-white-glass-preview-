import type {
  Account,
  AccountMissions,
  ActiveMissionRow,
  LegalContract,
  LegalContractLifecycle,
  LegalContractNoGoReason,
  MissionRisk,
  PastMissionRow,
} from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  cn,
} from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Briefcase } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NextAction } from '@/components/primitives/NextAction'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import { visibleMissionRisks } from '@/features/accounts/model/account-missions'
import { useRenewalWindows } from '@/features/missions/api'
import { CreateMissionFromDocumentDialog } from '@/features/missions/view/CreateMissionFromDocumentDialog'
import { ContractDocumentForm } from './ContractDocumentForm'
import { ContractUploadLinkPanel } from './ContractUploadLinkPanel'
import { renewalWindowBadge } from '@/features/missions/renewalWindowLabel'
import { apiFetch } from '@/lib/api'
import { queryKeys } from '@/lib/api/query-keys'
import { formatCents } from '@/lib/money'
import { formatDate } from '@/lib/locale'

const HEAD = 'text-xs font-medium text-[var(--bellum-text-muted)] whitespace-nowrap'
const CELL = 'py-2 align-middle'
const MUTED = 'text-[var(--bellum-text-muted)]'

/**
 * L'ONGLET MISSIONS D'UN DOSSIER DE COMPTE (PDF 4 §3.3, ticket BEL-BO-006).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * La source marque elle-même cet onglet « À FAIRE » : sur les quatorze qu'elle
 * décrit, treize existaient. Les missions d'un compte ne se voyaient qu'enfouies
 * dans « Preuves & REX », réduites à un intitulé et un badge de statut — ni la
 * période, ni les jours restants, ni la marge, ni qui était dessus, ni pourquoi
 * ça s'est arrêté. Et côté serveur, aucune route ne les rendait par compte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ §4.4 — CE QUI SE LIT ICI SE CORRIGE AILLEURS
 * ─────────────────────────────────────────────────────────────────────────────
 * « Chaque bloc propagé porte un lien vers sa source et ne s'édite jamais sur
 * place. » Cet onglet n'a AUCUN champ de saisie, aucun bouton d'enregistrement,
 * aucune mutation — c'est l'absence de code, pas une convention. Une marge qui
 * paraît fausse se corrige dans la mission, et le lien y mène, nommé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ AUCUNE VALEUR ABSENTE NE S'AFFICHE « 0 »
 * ─────────────────────────────────────────────────────────────────────────────
 * Un compte sans mission n'a pas « rapporté 0 € » : l'écran dit qu'il n'y a rien
 * à montrer, et il porte une SORTIE — un état vide sans action est un cul-de-sac,
 * déjà payé dans ce dépôt. Une marge absente dit LEQUEL des deux cas c'est :
 * « pas ton périmètre » quand le droit manque, « marge non mesurée » quand le
 * coût chargé n'est pas saisi. Sans `canReadFinance`, les deux seraient le même
 * `null` et l'écran finirait par écrire un zéro pour les deux.
 *
 * ⚠️ Le TARIF VENDU est affiché à tout le monde, et c'est délibéré : le prix de
 * VENTE est visible par design (doctrine de `mission.ts`, 28/08/2026), ce sont
 * les entrées de la MARGE qui se gardent. Deux fausses alertes ont déjà été
 * levées là-dessus.
 */
export function TabMissions({ account }: { account: Account }) {
  const { t } = useTranslation('accountMissions')
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.accounts.missions(account.id),
    queryFn: () => apiFetch<AccountMissions>({ path: `/delivery/accounts/${account.id}/missions` }),
  })

  if (isLoading) {
    return (
      <Text size="sm" color={MUTED}>
        {t('loading')}
      </Text>
    )
  }

  // ⚠️ « Cassé » et « non mesurable » se ressemblent trop pour qu'on les
  // confonde : une lecture en échec le DIT, elle ne rend pas un écran vide qui
  // se lirait « ce client ne vous a jamais rien acheté ».
  if (isError || !data) {
    return (
      <Text size="sm" color={MUTED}>
        {t('loadError')}
      </Text>
    )
  }

  // ⚠️ Les CINQ blocs, pas trois : `notRenewed` est en principe un
  // sous-ensemble de `past`, mais une garde qui suppose une invariante du
  // serveur devient fausse le jour où le serveur change. On lit ce qu'on a.
  const nothing =
    data.active.length === 0 &&
    data.past.length === 0 &&
    data.placedConsultants.length === 0 &&
    data.notRenewed.length === 0 &&
    data.buying === null

  return (
    <Box className="space-y-4">
      {/* #2124.30/.31 (lot M1-9) — « Ajouter une mission » et « Importer mon
          historique » restent disponibles MÊME sur un compte sans mission :
          le geste empêché était justement de ne les trouver que noyés dans
          un état totalement vide, ou nulle part. Chacune ouvre le flux
          EXISTANT — aucune nouvelle route. */}
      <QuickActions account={account} />

      {nothing ? (
        <EmptyState
          size="md"
          align="center"
          icon={<Briefcase className="h-10 w-10" />}
          title={t('empty.title')}
          description={t('empty.description')}
          // La SORTIE. Un état vide sans action est un cul-de-sac — cause racine
          // déjà payée ici (« une réponse juste sans chemin »). `/missions` existe
          // et c'est l'écran où une mission se crée.
          action={
            <Button asChild variant="outline" className="pointer-coarse:min-h-11">
              <Link to="/missions">{t('empty.action')}</Link>
            </Button>
          }
        />
      ) : (
        <>
          <SourceNote href={data.source.href} label={data.source.label} />
          <PaymentBehaviourBlock behaviour={data.paymentBehaviour} canReadFinance={data.canReadFinance} />
          <ActiveBlock rows={data.active} canReadFinance={data.canReadFinance} />
          <PastBlock rows={data.past} />
          <PlacedBlock rows={data.placedConsultants} />
          <BuyingBlock
            buying={data.buying}
            historicalInvoicedRevenueCents={data.historicalInvoicedRevenueCents}
            canReadFinance={data.canReadFinance}
          />
          <NotRenewedBlock rows={data.notRenewed} hasHistory={data.past.length > 0} />
        </>
      )}
      {/* #2422.4 (épopée #2869) — les contrats juridiques du compte. Rendu
          MÊME quand `nothing` (un compte peut porter un contrat-cadre avant
          sa première mission) — voir le docblock de `ContractsBlock`. */}
      <ContractsBlock
        accountId={account.id}
        // #2422.6 — les missions du compte, pour le sélecteur de « Demander
        // une pièce » (une mission + un contrat, jamais un compte entier).
        missions={[...data.active, ...data.past].map(row => ({ id: row.missionId, label: row.label }))}
      />
    </Box>
  )
}

/**
 * #2124.30/.31 — LES DEUX ACTIONS DIRECTES, TOUJOURS DISPONIBLES.
 *
 * Chacune ouvre un flux EXISTANT, trouvé plutôt que réécrit :
 *  · « Ajouter une mission » → `/missions/nouvelle` — la pleine page qui
 *    monte `NeedWizard` (même écriture que le dialogue de `/projects/needs`,
 *    `POST /projects/:id/needs`). Le TITRE dit « mission » ; la nuance
 *    vocabulaire est assumée et documentée dans `CreateMissionPage.tsx`.
 *  · « Importer mon historique » → `/settings/import`, le même assistant
 *    d'import générique que TabProjects propose déjà pour les projets.
 *
 * ⚠️ Aucune des deux ne préremplit le COMPTE (#2124.15) : ni `NeedWizard` ni
 * l'écran d'import n'acceptent de compte fixé par l'URL aujourd'hui — les
 * deux vivent hors du périmètre de ce lot (`CreateMissionPage.tsx`,
 * `NeedWizard.tsx`, `routes/settings/import.tsx`). Non livré, motif au
 * rapport plutôt qu'un faux prérempli.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2560 — LA TROISIÈME ACTION COMBLE EXACTEMENT CE TROU
 * ─────────────────────────────────────────────────────────────────────────────
 * « Créer depuis un document » n'ouvre ni `NeedWizard` ni l'import : elle
 * ouvre `CreateMissionFromDocumentDialog`, qui écrit directement
 * `POST /delivery/missions` avec l'`accountId` de CETTE fiche compte —
 * jamais deviné depuis le document, toujours celui d'où l'utilisateur clique.
 */
function QuickActions({ account }: { account: Account }) {
  const { t } = useTranslation('accountMissions')
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false)
  return (
    <Box className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
        <Link to="/missions/nouvelle">{t('quickActions.addMission')}</Link>
      </Button>
      <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
        <Link to="/settings/mes-donnees" search={{ tab: 'imports' }}>
          {t('quickActions.importHistory')}
        </Link>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="pointer-coarse:min-h-11"
        onClick={() => setDocumentDialogOpen(true)}
      >
        {t('quickActions.fromDocument')}
      </Button>
      <CreateMissionFromDocumentDialog
        accountId={account.id}
        accountName={account.company_name}
        open={documentDialogOpen}
        onOpenChange={setDocumentDialogOpen}
      />
    </Box>
  )
}

/* ── §4.4 rendu à l'écran ─────────────────────────────────────────────────── */

/**
 * Le lien vers la source, en toutes lettres.
 *
 * C'est la moitié VISIBLE de §4.4 : le serveur pose `editable: false`, mais
 * personne ne le lit à l'écran. Ce qu'un utilisateur doit comprendre, c'est
 * qu'une marge qui lui paraît fausse ne se corrige pas ici — et où elle se
 * corrige.
 */
function SourceNote({ href, label }: { href: string; label: string }) {
  const { t } = useTranslation('accountMissions')
  return (
    <Box display="flex" className="flex-wrap items-center gap-x-2 gap-y-1">
      <Text size="xs" color={MUTED}>
        {t('source.hint')}
      </Text>
      {/* `<a>` et non un `<div onClick>` : ce qui se clique se tabule (GA-35),
          et une cible tactile tient 44 px en pointeur grossier (GA-30). */}
      <a
        href={href}
        className="inline-flex items-center pointer-coarse:min-h-11 text-xs underline text-[var(--bellum-text-accent)]"
      >
        {label || t('source.link')}
      </a>
    </Box>
  )
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <Text size="xs" color={MUTED} className="uppercase tracking-wider">
          {title}
        </Text>
        {hint ? (
          <Text size="xs" color={MUTED}>
            {hint}
          </Text>
        ) : null}
        {children}
      </CardContent>
    </Card>
  )
}

/** Une valeur ABSENTE, nommée. Jamais « – » nu, jamais « 0 ». */
function Absent({ children }: { children: ReactNode }) {
  return (
    <Text element="span" size="sm" color={MUTED}>
      {children}
    </Text>
  )
}

/* ── Bloc 0 — comment ce client paie ──────────────────────────────────────── */

/**
 * « CE CLIENT PAIE MAL » — le dire AVANT la négociation, pas après.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ C'EST UN JUGEMENT SUR UN CLIENT. IL SE MESURE OU IL NE S'AFFICHE PAS.
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce qui s'affiche est un DÉCOMPTE, avec son dénominateur et sa période :
 * « 3 retards sur 11 factures, sur 12 mois ». Jamais un score, jamais une
 * probabilité, jamais un rang parmi les clients — on dit ce qui s'est passé sur
 * CE compte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUATRE ABSENCES, ET AUCUNE NE SE RESSEMBLE
 * ─────────────────────────────────────────────────────────────────────────────
 *  · pas le droit (`canReadFinance === false`) → « pas ton périmètre » ;
 *  · pas pu lire (`null` AVEC le droit) → l'écran DIT qu'il n'a pas su lire.
 *    « Cassé » et « non mesurable » se ressemblent trop pour qu'on les
 *    confonde, et annoncer « ce client n'a pas d'historique » sur une panne
 *    ferait négocier à l'aveugle ;
 *  · pas assez de factures → « pas assez d'historique pour mesurer », et le
 *    bloc dit combien il en manque ;
 *  · aucun retard, sur un dénominateur réel → `0`, qui est une MESURE, et une
 *    bonne nouvelle qu'on a le droit de dire.
 *
 * Le RETARD et le LITIGE ne se fondent pas : un client qui conteste ne paie pas
 * parce qu'il conteste, et les additionner ferait passer un désaccord pour de
 * la mauvaise volonté.
 */
function PaymentBehaviourBlock({
  behaviour,
  canReadFinance,
}: {
  behaviour: AccountMissions['paymentBehaviour']
  canReadFinance: boolean
}) {
  const { t } = useTranslation('accountMissions')

  if (behaviour === null) {
    return (
      <Block title={t('payment.title')}>
        <Text size="sm" color={MUTED}>
          {canReadFinance ? t('payment.unreadable') : t('payment.noAccess')}
        </Text>
      </Block>
    )
  }

  if (!behaviour.measurability.measurable || behaviour.lateCount === null || behaviour.disputedCount === null) {
    return (
      <Block title={t('payment.title')}>
        <Text size="sm" color={MUTED}>
          {t('payment.notEnoughHistory', {
            observed: behaviour.measurability.observed,
            required: behaviour.measurability.required,
          })}
        </Text>
        {behaviour.withoutDueDate > 0 ? <WithoutDueDate count={behaviour.withoutDueDate} /> : null}
      </Block>
    )
  }

  // Le seul cas où la teinte d'alerte est justifiée : un retard CONSTATÉ. Un
  // fond à opacité se compose sur le fond du thème, donc son texte suit le
  // thème lui aussi (`*-soft-text`).
  const flagged = behaviour.lateCount > 0
  const palette = flagged ? 'warning' : 'success'

  return (
    <Block title={t('payment.title')}>
      <Box
        className="rounded-md border p-3"
        style={{ background: `var(--${palette}-soft-bg)`, borderColor: `var(--${palette}-soft-border)` }}
      >
        <Text element="p" size="sm" weight="medium" color={`var(--${palette}-soft-text)`}>
          {flagged
            ? t('payment.late', { count: behaviour.lateCount, total: behaviour.invoiceCount })
            : t('payment.onTime', { count: behaviour.invoiceCount })}
        </Text>
        <Text element="p" size="xs" color={`var(--${palette}-soft-text)`}>
          {t('payment.window', { months: behaviour.windowMonths })}
        </Text>
        {/* Le litige se dit à PART, toujours — y compris à zéro quand il y a des
            retards : « aucun litige » explique alors que le retard n'est pas un
            désaccord, et c'est l'information qui change l'appel. */}
        <Text element="p" size="xs" color={`var(--${palette}-soft-text)`}>
          {behaviour.disputedCount > 0
            ? t('payment.disputed', { count: behaviour.disputedCount, total: behaviour.invoiceCount })
            : t('payment.noDispute')}
        </Text>
      </Box>
      {behaviour.withoutDueDate > 0 ? <WithoutDueDate count={behaviour.withoutDueDate} /> : null}
    </Block>
  )
}

/** Les factures écartées faute d'échéance : COMPTÉES, jamais absorbées — sinon
 *  un historique mal daté se lirait comme un historique propre. */
function WithoutDueDate({ count }: { count: number }) {
  const { t } = useTranslation('accountMissions')
  return (
    <Text element="p" size="xs" color={MUTED}>
      {t('payment.withoutDueDate', { count })}
    </Text>
  )
}

/* ── Bloc 1 — missions actives ────────────────────────────────────────────── */

function ActiveBlock({ rows, canReadFinance }: { rows: ActiveMissionRow[]; canReadFinance: boolean }) {
  // #2124.23/.24 — le namespace `missions` porte déjà les libellés courts du
  // statut de renouvellement (`renewal.*`) et des risques (`table.riskKinds.*`,
  // ceux du tableau `/missions`) : les réutiliser ici évite d'écrire une
  // deuxième traduction de la même échelle.
  const { t } = useTranslation(['accountMissions', 'missions'])
  // #2195.8 — la fenêtre se lit en JOURS depuis l'échelle de l'espace, et la
  // dérivation vit à un seul endroit (`renewalWindowLabel.ts`). `tMissions` est
  // le même `t`, borné au namespace que la dérivation attend.
  const { t: tMissions } = useTranslation('missions')
  const { data: windows } = useRenewalWindows()
  return (
    <Block title={t('active.title')} hint={t('active.hint')}>
      {rows.length === 0 ? (
        <Text size="sm" color={MUTED}>
          {t('active.empty')}
        </Text>
      ) : (
        // ⚠️ Le tableau défile dans SON conteneur, jamais le corps de la page.
        <Box className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={HEAD}>{t('active.columns.label')}</TableHead>
                <TableHead className={cn(HEAD, 'max-lg:hidden')}>{t('active.columns.consultants')}</TableHead>
                {/* #2124.19 — même clé que le panneau Contacts d'une mission
                    (`planningPanel.contacts.businessManager`, namespace
                    `accountMissions`) : un seul libellé pour le même rôle,
                    pas un second créé ici. */}
                <TableHead className={cn(HEAD, 'max-xl:hidden')}>
                  {t('planningPanel.contacts.businessManager')}
                </TableHead>
                <TableHead className={cn(HEAD, 'max-xl:hidden')}>{t('active.columns.period')}</TableHead>
                <TableHead className={HEAD}>{t('active.columns.daysRemaining')}</TableHead>
                <TableHead className={cn(HEAD, 'max-md:hidden')}>{t('active.columns.rate')}</TableHead>
                <TableHead className={cn(HEAD, 'max-md:hidden')}>{t('active.columns.margin')}</TableHead>
                <TableHead className={cn(HEAD, 'max-lg:hidden')}>{t('active.columns.nextAction')}</TableHead>
                {/* #2124.23 — le STATUT, distinct de `nextAction` qui est un
                    GESTE : `far` n'a aucune action, mais c'est une réponse. */}
                <TableHead className={cn(HEAD, 'max-xl:hidden')}>{t('active.columns.renewal')}</TableHead>
                {/* #2124.24 — voir `visibleMissionRisks` : partiel et assumé. */}
                <TableHead className={cn(HEAD, 'max-xl:hidden')}>{t('active.columns.risks')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.missionId}>
                  <TableCell className={CELL}>
                    {/* LE LIBELLÉ OUVRE LE DOSSIER DE LA MISSION (F1 · mention).
                        Il était du `<Text>` mort : depuis la fiche du compte, la
                        seule façon d'ouvrir une de ses missions était de repartir
                        vers `/missions` et de la retrouver dans la liste — c'est
                        justement le contexte qu'on venait de construire qu'on
                        perdait. La primitive, et pas un `<Link>` écrit à la
                        main : quinze mentions de compte à la main dans quatorze
                        fichiers sont exactement ce qu'elle existe pour fermer. */}
                    <ObjectMention kind="mission" id={row.missionId} name={row.label} />
                    <Text element="p" size="xs" color={MUTED}>
                      {row.roleTitle ? row.roleTitle : t('unknown.noRole')}
                    </Text>
                  </TableCell>
                  <TableCell className={cn(CELL, 'max-lg:hidden')}>
                    <Consultants people={row.consultants} />
                  </TableCell>
                  <TableCell className={cn(CELL, 'max-xl:hidden')}>
                    {/* #2124.19 — `owner_id`, jamais un contact client. */}
                    {row.businessManagerName === null ? (
                      <Absent>{t('planningPanel.contacts.unknown')}</Absent>
                    ) : (
                      <Text element="span" size="sm">
                        {row.businessManagerName}
                      </Text>
                    )}
                    {/* #2836 (#2124.20) — le MANAGER CLIENT, l'autre moitié du
                        binôme : un contact du compte. Non désigné = AUCUNE
                        ligne (on n'affiche pas ce qu'on n'a pas). */}
                    {row.clientManagerName === null ? null : (
                      <Text element="p" size="xs" color={MUTED}>
                        {t('planningPanel.contacts.clientManager')} · {row.clientManagerName}
                      </Text>
                    )}
                  </TableCell>
                  <TableCell className={cn(CELL, 'max-xl:hidden')}>
                    <Period startedOn={row.startedOn} endsOn={row.endsOn} />
                  </TableCell>
                  <TableCell className={CELL}>
                    <DaysRemaining days={row.daysRemaining} />
                  </TableCell>
                  <TableCell className={cn(CELL, 'max-md:hidden')}>
                    {/* Le prix de VENTE, sans condition de droit. */}
                    {row.soldDailyRateCents === null ? (
                      <Absent>{t('unknown.noRate')}</Absent>
                    ) : (
                      <Text element="span" size="sm">
                        {formatCents(row.soldDailyRateCents)}
                      </Text>
                    )}
                  </TableCell>
                  <TableCell className={cn(CELL, 'max-md:hidden')}>
                    <Margin percent={row.marginPercent} canReadFinance={canReadFinance} />
                  </TableCell>
                  {/* LA PROCHAINE ACTION, EN LIEN (fiche de lecture du 26/08).
                      Elle mène au dossier de la mission, où la date de fin se
                      pose et le renouvellement se décide. `none` — « rien à
                      engager maintenant » — n'a AUCUNE destination : c'est un
                      constat, et un lien y promettrait un geste qui n'existe
                      pas. La dérivation le tranche, pas cette cellule. */}
                  <TableCell className={cn(CELL, 'max-lg:hidden')}>
                    <NextAction
                      action={{ domain: 'active_mission', action: row.nextAction, missionId: row.missionId }}
                    />
                  </TableCell>
                  <TableCell className={cn(CELL, 'max-xl:hidden')}>
                    <Text element="span" size="sm">
                      {/* #2195.8 — la fenêtre se LIT en jours, depuis l'échelle de
                          l'espace : « J-20 » chez qui règle vingt jours. */}
                      {renewalWindowBadge(tMissions, row.renewal, windows?.days)}
                    </Text>
                  </TableCell>
                  <TableCell className={cn(CELL, 'max-xl:hidden')}>
                    <Risks row={row} canReadFinance={canReadFinance} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Block>
  )
}

/**
 * #2124.24 — LES RISQUES IDENTIFIÉS, EN BADGES NOMMÉS.
 *
 * `visibleMissionRisks` (voir sa doc) est PARTIEL et assumé : elle compose
 * `renewal` et `marginPercent`, déjà envoyés, sans recalculer ni deviner
 * `timesheet_disputed`/`timesheet_missing` — absents du contrat reçu ici.
 *
 * Trois états, et aucun ne se confond : `null` = non calculé (mission
 * suspendue — reprend le libellé du tableau `/missions`, même phrase) ;
 * `[]` = calculé, rien à signaler ; sinon, un badge par risque.
 */
function Risks({ row, canReadFinance }: { row: ActiveMissionRow; canReadFinance: boolean }) {
  const { t } = useTranslation('missions')
  const risks: MissionRisk[] | null = visibleMissionRisks(row, canReadFinance)

  if (risks === null) {
    return (
      <Text element="span" size="xs" color={MUTED}>
        {t('table.risksNotComputed')}
      </Text>
    )
  }
  if (risks.length === 0) {
    return (
      <Text element="span" size="sm" color={MUTED}>
        {t('table.noRisk')}
      </Text>
    )
  }
  return (
    <Box className="flex flex-wrap items-center gap-1">
      {risks.map(risk => (
        <Badge key={risk} variant="outline" className="whitespace-nowrap px-1 py-0 text-xs">
          {t(`table.riskKinds.${risk}`)}
        </Badge>
      ))}
    </Box>
  )
}

/**
 * La marge, ou la raison de son absence — et les deux raisons sont DIFFÉRENTES.
 *
 * Sans le droit : « pas ton périmètre ». Avec le droit mais sans coût chargé :
 * « marge non mesurée ». Les confondre ferait chercher la panne au mauvais
 * endroit — un commercial demanderait un droit qu'il a déjà, ou saisirait un
 * coût qu'il n'a pas le droit de voir.
 */
function Margin({ percent, canReadFinance }: { percent: number | null; canReadFinance: boolean }) {
  const { t } = useTranslation('accountMissions')
  if (!canReadFinance) {
    return (
      <Text element="span" size="sm" color={MUTED} title={t('unknown.marginNoAccessHelp')}>
        {t('unknown.marginNoAccess')}
      </Text>
    )
  }
  if (percent === null) {
    return (
      <Text element="span" size="sm" color={MUTED} title={t('unknown.marginNotMeasuredHelp')}>
        {t('unknown.marginNotMeasured')}
      </Text>
    )
  }
  return (
    <Text element="span" size="sm">
      {t('unknown.margin', { percent })}
    </Text>
  )
}

/** Les jours restants — `null` n'est pas « très loin », c'est « sans date de fin ». */
function DaysRemaining({ days }: { days: number | null }) {
  const { t } = useTranslation('accountMissions')
  if (days === null) {
    return (
      <Text element="span" size="sm" color={MUTED} title={t('unknown.noEndDateHelp')}>
        {t('unknown.noEndDate')}
      </Text>
    )
  }
  if (days < 0) {
    return (
      <Text element="span" size="sm">
        {t('active.overdue', { count: Math.abs(days) })}
      </Text>
    )
  }
  return (
    <Text element="span" size="sm">
      {t('active.days', { count: days })}
    </Text>
  )
}

function Period({ startedOn, endsOn }: { startedOn: string | null; endsOn: string | null }) {
  const { t } = useTranslation('accountMissions')
  const start = startedOn ? t('active.since', { date: formatDay(startedOn) }) : t('unknown.noStartDate')
  const end = endsOn ? t('active.until', { date: formatDay(endsOn) }) : t('unknown.noEndDate')
  return (
    <Text element="span" size="sm" color={MUTED}>
      {`${start} — ${end}`}
    </Text>
  )
}

function Consultants({ people }: { people: { consultantId: string; fullName: string }[] }) {
  const { t } = useTranslation('accountMissions')
  if (people.length === 0) return <Absent>{t('unknown.noConsultant')}</Absent>
  return (
    <Text element="span" size="sm">
      {people.map(person => person.fullName).join(', ')}
    </Text>
  )
}

/* ── Bloc 2 — missions passées ────────────────────────────────────────────── */

function PastBlock({ rows }: { rows: PastMissionRow[] }) {
  const { t } = useTranslation('accountMissions')
  return (
    <Block title={t('past.title')} hint={t('past.hint')}>
      {rows.length === 0 ? (
        <Text size="sm" color={MUTED}>
          {t('past.empty')}
        </Text>
      ) : (
        <>
          <Box className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={HEAD}>{t('past.columns.label')}</TableHead>
                  <TableHead className={cn(HEAD, 'max-lg:hidden')}>{t('past.columns.consultants')}</TableHead>
                  <TableHead className={cn(HEAD, 'max-xl:hidden')}>{t('past.columns.period')}</TableHead>
                  <TableHead className={HEAD}>{t('past.columns.endReason')}</TableHead>
                  <TableHead className={cn(HEAD, 'max-md:hidden')}>{t('past.columns.feedback')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.missionId}>
                    <TableCell className={CELL}>
                      <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
                        {row.label}
                      </Text>
                      <Text element="p" size="xs" color={MUTED}>
                        {row.roleTitle ? row.roleTitle : t('unknown.noRole')}
                      </Text>
                    </TableCell>
                    <TableCell className={cn(CELL, 'max-lg:hidden')}>
                      <Consultants people={row.consultants} />
                    </TableCell>
                    <TableCell className={cn(CELL, 'max-xl:hidden')}>
                      <Period startedOn={row.startedOn} endsOn={row.endsOn} />
                    </TableCell>
                    <TableCell className={CELL}>
                      {/* `null` = personne ne l'a écrit. Jamais une phrase de
                          remplissage, qui se lirait comme un motif réel. */}
                      {row.endReason ? (
                        <Text element="span" size="sm">
                          {row.endReason}
                        </Text>
                      ) : (
                        <Absent>{t('unknown.noEndReason')}</Absent>
                      )}
                    </TableCell>
                    <TableCell className={cn(CELL, 'max-md:hidden')}>
                      <Badge variant="outline" className="whitespace-nowrap px-1 py-0 text-xs">
                        {row.feedbackCollected ? t('past.feedbackCollected') : t('past.feedbackMissing')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          {/* Le retour lui-même ne se lit ni ne se saisit ici : loi 4, rien
              n'apparaît deux fois sous la même forme. On dit OÙ il vit. */}
          <Text size="xs" color={MUTED}>
            {t('past.feedbackWhere')}
          </Text>
        </>
      )}
    </Block>
  )
}

/* ── Bloc 3 — consultants placés ──────────────────────────────────────────── */

function PlacedBlock({ rows }: { rows: AccountMissions['placedConsultants'] }) {
  const { t } = useTranslation('accountMissions')
  return (
    <Block title={t('placed.title')} hint={t('placed.hint')}>
      {rows.length === 0 ? (
        <Text size="sm" color={MUTED}>
          {t('placed.empty')}
        </Text>
      ) : (
        <Box display="flex" className="flex-col gap-2">
          {rows.map(person => (
            <Box key={person.consultantId} display="flex" className="flex-wrap items-center gap-x-2 gap-y-1">
              <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
                {person.fullName}
              </Text>
              <Badge variant="outline" className="whitespace-nowrap px-1 py-0 text-xs">
                {t('placed.count', { count: person.missions })}
              </Badge>
              <Text size="xs" color={MUTED}>
                {person.firstStartedOn
                  ? t('placed.firstOn', { date: formatDay(person.firstStartedOn) })
                  : t('placed.firstUnknown')}
              </Text>
              <Text size="xs" color={MUTED}>
                {person.stillOnSite
                  ? t('placed.onSite')
                  : person.lastEndedOn
                    ? t('placed.lastEndedOn', { date: formatDay(person.lastEndedOn) })
                    : t('placed.lastEndUnknown')}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Block>
  )
}

/* ── Bloc 4 — ce que ce client achète ─────────────────────────────────────── */

function BuyingBlock({
  buying,
  historicalInvoicedRevenueCents,
  canReadFinance,
}: {
  buying: AccountMissions['buying']
  /** #2124.26 — réservé à un rôle autorisé : `null` veut dire deux choses
   *  différentes selon `canReadFinance` (voir plus bas). */
  historicalInvoicedRevenueCents: AccountMissions['historicalInvoicedRevenueCents']
  canReadFinance: boolean
}) {
  const { t } = useTranslation('accountMissions')
  // `null` = aucune mission. L'écran d'ensemble a déjà dit qu'il n'y a rien ;
  // afficher ici un bloc rempli de tirets ajouterait du bruit, pas de la vérité.
  if (buying === null) return null
  return (
    <Block title={t('buying.title')} hint={t('buying.hint')}>
      <Box display="flex" className="flex-col gap-3 sm:flex-row sm:flex-wrap">
        {/* #3711.17 — « Non mesuré » ne s'écrit que sous un score ou un axe : une moyenne absente est
            une absence dans une liste, elle ne fait AUCUNE ligne (doctrine 20/09). */}
        {buying.averageSoldDailyRateCents !== null ? (
          <Box className="min-w-0 flex-1">
            <Text size="xs" color={MUTED} className="uppercase tracking-wider">
              {t('buying.rate')}
            </Text>
            <Text element="p" size="lg" weight="semibold" color="text-[var(--bellum-text-primary)]">
              {formatCents(buying.averageSoldDailyRateCents)}
            </Text>
            <Text element="p" size="xs" color={MUTED}>
              {t('buying.onMissions', { count: buying.missions })}
            </Text>
            {/* La moyenne DIT quand elle est partielle. Une moyenne muette sur
              trois missions manquantes se lit comme une mesure complète. */}
            {buying.missionsWithoutRate > 0 ? (
              <Text element="p" size="xs" color={MUTED}>
                {t('buying.ratePartial', { count: buying.missionsWithoutRate })}
              </Text>
            ) : null}
          </Box>
        ) : null}

        {buying.averageDurationDays !== null ? (
          <Box className="min-w-0 flex-1">
            <Text size="xs" color={MUTED} className="uppercase tracking-wider">
              {t('buying.duration')}
            </Text>
            <Text element="p" size="lg" weight="semibold" color="text-[var(--bellum-text-primary)]">
              {t('buying.durationDays', { count: buying.averageDurationDays })}
            </Text>
            {buying.missionsWithoutDuration > 0 ? (
              <Text element="p" size="xs" color={MUTED}>
                {t('buying.durationPartial', { count: buying.missionsWithoutDuration })}
              </Text>
            ) : null}
          </Box>
        ) : null}

        <Box className="min-w-0 flex-1">
          <Text size="xs" color={MUTED} className="uppercase tracking-wider">
            {t('buying.roles')}
          </Text>
          {buying.roleTitles.length === 0 ? (
            <Text element="p" size="sm" color={MUTED}>
              {t('buying.rolesUnknown')}
            </Text>
          ) : (
            <Box display="flex" className="flex-wrap items-center gap-1 pt-1">
              {buying.roleTitles.map(role => (
                <Badge key={role.roleTitle} variant="outline" className="px-1 py-0 text-xs">
                  {`${role.roleTitle} · ${t('buying.roleCount', { count: role.missions })}`}
                </Badge>
              ))}
            </Box>
          )}
          {buying.missionsWithoutRoleTitle > 0 ? (
            <Text element="p" size="xs" color={MUTED}>
              {t('buying.rolesPartial', { count: buying.missionsWithoutRoleTitle })}
            </Text>
          ) : null}
        </Box>

        {/* #2124.26 — LE REVENU HISTORIQUE, réservé à un rôle autorisé. Les
            DEUX raisons d'un `null` ne se disent jamais pareil : sans le
            droit, « Pas ton périmètre » (même mot que le bloc paiement,
            juste au-dessus) ; avec le droit mais aucune facture, « non
            mesuré » — jamais un montant à 0 €. */}
        {!canReadFinance || historicalInvoicedRevenueCents !== null ? (
          <Box className="min-w-0 flex-1">
            <Text size="xs" color={MUTED} className="uppercase tracking-wider">
              {t('buying.historicalRevenue')}
            </Text>
            {!canReadFinance ? (
              <Text element="p" size="sm" color={MUTED}>
                {t('buying.historicalRevenueRestricted')}
              </Text>
            ) : (
              <Text element="p" size="lg" weight="semibold" color="text-[var(--bellum-text-primary)]">
                {formatCents(historicalInvoicedRevenueCents as number)}
              </Text>
            )}
          </Box>
        ) : null}
      </Box>
    </Block>
  )
}

/* ── Bloc 5 — ce qu'il ne renouvelle pas ──────────────────────────────────── */

function NotRenewedBlock({ rows, hasHistory }: { rows: AccountMissions['notRenewed']; hasHistory: boolean }) {
  const { t } = useTranslation('accountMissions')
  return (
    <Block title={t('notRenewed.title')} hint={t('notRenewed.hint')}>
      {rows.length === 0 ? (
        // Deux vides qui ne disent PAS la même chose : « rien n'est terminé ici »
        // et « tout ce qui s'est terminé a repris » se confondraient sous une
        // phrase unique, et la seconde est une bonne nouvelle.
        <Text size="sm" color={MUTED}>
          {hasHistory ? t('notRenewed.emptyAllResumed') : t('notRenewed.emptyNoHistory')}
        </Text>
      ) : (
        <Box display="flex" className="flex-col gap-3">
          {rows.map(row => (
            <Box key={row.missionId} display="flex" className="flex-col gap-0.5">
              <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
                {row.label}
              </Text>
              <Text size="xs" color={MUTED}>
                {row.endsOn ? t('notRenewed.endedOn', { date: formatDay(row.endsOn) }) : t('notRenewed.endedUndated')}
              </Text>
              <Text size="sm">{row.endReason ? row.endReason : t('unknown.noEndReason')}</Text>
              {/* `null` n'est pas `false` : « on ne sait pas » et « ce profil
                  n'a pas repris » ne se disent pas de la même façon. */}
              <Text size="xs" color={MUTED}>
                {row.sameRoleResumed === false
                  ? `${t('notRenewed.notResumed')} — ${row.roleTitle ?? ''}`.trim()
                  : row.roleTitle
                    ? t('notRenewed.unknownNoEndDate')
                    : t('notRenewed.unknownNoRole')}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Block>
  )
}

/**
 * Une date NUE (`2026-09-17`), formatée sans décalage de fuseau.
 *
 * ⚠️ `new Date('2026-09-17')` est interprété en UTC : dans un fuseau négatif,
 * `toLocaleDateString()` rend la VEILLE. Le piège a déjà été payé sur l'agenda.
 * On construit donc la date à midi LOCAL, qui ne bascule dans aucun sens.
 */
function formatDay(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return value
  return formatDate(new Date(year, month - 1, day, 12)) ?? value
}

/* ── Bloc 6 — contrats juridiques ─────────────────────────────────────────── */

/**
 * #2422.4 (épopée #2869, LAU-FINAL-136) — LE CONTRAT JURIDIQUE TYPÉ, premier
 * écran.
 *
 * Cinq écrivains de nuit consécutifs (24 au 27/09) ont vérifié qu'aucune
 * entité contrat n'existait — ce bloc en est l'APPELANT : sans lui, la table
 * `legal_contracts` livrée le même lot serait du code que personne n'appelle.
 *
 * Rendu MÊME sur un compte sans mission : un contrat-cadre se signe souvent
 * AVANT la première mission qu'il couvre.
 *
 * ⚠️ Lecture seule pour le contrat lui-même (§4.4) — `POST
 * .../contracts` existe et est testé (`legal-contract.service.spec.ts`), mais
 * aucun écran ne l'appelle encore : `reste`, voir le commentaire de #2869.
 */
function ContractsBlock({ accountId, missions }: { accountId: string; missions: { id: string; label: string }[] }) {
  const { t } = useTranslation('accountMissions')
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.accounts.contracts(accountId),
    queryFn: () =>
      apiFetch<
        (LegalContract & {
          lifecycle: LegalContractLifecycle
          noGo: { missionId: string; missionLabel: string | null; reason: LegalContractNoGoReason }[]
        })[]
      >({
        path: `/delivery/accounts/${accountId}/contracts`,
      }),
  })

  if (isLoading) return null
  // `Array.isArray`, jamais `!data` seul : une réponse mal formée (ou un test
  // qui ne mocke pas cette route) ne doit pas planter le rendu du reste de
  // l'onglet — elle se lit comme un échec de lecture, comme les autres blocs.
  if (isError || !Array.isArray(data)) {
    return (
      <Block title={t('contracts.title')}>
        <Text size="sm" color={MUTED}>
          {t('contracts.loadError')}
        </Text>
      </Block>
    )
  }

  return (
    <Block title={t('contracts.title')} hint={t('contracts.hint')}>
      {data.length === 0 ? (
        <Text size="sm" color={MUTED}>
          {t('contracts.empty')}
        </Text>
      ) : (
        <Box display="flex" className="flex-col gap-3">
          {data.map(contract => (
            <Box key={contract.id} display="flex" className="flex-col gap-0.5">
              <Box display="flex" className="flex-wrap items-center gap-2">
                <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
                  {contract.label}
                </Text>
                <LifecycleBadge lifecycle={contract.lifecycle} />
              </Box>
              <Text size="xs" color={MUTED}>
                {t(`contracts.types.${contract.type}`)} · {contract.counterpartyName}
              </Text>
              <Text size="xs" color={MUTED}>
                {contract.startsOn
                  ? t('active.since', { date: formatDay(contract.startsOn) })
                  : t('unknown.noStartDate')}
                {' — '}
                {contract.endsOn ? t('active.until', { date: formatDay(contract.endsOn) }) : t('unknown.noEndDate')}
              </Text>
              {contract.ownerName ? (
                <Text size="xs" color={MUTED}>
                  {t('contracts.owner', { name: contract.ownerName })}
                </Text>
              ) : null}
              {/* #2422.10 — les pièces QUE CE LECTEUR peut voir : le serveur ne
                  rend jamais les autres (`visibleLegalContractDocuments`), donc
                  aucune ligne masquée n'est dessinée ici. La portée ne s'écrit
                  que pour une pièce restreinte — pas un badge par ligne. */}
              {contract.documents.map(document => (
                <Box key={`${document.label}-${document.version}`} display="flex" className="flex-col gap-0">
                  <Text size="xs" weight="semibold" color="text-[var(--bellum-text-primary)]">
                    {t('contracts.documents.line', { label: document.label, version: document.version })}
                  </Text>
                  <Text size="xs" color={MUTED}>
                    {document.signedAt
                      ? t('contracts.documents.signed', { date: formatDay(document.signedAt) })
                      : t('contracts.documents.unsigned')}
                    {document.expiresOn
                      ? ` · ${t('contracts.documents.expires', { date: formatDay(document.expiresOn) })}`
                      : ''}
                  </Text>
                  {document.visibility && document.visibility !== 'workspace' ? (
                    <Text size="xs" color={MUTED}>
                      {t(`contracts.documents.visibility.${document.visibility}`)}
                    </Text>
                  ) : null}
                </Box>
              ))}
              <ContractDocumentForm accountId={accountId} contractId={contract.id} />
              {/* #2422.6 — « Demander une pièce » : le lien signé à portée
                  limitée, qu'un contact EXTERNE (client, partenaire) sans
                  compte BellumAI peut utiliser pour déposer une pièce. */}
              <ContractUploadLinkPanel accountId={accountId} contractId={contract.id} missions={missions} />
              {/* #2422.11 — le NO-GO croisé côté serveur (`legalContractChainNoGo`
                  via `LegalContractService.list`) : une facture partie sous la
                  mauvaise société, ou sans passer par le partenaire que ce
                  contrat nomme. Une ligne par mission concernée — jamais un
                  compte agrégé qui nommerait « des missions » sans dire lesquelles. */}
              {contract.noGo.map(item => (
                <Text key={item.missionId} size="xs" color="text-[var(--danger-soft-text)]">
                  {t(`contracts.noGo.${item.reason}`, { mission: item.missionLabel ?? t('unknown.missionLabel') })}
                </Text>
              ))}
            </Box>
          ))}
        </Box>
      )}
    </Block>
  )
}

/** Le cycle de vie DÉRIVÉ (`legalContractLifecycle`), en badge — jamais le
 *  statut déclaré seul : un contrat `signed` mais expiré ne doit pas se lire
 *  « signé » sans plus, ce serait taire la seule chose qui compte à l'écran. */
function LifecycleBadge({ lifecycle }: { lifecycle: LegalContractLifecycle }) {
  const { t } = useTranslation('accountMissions')
  const palette: 'success' | 'warning' | 'neutral' =
    lifecycle === 'active' ? 'success' : lifecycle === 'expiring_soon' ? 'warning' : 'neutral'
  return (
    <Badge
      variant="outline"
      className="whitespace-nowrap px-1 py-0 text-xs"
      style={
        palette === 'neutral'
          ? undefined
          : { background: `var(--${palette}-soft-bg)`, borderColor: `var(--${palette}-soft-border)` }
      }
    >
      {t(`contracts.lifecycle.${lifecycle}`)}
    </Badge>
  )
}
