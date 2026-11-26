import { useMemo, useState, type ComponentType } from 'react'
import type {
  ActionHistoryCategory,
  DataHygiene,
  ManagerCoverageMap,
  ManagerCoverageSegment,
  ManagerMemberStats,
  ManagerPeriodDays,
  ManagerTeamStats,
  ManagerUnassignedAccount,
  TrendPoint,
} from '@bellum/contracts'
import { parseManagerPeriodDays } from '@bellum/contracts'
import { SelectField, Text } from '@bellum/ui'
import { AskLaura } from '@/components/primitives/AskLaura'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Building2, Lock, type LucideProps, Mail, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TrendLine } from '@/components/primitives/TrendLine'
import { CollapsedSection } from '@/components/disclosure/CollapsedSection'
import { HygieneBadge } from '@/components/hygiene/HygieneBadge'
import { pilotageApi } from '@/features/pilotage/api'
import { RitualsPanel } from '@/features/pilotage/view/RitualsPanel'
import { useSession } from '@/lib/hooks/use-session'
import { formatCount } from '@/lib/locale'
import { revealTargetProps } from '@/lib/reveal-target'
import { parseTeamSubtab, parseTeamTab, TEAM_TABS, type TeamTab } from '../lib/team-tabs'
import { useAssignAccount } from '../hooks/useAssignAccount'
import { TeamMonthProvider } from '../hooks/team-month'
import { useManagerStats } from '../hooks/useManagerStats'
import { useTeamComments } from '../hooks/useTeamComments'
import { ArbitrationQueue, TEAM_ANCHORS } from './cockpit/ArbitrationQueue'
import { CoachingPanel } from './cockpit/CoachingPanel'
import { PipelineValueCard } from './cockpit/PipelineValueCard'
import { PlaybooksCard } from './cockpit/PlaybooksCard'
import { RecentActivityFeed } from './cockpit/RecentActivityFeed'
import { RepsBoard } from './cockpit/RepsBoard'
import { SharedActionsQueue } from './cockpit/SharedActionsQueue'
import {
  TeamCap,
  TeamCounters,
  TeamLastMoves,
  TeamLauraGlance,
  TeamPriorities,
  TeamWhoCarries,
} from './cockpit/TeamBoardTheo'
import { TeamCommentsPanel } from './cockpit/TeamCommentsPanel'
import { TeamPulse } from './cockpit/TeamPulse'
import { TeamRoutinesPanel } from './cockpit/TeamRoutinesPanel'
import { ObjectivesPanel } from './cockpit/ObjectivesPanel'
import { TeamActorChip, TeamFilters, TeamSubTabs, TeamTabBar } from './team/TeamChrome'
import { TeamDealsReview } from './team/TeamDealsReview'
import { TeamPortfolios } from './team/TeamPortfolios'
import { TeamPotential } from './team/TeamPotential'

// i18n keys: pipeline.status.new | pipeline.status.contacted | pipeline.status.replied | pipeline.status.meeting |
// pipeline.status.won | pipeline.status.lost | pipeline.status.archived
const PIPELINE_STATUSES = ['new', 'contacted', 'replied', 'meeting', 'won', 'lost', 'archived']

