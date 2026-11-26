import {
  Badge,
  Box,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  TYPE_SCALE,
  TabNav,
  Text,
  type TabNavItem,
} from '@bellum/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarCheck,
  CalendarDays,
  Ellipsis,
  FilePlus2,
  Flag,
  Link2,
  MapPin,
  Sparkles,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { CreateNeedDialog } from '@/features/projects/open-needs/view/CreateNeedDialog'
import { Provenance } from '@/components/primitives/Provenance'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { NextAction } from '@/components/primitives/NextAction'
import { CustomerPage } from '@/components/page/CustomerPage'
import { formatDate } from '@/lib/locale'
import { assigneesOf, useMission, useMissionFieldSources, type MissionFieldSources, type MissionView } from '../api'
import { PrivateSwitch } from '@/components/access/PrivateSwitch'
import { missionEntryContext } from '../missionEntryContext'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { ChainProgressBlock } from '@/features/chains/view/ChainProgressBlock'
import { MissionChainStrip } from '../chain/view/MissionChainStrip'
import { MissionDetailTabs, type MissionTab } from './MissionDetailTabs'
import { CreateMissionActionButton } from './CreateMissionActionButton'
import { MissionBusinessUnitLine } from './MissionBusinessUnitLine'
import { MissionPointClientDialog } from './MissionPointClientDialog'
import { isFinishedMission } from '../mission-status'
import { isoDay } from '../planning'
import { knownRenewalStatus, missionSituation, type MissionSituation } from '../planning-views'
import { MissionLifecycleDialog, canRunLifecycle } from './MissionLifecycleActions'
import { PageRecordLinks } from '@/features/records/PageRecordLinks'
import { MissionPrimaryActionBanner } from './MissionPrimaryActionBanner'
import { MissionStartBlockers } from './MissionStartBlockers'
import { missionRecapRows } from './missionRecap'
import { useDataExit } from '@/lib/data-exit'
import { toCsv } from '@/lib/csv'
import { downloadCSV } from '@/lib/export-csv'
import { MissionLifecycleStrip } from '../lifecycle/MissionLifecycleStrip'
import { MissionMeetingPrepCard } from './MissionMeetingPrepCard'
import { MissionEndChecklistPanel } from './MissionEndChecklistPanel'
import { MissionDeliveryMilestonesPanel } from './MissionDeliveryMilestonesPanel'
import { MissionInterruptionPanel } from './MissionInterruptionPanel'
import { MissionRepositioningPanel } from './MissionRepositioningPanel'

/**
 * LE DOSSIER D'UNE MISSION — l'adresse qui manquait (D200, 30/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * La mission avait SIX routes — `/missions`, `/missions/board`, `/missions/cra`,
 * `/missions/facturation`, `/missions/encaissements`, `/missions/planification`
 * — et toutes les six sont des LISTES. Aucune n'ouvre UNE mission. Le contenu
 * existait pourtant depuis des semaines : cinq onglets, quatre routes d'API.
 * Ce qui manquait était une ADRESSE.
 *
 * Conséquences mesurées avant ce lot : une mission ne pouvait être ni partagée
 * par lien, ni ouverte dans un onglet, ni mise en favori, ni MENTIONNÉE ailleurs
 * dans le produit — l'action d'une mention est « ouvrir », et il n'y avait rien
 * à ouvrir. Son libellé était du texte mort dans cinq écrans.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ IL NE RÉÉCRIT PAS LE TIROIR — LES DEUX SONT LE MÊME COMPOSANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Les cinq onglets viennent de `MissionDetailTabs`, que le tiroir rend aussi.
 * Un second composant qui rendrait la même mission divergerait du premier en
 * trois semaines : c'est la loi 4 du tome 7 (« rien n'apparaît deux fois sous la
 * même forme avec le même contenu »), et la garde `mission-dossier-single-render`
 * la tient ici.
 *
 * Les DEUX formes restent : un tiroir se ferme et rend la liste qu'on lisait,
 * un dossier se garde. C'est la matrice objet × forme du tome 7, pas une
 * redondance.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ IL LIT LA MÊME LIGNE QUE LA LISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `useMission` passe par `GET /delivery/missions?id=…` : même `SELECT`, même
 * décoration, même rédaction financière. Une seconde route serveur aurait
 * fabriqué la seconde vérité. Et l'espace reste dans le `where` à côté de
 * l'identité — un dossier ouvert par une URL est exactement l'endroit où une
 * isolation manquante se paie.
 */
