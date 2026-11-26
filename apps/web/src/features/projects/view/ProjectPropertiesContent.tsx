import { ProjectMissionLink } from './ProjectMissionLink'
import type { ProjectReadinessRow } from '@bellum/contracts'
import { Badge, Box, Button, Text } from '@bellum/ui'
import { ArrowUpRight, Share2 } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatDate } from '@/lib/locale'
import { BtmmpPanel } from './BtmmpPanel'
import { ProjectSectorsPanel } from './ProjectSectorsPanel'
import { ProjectAmountControl } from './ProjectAmountControl'
import { ProjectOwnerControl } from './ProjectOwnerControl'
import { ProjectForecastCategoryControl } from './ForecastCategoryField'
import { TimelinePanel } from '@/features/activities/view/TimelinePanel'
import { SubmissionsPanel } from '@/features/submissions/view/SubmissionsPanel'
import { ChainProgressBlock } from '@/features/chains/view/ChainProgressBlock'
import { ProjectNeedsPanel } from './ProjectNeedsPanel'
import { ProjectStepsPanel } from './ProjectStepsPanel'
import { ProjectSynthesisPanel } from './ProjectSynthesisPanel'
import { ProjectDocumentsPanel } from './ProjectDocumentsPanel'
import { LostDealCaseDimensions } from './LostDealCaseDimensions'
import { LostDealComparableLosses, LostDealDecisionOrganisation } from './LostDealDecisionOrganisation'
import { LostDealRexPanel } from './LostDealRexPanel'
import { ProjectContactsPanel } from './ProjectContactsPanel'
import { ProjectPartnerGovernancePanel } from './ProjectPartnerGovernancePanel'
import { ProjectStageControl } from './ProjectStageControl'
import { ProjectProvenanceLine } from './ProjectProvenanceLine'
import { useProjectOwners } from '../hooks/useProjectOwners'
import { primaryActionForProject } from '../model/project-primary-action'
import { staleOf } from '../model/stale-alert'
import type { StageSlaRow } from '@/features/settings/lib/stage-sla-api'
import { OpportunityEvidenceBadge } from '@/features/accounts/view/account-detail/tabs/opportunities/OpportunityEvidenceBadge'
import { useWorkspaceProfile } from '@/features/profile/hooks/useWorkspaceProfile'
import { ProjectFramingBlock } from './ProjectFramingBlock'
import { TaskComposer } from '@/features/tasks/view/TaskComposer'
import { useCreateTask } from '@/features/tasks/hooks/useTasks'
import { useExportProjectToCrm } from '../hooks/useExportProjectToCrm'
import { useArchiveOpportunity } from '../hooks/useArchiveOpportunity'
import { useState } from 'react'

/**
 * #4194 (lot L3) — LES PROPRIÉTÉS ET LES GESTES d'UNE opportunité, dans la zone
 * « Propriétés » du panneau latéral unique (`RecordPanel`). Ancien
 * `ProjectDetailSheet` : le tiroir (titre, compte, porte vers le dossier, bouton
 * Laura) est parti dans le panneau ; les gestes utiles restent ici.
 *
 * Le panneau n'affiche que ce qui existe : pas de « 0 € » à la place d'un
 * montant jamais saisi, pas de date de clôture déduite d'un cycle moyen. Un
 * champ vide se dit vide — c'est ce qui rend crédible le reste de l'écran.
 */