// Les personas viennent de `contacts.decision_role` (taxonomie MEDDIC). On
// traduit ce qu'on connaît ; une valeur hors liste s'affiche telle quelle
// plutôt que de disparaître — le manager voit ce que la base contient vraiment.
// i18n keys: coverageMap.persona.<role>
const KNOWN_PERSONAS: readonly string[] = [
  'technical',
  'economic',
  'procurement',
  'user',
  'champion',
  'influencer',
  'blocker',
]

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ⚠️ RENVERSEMENT ASSUMÉ ET DATÉ — Louis 14/10/2026 (#4158, lot L7)
 * ═════════════════════════════════════════════════════════════════════════════
 * Cet écran a été, du 10/09 au 14/10/2026, fait de SEPT sections repliées par
 * défaut : « segmenter les parties de cette page et les replier par défaut »
 * (#1809), puis les sept intitulés Aujourd'hui / Semaine / Équipe / Pipe /
 * Staffing / Missions / Adoption (#2405.3, tranché le 22/09 soir). Ces deux
 * décisions sont RENVERSÉES, sciemment : « Je suis vraiment pas satisfait du
 * dashboard en lui-même, son contenu, sa présentation » — à l'arrivée, sept
 * accordéons fermés, on ne voyait rien. L'historique de #1809 et #2405.3 n'est
 * pas réécrit ; leur test (`ManagerDashboardPage.collapsed.test.tsx`) change de
 * sens, il ne disparaît pas.
 *
 * LA RÈGLE QUI LES REMPLACE : une PYRAMIDE INVERSÉE. Ce qui demande une action
 * en haut, l'état au milieu, le détail et l'historique en bas — et rien de
 * replié au-dessus de « Activité de l'équipe ». UNE période pour toute la page
 * (7 / 30 / 90 j, défaut 7), dans l'URL (`?periode=`).
 *
 *   1. En-tête (#4158.37) — le nom de l'ESN, les avatars, la période,
 *      « Préparer ma revue d'équipe » (Laura), « Gérer les membres ».
 *   2. À traiter (#4158 (complément BU)) — toujours ouvert, en premier.
 *   3. Pouls de l'équipe (#4158.39) — cinq indicateurs vs période précédente.
 *   4. Par commercial (#4158.40) — six colonnes, triées par NOM.
 *   5. Revue de pipeline (#4158.41) — remplace « Pipe ».
 *   6. Staffing (#4158.42) — besoins face aux disponibles, couverture.
 *   7. Activité de l'équipe (#4158.43) — le fil de la période.
 *   8. Détail replié (#4158.44) — Adoption, hygiène Missions, contacts.
 *
 * OÙ EST PASSÉ CHAQUE INDICATEUR DE L'ANCIEN ÉCRAN — ou pourquoi il est parti :
 *  - arbitrages d'« Aujourd'hui » → « À traiter », inchangés dans leur fond ;
 *  - doublons de couverture (« Staffing ») → « À traiter », une carte par compte ;
 *  - agenda de la semaine (« Semaine », #4158.45) → RETIRÉ de cet écran : le
 *    sélecteur de période le remplace ici, et l'agenda vit dans `/agenda`.
 *    L'API sert encore `agenda` (ajout seulement), l'écran ne le lit plus ;
 *  - table des membres → « Par commercial » (colonnes retirées : voir RepsBoard) ;
 *  - file d'actions partagées → sous la table « Par commercial », c'est le
 *    détail de ses colonnes « actions ouvertes / dont en retard » ;
 *  - coaching → sous la table, OUVERT et non replié. Tranché sans Louis : le
 *    brief le voulait replié, mais « rien de replié au-dessus de l'Activité »
 *    l'emporte, et il ne s'affiche que s'il porte un fait daté ;
 *  - pipeline valorisé, objectifs → « Revue de pipeline » ;
 *  - statuts des contacts (bande « Pipeline ») → « Contacts à traiter », replié ;
 *  - couverture, carte de couverture, comptes sans responsable → « Staffing » ;
 *  - hygiène Missions → replié en bas ;
 *  - fil d'activité, playbooks, routines, rituels, commentaires, crédits,
 *    totaux → « Activité de l'équipe » (le fil) et « Adoption » (le reste) ;
 *  - total « Analyses » (#4158.45) → RETIRÉ : il est dans le pouls. Les totaux
 *    Comptes / Contacts / Emails restent dans « Adoption », avec leur porte.
 *  - « N membres · vue consolidée » → les avatars de l'en-tête le disent.
 */
export function ManagerDashboardPage() {
  const { t } = useTranslation('manager')
  // #4158.37 — la période vient de l'URL ; une valeur trafiquée retombe sur 7 j. Théo D — l'onglet
  // (`onglet`) et son sous-onglet (`sous`) y vivent aussi : aucune route neuve, un lien se partage.
  const search = useSearch({ strict: false }) as { periode?: unknown; onglet?: unknown; sous?: unknown }
  const navigate = useNavigate()
  const period = parseManagerPeriodDays(search.periode)
  const requestedTab = parseTeamTab(search.onglet)
  // Un onglet dont l'écran n'existe pas encore (Recherches) n'est pas servi : on retombe sur la vue d'ensemble.
  const tab: TeamTab = SERVED_TABS.includes(requestedTab) ? requestedTab : 'vue'
  const sub = parseTeamSubtab(tab, search.sous)
  const { data, isLoading, error } = useManagerStats(period)
  const { user } = useSession()
  // La PORTÉE (toute l'équipe, ou une personne) et le MOIS des objectifs : des filtres de page, qui ne
  // changent jamais le rôle ni les droits de qui lit.
  const [memberId, setMemberId] = useState('')
  const months = useMemo(() => recentMonths(6), [])
  const [month, setMonth] = useState(months[0] ?? '')
  // Théo D team-vue.N4 — « Sujets partagés » relit le fil d'équipe existant.
  const comments = useTeamComments()
  // #2405.3 — l'hygiène Missions réutilise la MÊME lecture que la vue Qualité et
  // le panneau des rituels (`pilotage-hygiene`), jamais un second calcul (GA-26).
  const hygiene = useQuery({
    queryKey: ['pilotage-hygiene'],
    queryFn: pilotageApi.hygiene,
    staleTime: 60_000,
    retry: false,
  })
  const missionsLines = ((hygiene.data as DataHygiene | undefined)?.lines ?? []).filter(
    line => line.key === 'missions_without_end_date' || line.key === 'missions_without_cost',
  )
  const hasMissionsContent = missionsLines.some(line => line.count !== null)

  const choosePeriod = (next: ManagerPeriodDays) =>
    void navigate({ to: '/team', search: prev => ({ ...prev, periode: next }) })

  if (isLoading) {
    return <Centered>{t('states.loading')}</Centered>
  }
  if (error) {
    const status = error instanceof Error && typeof error.cause === 'number' ? error.cause : null
    if (status === 403) {
      return (
        <Centered>
          <Lock className="mb-3 size-6 text-[var(--bellum-text-muted)]" />
          {t('errors.forbidden')}
        </Centered>
      )
    }
    return <Centered>{t('errors.load')}</Centered>
  }
  if (!data) return null

  // Les libellés suivent la période RÉELLEMENT servie (pendant une relecture,
  // `keepPreviousData` montre encore l'ancienne — l'écran ne la renomme pas).
  const days = (data.period?.days as ManagerPeriodDays | undefined) ?? period
  const viewer = data.members.find(member => member.user_id === user?.id)
  // La portée restreint ce que la page MONTRE ; les chiffres d'équipe (cap, pipe) restent ceux de l'équipe.
  const members = memberId ? data.members.filter(member => member.user_id === memberId) : data.members
  const scopedActivity =
    data.period_activity && memberId
      ? {
          ...data.period_activity,
          items: data.period_activity.items.filter(event => event.user_id === memberId),
        }
      : data.period_activity

  return (
    // Pleine largeur : le `px-4 md:px-6 py-6` du conteneur de CustomerPage suffit.
    <TeamMonthProvider value={month === months[0] ? undefined : `${month}-01`}>
      <div className="w-full space-y-6">
        <BoardHeader
          tab={tab}
          sub={sub}
          members={data.members}
          viewerId={user?.id ?? null}
          viewerRole={viewer?.role ?? null}
          viewerName={viewer?.name ?? null}
        />

        <TeamTabBar
          tab={tab}
          tabs={TAB_ORDER}
          openActions={data.shared_actions?.open ?? null}
          period={search.periode === undefined ? undefined : period}
        />

        <TeamFilters
          members={data.members}
          memberId={memberId}
          onMember={setMemberId}
          month={month}
          onMonth={setMonth}
          months={months}
          period={period}
          onPeriod={choosePeriod}
          showPeriod={tab === 'objectifs' && sub === 'portefeuilles'}
        />

        {tab === 'vue' ? (
          <OverviewTab data={data} sharedTopics={comments.isSuccess ? comments.data.items.length : undefined} />
        ) : null}

        {tab === 'objectifs' ? (
          <>
            <TeamSubTabs tab={tab} sub={sub} />
            {sub === 'objectifs' ? <GoalsTab members={data.members} /> : null}
            {sub === 'affaires' ? (
              <>
                <TeamDealsReview review={data.pipeline_review} members={data.members} />
                {/* Gardé hors maquette (Louis tranche) : le pipeline valorisé par étape. */}
                {data.pipeline_value && data.pipeline_value.by_stage.length > 0 ? (
                  <PipelineValueCard pipeline={data.pipeline_value} />
                ) : null}
              </>
            ) : null}
            {sub === 'portefeuilles' ? <PortfoliosTab data={data} members={members} days={days} /> : null}
          </>
        ) : null}

        {tab === 'plans' ? <PlansTab data={data} currentUserId={user?.id ?? null} members={data.members} /> : null}

        {tab === 'activite' ? (
          <>
            <TeamSubTabs tab={tab} sub={sub} />
            {sub === 'journal' ? (
              <JournalTab
                data={data}
                members={members}
                days={days}
                activity={scopedActivity}
                hasMissionsContent={hasMissionsContent}
                onPeriod={choosePeriod}
              />
            ) : null}
            {sub === 'echanges' ? <TeamCommentsPanel members={data.members} /> : null}
          </>
        ) : null}

        <Text size="xs" className="text-center text-[var(--bellum-text-muted)]">
          {t('footer.hosting')}
        </Text>
      </div>
    </TeamMonthProvider>
  )
}

/** Les écrans de l'espace Équipe qui existent. `recherches` y entre avec son écran, pas avant. */
const SERVED_TABS: readonly TeamTab[] = ['vue', 'objectifs', 'plans', 'activite']
const TAB_ORDER: readonly TeamTab[] = TEAM_TABS.filter(tab => SERVED_TABS.includes(tab) || tab === 'administration')

/** Les `count` derniers mois, du plus récent au plus ancien, en `AAAA-MM`. */
function recentMonths(count: number): string[] {
  const now = new Date()
  return Array.from({ length: count }, (_, back) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
    return date.toISOString().slice(0, 7)
  })
}

/** Vue d'ensemble — le cap et les priorités, les compteurs, le potentiel à convertir, qui porte quoi. */
function OverviewTab({ data, sharedTopics }: { data: ManagerTeamStats; sharedTopics: number | undefined }) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <TeamCap members={data.members} />
        <TeamPriorities data={data} />
      </div>
      <TeamCounters data={data} sharedTopics={sharedTopics} />
      {/* Théo `t8-content-grid` : deux colonnes INDÉPENDANTES — à gauche le potentiel puis qui
          porte quoi, à droite le regard de Laura puis les derniers mouvements. Deux piles, pas
          une grille à rangées couplées : la hauteur d'un bloc ne creuse pas l'autre colonne. */}
      <div
        data-testid="team-overview-content"
        className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
      >
        <div data-testid="team-overview-main" className="space-y-4">
          <TeamPotential pipeline={data.pipeline_value} />
          <TeamWhoCarries members={data.members} />
        </div>
        <aside data-testid="team-overview-aside" className="space-y-4">
          <TeamLauraGlance data={data} />
          <TeamLastMoves data={data} />
        </aside>
      </div>
    </>
  )
}

/** Objectifs & affaires › Objectifs du mois — le cap, ce qu'il ne faut pas confondre, l'objectif choisi par chacun. */
function GoalsTab({ members }: { members: ManagerMemberStats[] }) {
  const { t } = useTranslation('manager')
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <TeamCap members={members} detail={false} />
        <section
          aria-label={t('board.confuse.title')}
          data-board-block="confuse"
          className="rounded-2xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4 md:p-6"
        >
          <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
            {t('board.confuse.title')}
          </Text>
          <ol className="mt-3 divide-y divide-[var(--bellum-border)]">
            {(['cap', 'won', 'cash'] as const).map((key, index) => (
              <li key={key} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--bellum-border)] text-xs text-[var(--bellum-text-secondary)]"
                >
                  {`0${index + 1}`}
                </span>
                <div>
                  <Text element="h3" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
                    {t(`board.confuse.${key}.title`)}
                  </Text>
                  <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                    {t(`board.confuse.${key}.body`)}
                  </Text>
                  {key === 'cash' ? (
                    <Link
                      to="/missions/encaissements"
                      className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
                    >
                      {t('board.confuse.cash.cta')}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
      {/* « Un objectif choisi, pas imposé en silence » : le titre, « Définir mon objectif » et les
          cartes par membre vivent dans `ObjectivesPanel`, un seul bloc. */}
      <ObjectivesPanel members={members} />
    </>
  )
}

/** Objectifs & affaires › Portefeuilles — qui porte quoi, ce qui demande un arbitrage, la couverture. */
function PortfoliosTab({
  data,
  members,
  days,
}: {
  data: ManagerTeamStats
  members: ManagerMemberStats[]
  days: ManagerPeriodDays
}) {
  return (
    <>
      <TeamPortfolios members={data.members} />
      {/* Gardés hors maquette (Louis tranche) : la file « À traiter », le pouls, « Par
          commercial » et la couverture vivaient ici avant Théo ; ils restent, sous la liste. */}
      <ArbitrationQueue data={data} />
      {data.pulse ? <TeamPulse pulse={data.pulse} days={days} /> : null}
      <RepsBoard members={members} days={days} />
      <StaffingBlock data={data} />
    </>
  )
}

/** Plans & actions — la file d'actions partagées et ce que les faits disent à un manager. */
function PlansTab({
  data,
  currentUserId,
  members,
}: {
  data: ManagerTeamStats
  currentUserId: string | null
  members: ManagerMemberStats[]
}) {
  return (
    <div className="space-y-6">
      {data.shared_actions ? (
        <div {...revealTargetProps(TEAM_ANCHORS.sharedActions)} className="scroll-mt-4 focus:outline-none">
          <SharedActionsQueue actions={data.shared_actions} members={members} currentUserId={currentUserId} />
        </div>
      ) : null}
      <CoachingPanel coaching={data.coaching} />
    </div>
  )
}

/** Activité & échanges › Journal d'activité — le fil de la période, puis l'adoption et l'hygiène. */
function JournalTab({
  data,
  members,
  days,
  activity,
  hasMissionsContent,
  onPeriod,
}: {
  data: ManagerTeamStats
  members: ManagerMemberStats[]
  days: number
  activity: ManagerTeamStats['period_activity']
  hasMissionsContent: boolean
  onPeriod: (next: ManagerPeriodDays) => void
}) {
  const { t } = useTranslation('manager')
  return (
    <div className="space-y-6">
      {/* Théo : le journal a SA barre d'outils (type de fait, période, export, journal
          d'administration) ; une période sans fait le DIT, jamais un onglet vide. */}
      <div {...revealTargetProps(TEAM_ANCHORS.activity)} className="scroll-mt-4 focus:outline-none">
        <RecentActivityFeed activity={activity} members={members} days={days} onPeriod={onPeriod} />
      </div>

      {/* #4158.44 — le détail et l'historique : sous le fil, repliés. */}
      <section aria-label={t('board.details.eyebrow')} data-board-block="details" className="space-y-3">
        <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
          {t('board.details.eyebrow')}
        </Text>
        <CollapsedSection title={t('board.details.adoption')}>
          <div className="space-y-6">
            {data.playbooks && data.playbooks.total > 0 ? <PlaybooksCard playbooks={data.playbooks} /> : null}
            {/* #2399.8 — `TeamRoutinesPanel` masque le bloc quand personne n'a de
                ligne matérialisée. */}
            {data.routines ? <TeamRoutinesPanel routines={data.routines} members={data.members} /> : null}
            {/* #1437 — les rituels d'équipe : organisation managériale. */}
            <RitualsPanel />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <TotalCard
                icon={Building2}
                label={t('totals.accounts')}
                value={data.totals.accounts}
                trend={data.trend?.accounts}
                to="/accounts"
              />
              <TotalCard
                icon={Users}
                label={t('totals.contacts')}
                value={data.totals.contacts}
                trend={data.trend?.contacts}
                to="/contacts"
              />
              <TotalCard
                icon={Mail}
                label={t('totals.emailsSent')}
                value={data.totals.emails_sent}
                trend={data.trend?.emails_sent}
                to="/actions"
                category="message"
              />
            </div>
            {/* #4463 — le bloc « Crédits & usage IA » est retiré : aucun crédit côté manager. */}
          </div>
        </CollapsedSection>

        {/* `HygieneBadge` porte ses propres quatre états ; la section disparaît
            seulement quand AUCUNE des deux lignes n'a pu être lue. */}
        {hasMissionsContent ? (
          <CollapsedSection title={t('board.details.missions')}>
            <div className="flex flex-wrap gap-2">
              <HygieneBadge
                check="missions_without_end_date"
                label={t('missionsHygiene.endDate')}
                hint={t('missionsHygiene.endDateHint')}
              />
              <HygieneBadge
                check="missions_without_cost"
                label={t('missionsHygiene.cost')}
                hint={t('missionsHygiene.costHint')}
              />
            </div>
          </CollapsedSection>
        ) : null}

        {data.pipeline.length > 0 ? (
          <CollapsedSection title={t('board.details.contacts')}>
            <PipelineStrip pipeline={data.pipeline} />
          </CollapsedSection>
        ) : null}
      </section>
    </div>
  )
}

/**
 * L'en-tête de l'espace Équipe, tel que Théo le dessine : « Le pilotage collectif » en
 * surtitre, le titre de l'onglet (un point d'accent à la fin), sa phrase, la puce « qui lit,
 * avec quel rôle » (qui ouvre la comparaison des parcours) et le geste principal — préparer le
 * point d'équipe, un parcours en trois écrans où rien ne part. Les membres restent nommés en
 * avatars (nom au survol ET au focus).
 */
function BoardHeader({
  tab,
  sub,
  members,
  viewerId,
  viewerName,
  viewerRole,
}: {
  tab: TeamTab
  sub: string | undefined
  members: ManagerMemberStats[]
  viewerId: string | null
  viewerName: string | null
  viewerRole: ManagerMemberStats['role'] | null
}) {
  const { t, i18n } = useTranslation('manager')
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name, locale, { sensitivity: 'base' }))
  // Le titre et la phrase suivent l'onglet (et le sous-onglet quand il parle d'autre chose).
  const key = tab === 'objectifs' || tab === 'activite' ? tab : tab === 'plans' ? 'plans' : 'vue'

  return (
    <header className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-start md:justify-between">
      <div className="min-w-0 space-y-3">
        <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
          {t('board.eyebrow')}
        </Text>
        <h1
          data-sub={sub}
          aria-label={`${t(`board.headline.${key}.title`)}.`}
          className="text-4xl font-semibold tracking-tight text-[var(--bellum-text-primary)] md:text-5xl"
        >
          {t(`board.headline.${key}.title`)}
          <span aria-hidden className="text-[var(--bellum-text-accent)]">
            .
          </span>
        </h1>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t(`board.headline.${key}.tagline`)}
        </Text>
        <ul aria-label={t('board.members')} className="flex flex-wrap gap-1.5">
          {sorted.map(member => (
            <li key={member.user_id}>
              {/* Le nom au survol (`title`) ET au focus clavier (`tabIndex`,
                  nom accessible) : un avatar muet ne dit pas qui c'est. */}
              <span
                role="img"
                aria-label={member.name}
                title={member.name}
                tabIndex={0}
                className="flex size-9 items-center justify-center rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-xs font-semibold text-[var(--bellum-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
              >
                {initialsOf(member.name)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-3 md:items-end">
        <TeamActorChip members={members} viewerId={viewerId} viewerName={viewerName} viewerRole={viewerRole} />
        {/* Théo D team-vue.R1 — le point d'équipe : un parcours en trois écrans
            (sujets → décisions → relecture), rien ne part. */}
        <Link
          to="/team/review/$step"
          params={{ step: '1' }}
          className="inline-flex min-h-11 items-center rounded-lg bg-[var(--bellum-primary-500)] px-4 text-sm font-medium text-[var(--bellum-on-primary)] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
        >
          {t('board.reviewCta')}
        </Link>
        {/* Le geste du bouton flottant de Laura : la question pré-remplie
            (team-review.A2) reste à un clic. */}
        <AskLaura label={t('board.review.label')} question={t('board.review.question')} alwaysVisible />
      </div>
    </header>
  )
}

function initialsOf(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('')
}

/**
 * #4158.42 — « Staffing » : besoins ouverts face aux consultants DÉCLARÉS
 * disponibles, puis qui couvre quoi (comptes par propriétaire, carte de
 * couverture, file des comptes sans responsable). Les doublons sont partis dans
 * « À traiter ». Rien de tout cela : aucune ligne.
 */
function StaffingBlock({ data }: { data: ManagerTeamStats }) {
  const { t } = useTranslation('manager')
  const staffing = data.staffing
  const hasStaffing =
    !!staffing && (staffing.open_needs > 0 || staffing.available_now > 0 || staffing.available_soon > 0)
  const hasCoverage = !!data.coverage && data.coverage.total_accounts > 0
  const hasMap =
    !!data.coverage_map &&
    data.coverage_map.sectors.length + data.coverage_map.territories.length + data.coverage_map.personas.length > 0
  const hasQueue = !!data.coverage && !!data.unassigned_sample && data.unassigned_sample.length > 0
  if (!hasStaffing && !hasCoverage && !hasMap && !hasQueue) return null

  return (
    <section aria-label={t('board.staffing.eyebrow')} data-board-block="staffing" className="space-y-3">
      <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
        {t('board.staffing.eyebrow')}
      </Text>
      <Text element="h2" size="lg" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {hasStaffing && staffing
          ? t('board.staffing.title', {
              needs: t('board.staffing.needs', { count: staffing.open_needs }),
              available: t('board.staffing.available', { count: staffing.available_now }),
            })
          : t('board.staffing.titleCoverage')}
      </Text>
      {hasStaffing && staffing ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {staffing.available_soon > 0 ? (
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('board.staffing.soon', { count: staffing.available_soon })}
            </Text>
          ) : null}
          <Link
            to="/projects"
            className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('board.staffing.openNeeds')}
          </Link>
          <Link
            to="/consultants"
            className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('board.staffing.openConsultants')}
          </Link>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {hasCoverage && data.coverage ? <CoverageCard coverage={data.coverage} /> : null}
        {hasQueue && data.coverage && data.unassigned_sample ? (
          <div {...revealTargetProps(TEAM_ANCHORS.unassigned)} className="scroll-mt-4 focus:outline-none">
            <UnassignedQueue
              accounts={data.unassigned_sample}
              members={data.members}
              unassigned={data.coverage.unassigned}
            />
          </div>
        ) : null}
      </div>
      {/* Carte de couverture : absente = API plus ancienne, donc masquée. */}
      {hasMap && data.coverage_map ? (
        <div {...revealTargetProps(TEAM_ANCHORS.coverageMap)} className="scroll-mt-4 focus:outline-none">
          <CoverageMapCard map={data.coverage_map} members={data.members} />
        </div>
      ) : null}
    </section>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-4 md:px-6 text-center text-[var(--bellum-text-secondary)]">
      {children}
    </div>
  )
}

/**
 * Une tuile de total. Le cumul seul ne dit rien à un manager (« 342 emails »
 * depuis quand ?) : quand le serveur sait compter le mois en cours et le mois
 * précédent, la tuile porte le RYTHME sous le cumul. Absence de `trend` (API
 * plus ancienne) = pas de ligne, jamais un « +0 % » inventé.
 *
 * Et le cumul MÈNE à ce qu'il compte : un `<Link>` et non un `<div onClick>`,
 * parce que ce qui se clique se tabule, s'ouvre dans un onglet et s'annonce
 * (GA-35). `to` absent ⇒ tuile inerte : un lien mort est pire qu'une absence de
 * lien.
 */
function TotalCard({
  icon: Icon,
  label,
  value,
  trend,
  to,
  category,
}: {
  icon: ComponentType<LucideProps>
  label: string
  value: number
  trend?: TrendPoint
  /** L'écran où ces objets sont réellement rendus. Absent = tuile inerte. */
  to?: '/accounts' | '/contacts' | '/actions'
  /** Catégorie du journal, quand la porte est `/actions`. */
  category?: ActionHistoryCategory
}) {
  const { i18n } = useTranslation('manager')
  const className = 'block rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4'
  const interactive =
    'transition-colors hover:bg-[var(--bellum-surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]'

  const body = (
    <>
      <div className="flex items-center gap-2 text-[var(--bellum-text-muted)]">
        <Icon className="size-4" />
        <Text size="xs" className="uppercase tracking-wide">
          {label}
        </Text>
      </div>
      <Text element="p" size="2xl" weight="bold" className="mt-2 text-[var(--bellum-text-primary)]">
        {value.toLocaleString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB')}
      </Text>
      {trend ? (
        // `moreIsBetter` : sur ces quatre tuiles, plus de comptes, de contacts,
        // d'emails et d'analyses est la bonne direction. La primitive ne le
        // devine pas — et c'est voulu : la même tuile sur « contacts sans
        // adresse » afficherait du vert sur une mauvaise nouvelle.
        <TrendLine
          trend={{ state: 'measured', ...trend }}
          sense="moreIsBetter"
          showCurrent
          keepPercentUnderSmallBase
          className="mt-1 block"
        />
      ) : null}
    </>
  )

  if (!to) return <div className={className}>{body}</div>

  return (
    <Link to={to} search={category ? { category } : undefined} className={`${className} ${interactive}`}>
      {body}
    </Link>
  )
}

/*
 * ⚠️ Le rendu du rythme du mois vivait ICI, et il était le SEUL delta correct
 * du dépôt — celui qui refusait d'écrire « +100 % » sur une base nulle. Il est
 * parti dans `components/primitives/TrendLine.tsx` le 28/08/2026, tel quel, et
 * ce n'est pas un déménagement de confort : les indicateurs de STOCK du
 * pilotage avaient besoin de la même règle, et la recoder aurait produit une
 * seconde version qui aurait fini par diverger (GA-26). La primitive y a gagné
 * un quatrième état — « pas de photo le mois dernier » —, que ces quatre
 * tuiles-ci ne rencontrent jamais : leur `previous` est un COMPTAGE, donc
 * toujours mesuré.
 */

/**
 * Portfolio coverage — how much of the workspace actually has a responsable.
 * This is the screen's headline number: an ESN's first question is "qui porte
 * quoi", and the honest answer starts with how many nobody carries.
 */
function CoverageCard({ coverage }: { coverage: { total_accounts: number; assigned: number; unassigned: number } }) {
  const { t } = useTranslation('manager')
  const { total_accounts: total, assigned, unassigned } = coverage

  if (total === 0) {
    return (
      <div className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
        <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('coverage.title')}
        </Text>
        <Text size="sm" className="mt-2 text-[var(--bellum-text-secondary)]">
          {t('coverage.empty')}
        </Text>
      </div>
    )
  }

  const assignedPct = Math.round((assigned / total) * 100)

  return (
    <div className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('coverage.title')}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('coverage.summary', { assigned, total, percent: assignedPct })}
        </Text>
      </div>
      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-[var(--bellum-surface-2)]">
        <div className="bg-[var(--bellum-primary-500)]" style={{ width: `${assignedPct}%` }} />
      </div>
      <Text size="xs" className="mt-3 text-[var(--bellum-text-secondary)]">
        {unassigned > 0 ? t('coverage.unassigned', { count: unassigned }) : t('coverage.allAssigned')}
      </Text>
    </div>
  )
}

/**
 * Carte de couverture (restitution V2 §10) : qui couvre quel secteur, quel
 * territoire, quel persona. Ce que le manager cherche ici, ce sont ses angles
 * morts — un segment que personne ne porte (« zone blanche ») passe donc devant
 * la répartition entre membres.
 *
 * Un axe vide n'est pas rendu : un workspace dont aucun compte n'a de secteur
 * renseigné n'a pas d'axe secteur, il n'a pas « zéro secteur ».
 */
function CoverageMapCard({ map, members }: { map: ManagerCoverageMap; members: ManagerMemberStats[] }) {
  const { t } = useTranslation('manager')

  // i18n keys: coverageMap.axis.sectors | coverageMap.axis.territories | coverageMap.axis.personas
  // L'unité diffère par axe et ne peut pas être unifiée sans mentir : un secteur
  // et un territoire comptent des COMPTES, un persona des CONTACTS.
  const axes = [
    { key: 'sectors', segments: map.sectors, unit: 'accounts' },
    { key: 'territories', segments: map.territories, unit: 'accounts' },
    { key: 'personas', segments: map.personas, unit: 'contacts' },
  ].filter(axis => axis.segments.length > 0)

  if (axes.length === 0) return null

  const nameOf = (id: string) => members.find(m => m.user_id === id)?.name ?? id
  const labelOf = (axisKey: string, label: string) =>
    axisKey === 'personas' && KNOWN_PERSONAS.includes(label) ? t(`coverageMap.persona.${label}`) : label

  return (
    <div className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
      <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {t('coverageMap.title')}
      </Text>
      <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('coverageMap.subtitle')}
      </Text>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {axes.map(axis => (
          <section key={axis.key}>
            <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
              {t(`coverageMap.axis.${axis.key}`)}
            </Text>
            <ul className="mt-2 space-y-2">
              {axis.segments.map(segment => (
                <CoverageSegmentRow
                  key={segment.label}
                  segment={segment}
                  label={labelOf(axis.key, segment.label)}
                  unit={axis.unit}
                  nameOf={nameOf}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function CoverageSegmentRow({
  segment,
  label,
  unit,
  nameOf,
}: {
  segment: ManagerCoverageSegment
  label: string
  unit: string
  nameOf: (id: string) => string
}) {
  const { t } = useTranslation('manager')
  const orphan = segment.owners.length === 0

  return (
    <li className="rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
          {label}
        </Text>
        {/* i18n keys: coverageMap.unit.accounts | coverageMap.unit.contacts */}
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t(`coverageMap.unit.${unit}`, { count: segment.total })}
        </Text>
      </div>
      {orphan ? (
        <Text size="xs" className="mt-1 text-[var(--warning-soft-text)]">
          {t('coverageMap.whiteSpace')}
        </Text>
      ) : (
        <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
          {segment.owners.map(owner => `${nameOf(owner.user_id)} · ${owner.count}`).join(' — ')}
        </Text>
      )}
      {/* Le reliquat sans responsable n'est affiché que s'il en reste : sur un
          segment déjà signalé « zone blanche », le répéter serait du bruit. */}
      {!orphan && segment.unassigned > 0 ? (
        <Text size="xs" className="mt-0.5 text-[var(--warning-soft-text)]">
          {t('coverageMap.unassigned', { count: segment.unassigned })}
        </Text>
      ) : null}
    </li>
  )
}

/**
 * The to-assign queue — the one place on this screen where a decision is taken
 * rather than reported. Rendered only when something is actually unassigned: an
 * empty queue is a good state, not a section worth space.
 */
function UnassignedQueue({
  accounts,
  members,
  unassigned,
}: {
  accounts: ManagerUnassignedAccount[]
  members: ManagerMemberStats[]
  unassigned: number
}) {
  const { t } = useTranslation('manager')
  const assign = useAssignAccount()

  if (accounts.length === 0) return null

  const remaining = unassigned - accounts.length

  return (
    <div className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
      <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {t('unassigned.title')}
      </Text>
      <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('unassigned.subtitle')}
      </Text>

      <ul className="mt-4 space-y-2">
        {accounts.map(account => (
          <li
            key={account.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2"
          >
            <div className="min-w-0">
              <Text size="sm" weight="semibold" className="truncate text-[var(--bellum-text-primary)]">
                {account.company_name}
              </Text>
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {account.sector ?? t('unassigned.noSector')}
                {account.priority_score !== null
                  ? ` · ${t('unassigned.score', { score: account.priority_score })}`
                  : ''}
              </Text>
            </div>

            {/* Le natif était choisi « pour éviter le portail et le z-index ».
                Il évitait surtout de suivre le thème : son menu était rendu par
                le système, donc blanc au milieu d'un écran sombre. L'échelle
                d'empilement du produit est NOMMÉE (`picker`), ce qui règle la
                question du z-index sans renoncer au thème.

                La valeur reste vide en permanence : ce menu n'affiche pas un
                état, il pose un geste — une fois le compte attribué, sa ligne
                quitte la liste. */}
            <SelectField
              size="sm"
              className="min-w-0 max-w-full"
              value=""
              disabled={assign.isPending}
              ariaLabel={t('unassigned.assignLabel', { company: account.company_name })}
              emptyOption={{ label: t('unassigned.placeholder') }}
              options={members.map(member => ({ value: member.user_id, label: member.name }))}
              onChange={next => {
                if (!next) return
                assign.mutate({ accountId: account.id, assignedTo: next })
              }}
            />
          </li>
        ))}
      </ul>

      {remaining > 0 ? (
        <Text size="xs" className="mt-3 text-[var(--bellum-text-secondary)]">
          {t('unassigned.more', { count: remaining })}
        </Text>
      ) : null}
    </div>
  )
}

function PipelineStrip({ pipeline }: { pipeline: { status: string; count: number }[] }) {
  const { t } = useTranslation('manager')
  const total = pipeline.reduce((sum, p) => sum + p.count, 0) || 1
  return (
    <div className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
      <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {t('pipeline.title')}
      </Text>
      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-[var(--bellum-surface-2)]">
        {pipeline.map((p, i) => (
          <div
            key={p.status}
            className={i % 2 === 0 ? 'bg-[var(--bellum-primary-500)]' : 'bg-[var(--bellum-primary-400)]'}
            style={{ width: `${(p.count / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {pipeline.map(p => (
          <Text key={p.status} size="xs" className="text-[var(--bellum-text-secondary)]">
            {PIPELINE_STATUSES.includes(p.status) ? t(`pipeline.status.${p.status}`) : p.status} ·{' '}
            <span className="font-semibold">{formatCount(p.count)}</span>
          </Text>
        ))}
      </div>
    </div>
  )
}