export function MissionDossierPage({ missionId }: { missionId: string }) {
  const { t } = useTranslation('missions')
  const { mission, isPending, isError, notFound, refetch } = useMission(missionId)

  // #2953 (#2193.54) — CE QUE CET ÉCRAN DÉCLARE MONTRER À LAURA (bulle).
  //
  // ⚠️ AVANT les retours anticipés : un hook conditionnel casserait l'ordre des
  // hooks au premier chargement qui aboutit — même règle que `NeedDetailPage`.
  useLauraContext(missionEntryContext({ t, mission: mission ?? null, isPending }))

  if (isPending) {
    return (
      <CustomerPage pageTitle={t('dossier.loading')}>
        <Text size="sm" className="py-6 text-[var(--bellum-text-muted)]">
          {t('dossier.loading')}
        </Text>
      </CustomerPage>
    )
  }

  // ⚠️ Deux vides, deux phrases. « Je n'ai pas pu lire » envoie réessayer ;
  // « cette mission n'est pas dans cet espace » envoie chercher ailleurs. Les
  // confondre ferait recharger une page qui ne changera jamais — ou abandonner
  // une lecture qui aurait marché au second essai.
  if (isError) {
    return (
      <CustomerPage pageTitle={t('dossier.errorTitle')}>
        <Card className="p-6">
          <Text size="sm">{t('dossier.errorBody')}</Text>
          <Box display="flex" className="mt-3 flex-wrap gap-2">
            <Button size="sm" className="pointer-coarse:min-h-11" onClick={() => void refetch()}>
              {t('dossier.retry')}
            </Button>
            <BackToList />
          </Box>
        </Card>
      </CustomerPage>
    )
  }

  if (notFound || !mission) {
    return (
      <CustomerPage pageTitle={t('dossier.missingTitle')}>
        <Card className="p-6">
          <Text size="sm">{t('dossier.missingBody')}</Text>
          <Box className="mt-3">
            <BackToList />
          </Box>
        </Card>
      </CustomerPage>
    )
  }

  return <Dossier mission={mission} />
}

/** Le retour à la liste, écrit UNE fois : trois états l'offrent. */
function BackToList() {
  const { t } = useTranslation('missions')
  return (
    <Button size="sm" variant="ghost" asChild className="gap-1.5 pointer-coarse:min-h-11">
      <Link to="/missions">
        <ArrowLeft className="size-4" aria-hidden />
        {t('dossier.backToList')}
      </Link>
    </Button>
  )
}