export function ProjectPropertiesContent({
  project,
  omitMissionGesture = false,
  slaRows,
}: {
  project: ProjectReadinessRow
  /** #4291.8 — `WonMissionDetail` porte déjà le geste mission : ne pas l'afficher deux fois (GA-26). */
  omitMissionGesture?: boolean
  /** #2170.43 — les seuils d'étape de l'espace, lus UNE fois par la page ; absents = 7/14/30. */
  slaRows?: readonly StageSlaRow[]
}) {
  const { t } = useTranslation('projects')
  const { t: tActivities } = useTranslation('activities')
  const navigate = useNavigate()
  const { ownerName } = useProjectOwners()
  // #2170.24 — la saisie de la prochaine action, montée à l'ouverture
  // seulement (même geste que le compte, #2150.22).
  // #2171.35 — PLANIFIER UN RENDEZ-VOUS réutilise le MÊME compositeur : une
  // tâche datée EST un rendez-vous, et il n'existe aucun connecteur
  // calendrier (agent_docs/env-reference.md) pour en faire un second objet.
  // `null` = fermé, une chaîne = ouvert avec cet intitulé pré-rempli (`''` pour
  // la prochaine action libre, déjà le comportement d'avant ce point).
  const [taskComposerTitle, setTaskComposerTitle] = useState<string | null>(null)
  const createTask = useCreateTask()
  const exportToCrm = useExportProjectToCrm()
  const archiveOpportunity = useArchiveOpportunity()
  const isArchived = Boolean(project.archived_at)
  // #2171.10 — même fonction que la carte du pipe (`PipelineBoard.tsx`) et le
  // tableau (`ProjectsTable.tsx`) : un nom d'owner recalculé à trois endroits
  // divergerait à la première retouche.
  const owner = ownerName(project.owner_id)
  // #2170.43 — au seuil réglé par l'espace pour cette étape (Règles → Pipe), lu par la page.
  const stale = project.stage === 'won' ? null : staleOf(project, Date.now(), slaRows)
  // #2171.16 — L'ACTION PRINCIPALE DYNAMIQUE : `null` sur `won` (le bouton
  // dédié #1327 la porte déjà) et sur `lost`/`dormant` (rien à pousser).
  // #4291.7 — en espace forfait / conseil, la demande confirmée se CADRE (périmètre, sponsor, budget).
  const workspaceProfile = useWorkspaceProfile()
  const primaryAction = primaryActionForProject(project, workspaceProfile)
  const scrollToAnchor = (anchor: string) =>
    document.querySelector(`[data-anchor="${anchor}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <Box>
      {/* L'action principale dynamique (#2171.16) et la porte vers le COMPTE
          (#2171.7) : les deux gestes qui restent collés en tête de zone. La porte vers
          le dossier complet et l'unique bouton Laura sont dans l'en-tête du panneau. */}
      <Box data-slot="opportunity-primary" display="flex" className="flex-wrap items-center gap-2 px-5 pt-4">
        {primaryAction ? (
          <Button variant="black" size="sm" onClick={() => scrollToAnchor(primaryAction.anchor)}>
            {t(`detail.primaryAction.${primaryAction.labelKey}`)}
          </Button>
        ) : null}
      </Box>
      {workspaceProfile === 'forfait_conseil' ? <ProjectFramingBlock project={project} /> : null}
      {/* #3420 (X76) — LE HERO DÉFILE. Il était collé dans `SheetHeader` (~345 px sur 805) et
              mangeait la place du contenu : seuls titre, compte et deux gestes restent collés (≤ 120 px). */}
      <Box data-slot="opportunity-hero" className="space-y-2 px-5 pt-4">
        {/* #4336.2 — L'ORIGINE en TÊTE du panneau (« Origine · … »), même mot et même fonction que la carte et la
              colonne du tableau ; la confiance et la date de recalcul suivent sur la même ligne (#2171.12). */}
        <ProjectProvenanceLine opportunity={project} />
        <Box display="flex" className="flex-wrap items-center gap-2">
          <Badge variant="default">{t(`kinds.${project.kind}`, { defaultValue: project.kind })}</Badge>
          {/* #4499 (arbitrage Louis 24/10) — le niveau de preuve a quitté la carte du pipe (maquette V22) : il se lit
              ICI, jamais une fonction perdue. Muet quand l'API n'a pas répondu. */}
          {project.stage === 'won' ? null : <OpportunityEvidenceBadge evidence={project.evidence} />}
          {/* #2171.39 — « on n'affiche pas ce qu'on n'a pas » : aucune
                pastille sur une opportunité active, jamais un « Active »
                qui n'apporte rien. */}
          {isArchived ? <Badge variant="outline">{t('detail.archivedBadge')}</Badge> : null}
        </Box>
        {/* #4499 — l'objectif et l'alerte de stagnation ont quitté la carte (maquette V22) : ils se lisent ici. L'objectif
            est une intention facultative (aucune ligne sinon) ; une affaire signée ne stagne pas. */}
        {project.objective ? (
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('pipeline.cardObjective', { objective: project.objective })}
          </Text>
        ) : null}
        {stale ? (
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('pipeline.staleCard', { count: stale.days })}
          </Text>
        ) : null}
        {/* #2171.10 — L'OWNER. Absent = aucune ligne, même raison que la
              carte du pipe : « non attribué » inventerait un porteur. */}
        {owner ? (
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('pipeline.cardOwner', { name: owner })}
          </Text>
        ) : null}
        {/* #2171.13 / #2171.14 — DATE DE CRÉATION ET DERNIÈRE ACTIVITÉ.
              `first_detected_at` (première détection de l'opportunité) et
              `updated_at` (même proxy assumé que `ProjectsTable.tsx:184-198`
              et la carte du pipe — le pipe ne porte pas d'événement, et une
              vraie timeline se lit plus bas, dans le panneau d'activité). */}
        <Box display="flex" className="flex-wrap items-center gap-x-3 gap-y-0.5">
          {formatDate(project.first_detected_at, { dateStyle: 'medium' }) ? (
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('detail.createdAt', { date: formatDate(project.first_detected_at, { dateStyle: 'medium' }) })}
            </Text>
          ) : null}
          {formatDate(project.updated_at, { dateStyle: 'medium' }) ? (
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('detail.lastActivityAt', { date: formatDate(project.updated_at, { dateStyle: 'medium' }) })}
            </Text>
          ) : null}
        </Box>
        {/* #2171.15 — LA PROCHAINE ACTION, dans le hero. Même trois cas que
              la carte du pipe (`PipelineBoard.tsx:658-671`) : `undefined` =
              l'API n'a pas dit (silence), `null` = aucune tâche ouverte (un
              vrai fait), un objet = titre + échéance. */}
        {project.next_action === undefined ||
        (project.next_action === null && project.stage === 'won') ? null : project.next_action === null ? (
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('pipeline.cardNoNextAction')}
          </Text>
        ) : (
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('pipeline.cardNextAction', {
              title: project.next_action.title,
              date: formatDate(project.next_action.due_on, { dateStyle: 'medium' }),
            })}
          </Text>
        )}
        {/* #2170.24 — `next_action` n'était qu'une LECTURE (dérivée de
              `tasks`, `projects.service.ts`) : ce bouton ouvre le même
              compositeur que celui des comptes (#2150.22, `TaskComposer`) et
              crée une tâche rattachée à CE projet (`projectId`), jamais une
              seconde saisie. */}
        <Box display="flex" className="flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="w-fit" onClick={() => setTaskComposerTitle('')}>
            {t('detail.addNextAction')}
          </Button>
          {/* #2171.35 — PLANIFIER UN RENDEZ-VOUS : même compositeur, seul
                l'intitulé pré-rempli distingue le geste — voir le docblock de
                `taskComposerTitle`. */}
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            onClick={() => setTaskComposerTitle(t('detail.meetingDefaultTitle'))}
          >
            {t('detail.scheduleMeeting')}
          </Button>
        </Box>
        <Box display="flex" className="flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigate({ to: '/accounts/$id', params: { id: project.account_id } })}
          >
            {t('detail.openAccount')}
            <ArrowUpRight className="ml-1 size-3.5" aria-hidden />
          </Button>
          {/* #1327 (7/9) — « Quand un projet est gagné, proposer clairement :
                Ouvrir / créer la mission ».

                « Aucune ressaisie et aucune rupture de parcours entre
                prospection, staffing, proposition et delivery » : c'est LA
                jointure du cycle, et c'était la seule qui n'avait aucune porte.
                Le projet passait en « gagné », et il fallait aller chercher
                Missions dans la nav en sachant déjà quoi y faire.

                ⚠️ `has_mission` est TRIVALENT et le champ est optionnel.
                `undefined` veut dire que l'API ne l'a pas dit (le web se déploie
                avant elle) : on n'affiche alors RIEN. Proposer « Créer la
                mission » sur une réponse muette ferait créer un doublon —
                `missions_opportunity_uniq` le refuserait, et l'utilisateur
                lirait une erreur qu'il n'a pas causée.

                La mission existante s'ouvre par le COMPTE (`/missions?accountId=`,
                le chemin déjà emprunté par `missionsOfAccount`) : `ProjectRow`
                ne porte pas l'identité de la mission, et l'inventer serait un
                lien qui promet une fiche et rend une liste. */}
          {omitMissionGesture ? null : project.stage === 'won' && project.has_mission === true ? (
            // #4291.8 — la mission est NOMMÉE et cliquable quand on la retrouve (`opportunity_id`) ; sinon le geste d'avant.
            <ProjectMissionLink
              project={project}
              fallback={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void navigate({ to: '/missions', search: { accountId: project.account_id } })}
                >
                  {t('detail.openMission')}
                  <ArrowUpRight className="ml-1 size-3.5" aria-hidden />
                </Button>
              }
            />
          ) : project.stage === 'won' && project.has_mission === false ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void navigate({ to: '/missions/nouvelle', search: { project_id: project.id } })}
            >
              {t('detail.createMission')}
              <ArrowUpRight className="ml-1 size-3.5" aria-hidden />
            </Button>
          ) : null}

          {/* #1453 — LA PORTE CONTEXTUELLE.
                « Ne plus demander à l'utilisateur d'aller dans l'onglet
                Propositions, de comprendre ce qu'est cette page, puis d'y
                rechercher son besoin. » Le dossier est déjà sous les yeux : le
                geste part d'ici, avec lui déjà choisi.

                Il ne s'affiche pas sur un dossier GAGNÉ ou PERDU : préparer une
                proposition pour une affaire déjà tranchée n'a pas de sens, et un
                bouton qui ne sert à rien coûte plus qu'il ne rapporte. */}
          {project.stage !== 'won' && project.stage !== 'lost' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void navigate({ to: '/propositions', search: { project: project.id } })}
            >
              {t('detail.prepareProposal')}
              <ArrowUpRight className="ml-1 size-3.5" aria-hidden />
            </Button>
          ) : null}
          {/* F1-FIX #4341 — l'onglet « Appels d'offres » a quitté Affaires (Louis 19/10/2026) : l'envoi du
                modèle d'appel d'offres et sa réponse partent de l'affaire, dans le pipe (`/projects?lens=rfp`).
                Même condition que « Préparer la proposition » : une affaire tranchée n'en prépare plus. */}
          {project.stage !== 'won' && project.stage !== 'lost' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void navigate({ to: '/projects', search: { lens: 'rfp' } })}
            >
              {t('detail.answerTender')}
              <ArrowUpRight className="ml-1 size-3.5" aria-hidden />
            </Button>
          ) : null}
          {/* #2171.37 — EXPORTER VERS LE CRM. `POST /projects/:id/export-crm`
                et `useExportProjectToCrm` existaient déjà (montés sur
                `NeedsAccountSheet.tsx:292-302`, la fiche besoin côté compte) —
                jamais sur LA fiche canonique de l'opportunité, `git grep`
                trouvait l'appelant ailleurs mais pas ici. Même hook, même
                geste : rien n'est écrit en double. */}
          <Button
            variant="ghost"
            size="sm"
            disabled={exportToCrm.isPending}
            onClick={() => exportToCrm.mutate(project.id)}
          >
            {exportToCrm.isPending ? t('actions.exporting') : t('actions.exportCrm')}
          </Button>
          {/* #2171.39 — ARCHIVER, un geste distinct de `lost`/`dormant` : on
                peut ranger une affaire gagnée ou perdue sans en changer l'issue.
                `stage`/`outcome` ne bougent pas — même doctrine que
                `project_needs.archived_at`. */}
          <Button
            variant="ghost"
            size="sm"
            disabled={archiveOpportunity.isPending}
            onClick={() => archiveOpportunity.mutate({ id: project.id, archived: !isArchived })}
          >
            {isArchived ? t('detail.unarchive') : t('detail.archive')}
          </Button>
          {/* #2171.38 — PARTAGER, même geste que la fiche besoin
                (`NeedDetailPage.tsx` → `onShare`) : copier le lien du DOSSIER
                CANONIQUE (`/projects/$id`, #2801) — le même que « Ouvrir le
                dossier complet » juste au-dessus, jamais un second calcul. */}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              const url = `${window.location.origin}/projects/${project.id}`
              void navigator.clipboard.writeText(url).then(
                () => toast.success(t('detail.shareCopied')),
                () => toast.error(t('detail.shareFailed')),
              )
            }}
          >
            <Share2 className="size-3.5" aria-hidden />
            {t('detail.share')}
          </Button>
        </Box>
      </Box>
      <Box className="space-y-5 px-5 py-4">
        <ProjectStageControl opportunity={project} />
        {/* #2170.26 — ATTRIBUER, à côté du sélecteur d'étape : même
                gabarit (badge + menu), le même geste de gouvernance que
                « Déplacer » ou « Marquer perdu » juste au-dessus. */}
        <ProjectOwnerControl opportunity={project} />
        <ProjectForecastCategoryControl opportunity={project} />
        <ProjectAmountControl opportunity={project} />

        {/* #2171.17 — SECTION « SYNTHÈSE ET DÉCISION ACTUELLE ». Même
                geste que #2171.19/.21 : NOMMER un regroupement qui existait
                déjà (contexte #2171.11 déjà là, risques #2324.37) plutôt que
                recalculer un second bloc. « On n'affiche pas ce qu'on n'a
                pas » (#2613) : aucun titre sur un dossier sans contexte NI
                risque écrit — un score ou une liste, jamais un intitulé nu. */}
        {project.detail || project.risks?.trim() || project.scope_label?.trim() ? (
          <Box className="space-y-3" data-anchor="project-synthesis">
            <Text
              element="h4"
              size="sm"
              weight="medium"
              color="text-muted-foreground"
              data-testid="current-synthesis-heading"
            >
              {t('detail.currentSynthesis')}
            </Text>
            {project.detail ? (
              <Box className="space-y-1">
                <Text element="p" size="xs" color="text-muted-foreground">
                  {t('detail.context')}
                </Text>
                <Text size="sm" className="whitespace-pre-wrap">
                  {project.detail}
                </Text>
              </Box>
            ) : null}

            {/* #2324.37 — les risques de l'affaire (écrits à l'écran ou
                    proposés par Laura, validés d'un clic). Absents : aucune
                    ligne. */}
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

            {/* #3266.1 (#3292) — le grain équipe/site/projet, saisi à la
                    création. Absent : aucune ligne, même règle que risques. */}
            {project.scope_label?.trim() ? (
              <Box className="space-y-1" data-testid="project-scope-label">
                <Text element="p" size="xs" color="text-muted-foreground">
                  {t('detail.scopeLabel')}
                </Text>
                <Text size="sm" className="whitespace-pre-wrap">
                  {project.scope_label}
                </Text>
              </Box>
            ) : null}
          </Box>
        ) : null}

        {/* #2171.27 — la synthèse EN 7 QUESTIONS, générée par Laura à la
                demande : distincte du bloc juste au-dessus (#2171.17, un
                regroupement de champs déjà écrits par le commercial). Voir le
                docblock de `ProjectSynthesisPanel`. */}
        <ProjectSynthesisPanel projectId={project.id} />

        {/* OÙ EN EST CE PROJET DANS LE PROCESSUS (#1505).
                Une LECTURE dérivée du projet, de ses appels d'offres et de ses
                positionnements : pas de seconde barre de statut, aucun chemin
                d'écriture vers la position — l'étape se change en changeant le
                projet, pas en cliquant ici. */}
        <ChainProgressBlock subjectType="project" subjectId={project.id} />

        <Box data-anchor="project-needs-panel">
          <ProjectNeedsPanel projectId={project.id} />
        </Box>
        {/* #2171.22 — Section « Actions et prochaines étapes », COCHABLE
                — distincte de la prochaine action du hero (#2171.15, une
                dérivation non persistée). Même mécanisme que `NeedStepsCard`
                côté besoin, porté par l'opportunité. */}
        <ProjectStepsPanel projectId={project.id} />
        {/* #2171.5 — le comité de l'affaire : sponsor, décideur,
                prescripteur, acheteur, utilisateur, bloqueur. */}
        <ProjectContactsPanel projectId={project.id} accountId={project.account_id} />
        {/* #3270.6 — SURFACE OPPORTUNITÉ : le cadre des ESN rang 2 en place chez le
                compte. Se tait sans présence gouvernée (une absence ne fait pas de ligne). */}
        <ProjectPartnerGovernancePanel accountId={project.account_id} />
        {/* #2171.24 — Section « Documents » : devis, NDA, contrat cadre,
                suivis au niveau de L'AFFAIRE (équivalent `NeedDocumentsTab`,
                un rôle précis). Sans fichier joint dans cette tranche — voir
                le docblock de `ProjectDocumentsPanel`. */}
        <ProjectDocumentsPanel projectId={project.id} />
        {/* #3272 (épopée #3295) — « Pertes documentées » : LECTURE des
                REX de perte déjà recueillis, réservée à une affaire perdue
                (`LostDealRexDialog` n'écrit qu'à ce stade). Voir le
                docblock de `LostDealRexPanel`. */}
        {project.stage === 'lost' ? <LostDealRexPanel projectId={project.id} /> : null}
        {/* #3246 — stratégie / modèle d'achat d'une perte déjà clôturée :
                sans eux, la perte reste hors de la comparaison de Laura. */}
        {project.stage === 'lost' ? <LostDealDecisionOrganisation projectId={project.id} /> : null}
        {project.stage === 'lost' ? <LostDealCaseDimensions projectId={project.id} /> : null}
        {project.stage === 'lost' ? <LostDealComparableLosses projectId={project.id} /> : null}
        {/* #2171.21 — SECTION « CONDITIONS COMMERCIALES ». `BtmmpPanel`
                (budget/timing/mission/management/process/prochaine étape) ET
                `ProjectAmountControl` (montant, dans le hero) couvraient déjà
                CHACUN une partie — aucun bloc ne les nommait ensemble. Le
                montant reste dans le hero (#2171.11, déjà là) : le dupliquer
                ici afficherait deux fois la même valeur, ce que GA-26 refuse.
                Ce titre nomme le regroupement qui manquait, sans recalculer
                ni redessiner ce qui existe déjà. */}
        <Box
          data-anchor="project-commercial-conditions"
          className="space-y-2"
          data-testid="commercial-conditions-heading"
        >
          <Text element="h4" size="sm" weight="medium" color="text-muted-foreground">
            {t('detail.commercialConditions')}
          </Text>
          <BtmmpPanel opportunityId={project.id} btmmp={project.btmmp ?? null} readiness={project.readiness} />
        </Box>
        {/* Le secteur de la DEMANDE — pas celui du compte (doctrine C05). */}
        <ProjectSectorsPanel
          opportunityId={project.id}
          sectors={project.application_sector_codes}
          domainCode={project.primary_domain_code ?? null}
        />

        {/* Qui a été proposé sur ce projet, et où ça en est. */}
        <Box data-anchor="project-submissions-panel">
          <SubmissionsPanel projectId={project.id} />
        </Box>

        {/* L'historique du projet. Le bouton de capture est masqué : la
                capture est globale à l'espace, et le proposer ici ferait croire
                qu'elle ne va chercher que les échanges de ce projet. */}
        <Box className="space-y-2">
          <Text element="p" size="xs" weight="medium" color="text-muted-foreground">
            {tActivities('card.projectTitle')}
          </Text>
          <TimelinePanel
            scope="project"
            entityId={project.id}
            projectId={project.id}
            accountId={project.account_id ?? undefined}
            showSync={false}
          />
        </Box>
      </Box>

      {/* #2170.24 / #2171.35 — même compositeur que le compte (#2150.22),
            rattaché à ce projet plutôt qu'à un compte. `taskComposerTitle`
            distingue « prochaine action » (intitulé vide) de « rendez-vous »
            (intitulé pré-rempli) — voir son docblock plus haut. */}
      {taskComposerTitle !== null ? (
        <TaskComposer
          open
          initialTitle={taskComposerTitle}
          onOpenChange={open => setTaskComposerTitle(open ? taskComposerTitle : null)}
          isPending={createTask.isPending}
          onSubmit={draft =>
            createTask.mutate({ ...draft, projectId: project.id }, { onSuccess: () => setTaskComposerTitle(null) })
          }
        />
      ) : null}
    </Box>
  )
}
