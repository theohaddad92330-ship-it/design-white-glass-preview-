import { ProjectMissionLink } from './ProjectMissionLink'
import type { ProjectReadRow } from '@bellum/contracts'
import { Badge, Box, Button, Card, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { CustomerPage } from '@/components/page/CustomerPage'
import { ChainProgressBlock } from '@/features/chains/view/ChainProgressBlock'
import { PresentationsTable } from '@/features/submissions/view/PresentationsTable'
import { useSubmissions } from '@/features/submissions/api'
import { TimelinePanel } from '@/features/activities/view/TimelinePanel'
import type { ProjectOrigin } from '../lib/projectOrigin'
import { useProject } from '../hooks/useProject'
import { useProjectNeeds } from '../hooks/useProjectNeeds'
import { useProjectOwners } from '../hooks/useProjectOwners'
import { useProjectStageMove } from '../hooks/useProjectStageMove'
import { nextInformation } from '../model/project-next-info'
import { primaryActionForProject } from '../model/project-primary-action'
import { useWorkspaceProfile } from '@/features/profile/hooks/useWorkspaceProfile'
import { ProjectFramingBlock } from './ProjectFramingBlock'
import { BtmmpPanel } from './BtmmpPanel'
import { PageRecordLinks } from '@/features/records/PageRecordLinks'
import { ProjectSectorsPanel } from './ProjectSectorsPanel'
import { ProjectProvenanceLine } from './ProjectProvenanceLine'
import { ProjectNeedsPanel } from './ProjectNeedsPanel'
import { ProjectContactsPanel } from './ProjectContactsPanel'
import { ProjectDocumentsPanel } from './ProjectDocumentsPanel'
import { ProjectPartnerGovernancePanel } from './ProjectPartnerGovernancePanel'
import { ProjectStepsPanel } from './ProjectStepsPanel'
import { ProjectDecisionChecklist } from './ProjectDecisionChecklist'
import { ProjectEditDialog } from './ProjectEditDialog'
import { ProjectFollowUpDialog } from './ProjectFollowUpDialog'
import { ProjectFrieze } from './ProjectFrieze'
import { ProjectLauraDialog } from './ProjectLauraDialog'

/**
 * LE DOSSIER D'UN PROJET/AFFAIRE — `/projects/:id` (fondation de l'épopée #2801).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE ÉPOPÉE FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * `object-forms.ts` mesurait le PROJET sans F6 : « Aucune route `projects/$id`
 * n'existe ; les deux barres d'onglets de l'écran sont des filtres sur la LISTE,
 * pas les onglets d'un projet. » Une carte qui voudrait ouvrir « le projet
 * lui-même » (#2106.9, « projet sans suite → prochaine action ») n'avait donc
 * AUCUN écran où atterrir — c'est le blocage nommé par #2801, et c'est cette
 * adresse qui le lève.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ IL NE RÉÉCRIT PAS LES BLOCS — CE SONT LES MÊMES COMPOSANTS QUE LE TIROIR
 * ─────────────────────────────────────────────────────────────────────────────
 * `ProjectDetailSheet` (le tiroir, F5 panneau) et ce dossier (F6) composent les
 * MÊMES sous-composants — `ProjectStageControl`, `ProjectOwnerControl`,
 * `ProjectAmountControl`, `ProjectProvenanceLine`, `ProjectNeedsPanel`,
 * `ProjectContactsPanel`, `BtmmpPanel`, `ProjectSectorsPanel`,
 * `SubmissionsPanel`, `TimelinePanel` — chacun sa propre lecture/écriture, une
 * seule fois. Un second calcul de la même valeur à cet endroit serait le
 * défaut n°1 de ce dépôt (loi 4 du tome 7) ; l'ASSEMBLAGE, lui, diffère parce
 * que F5 et F6 répondent à des questions différentes (la matrice objet × forme
 * du tome 7, pas une redondance — même arbitrage que `MissionDossierPage`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ IL LIT LA MÊME LIGNE QUE LA LISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `useProject` passe par `GET /projects?id=…` : même `SELECT`, même
 * décoration (`withEvidence`, `withDecayedConfidence`). Une seconde route
 * aurait fabriqué une seconde vérité pour le même projet.
 */
type ProjectDossierTab = 'need' | 'profiles' | 'activity'

export function ProjectDossierPage({
  projectId,
  origin = null,
  initialTab = 'need',
}: {
  projectId: string
  origin?: ProjectOrigin | null
  initialTab?: ProjectDossierTab
}) {
  const { t } = useTranslation('projects')
  const { project, isPending, isError, notFound, refetch } = useProject(projectId)

  if (isPending) {
    return (
      <CustomerPage pageTitle={t('dossier.loading')}>
        <Text size="sm" className="py-6 text-[var(--bellum-text-muted)]">
          {t('dossier.loading')}
        </Text>
      </CustomerPage>
    )
  }

  // ⚠️ Deux vides, deux phrases : « je n'ai pas pu lire » envoie réessayer,
  // « ce projet n'est pas dans cet espace » envoie chercher ailleurs.
  if (isError) {
    return (
      <CustomerPage pageTitle={t('dossier.errorTitle')}>
        <Card className="p-6">
          <Text size="sm">{t('dossier.errorBody')}</Text>
          <Box display="flex" className="mt-3 flex-wrap gap-2">
            <Button size="sm" className="pointer-coarse:min-h-11" onClick={() => void refetch()}>
              {t('dossier.retry')}
            </Button>
            <BackToList origin={origin} />
          </Box>
        </Card>
      </CustomerPage>
    )
  }

  if (notFound || !project) {
    return (
      <CustomerPage pageTitle={t('dossier.missingTitle')}>
        <Card className="p-6">
          <Text size="sm">{t('dossier.missingBody')}</Text>
          <Box className="mt-3">
            <BackToList origin={origin} />
          </Box>
        </Card>
      </CustomerPage>
    )
  }

  return <Dossier project={project} origin={origin} initialTab={initialTab} />
}

/**
 * Le retour, écrit UNE fois : quatre états l'offrent. #3683.6 — ouvert depuis un dossier compte,
 * il ramène à CE compte et à l'onglet quitté ; sans origine, à la liste du pipe (comme avant).
 */
function BackToList({ origin }: { origin: ProjectOrigin | null }) {
  const { t } = useTranslation('projects')
  if (origin) {
    return (
      <Button size="sm" variant="ghost" asChild className="gap-1.5 pointer-coarse:min-h-11">
        <Link to="/accounts/$id" params={{ id: origin.accountId }} search={{ tab: origin.tab }}>
          <ArrowLeft className="size-4" aria-hidden />
          {t('dossier.backToAccount')}
        </Link>
      </Button>
    )
  }
  return (
    <Button size="sm" variant="ghost" asChild className="gap-1.5 pointer-coarse:min-h-11">
      <Link to="/projects">
        <ArrowLeft className="size-4" aria-hidden />
        {t('dossier.backToList')}
      </Link>
    </Button>
  )
}

function Dossier({
  project,
  origin,
  initialTab,
}: {
  project: ProjectReadRow
  origin: ProjectOrigin | null
  initialTab: ProjectDossierTab
}) {
  const { t } = useTranslation('projects')
  const { ownerName } = useProjectOwners()
  const owner = ownerName(project.owner_id)
  const submissions = useSubmissions({ projectId: project.id })
  const items = submissions.data?.items ?? []
  const move = useProjectStageMove(project)
  const [tab, setTab] = useState<ProjectDossierTab>(initialTab)
  const [editing, setEditing] = useState(false)
  const [lauraOpen, setLauraOpen] = useState(false)
  const [followUp, setFollowUp] = useState(false)
  // #2951 (recette écran, #2171.16) — LE MÊME CTA QUE LE TIROIR : un texte qui change avec l'étape, jamais un
  // second calcul (GA-26). Il vit désormais dans le bandeau « prochaine information utile ».
  const workspaceProfile = useWorkspaceProfile()
  const primaryAction = primaryActionForProject(project, workspaceProfile)
  const info = nextInformation({ stage: project.stage, hasMission: project.has_mission === true }, items)
  const showProposal =
    project.stage === 'profiles_submitted' || project.stage === 'negotiation' || project.stage === 'won'

  // L'ancre d'une action principale peut vivre dans un autre onglet : on l'ouvre, puis on y défile.
  const [anchor, setAnchor] = useState<string | null>(null)
  useEffect(() => {
    if (!anchor) return
    document.querySelector(`[data-anchor="${anchor}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setAnchor(null)
  }, [anchor, tab])
  const goTo = (target: string) => {
    setTab(target === 'project-submissions-panel' ? 'profiles' : 'need')
    setAnchor(target)
  }

  return (
    // Refonte Théo C (`projects-fiche`) — l'en-tête de la coque porte le titre de l'affaire, « compte ·
    // porteur » en phrase, et Modifier · Avec Laura · Suivi à droite (un seul h1, GA-347). Puis, dans
    // l'ordre de la maquette : le retour, la frise d'étapes, les onglets Besoin · Profils & présentations ·
    // Activité, la ligne de contexte, et des panneaux à titre (`.bo11-panel`).
    <CustomerPage
      pageTitle={project.label}
      pageSubtitle={[project.company_name ?? t('pipeline.unknownAccount'), owner].filter(Boolean).join(' · ')}
      headerActions={
        <Box className="flex flex-wrap items-center gap-2">
          {/* #1453 — l'entrée du studio de proposition, gardée hors maquette. */}
          {showProposal ? (
            <Button asChild size="sm" variant="outline" className="pointer-coarse:min-h-11">
              <Link to="/propositions" search={{ project: project.id }}>
                {t('dossier.prepareProposal')}
              </Link>
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="pointer-coarse:min-h-11"
            onClick={() => setEditing(true)}
          >
            {t('dossier.edit')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="pointer-coarse:min-h-11"
            onClick={() => setLauraOpen(true)}
          >
            {t('dossier.withLaura')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="pointer-coarse:min-h-11"
            onClick={() => setFollowUp(true)}
          >
            {t('dossier.followUp')}
          </Button>
        </Box>
      }
    >
      <Box className="flex flex-col gap-4 pb-6">
        <Box display="flex" className="flex-wrap items-center gap-2">
          <BackToList origin={origin} />
          <CompanyAvatar
            name={project.company_name ?? t('pipeline.unknownAccount')}
            logoUrl={project.logo_url}
            website={project.website}
          />
          <Badge variant="default">{t(`kinds.${project.kind}`, { defaultValue: project.kind })}</Badge>
          {project.archived_at ? <Badge variant="outline">{t('detail.archivedBadge')}</Badge> : null}
        </Box>
        <ProjectProvenanceLine opportunity={project} />

        <ProjectFrieze project={project} move={move} />

        {/* Théo `.bo11-tabs` — trois vrais onglets soulignés ; chacun n'affiche que son contenu. */}
        <div
          role="tablist"
          aria-label={t('dossier.tabs.label')}
          className="flex min-w-0 gap-6 overflow-x-auto border-b border-[var(--bellum-border)]"
        >
          {(
            [
              { key: 'need', label: t('dossier.tabs.need'), count: null },
              { key: 'profiles', label: t('dossier.tabs.profilesShort'), count: items.length },
              { key: 'activity', label: t('dossier.tabs.activity'), count: null },
            ] as const
          ).map(item => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 text-sm ${
                tab === item.key
                  ? 'border-[var(--bellum-primary-500)] font-semibold text-[var(--bellum-text-primary)]'
                  : 'border-transparent text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]'
              }`}
            >
              {item.label}
              {item.count ? (
                <span className="rounded-badge bg-[var(--bellum-surface-2)] px-1.5 py-0.5 text-xs tabular-nums text-[var(--bellum-text-secondary)]">
                  {item.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {tab === 'need' ? (
          <Box className="flex flex-col gap-4">
            {info?.kind === 'prepareMission' || info?.kind === 'openMission' ? (
              <ContextLine>
                <Box>
                  <Text size="sm" weight="semibold" className="block">
                    {t('dossier.won.title')}
                  </Text>
                  <Text size="xs" color="text-muted-foreground" className="block">
                    {t('dossier.won.body')}
                  </Text>
                </Box>
                {/* A1 — « Créer la mission » seulement une fois gagnée ; même formulaire que « Depuis une affaire gagnée » côté Missions. */}
                {info.kind === 'openMission' ? (
                  // #4291.8 — la mission est NOMMÉE et cliquable quand on la retrouve ; sinon le bouton d'avant.
                  <ProjectMissionLink
                    project={project}
                    fallback={
                      <Button asChild size="sm" className="pointer-coarse:min-h-11">
                        <Link to="/missions" search={{ accountId: project.account_id }}>
                          {t('detail.openMission')}
                        </Link>
                      </Button>
                    }
                  />
                ) : (
                  <Button asChild size="sm" className="pointer-coarse:min-h-11">
                    <Link to="/missions/nouvelle" search={{ project_id: project.id }}>
                      {t('detail.createMission')}
                    </Link>
                  </Button>
                )}
              </ContextLine>
            ) : info?.kind === 'clientFeedback' ? (
              <ContextLine>
                <Box>
                  <Text size="sm" weight="semibold" className="block">
                    {t('dossier.feedback.title', { name: info.name ?? t('dossier.feedback.someone') })}
                  </Text>
                  <Text size="xs" color="text-muted-foreground" className="block">
                    {t('dossier.feedback.body')}
                  </Text>
                </Box>
                <Button type="button" size="sm" className="pointer-coarse:min-h-11" onClick={() => setTab('profiles')}>
                  {t('dossier.feedback.cta')}
                </Button>
              </ContextLine>
            ) : info?.kind === 'primaryAction' && primaryAction ? (
              <ContextLine>
                <Text size="sm" weight="semibold">
                  {t('dossier.nextInfo')}
                </Text>
                {/* #2951 — le CTA qui change avec l'étape. */}
                <Button
                  type="button"
                  size="sm"
                  variant="black"
                  className="pointer-coarse:min-h-11"
                  onClick={() => goTo(primaryAction.anchor)}
                >
                  {t(`detail.primaryAction.${primaryAction.labelKey}`)}
                </Button>
              </ContextLine>
            ) : null}

            <DossierPanel title={t('dossier.panels.need')}>
              {/* #4291.7 — espace forfait / conseil : le projet se lit (périmètre, sponsor, budget). */}
              {workspaceProfile === 'forfait_conseil' ? <ProjectFramingBlock project={project} /> : null}
              {project.detail?.trim() ? (
                <Box className="space-y-1">
                  <Text element="p" size="xs" color="text-muted-foreground">
                    {t('detail.context')}
                  </Text>
                  <Text size="sm" className="whitespace-pre-wrap">
                    {project.detail}
                  </Text>
                </Box>
              ) : null}
              {project.risks?.trim() ? (
                <Box className="space-y-1" data-testid="project-risks">
                  <Text element="p" size="xs" color="text-muted-foreground">
                    {t('detail.risks')}
                  </Text>
                  <Text size="sm" className="whitespace-pre-wrap">
                    {project.risks}
                  </Text>
                </Box>
              ) : null}

              {/* « Le besoin » : la fiche du besoin détaille, l'affaire résume (HT-8). */}
              <Box data-anchor="project-needs-panel">
                <ProjectNeedsPanel projectId={project.id} />
              </Box>
            </DossierPanel>

            <ProjectDecisionChecklist project={project} />

            {/* A5 — contacts et partenaire, REPLIÉS sous « Ce qui reste à décider » (jamais cachés). */}
            <DossierPanel title={t('dossier.contactsAndPartner')} description={t('dossier.panels.contactsHint')}>
              <Box className="space-y-3">
                <ProjectContactsPanel projectId={project.id} accountId={project.account_id} />
                <ProjectPartnerGovernancePanel accountId={project.account_id} />
              </Box>
            </DossierPanel>

            <Box data-anchor="project-commercial-conditions">
              <DossierPanel title={t('detail.commercialConditions')}>
                <BtmmpPanel opportunityId={project.id} btmmp={project.btmmp ?? null} />
              </DossierPanel>
            </Box>
            <ProjectSectorsPanel
              opportunityId={project.id}
              sectors={project.application_sector_codes}
              domainCode={project.primary_domain_code ?? null}
            />
            {/* #4016.1b — la probabilité calibrée de l'affaire, avec ses axes (A3 : gardée, repliée). */}
            {/* Aucune probabilité de closing sur la fiche (doctrine #4016 L1 : Pilotage seulement ; notre
                AFFAIRES-E39) : elle se lit dans Pilotage › Pipe. */}
          </Box>
        ) : null}

        {tab === 'profiles' ? (
          <Box className="flex flex-col gap-3" data-anchor="project-submissions-panel">
            <Box className="flex flex-wrap items-center justify-between gap-2">
              <Box>
                <Text element="h2" size="base" weight="semibold">
                  {t('dossier.profiles.title')}
                </Text>
                <Text size="xs" color="text-muted-foreground" className="block">
                  {t('dossier.profiles.hint')}
                </Text>
              </Box>
              <Box className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline" className="pointer-coarse:min-h-11">
                  <Link to="/projects/presentations" search={{ project: project.id }}>
                    {t('dossier.profiles.all')}
                  </Link>
                </Button>
                <FindProfilesButton projectId={project.id} />
              </Box>
            </Box>
            {submissions.isLoading ? (
              <Text size="sm" color="text-muted-foreground">
                {t('common:states.loading')}
              </Text>
            ) : items.length === 0 ? (
              <Text size="sm" color="text-muted-foreground">
                {t('dossier.profiles.empty')}
              </Text>
            ) : (
              <PresentationsTable items={items} />
            )}
          </Box>
        ) : null}

        {tab === 'activity' ? (
          <Box className="flex flex-col gap-4">
            <ChainProgressBlock subjectType="project" subjectId={project.id} />
            {/* #4198 (L7) — besoins, candidats et missions de l'affaire, cliquables. */}
            <PageRecordLinks kind="opportunity" id={project.id} />
            {/* R3 — les tâches de l'affaire restent partagées avec Actions et Ma journée. */}
            <ProjectStepsPanel projectId={project.id} />
            <TimelinePanel
              scope="project"
              entityId={project.id}
              projectId={project.id}
              accountId={project.account_id ?? undefined}
              showSync={false}
            />
            {/* A5 — les pièces reçues ou envoyées, datées, à côté de l'historique. */}
            <ProjectDocumentsPanel projectId={project.id} />
          </Box>
        ) : null}
      </Box>

      <ProjectEditDialog project={project} open={editing} onOpenChange={setEditing} />
      <ProjectLauraDialog project={project} open={lauraOpen} onOpenChange={setLauraOpen} />
      <ProjectFollowUpDialog
        project={project}
        open={followUp}
        onOpenChange={setFollowUp}
        onNote={() => setTab('activity')}
        onChooseStage={move.choose}
      />
      {move.layer}
    </CustomerPage>
  )
}

/** « Trouver des profils » : le rapprochement du premier besoin de l'affaire, sinon le vivier. */
function FindProfilesButton({ projectId }: { projectId: string }) {
  const { t } = useTranslation('projects')
  const needs = useProjectNeeds(projectId)
  const first = needs.data?.[0]
  return (
    <Button asChild size="sm" variant="outline" className="pointer-coarse:min-h-11">
      {first ? (
        <Link to="/projects/needs/$needId" params={{ needId: first.id }} search={{ tab: 'matching' }}>
          {t('dossier.profiles.find')}
        </Link>
      ) : (
        <Link to="/consultants">{t('dossier.profiles.find')}</Link>
      )}
    </Button>
  )
}

/** Un panneau de la fiche (Théo `.bo11-panel`) : un titre h2, une phrase facultative, une action, le contenu. */
function DossierPanel({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-[var(--bellum-border)] bg-card p-4 md:p-5">
      <Box display="flex" className="mb-4 flex-wrap items-start justify-between gap-3">
        <div>
          <Text element="h2" size="lg" weight="semibold" className="tracking-tight">
            {title}
          </Text>
          {description ? (
            <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
              {description}
            </Text>
          ) : null}
        </div>
        {action}
      </Box>
      <Box className="space-y-4">{children}</Box>
    </section>
  )
}

/** La ligne de contexte (Théo `.bo11-contextline`) : ce qui est utile maintenant, et son geste. */
function ContextLine({ children }: { children: React.ReactNode }) {
  return (
    <Box
      data-testid="dossier-contextline"
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] px-4 py-3"
    >
      {children}
    </Box>
  )
}