function Dossier({ mission }: { mission: MissionView }) {
  const { t } = useTranslation('missions')
  const navigate = useNavigate()
  const [tab, setTab] = useState<MissionTab>('overview')
  const [pointOpen, setPointOpen] = useState(false)
  const [reliefOpen, setReliefOpen] = useState(false)
  const today = isoDay(new Date())
  const situation = missionSituation(
    {
      startedOn: mission.started_on,
      endsOn: mission.ends_on,
      renewalStatus: knownRenewalStatus(mission.renewal_status),
    },
    today,
  )
  const finished = isFinishedMission(mission.status)

  const tabs: TabNavItem[] = [
    { key: 'overview', label: t('tabs.overview') },
    { key: 'staffing', label: t('tabs.staffing') },
    { key: 'terms', label: t('tabs.terms') },
    { key: 'scores', label: t('tabs.scores') },
    { key: 'history', label: t('tabs.history') },
  ]
  const { t: tBriefing } = useTranslation('briefing')

  return (
    <CustomerPage titleInScreen pageTitle={mission.label}>
      <Box className="flex flex-col gap-4 py-4">
        {/* Théo missions-dossier.R8 — la barre du haut : une phrase à gauche, la porte vers une relève ou un
            renfort à droite. Elle ne modifie JAMAIS l'affectation en cours : elle crée un besoin. */}
        <Box data-slot="dossier-relief" display="flex" className="flex-wrap items-center justify-between gap-2">
          <Text element="span" size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('dossier.relief.hint')}
          </Text>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5 border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)] pointer-coarse:min-h-11"
            onClick={() => setReliefOpen(true)}
          >
            <Users className="size-4" aria-hidden />
            {t('dossier.relief.open')}
          </Button>
        </Box>
        <Button asChild size="sm" variant="ghost" className="-ms-2 gap-1.5 self-start pointer-coarse:min-h-11">
          <Link to="/missions/planification">
            <ArrowLeft className="size-4" aria-hidden />
            {t('dossier.backToPlanning')}
          </Link>
        </Button>

        {/* L'ENTÊTE : l'étiquette du type d'objet, le titre, le compte et la situation ; à droite le geste
            principal et le menu « ⋯ » qui porte le cycle (prolonger, terminer), l'export et le projet. */}
        <header data-slot="dossier-head" className="flex flex-wrap items-start justify-between gap-3">
          <Box className="min-w-0 space-y-2">
            <Text
              element="span"
              size="xs"
              weight="semibold"
              color="text-[var(--bellum-text-muted)]"
              className="block uppercase tracking-widest"
            >
              {t('dossier.eyebrow')}
            </Text>
            <Text element="h1" className={TYPE_SCALE.pageTitle}>
              {mission.label}
            </Text>
            <Box display="flex" className="flex-wrap items-center gap-2">
              {mission.accountName ? (
                <>
                  <CompanyAvatar
                    name={mission.accountName}
                    logoUrl={mission.accountLogoUrl}
                    website={mission.accountWebsite}
                  />
                  <Link to="/accounts/$id" params={{ id: mission.account_id }} className="text-sm hover:underline">
                    {mission.accountName}
                  </Link>
                </>
              ) : (
                // « Compte inconnu » n'est pas « pas de compte » : le NOM peut manquer quand le compte porteur
                // est hors du périmètre du lecteur.
                <Text element="span" size="sm">
                  {t('unknownAccount')}
                </Text>
              )}
              {mission.businessUnitName ? (
                <Text element="span" size="sm" color="text-[var(--bellum-text-secondary)]">
                  {'· '}
                  {mission.businessUnitName}
                </Text>
              ) : null}
              <Badge variant={finished ? 'default' : SITUATION_BADGE[situation]}>
                {finished ? t(`status.${mission.status}`) : t(`planning.screen.situation.${situation}`)}
              </Badge>
            </Box>
          </Box>
          <Box display="flex" className="shrink-0 flex-wrap items-center gap-1.5">
            {/* #4424.3 — la proposition de préparer le rendez-vous ne vit plus seulement sous le toast de
                création (une seconde, puis plus rien) : elle reste ici, sur le dossier. Un lien vers le
                panneau R1/R2 de la fiche du compte ; rien ne part seul. */}
            <Button size="sm" variant="outline" asChild className="gap-1.5 pointer-coarse:min-h-11">
              <Link to="/accounts/$id" params={{ id: mission.account_id }} search={{ tab: 'plan', prep: 'rdv' }}>
                <CalendarCheck className="size-3.5" aria-hidden="true" />
                {tBriefing('agenda.prepProposal.cta')}
              </Link>
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 pointer-coarse:min-h-11"
              onClick={() => setPointOpen(true)}
            >
              <CalendarDays className="size-4" aria-hidden />
              {t('dossier.pointClient.open')}
            </Button>
            <DossierMoreMenu mission={mission} />
          </Box>
        </header>

        <Box className="border-b border-border" role="navigation" aria-label={t('dossier.tabsLabel')}>
          <TabNav tabs={tabs} activeTab={tab} onTabChange={key => setTab(key as MissionTab)} size="sm" />
        </Box>

        {/* #4198 (L7) — l'affaire d'origine, le consultant, le compte : cliquables. */}
        <PageRecordLinks kind="mission" id={mission.id} />

        <Box className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Box className="min-w-0">
            <MissionDetailTabs
              mission={mission}
              hideNav
              tab={tab}
              onTabChange={setTab}
              extras={{
                overview: <OverviewExtras mission={mission} onPointClient={() => setPointOpen(true)} />,
                staffing: (
                  <>
                    {/* #2414.54-59 — le traitement d'une mission interrompue ; #2986 — le signal de repositionnement. */}
                    <MissionInterruptionPanel missionId={mission.id} status={mission.status} />
                    <MissionRepositioningPanel mission={mission} />
                    {/* #2414 — la checklist de sortie : NOMMÉE, jamais une porte. */}
                    <MissionEndChecklistPanel missionId={mission.id} status={mission.status} />
                  </>
                ),
              }}
            />
          </Box>
          <MissionRecordProps mission={mission} situation={situation} finished={finished} />
        </Box>
      </Box>
      {pointOpen ? (
        <MissionPointClientDialog mission={mission} open onOpenChange={open => !open && setPointOpen(false)} />
      ) : null}
      {reliefOpen ? (
        <CreateNeedDialog
          open
          onOpenChange={open => !open && setReliefOpen(false)}
          onCreated={need => {
            setReliefOpen(false)
            void navigate({ to: '/projects/needs/$needId', params: { needId: need.id } })
          }}
          initialTitle={t('dossier.relief.title', { mission: mission.label })}
          initialContext={t('dossier.relief.context', { mission: mission.label })}
          initialSkills={(mission.assignedSkills ?? []).join(', ')}
          initialAccountId={mission.account_id}
          initialAccountName={mission.accountName ?? undefined}
        />
      ) : null}
    </CustomerPage>
  )
}

/**
 * Théo missions-dossier — LE MENU « ⋯ » : le cycle (prolonger, terminer), l'export du récapitulatif et la
 * création d'un projet. Rien ne disparaît : chaque entrée ouvre le même dialogue ou la même porte que
 * les boutons d'avant. Les entrées qu'un droit ou un statut refuse ne s'affichent pas.
 */
function DossierMoreMenu({ mission }: { mission: MissionView }) {
  const { t } = useTranslation('missions')
  const dataExit = useDataExit()
  const [lifecycle, setLifecycle] = useState<'extend' | 'end' | null>(null)
  const running = canRunLifecycle(mission)
  const grant = dataExit.grant
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t('dossier.more')}
            className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          >
            <Ellipsis className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {running ? (
            <>
              <DropdownMenuItem onSelect={() => setLifecycle('extend')}>{t('lifecycle.extend')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setLifecycle('end')}>{t('lifecycle.end')}</DropdownMenuItem>
            </>
          ) : null}
          {grant ? (
            <DropdownMenuItem
              onSelect={() => downloadCSV(toCsv(missionRecapRows(mission, t)), `mission-${mission.id}.csv`, grant)}
            >
              {t('recap.export')}
            </DropdownMenuItem>
          ) : null}
          {/* #2711.1 — « créer un projet à la main depuis une mission » : le clic NAVIGUE, c'est le formulaire
              qui crée. */}
          <DropdownMenuItem asChild>
            <Link to="/projects" search={{ create: 1, account_id: mission.account_id, mission_id: mission.id }}>
              <FilePlus2 className="size-4" aria-hidden />
              {t('dossier.createProject')}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {lifecycle ? (
        <MissionLifecycleDialog mission={mission} kind={lifecycle} onClose={() => setLifecycle(null)} />
      ) : null}
    </>
  )
}

const SITUATION_BADGE = {
  running: 'success',
  renewal: 'warning',
  starting: 'primary',
  ending: 'warning',
} as const satisfies Record<MissionSituation, 'success' | 'warning' | 'primary'>

/**
 * Théo missions-dossier — LA SYNTHÈSE, EN TÊTE : l'identité (la personne, les dates, la frise du cycle de
 * vie), ce qui bloque le démarrage, les points de passage, puis « Prochaine étape ». Ce qui flottait en
 * vrac au-dessus des onglets (avant la refonte) vit maintenant ICI, dans l'onglet qui le concerne.
 */
function OverviewExtras({ mission, onPointClient }: { mission: MissionView; onPointClient: () => void }) {
  const { t } = useTranslation('missions')
  const people = assigneesOf(mission)
  const first = people[0]
  const date = (iso: string | null) =>
    iso ? (formatDate(iso, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) ?? iso) : null

  return (
    <>
      {/* Théo .identity — LA CARTE D'IDENTITÉ : la personne et son contrat, les dates en grand, l'objectif,
          puis la frise du cycle de vie. */}
      <section
        data-slot="dossier-identity"
        className="space-y-5 rounded-2xl border border-border bg-card p-5 md:p-6"
        aria-label={t('dossier.identity.label')}
      >
        <Box display="flex" className="items-start justify-between gap-3">
          {mission.assignees === null ? (
            <UnknownValue reason={t('dossier.hero.consultantUnread')} />
          ) : first ? (
            <Box className="flex items-center gap-3">
              <ContactAvatar name={first.fullName} photoUrl={first.photoUrl} size="lg" />
              <Box className="min-w-0">
                {first.id ? (
                  <Link to="/consultants/$id" params={{ id: first.id }} className="text-lg font-medium hover:underline">
                    {people.map(person => person.fullName).join(' · ')}
                  </Link>
                ) : (
                  <Text element="span" size="lg" weight="medium">
                    {people.map(person => person.fullName).join(' · ')}
                  </Text>
                )}
                {mission.role_title ? (
                  <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                    {mission.role_title}
                  </Text>
                ) : null}
              </Box>
            </Box>
          ) : (
            <UnknownValue reason={t('dossier.hero.consultantUnknown')} />
          )}
          <Badge variant="secondary" className="shrink-0">
            {t(`table.contractKinds.${mission.contract_kind}`)}
          </Badge>
        </Box>
        <dl className="flex items-end justify-between gap-3 border-y border-border py-4">
          <Box>
            <dt className="text-xs text-[var(--bellum-text-muted)]">{t('planning.screen.peek.start')}</dt>
            <dd className="text-xl font-medium tabular-nums">
              {date(mission.started_on) ?? <UnknownValue reason={t('table.startedOnUnknown')} />}
            </dd>
          </Box>
          <ArrowRight aria-hidden className="mb-1.5 size-4 text-[var(--bellum-text-muted)]" />
          <Box className="text-end">
            <dt className="text-xs text-[var(--bellum-text-muted)]">{t('planning.screen.peek.end')}</dt>
            <dd className="text-xl font-medium tabular-nums">{date(mission.ends_on) ?? t('noEndDate')}</dd>
          </Box>
        </dl>
        {/* L'objectif et le périmètre — ce qu'on a, seulement (on n'affiche pas ce qu'on n'a pas : ils se
            saisissent plus bas, dans « Modifier l'objectif et le périmètre »). */}
        {mission.objective ? <Text size="base">{mission.objective}</Text> : null}
        {mission.perimeter ? (
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {mission.perimeter}
          </Text>
        ) : null}
        <MissionLifecycleStrip mission={mission} />
      </section>

      {/* Théo .frame — « CADRE DE LA MISSION » : le mode de réalisation, le périmètre, puis les prérequis de
          démarrage repliés dessous (#2338 / #2409 + les manques de l'ancien écran ADV, dans UNE liste). */}
      <section
        data-slot="dossier-frame"
        className="space-y-4 rounded-2xl border border-border bg-card p-5 md:p-6"
        aria-label={t('dossier.frame.title')}
      >
        <Text element="h2" className={TYPE_SCALE.sectionTitle}>
          {t('dossier.frame.title')}
        </Text>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FrameTile
            label={t('dossier.frame.mode')}
            value={
              mission.contract_kind === 'forfait'
                ? t('dossier.frame.forfait')
                : people.length > 0
                  ? t('dossier.frame.staffed', { count: people.length })
                  : t('dossier.frame.unstaffed')
            }
            hint={
              mission.contract_kind === 'forfait'
                ? t('dossier.frame.forfaitHint')
                : people.length > 0
                  ? t('dossier.frame.staffedHint', { count: people.length })
                  : t('dossier.frame.unstaffedHint')
            }
          />
        </ul>
        <MissionStartBlockers missionId={mission.id} status={mission.status} label={mission.label ?? null} />
      </section>

      {/* #3269 (BEL-SC-240) — « Les points de passage » : les jalons de delivery. */}
      <MissionDeliveryMilestonesPanel missionId={mission.id} />

      {/* « Prochaine étape » — l'action principale (#2953) PRIORISE ce que les panneaux disent déjà ; la
          prochaine action de la ligne (#2193) s'écrit dessous ; deux gestes : le point client, une tâche. */}
      <section
        data-slot="dossier-next-step"
        className="space-y-3 rounded-2xl border border-border bg-card p-5 md:p-6"
        aria-label={t('dossier.nextStep.title')}
      >
        <Text element="h2" className={TYPE_SCALE.sectionTitle}>
          {t('dossier.nextStep.title')}
        </Text>
        <MissionPrimaryActionBanner mission={mission} />
        {mission.nextAction === undefined ? (
          <UnknownValue reason={t('table.nextActionUnread')} />
        ) : (
          <NextAction action={{ domain: 'active_mission', action: mission.nextAction, missionId: mission.id }} />
        )}
        <Box display="flex" className="flex-wrap items-center gap-2">
          <Button type="button" size="sm" className="gap-1.5 pointer-coarse:min-h-11" onClick={onPointClient}>
            <CalendarDays className="size-4" aria-hidden />
            {t('dossier.pointClient.open')}
          </Button>
          {/* Une tâche PARTAGÉE avec Actions et « Ma journée », pas copiée dans un second gestionnaire. */}
          <CreateMissionActionButton mission={mission} />
        </Box>
      </section>

      {/* DE LA SIGNATURE AU CASH (#2199.17) — la chaîne de LIVRAISON de CETTE mission : relevé, facturation,
          encaissement, repositionnement, et l'écran où chaque étape se répare. */}
      <MissionChainStrip mission={mission} />

      {/* #2407.3 — d'où viennent le client, l'intitulé, les dates et le TJM : jamais une source devinée. */}
      <MissionFieldSourcesLine missionId={mission.id} />
      {/* #4424.3 — la préparation du rendez-vous (pitch / R1), PERSISTANTE tant que le R1 n'a pas eu lieu. */}
      <MissionMeetingPrepCard accountId={mission.account_id} accountName={mission.accountName ?? null} />
      {/* #1505 — où en est cette mission dans le parcours : une LECTURE, aucun chemin d'écriture. */}
      <ChainProgressBlock subjectType="mission" subjectId={mission.id} />
      {/* #4158.34 — l'interrupteur « Privé » ; défaut partagé. */}
      <PrivateSwitch kind="missions" id={mission.id} isPrivate={mission.is_private} invalidate={[['missions']]} />
    </>
  )
}

/**
 * Théo missions-dossier — LES PROPRIÉTÉS, à droite : la situation, les dates, qui porte la mission, les
 * expertises, l'interlocuteur client, le lieu, la source, la BU — et « Échanger avec Laura ».
 *
 * ⚠️ Chaque champ vient d'une résolution qui existe déjà ailleurs (`ownerName`, `clientManagerName`,
 * `assignedSkills`, `opportunityLabel`…) : cette colonne ne calcule rien, elle les REND, une fois. Un champ
 * non renseigné est NOMMÉ (`UnknownValue`), jamais masqué ni à blanc (décision du 16/09/2026, #2193.3-8).
 */
function MissionRecordProps({
  mission,
  situation,
  finished,
}: {
  mission: MissionView
  situation: MissionSituation
  finished: boolean
}) {
  const { t } = useTranslation('missions')
  const startedOn = formatDate(mission.started_on, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const endsOn = formatDate(mission.ends_on, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const skills = mission.assignedSkills ?? []

  return (
    <aside
      data-slot="dossier-props"
      aria-label={t('dossier.props.label')}
      className="h-fit space-y-4 rounded-2xl border border-border bg-card p-4 text-sm lg:sticky lg:top-4"
    >
      <Prop icon={Flag} label={t('dossier.props.situation')} boxed>
        <Badge variant={finished ? 'default' : SITUATION_BADGE[situation]}>
          {finished ? t(`status.${mission.status}`) : t(`planning.screen.situation.${situation}`)}
        </Badge>
      </Prop>
      <Prop icon={CalendarDays} label={t('dossier.props.dates')} boxed>
        {startedOn ?? <UnknownValue reason={t('table.startedOnUnknown')} />}
        {' → '}
        {endsOn ?? t('noEndDate')}
      </Prop>
      <Prop icon={UserRound} label={t('dossier.props.owner')} boxed>
        {mission.ownerName ?? <UnknownValue reason={t('table.ownerUnknown')} />}
      </Prop>
      {skills.length > 0 ? (
        <Prop icon={Sparkles} label={t('dossier.props.skills')}>
          <ul className="flex flex-wrap gap-1.5">
            {skills.map(skill => (
              <li key={skill}>
                <Badge variant="default">{skill}</Badge>
              </li>
            ))}
          </ul>
        </Prop>
      ) : null}
      <Prop icon={Users} label={t('dossier.hero.clientManager')} boxed>
        {mission.clientManagerName === null || mission.clientManagerName === undefined ? (
          <UnknownValue reason={t('dossier.hero.clientManagerUnknown')} />
        ) : mission.clientManagerContactId ? (
          // #2193.59 — un contact RÉEL a une fiche : le nom seul refusait tout lien.
          <Link to="/contacts/$id" params={{ id: mission.clientManagerContactId }} className="hover:underline">
            {mission.clientManagerName}
          </Link>
        ) : (
          mission.clientManagerName
        )}
      </Prop>
      <Prop icon={MapPin} label={t('dossier.props.place')} boxed>
        {mission.location || mission.remote_preference ? (
          [mission.location, mission.remote_preference ? t(`table.remoteKinds.${mission.remote_preference}`) : null]
            .filter(Boolean)
            .join(' · ')
        ) : (
          <UnknownValue reason={t('table.locationUnknown')} />
        )}
      </Prop>
      <Prop icon={Link2} label={t('dossier.props.source')}>
        {mission.opportunityLabel && mission.opportunity_id ? (
          <Link to="/projects/$id" params={{ id: mission.opportunity_id }} className="hover:underline">
            {mission.opportunityLabel}
          </Link>
        ) : (
          (mission.opportunityLabel ?? <UnknownValue reason={t('table.originOpportunityUnknown')} />)
        )}
      </Prop>
      {/* #3413 « autre BU » — la BU propriétaire et le geste de transfert ; le journal se lit dans « Documents & suivi ». */}
      <Prop icon={Building2} label={t('overview.businessUnit')} boxed>
        <MissionBusinessUnitLine missionId={mission.id} />
      </Prop>
      <AskLaura
        question={t('dossier.props.lauraQuestion', { mission: mission.label, account: mission.accountName ?? '' })}
        label={t('dossier.props.laura')}
      />
    </aside>
  )
}

/** Une tuile du cadre : un libellé, une valeur en grand, une précision. */
function FrameTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <li className="min-w-0 space-y-1 rounded-card border border-border p-4">
      <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]" className="block">
        {label}
      </Text>
      <Text element="span" size="lg" weight="medium" className="block break-words">
        {value}
      </Text>
      {hint ? (
        <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]" className="block">
          {hint}
        </Text>
      ) : null}
    </li>
  )
}

function Prop({
  icon: Icon,
  label,
  children,
  boxed = false,
}: {
  icon: LucideIcon
  label: string
  children: React.ReactNode
  boxed?: boolean
}) {
  return (
    <Box className="min-w-0 space-y-1.5">
      <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]" className="flex items-center gap-1.5">
        <Icon aria-hidden className="size-3.5 shrink-0" />
        {label}
      </Text>
      {/* Théo — la valeur dans une case arrondie (un champ qu'on lit d'un coup d'œil).
          `div` et non `p` : `UnknownValue` rend déjà un `<p>`, et un `<p>` dans un `<p>` est du HTML invalide. */}
      <div
        className={
          boxed
            ? 'break-words rounded-control border border-border bg-[var(--bellum-surface-2)] px-3 py-2'
            : 'break-words'
        }
      >
        {children}
      </div>
    </Box>
  )
}

/**
 * #2407.3 — D'OÙ VIENNENT LE CLIENT, L'INTITULÉ, LES DATES ET LE TJM.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RÉFUTÉ EN PROD LE 23/09
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /delivery/missions/:id/field-sources` existait côté API depuis le
 * 22/09 soir — et ne couvrait que dates + TJM — SANS AUCUN appelant web : un
 * correctif de LECTURE est inerte si personne n'écrit, et ici personne ne
 * LISAIT non plus. `DeliveryService.create` trace désormais aussi le CLIENT
 * et l'INTITULÉ (`delivery.service.ts`), les deux seuls champs qui ne se
 * posent qu'à la création.
 *
 * `Provenance` (`@/components/primitives/Provenance`) est RÉUTILISÉE telle
 * quelle — la même primitive que les comptes et les projets, le même
 * catalogue `common:provenance.<source>` (GA-26) — plutôt que d'inventer un
 * second vocabulaire « CRM / import / saisi » pour la mission seule.
 *
 * ⚠️ `lieu`/`remote` de l'issue #2407 n'y figurent PAS : ce sont des champs de
 * l'AFFECTATION (`mission_assignments`, #2407.4, déjà livré), pas de la
 * mission — les y ajouter confondrait deux objets distincts.
 */
function MissionFieldSourcesLine({ missionId }: { missionId: string }) {
  const { t } = useTranslation('missions')
  const { data } = useMissionFieldSources(missionId)
  // Pendant le chargement, `data` est `undefined` : rien ne s'affiche plutôt
  // qu'une provenance devinée le temps d'une seconde requête.
  if (!data) return null

  // #2407.3 — RÉFUTÉ en prod le 23/09 (une deuxième fois, après le premier
  // correctif d'appelant) : cette ligne rendait les CINQ champs sans
  // condition, donc « provenance non renseignée » IDENTIQUE sur 3/3 missions
  // mesurées (LVMH, DASSAULT AVIATION, ROCHE) — aucune n'avait encore été
  // rejouée par `DeliveryService.updateMission`/`create` depuis que ce champ
  // se trace. Doctrine « on n'affiche pas ce qu'on n'a pas » : un champ
  // jamais tracé ne rend AUCUNE ligne, ni son libellé ni un placeholder.
  const allFields: readonly { key: keyof MissionFieldSources; label: string }[] = [
    { key: 'accountId', label: t('dossier.provenance.client') },
    { key: 'label', label: t('dossier.provenance.label') },
    { key: 'startedOn', label: t('dossier.provenance.startedOn') },
    { key: 'endsOn', label: t('dossier.provenance.endsOn') },
    { key: 'dailyRate', label: t('dossier.provenance.dailyRate') },
  ]
  const fields = allFields.filter(({ key }) => data[key] !== null)
  if (fields.length === 0) return null

  return (
    <Box
      display="flex"
      className="flex-wrap items-center gap-x-4 gap-y-1"
      aria-label={t('dossier.provenance.groupLabel')}
    >
      {fields.map(({ key, label }) => {
        const info = data[key]
        return (
          <Box key={key} display="flex" className="items-center gap-1">
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {label}
            </Text>
            <Provenance source={info?.source ?? null} observedAt={info?.at ?? null} />
          </Box>
        )
      })}
    </Box>
  )
}
