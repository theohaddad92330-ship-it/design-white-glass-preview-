import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  DEFAULT_UNSTAFFABLE_REASONS,
  canTransitionNeedStatus,
  staffableGateEffect,
  type StaffableVerdict,
  type ProfileTypeAgreement,
  needResumeOnProblem,
  needStatusRequiresReason,
  needHasConsultantAgreement,
  needHasEngagedConsultant,
  needRequiresStaffing,
  type NeedStoredStatus,
  DEFAULT_STAGE_LABELS,
  PIPELINE_STAGES,
  financeScopeClause,
  NEEDS_AWAITING_FEEDBACK_DAYS,
  needsAwaitingFeedbackSql,
  mostAdvancedNeedStatusSql,
  normaliseSpokenLanguages,
  opportunityEvidenceGaps,
  pipelineHealth,
  pipelineSummary,
  taskStillOpenSql,
  detectContactSolicitationCollisions,
  detectContradictoryActions,
  detectDuplicateOpportunities,
  detectMultiOwnerOpportunities,
  detectStaffingCollisions,
  type Btmmp,
  type ContactSolicitationCollision,
  type ContradictoryActionOpportunity,
  type DuplicateOpportunityGroup,
  type MultiOwnerOpportunity,
  type OutreachSequenceStatus,
  type StaffingCollision,
  type SubmissionStage,
  type SubmissionSubstatus,
  type CreateProjectNeed,
  type PipelineHealth,
  type PipelineStage,
  type PipelineSummaryResponse,
  type ProjectContact,
  type ProjectContactRole,
  type ProjectNeed,
  type ProjectStage,
  type UpdateProjectNeed,
  TRIAGED_STAGES,
  needStillOpenSql,
  needStaffableNotRefusedSql,
  pipelineCapacity,
  type PipelineCapacitySignals,
  assertExplicitConvergenceTransition,
  assertConvergenceCitesFoundingSignals,
  type ConvergenceState,
  canonicalCommercialStage,
  evaluateCommercialTransition,
  type CommercialCanonicalStage,
  type CommercialTransitionEvidenceKey,
  type CommercialTransitionSource,
  deliveryModeProblems,
} from '@bellum/contracts'
import { LossReasonEntity } from '../../database/entities/loss-reason.entity'
import { NeedUnstaffableReasonEntity } from '../../database/entities/need-unstaffable-reason.entity'
import { PipelineStageLabelEntity } from '../../database/entities/pipeline-stage-label.entity'
import { ProjectContactEntity } from '../../database/entities/project-contact.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import {
  CommercialTransitionsService,
  type CommercialTransitionEntry,
} from '../commercial-transitions/commercial-transitions.service'

/** Combien de rôles recherchés au plus sur un projet. Au-delà, ce n'est plus un
 *  projet, c'est un appel d'offres — et il a son propre écran. */
const MAX_NEEDS_PER_PROJECT = 50

/**
 * Le périmètre que l'APPELANT demande sur le pipe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI C'EST L'APPELANT QUI LE DIT, ET NON LA ROUTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /projects/pipeline` a TROIS lecteurs, et ils ne demandent pas la même
 * chose :
 *
 *  · l'écran `/projects` — le pipe complet, c'est son objet ;
 *  · l'état vide de `/missions` — il décide quelle porte ouvrir d'après ce que
 *    l'ESPACE a gagné, pas d'après ce que le lecteur a gagné ;
 *  · le cockpit — « **Mon** pipe », donc le sien.
 *
 * Rendre la route personnelle aurait cassé les deux premiers ; la laisser
 * collective laisse le troisième MENTIR. Un paramètre est la seule forme qui
 * serve les trois, et c'est déjà celle qu'a prise `?accountId=` sur la liste des
 * missions (§4.4).
 *
 * Une UNION et non un objet à champ facultatif, pour la raison écrite sur
 * {@link FinanceScope} : un `userId` oublié sur `own` rendrait le pipe de
 * l'espace entier sous le mot « mon », et le compilateur ne dirait rien.
 */
export type PipelineScope = { kind: 'workspace' } | { kind: 'own'; userId: string }

/**
 * Les projets que PERSONNE ne porte — ni porteur, ni compte attribué.
 *
 * Transposition à `opportunities` de `UNASSIGNED_MISSIONS_SQL` (`finance-scope.ts`),
 * exactement comme `contacts.assigned_to` est la transposition de
 * `accounts.assigned_to` : même règle, autre table. La règle, elle, n'existe
 * qu'une fois — et `cockpit-scope-is-owned.spec.ts` vérifie que les deux
 * énoncés restent le même.
 *
 * Sa raison d'être est celle de D1 : sur un espace où rien n'est attribué, un
 * commercial verrait « Mon pipe : 0 projet », ce qui se lit « je n'ai rien en
 * cours » alors que la vérité est « rien ne m'est rattaché ». Les deux appellent
 * des gestes opposés — prospecter, ou réclamer son portefeuille.
 */
const PROJECTS_OUTSIDE_ANY_PORTFOLIO_SQL = `
  SELECT COUNT(*)::text AS count
    FROM opportunities o
    JOIN accounts acc ON acc.id = o.account_id
   WHERE (o.workspace_id = $1 OR acc.workspace_id = $1)
     AND acc.status <> 'deleted'
     AND o.owner_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM accounts a WHERE a.id = o.account_id AND a.assigned_to IS NOT NULL
     )`

/**
 * Ce qui entoure le projet : son pipe, ses rôles recherchés, ses interlocuteurs,
 * et les deux catalogues que l'espace peut régler (libellés d'étape, motifs de
 * perte).
 *
 * Séparé de `ProjectsService`, qui porte la lecture du graphe et la
 * matérialisation depuis l'analyse. Le partage tient en une phrase : là-bas, ce
 * que la machine a produit ; ici, ce que l'équipe en fait.
 */
@Injectable()
export class ProjectPipelineService {
  private readonly logger = new Logger(ProjectPipelineService.name)

  constructor(
    @InjectRepository(ProjectEntity) private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(ProjectNeedEntity) private readonly needs: Repository<ProjectNeedEntity>,
    @InjectRepository(ProjectContactEntity) private readonly links: Repository<ProjectContactEntity>,
    @InjectRepository(PipelineStageLabelEntity) private readonly labels: Repository<PipelineStageLabelEntity>,
    @InjectRepository(LossReasonEntity) private readonly lossReasons: Repository<LossReasonEntity>,
    @InjectRepository(NeedUnstaffableReasonEntity)
    private readonly unstaffableReasons: Repository<NeedUnstaffableReasonEntity>,
    private readonly commercialTransitions: CommercialTransitionsService,
  ) {}

  /* ── Le pipe ─────────────────────────────────────────────────────────────── */

  /**
   * L'état du pipe : cinq colonnes, leurs projets, leurs montants.
   *
   * Le calcul lui-même est PUR (`pipelineSummary`) — c'est ce qui permet de
   * tester « un projet sans montant n'est pas un projet à 0 € » sans base.
   *
   * ⚠️ `scope` vaut « l'espace » par DÉFAUT, et ce défaut n'est pas une
   * commodité : les trois appelants d'avant (l'écran `/projects`, l'état vide de
   * `/missions`, le pont du copilote) lisent le pipe de l'espace et doivent
   * continuer, au SQL près, à lire exactement le même. Un défaut « own » aurait
   * changé leur réponse sans que personne ne l'ait décidé.
   *
   * ⚠️ La restriction passe par `financeScopeClause` — la SEULE définition de
   * « mon périmètre » du dépôt : je le porte (`owner_id`) OU le compte m'est
   * attribué (`accounts.assigned_to`). Son nom dit « finance » parce que le
   * chiffre d'affaires en a eu besoin le premier ; la règle, elle, n'a rien de
   * financier. La recopier ici en ferait la seconde vérité — et une portée trop
   * LARGE recopiée de travers rend juste un chiffre plus gros, qui a l'air juste.
   *
   * ⚠️ L'alias du compte est `acc` et non `a` : la clause déclare son propre
   * `FROM accounts a`, et deux `a` imbriqués se lisent de travers même quand
   * PostgreSQL, lui, les résout correctement.
   */
  async summary(
    workspaceId: string,
    language: 'fr' | 'en' = 'fr',
    scope: PipelineScope = { kind: 'workspace' },
  ): Promise<PipelineSummaryResponse> {
    const own =
      scope.kind === 'own'
        ? financeScopeClause({ kind: 'own', workspaceId, userId: scope.userId }, 'o', 2)
        : { sql: '', params: [] }

    const [rows, labels, outsideAnyPortfolio] = await Promise.all([
      this.projects.manager.query<
        {
          stage: string
          kind: string
          amount_cents: number | null
          has_next_action: boolean
          source: string | null
          owner_id: string | null
          expected_close_on: string | null
          btmmp: Btmmp | null
          objective: string | null
          risks: string | null
          scope_label: string | null
        }[]
      >(
        // #1325 (3/9.1) — « nombre sans prochaine action » dans l'entête de
        // colonne. Une tâche ENCORE OUVERTE rattachée au projet EST sa prochaine
        // action.
        //
        // ⚠️ Le prédicat vient de `taskStillOpenSql` et n'est PAS réécrit ici.
        // Ma première version disait `completed_at IS NULL` : GA-54 l'a refusée,
        // et elle a raison — le 28/08, deux définitions coexistaient et la même
        // tâche annulée était « une action programmée » d'un côté et « sans
        // panier » de l'autre.
        //
        // `EXISTS` plutôt qu'une jointure : un projet qui porte trois tâches ne
        // doit pas compter pour trois lignes.
        // #3714 — les colonnes que `projectNature` lit pour reconnaître le TRAVAIL
        // humain : sans elles, une affaire mal intitulée serait comptée comme une
        // généralité. Même classification que l'écran du dossier, une seule règle.
        `SELECT o.stage, o.kind, o.amount_cents::int AS amount_cents,
                o.source, o.owner_id, o.expected_close_on::text AS expected_close_on, o.btmmp,
                o.objective, o.risks, o.scope_label,
                EXISTS (
                  SELECT 1 FROM tasks tk
                   WHERE tk.project_id = o.id AND ${taskStillOpenSql('tk')}
                ) AS has_next_action
         FROM opportunities o
         JOIN accounts acc ON acc.id = o.account_id
        WHERE (o.workspace_id = $1 OR acc.workspace_id = $1)
          AND acc.status <> 'deleted'${own.sql}`,
        [workspaceId, ...own.params],
      ),
      this.stageLabels(workspaceId),
      // Sur la portée « espace » la requête ne PART PAS : il n'y a rien hors
      // périmètre, et « 0 hors périmètre » affiché en permanence est un bruit
      // qui cesse d'être lu. Chemin byte-identique pour les trois appelants
      // historiques.
      scope.kind === 'own' ? this.projectsOutsideAnyPortfolio(workspaceId) : Promise.resolve(null),
    ])

    return { ...pipelineSummary(rows, labels, language), scope: { kind: scope.kind, outsideAnyPortfolio } }
  }

  /**
   * #2324.40/43/44/46/47/48 — LE DIAGNOSTIC DE PIPE, jamais un score.
   *
   * Trois lectures scalaires par affaire (has_next_action, needs_without_profile,
   * needs_awaiting_feedback), au même patron que {@link summary} (`EXISTS`,
   * jamais une jointure qui dupliquerait la ligne) et que `OpenNeedsService`
   * (`shortlist_count` = aucune candidature déposée sur le besoin). Le calcul
   * NOMMÉ (raisons, jamais une pondération) vit dans `pipelineHealth`
   * (`@bellum/contracts`, PUR, testé sans base) — cette méthode ne fait QUE lire.
   *
   * ⚠️ Portée ESPACE, comme {@link summary} par défaut, et pour la même raison :
   * `opportunities` ne porte pas de propriétaire commercial fiable pour TOUTES
   * ses lignes (un signal détecté n'en a pas), et le NO-GO #2324.48 a justement
   * besoin de voir les signaux non adoptés pour les exclure — un périmètre
   * `own` les aurait déjà fait disparaître avant que la règle ne s'applique.
   */
  async health(
    workspaceId: string,
    now: Date = new Date(),
  ): Promise<
    PipelineHealth & {
      staffingCollisions: StaffingCollision[]
      contactSolicitationCollisions: ContactSolicitationCollision[]
      duplicateOpportunities: DuplicateOpportunityGroup[]
      multiOwnerOpportunities: MultiOwnerOpportunity[]
      contradictoryActionOpportunities: ContradictoryActionOpportunity[]
      opportunityNames: Record<string, { accountId: string; companyName: string | null; label: string }>
      capacity: PipelineCapacitySignals
    }
  > {
    const rows = await this.projects.manager.query<
      {
        id: string
        stage: string
        kind: string | null
        owner_id: string | null
        stage_entered_at: string | null
        has_next_action: boolean
        needs_total: string | number
        needs_without_profile: string | number
        needs_awaiting_feedback: string | number
        most_advanced_need_status: string | null
        // #2325.13 — les colonnes que `opportunityEvidenceGaps` (@bellum/contracts)
        // lit déjà pour `projectEvidence` ailleurs (ProjectsService) : aucune
        // nouvelle donnée, seulement de quoi appliquer le MÊME barème ici.
        source: string | null
        offer: string | null
        primary_domain_code: string | null
        amount_cents: string | number | null
        expected_close_on: string | null
        btmmp: Btmmp | null
        first_detected_at: string
        // #2325.33 — de quoi grouper les doublons SANS deuxième requête : ce sont
        // les MÊMES lignes déjà lues pour le diagnostic de pipe.
        account_id: string
        label: string
        // #2325.32 — les porteurs DISTINCTS des tâches OUVERTES de l'affaire,
        // en plus de son propre `owner_id` : de quoi détecter une affaire
        // travaillée par plusieurs personnes SANS deuxième requête (GA-26).
        task_owner_ids: string[]
        // #2325.29 — le secteur du compte, de quoi comparer les dossiers actifs
        // aux secteurs prioritaires SANS deuxième requête (GA-26) : voir
        // {@link capacity}, qui reçoit ces lignes déjà lues.
        account_sector: string | null
        // #3904 — le nom du compte, de quoi NOMMER l'affaire sans deuxième requête.
        account_name?: string | null
      }[]
    >(
      `SELECT o.id, o.stage, o.kind, o.owner_id, o.stage_entered_at::text AS stage_entered_at,
              o.source, o.offer, o.primary_domain_code, o.amount_cents,
              o.expected_close_on::text AS expected_close_on, o.btmmp,
              o.first_detected_at::text AS first_detected_at,
              o.account_id, o.label, acc.sector AS account_sector, acc.company_name AS account_name,
              (
                SELECT COALESCE(array_agg(DISTINCT tk.owner_id) FILTER (WHERE tk.owner_id IS NOT NULL), '{}')
                  FROM tasks tk WHERE tk.project_id = o.id AND ${taskStillOpenSql('tk')}
              ) AS task_owner_ids,
              EXISTS (
                SELECT 1 FROM tasks tk WHERE tk.project_id = o.id AND ${taskStillOpenSql('tk')}
              ) AS has_next_action,
              (
                SELECT COUNT(*) FROM project_needs n WHERE n.project_id = o.id AND n.archived_at IS NULL
              ) AS needs_total,
              (
                SELECT COUNT(*) FROM project_needs n
                 WHERE n.project_id = o.id AND n.archived_at IS NULL
                   AND NOT EXISTS (SELECT 1 FROM submissions sub WHERE sub.need_id = n.id)
              ) AS needs_without_profile,
              (
                SELECT COUNT(*) FROM project_needs n
                 WHERE n.project_id = o.id AND n.archived_at IS NULL
                   AND ${needsAwaitingFeedbackSql('n.status')}
                   AND n.status_changed_at IS NOT NULL
                   AND n.status_changed_at < now() - make_interval(days => $2::int)
                   AND EXISTS (
                     SELECT 1 FROM submissions sub WHERE sub.need_id = n.id AND sub.submitted_at IS NOT NULL
                   )
              ) AS needs_awaiting_feedback,
              -- #2324.20/21/23 — le besoin le PLUS AVANCÉ dans le parcours de
              -- staffing, jamais une sixième étape d'opportunité : voir
              -- opportunityStageDetail (@bellum/contracts), qui traduit ce
              -- statut brut (déjà project_needs.status) en affinage lisible.
              -- #2170.3 — écrit à UN seul endroit désormais (GA-26) :
              -- mostAdvancedNeedStatusSql, que projects.service.ts réutilise.
              -- #2942 — 'entretien' et 'négociation' (interview, negotiation)
              -- sont deux étapes de PLUS de ce même parcours de staffing,
              -- entre client_review et won : voir NEED_STATUS_PROGRESS_ORDER
              -- (@bellum/contracts), qui les place après client_review.
              ${mostAdvancedNeedStatusSql('o.id')} AS most_advanced_need_status
         FROM opportunities o
         JOIN accounts acc ON acc.id = o.account_id
        WHERE (o.workspace_id = $1 OR acc.workspace_id = $1)
          AND acc.status <> 'deleted'`,
      [workspaceId, NEEDS_AWAITING_FEEDBACK_DAYS],
    )

    const health = pipelineHealth(
      rows.map(row => ({
        id: row.id,
        stage: row.stage,
        kind: row.kind,
        owner_id: row.owner_id,
        stage_entered_at: row.stage_entered_at,
        has_next_action: row.has_next_action,
        needs_total: Number(row.needs_total ?? 0),
        needs_without_profile: Number(row.needs_without_profile ?? 0),
        needs_awaiting_feedback: Number(row.needs_awaiting_feedback ?? 0),
        most_advanced_need_status: row.most_advanced_need_status,
        // #2325.13 — axe CONFIANCE : le MÊME barème que `ProjectsService`
        // (`projectEvidence`/`opportunityEvidenceGaps`, @bellum/contracts),
        // jamais un second calcul de fit/périmètre/décideur/prochaine action.
        evidence_gaps: opportunityEvidenceGaps({
          kind: row.kind ?? '',
          stage: row.stage as ProjectStage,
          source: row.source,
          offer: row.offer,
          primary_domain_code: row.primary_domain_code,
          // `== null` et non `=== null` : une ligne mockée ou une jointure
          // partielle qui omet la colonne rend `undefined`, jamais un
          // périmètre inventé (`Number(undefined)` vaudrait `NaN`, dont
          // `typeof … === 'number'` est VRAI — la même faute que #2325.13
          // documente déjà pour `projectEvidenceInput`).
          amount_cents: row.amount_cents == null ? null : Number(row.amount_cents),
          expected_close_on: row.expected_close_on,
          btmmp: row.btmmp,
          first_detected_at: row.first_detected_at,
        }),
      })),
      now,
    )

    const activeRows = rows.filter(row => (TRIAGED_STAGES as readonly string[]).includes(row.stage))

    const [staffingCollisions, contactSolicitationCollisions, capacity] = await Promise.all([
      this.staffingCollisions(workspaceId),
      this.contactSolicitationCollisions(workspaceId),
      this.capacity(workspaceId, {
        activeDossiersCount: activeRows.length,
        activeDossierSectors: activeRows.map(row => row.account_sector ?? null),
        presentationDossiersCount: activeRows.filter(row => row.stage === 'profiles_submitted').length,
      }),
    ])

    return {
      ...health,
      staffingCollisions,
      contactSolicitationCollisions,
      // #2325.33 — depuis les MÊMES lignes que le diagnostic ci-dessus, jamais
      // une seconde requête (GA-26) : ce sont déjà toutes les affaires de
      // l'espace, intake et étapes closes comprises — `detectDuplicateOpportunities`
      // filtre lui-même sur les étapes actives.
      duplicateOpportunities: detectDuplicateOpportunities(
        rows.map(row => ({ id: row.id, accountId: row.account_id, label: row.label, stage: row.stage })),
      ),
      // #2325.32 — même geste : les MÊMES lignes, jamais une nouvelle lecture.
      multiOwnerOpportunities: detectMultiOwnerOpportunities(
        rows.map(row => ({
          id: row.id,
          ownerIds: [row.owner_id, ...(row.task_owner_ids ?? [])].filter(
            (ownerId): ownerId is string => typeof ownerId === 'string' && ownerId.length > 0,
          ),
        })),
      ),
      // #2325.36 — `has_next_action` est DÉJÀ calculé ci-dessus pour
      // `pipelineHealth` (#2324.42) : aucune colonne de plus, aucun second calcul.
      contradictoryActionOpportunities: detectContradictoryActions(
        rows.map(row => ({ id: row.id, stage: row.stage, hasOpenTask: row.has_next_action })),
      ),
      capacity,
      // #3904 — « Lequel de mes comptes est à deux doigts de signer ? » : les
      // lignes du diagnostic ne portent que l'identifiant de l'affaire, et
      // Laura « ne pouvait pas nommer le compte ». Le nom lu en base voyage ici,
      // par identifiant (les lignes ci-dessus gardent leur forme). Un nom absent
      // reste `null`, jamais deviné.
      opportunityNames: Object.fromEntries(
        rows.map(row => [
          row.id,
          { accountId: row.account_id, companyName: row.account_name ?? null, label: row.label },
        ]),
      ),
    }
  }

  /**
   * #2325.27-.31 — tranché sans Louis, reco appliquée (registre `chat-lot3`,
   * confirmé 25/09/2026) : le calcul PUR vit dans `pipelineCapacity`
   * (`@bellum/contracts`), cette méthode ne fait QUE lire les cinq entrées
   * réelles qu'il attend. Portée ESPACE, comme {@link health} : une capacité
   * d'équipe ne se lit pas « pour moi ».
   *
   * `activeDossiersCount` / `activeDossierSectors` / `presentationDossiersCount`
   * viennent des lignes DÉJÀ lues par {@link health} (`acc.sector`, ajouté à sa
   * projection) — jamais une deuxième requête sur `opportunities` pour un
   * agrégat qui s'en déduit.
   */
  private async capacity(
    workspaceId: string,
    dossiers: {
      activeDossiersCount: number
      activeDossierSectors: readonly (string | null)[]
      presentationDossiersCount: number
    },
  ): Promise<PipelineCapacitySignals> {
    const [members, prioritySectorsRows, openNeedsRows, consultantsAvailableSoonRows] = await Promise.all([
      // #2325.27/.28 — les membres ACTIFS de l'espace, chacun avec sa tranche de
      // temps commercial hebdomadaire RÉSIDUELLE déclarée (réponse PERSONNELLE,
      // `TEMPS_PERSONAL_ANSWER_KEYS` — jamais le profil canonique de l'ESN).
      this.projects.manager.query<Array<{ weekly_sales_time_residual: string | null }>>(
        `SELECT p.weekly_sales_time_residual
           FROM workspace_members wm
           LEFT JOIN esn_profiles p ON p.user_id = wm.user_id AND p.is_current = true
          WHERE wm.workspace_id = $1`,
        [workspaceId],
      ),
      // #2325.29 — les secteurs prioritaires déclarés sur le profil CANONIQUE de
      // l'espace (`esn_profiles.priority_sectors`, migration `PrioritySectors`).
      this.projects.manager.query<Array<{ priority_sectors: string[] | null }>>(
        `SELECT priority_sectors
           FROM esn_profiles
          WHERE workspace_id = $1 AND is_workspace_canonical = true AND is_current = true
          LIMIT 1`,
        [workspaceId],
      ),
      // #2325.30 — les besoins ENCORE OUVERTS de l'espace, mêmes DEUX prédicats
      // que `buildStaleNeeds` (`briefing.service.ts`) : jamais un besoin refusé
      // à la staffabilité, jamais un besoin déjà clos.
      this.projects.manager.query<Array<{ count: string }>>(
        `SELECT COUNT(*)::text AS count
           FROM project_needs n
          WHERE n.workspace_id = $1
            AND ${needStillOpenSql('n.status')}
            AND ${needStaffableNotRefusedSql('n.staffable')}`,
        [workspaceId],
      ),
      // #2325.31 — consultants dont la disponibilité DÉCLARÉE (`available_from`)
      // tombe sous 30 jours. `available_from IS NULL` (non déclarée) ne compte
      // JAMAIS comme disponible.
      this.projects.manager.query<Array<{ count: string }>>(
        `SELECT COUNT(*)::text AS count
           FROM consultants c
          WHERE c.workspace_id = $1
            AND c.archived_at IS NULL
            AND c.available_from IS NOT NULL
            AND c.available_from <= (current_date + interval '30 days')`,
        [workspaceId],
      ),
    ])

    return pipelineCapacity({
      activeDossiersCount: dossiers.activeDossiersCount,
      activeDossierSectors: dossiers.activeDossierSectors,
      presentationDossiersCount: dossiers.presentationDossiersCount,
      members: members.map(row => ({ weeklySalesTimeResidualBand: row.weekly_sales_time_residual ?? null })),
      prioritySectors: prioritySectorsRows[0]?.priority_sectors ?? [],
      openNeedsCount: Number(openNeedsRows[0]?.count ?? 0),
      consultantsAvailableSoonCount: Number(consultantsAvailableSoonRows[0]?.count ?? 0),
    })
  }

  /**
   * #2325.34 — « détecte les mêmes consultants sollicités ailleurs ».
   *
   * `detectStaffingCollisions` (`@bellum/contracts`, #2107.17/#2108.18/#2108.30)
   * est PUR et déjà testé : deux positionnements OUVERTS du même consultant sur
   * deux besoins DISTINCTS. Une lecture SÉPARÉE de `health()` — les
   * positionnements ne sont pas des opportunités, les mélanger romprait la
   * lecture pure du diagnostic de pipe (#2324/#2325). ⚠️ Ne compare JAMAIS deux
   * `ownerId` : la collision ENTRE COMMERCIAUX est écartée par doctrine
   * (décision Louis 16/09/2026, `staffing-collision.ts`) — cette requête ne lit
   * même pas la colonne.
   */
  private async staffingCollisions(workspaceId: string): Promise<StaffingCollision[]> {
    const rows = await this.projects.manager.query<
      { id: string; need_id: string | null; consultant_id: string; consultant_name: string | null; stage: string }[]
    >(
      `SELECT s.id, s.need_id, s.consultant_id, c.full_name AS consultant_name, s.stage
         FROM submissions s
         LEFT JOIN consultants c ON c.id = s.consultant_id
        WHERE s.workspace_id = $1`,
      [workspaceId],
    )

    return detectStaffingCollisions(
      rows.map(row => ({
        id: row.id,
        needId: row.need_id,
        consultantId: row.consultant_id,
        consultantName: row.consultant_name,
        stage: row.stage as SubmissionStage,
      })),
    )
  }

  /**
   * #2325.35 — « détecte les mêmes contacts sollicités [ailleurs] ».
   *
   * `detectContactSolicitationCollisions` (`@bellum/contracts`) est PUR et
   * déjà testé : deux séquences d'outreach ACTIVES sur le MÊME contact. Une
   * lecture SÉPARÉE de `health()` — les séquences ne sont pas des
   * opportunités, les mélanger romprait la lecture pure du diagnostic de pipe
   * (#2324/#2325). ⚠️ Ne lit JAMAIS `user_id` (l'auteur de la séquence) : la
   * collision ENTRE COMMERCIAUX est écartée par doctrine, même raison que
   * #2325.34 (`contact-solicitation-collision.ts`).
   */
  private async contactSolicitationCollisions(workspaceId: string): Promise<ContactSolicitationCollision[]> {
    const rows = await this.projects.manager.query<
      { id: string; contact_id: string; contact_name: string | null; status: string }[]
    >(
      `SELECT s.id, s.contact_id, c.full_name AS contact_name, s.status
         FROM outreach_sequences s
         LEFT JOIN contacts c ON c.id = s.contact_id
        WHERE s.workspace_id = $1`,
      [workspaceId],
    )

    return detectContactSolicitationCollisions(
      rows.map(row => ({
        id: row.id,
        contactId: row.contact_id,
        contactName: row.contact_name,
        status: row.status as OutreachSequenceStatus,
      })),
    )
  }

  /**
   * #3264.14 (épopée #3264, lot R11 29/09) — LA MÊME COLLISION QUE
   * {@link contactSolicitationCollisions}, RÉDUITE À UN CONTACT.
   *
   * `apps/ia` ne peut pas importer `packages/contracts` (racine Railway =
   * `apps/ia`, même frontière documentée que `method-corpus.ts`/`persona.py`)
   * ni lire `outreach_sequences` directement : `prepare_message_for_contact`
   * a besoin de savoir, AVANT de préparer un message, si un collègue a déjà
   * une séquence active sur ce contact. Réutilise la MÊME lecture que
   * `health()` (jamais une seconde requête, GA-26) et filtre son résultat —
   * la dérivation reste `detectContactSolicitationCollisions`, unique.
   */
  async contactSolicitationCollisionFor(
    workspaceId: string,
    contactId: string,
  ): Promise<ContactSolicitationCollision | null> {
    const collisions = await this.contactSolicitationCollisions(workspaceId)
    return collisions.find(collision => collision.contactId === contactId) ?? null
  }

  /**
   * Volontairement SANS try/catch : un `null` rendu ici se lirait « rien n'est
   * hors de ton portefeuille », ce qui est une affirmation, pas une absence. Une
   * lecture en échec doit faire échouer le bloc — l'écran dit alors « le pipe n'a
   * pas pu être chargé », ce qui est vrai — plutôt que de rassurer à tort.
   */
  private async projectsOutsideAnyPortfolio(workspaceId: string): Promise<number> {
    const rows = await this.projects.manager.query<{ count: string }[]>(PROJECTS_OUTSIDE_ANY_PORTFOLIO_SQL, [
      workspaceId,
    ])
    return Number(rows?.[0]?.count ?? 0)
  }

  /** Les libellés d'étape de l'espace — seulement ceux qu'il a renommés. */
  async stageLabels(workspaceId: string): Promise<Partial<Record<PipelineStage, string>>> {
    const rows = await this.labels.find({ where: { workspace_id: workspaceId } })
    const labels: Partial<Record<PipelineStage, string>> = {}
    for (const row of rows) {
      if ((PIPELINE_STAGES as readonly string[]).includes(row.stage)) labels[row.stage as PipelineStage] = row.label
    }
    return labels
  }

  /**
   * Renommer une étape. Un libellé vide REMET le défaut plutôt que d'afficher
   * une colonne sans nom — et remettre le défaut doit rester possible sans
   * passer par la base.
   */
  async renameStage(workspaceId: string, stage: PipelineStage, label: string | null): Promise<void> {
    const trimmed = (label ?? '').trim()
    if (!trimmed) {
      await this.labels.delete({ workspace_id: workspaceId, stage })
      return
    }
    await this.labels.manager.query(
      `INSERT INTO pipeline_stage_labels (workspace_id, stage, label, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (workspace_id, stage) DO UPDATE SET label = EXCLUDED.label, updated_at = now()`,
      [workspaceId, stage, trimmed.slice(0, 60)],
    )
  }

  /** Les libellés effectifs, défauts compris — ce que l'écran affiche. */
  async effectiveStageLabels(
    workspaceId: string,
    language: 'fr' | 'en' = 'fr',
  ): Promise<{ stage: PipelineStage; label: string; isDefault: boolean }[]> {
    const custom = await this.stageLabels(workspaceId)
    return PIPELINE_STAGES.map(stage => ({
      stage,
      label: custom[stage] ?? DEFAULT_STAGE_LABELS[stage][language],
      isDefault: custom[stage] === undefined,
    }))
  }

  /* ── Les motifs de perte ─────────────────────────────────────────────────── */

  async listLossReasons(workspaceId: string): Promise<{ id: string; label: string }[]> {
    const rows = await this.lossReasons.find({
      where: { workspace_id: workspaceId, archived: false },
      order: { sort_order: 'ASC', created_at: 'ASC' },
    })
    return rows.map(row => ({ id: row.id, label: row.label }))
  }

  async addLossReason(workspaceId: string, label: string): Promise<{ id: string; label: string }> {
    const trimmed = label.trim()
    if (!trimmed) throw new BadRequestException('Un motif de perte ne peut pas être vide')
    const existing = await this.lossReasons.manager.query<{ id: string; label: string }[]>(
      `SELECT id, label FROM loss_reasons WHERE workspace_id = $1 AND lower(label) = lower($2) LIMIT 1`,
      [workspaceId, trimmed],
    )
    // Un doublon de casse produirait deux lignes dans le rapport pour la même
    // raison — exactement ce que le catalogue existe pour éviter.
    if (existing[0]) {
      await this.lossReasons.update({ id: existing[0].id }, { archived: false })
      return existing[0]
    }
    const saved = await this.lossReasons.save(
      this.lossReasons.create({ workspace_id: workspaceId, label: trimmed.slice(0, 120) }),
    )
    return { id: saved.id, label: saved.label }
  }

  async archiveLossReason(workspaceId: string, id: string): Promise<void> {
    // Archivé, jamais supprimé : les projets déjà perdus pour ce motif
    // garderaient sinon une raison introuvable.
    await this.lossReasons.update({ id, workspace_id: workspaceId }, { archived: true })
  }

  /* ── Les rôles recherchés ────────────────────────────────────────────────── */

  async listNeeds(workspaceId: string, projectId: string): Promise<ProjectNeed[]> {
    await this.assertProject(workspaceId, projectId)
    const rows = await this.needs.find({ where: { project_id: projectId }, order: { created_at: 'ASC' } })
    return rows.map(toNeedWire)
  }

  async addNeed(
    workspaceId: string,
    projectId: string,
    input: CreateProjectNeed,
    actorId: string | null = null,
  ): Promise<ProjectNeed> {
    // #2558.1 — un besoin existe sans projet : le COMPTE est désormais porté en
    // propre par `project_needs.account_id`, il n'est plus déduit du projet à
    // chaque lecture. Ici le projet EST connu, donc le compte vient de lui —
    // c'est la même valeur qu'avant, simplement écrite plutôt que redéduite.
    const parent = await this.assertProject(workspaceId, projectId)
    const count = await this.needs.count({ where: { project_id: projectId } })
    if (count >= MAX_NEEDS_PER_PROJECT) {
      throw new BadRequestException(`Un projet ne porte pas plus de ${MAX_NEEDS_PER_PROJECT} rôles recherchés`)
    }
    return toNeedWire(await this.saveNeed(workspaceId, parent.account_id, projectId, input, actorId))
  }

  /**
   * #2558.1 — CRÉER UN BESOIN AU NOM D'UN COMPTE, avec ou sans projet.
   *
   * La porte `POST /projects/:id/needs` porte le projet DANS L'URL : aucun
   * corps n'y décrit un besoin sans projet. La majorité des missions d'ESN ne
   * produisent aucun signal public (retour bêta du 17/09/2026) — leur inventer
   * un projet, c'était fabriquer de la donnée vide.
   *
   * ⚠️ Les DEUX gardes d'autorisation, et dans cet ordre :
   *
   *  · le COMPTE appartient à l'espace de l'appelant — sinon 404, jamais une
   *    écriture chez le voisin (même règle qu'`assertProject`) ;
   *  · le projet nommé, quand il y en a un, appartient à CE compte — sinon on
   *    écrirait un besoin dont le projet parle d'un autre client, et l'écran
   *    montrerait deux noms de société sur la même ligne.
   *
   * Le plafond par projet ne s'applique pas ici : il borne ce qu'un PROJET
   * porte (« au-delà, c'est un appel d'offres »), et un besoin sans projet
   * n'entre dans aucun projet.
   */
  async addNeedForAccount(
    workspaceId: string,
    accountId: string,
    input: CreateProjectNeed & { project_id?: string | null },
    actorId: string | null = null,
  ): Promise<ProjectNeed> {
    const { project_id: projectId = null, ...needInput } = input
    const accounts = await this.projects.manager.query<{ id: string }[]>(
      `SELECT a.id FROM accounts a WHERE a.id = $1 AND a.workspace_id = $2 AND a.status <> 'deleted' LIMIT 1`,
      [accountId, workspaceId],
    )
    if (!accounts[0]) throw new NotFoundException('Compte introuvable')

    if (projectId) {
      const parent = await this.assertProject(workspaceId, projectId)
      if (parent.account_id !== accountId) {
        throw new BadRequestException(
          'Ce projet appartient à un autre compte — un besoin ne peut pas nommer deux clients.',
        )
      }
    }

    return toNeedWire(await this.saveNeed(workspaceId, accountId, projectId, needInput, actorId))
  }

  /**
   * #2558.1 — L'ÉCRITURE D'UN BESOIN, à un seul endroit (GA-26).
   *
   * Les deux portes (`POST /projects/:id/needs` et `POST /projects/needs`)
   * écrivent les mêmes colonnes ; ce qui les distingue est ce qu'elles ont le
   * droit de savoir du compte et du projet, pas la façon de poser un besoin.
   * Deux copies de cette projection auraient divergé au premier champ ajouté —
   * ce fichier porte déjà quatre cas historiques de « colonne lue, jamais
   * écrite », tous nés d'une projection oubliée quelque part.
   */
  private async saveNeed(
    workspaceId: string,
    accountId: string,
    projectId: string | null,
    input: CreateProjectNeed,
    actorId: string | null = null,
  ): Promise<ProjectNeedEntity> {
    // #2174.11 (épopée #2939) — CINQUIÈME occurrence de « colonne lue, jamais
    // écrite » dans ce fichier : `contact_id` est sélectionné par
    // `open-needs.service.ts` (`need.contact_id AS contact_id`) et déclaré par
    // `projectNeedSchema` depuis toujours, sans qu'aucune porte de création ne
    // l'accepte — l'interlocuteur ne pouvait s'assigner qu'après coup. Même
    // garde que le projet (`assertProject` ci-dessous) : un interlocuteur d'un
    // AUTRE compte laisserait le dossier client afficher la mauvaise personne.
    // #3547 — le forfait encadré se REFUSE ici, en clair, avant l'écriture : le
    // CHECK SQL (`project_needs_supervised_coherent_check`) n'est que le filet.
    assertDeliveryModeCoherent(input)
    if (input.contact_id) await this.assertContactBelongsToAccount(input.contact_id, accountId, workspaceId)
    // #2939 (#2174.33) — LE DÉCIDEUR : même garde que l'interlocuteur juste
    // au-dessus, un décideur d'un AUTRE compte afficherait la mauvaise
    // personne sur le dossier client.
    if (input.decision_maker_contact_id) {
      await this.assertContactBelongsToAccount(input.decision_maker_contact_id, accountId, workspaceId)
    }
    const saved = await this.needs.save(
      this.needs.create({
        workspace_id: workspaceId,
        // #2558.1 — `null` est une valeur PLEINE ici : ce besoin n'appartient
        // à aucun projet, et rien ne reste à compléter.
        project_id: projectId,
        account_id: accountId,
        // #2323.1 — `detected` EXISTE dans le schéma et la garde d'état depuis
        // le 25/09, mais AUCUN appelant ne le posait : le défaut `to_qualify`
        // de la colonne s'appliquait toujours, quelle que soit la provenance.
        // `provenance: 'model'` est la SEULE valeur qui dit qu'aucun humain n'a
        // encore confirmé ce besoin (une proposition ACCEPTÉE, elle, porte
        // `provenance: 'pipeline'` — le clic d'acceptation EST la confirmation
        // humaine) : c'est exactement « le contexte suggère un besoin
        // potentiel » du §2323.1, jamais un « à qualifier » que personne n'a
        // encore acté.
        status: input.provenance === 'model' ? 'detected' : 'to_qualify',
        title: input.title.trim(),
        skills: input.skills ?? [],
        seniority: input.seniority ?? null,
        headcount: input.headcount ?? 1,
        target_tjm_cents: input.target_tjm_cents == null ? null : String(input.target_tjm_cents),
        start_on: input.start_on ?? null,
        duration_months: input.duration_months ?? null,
        location: input.location ?? null,
        // #2173.29 — `null` reste `null` : non renseigné n'est jamais un
        // défaut `sur_site`.
        remote: input.remote ?? null,
        contract_kind: input.contract_kind ?? 'inconnu',
        // #3547 — FORFAIT ENCADRÉ : `staffed` par défaut = comportement historique ;
        // rôle et équipe `null` / `[]` = non dits, jamais « cadrage » ni 0.
        delivery_mode: input.delivery_mode ?? 'staffed',
        supervision_role: input.supervision_role ?? null,
        client_team_size: input.client_team_size ?? null,
        client_team_names: input.client_team_names ?? [],
        deadline_at: input.deadline_at ? new Date(input.deadline_at) : null,
        // ⚠️ `source` et `provenance` étaient ACCEPTÉS par le contrat et jetés
        // ici. Les colonnes existent depuis le chantier CRM, le contrat les
        // déclare, l'appelant qui accepte une proposition détectée les passe —
        // et un commentaire de ce dépôt affirmait déjà que « la provenance
        // voyage AVEC le besoin ». Elle ne voyageait pas : tout besoin sortait
        // en `source: null`, et le badge « détecté » du §6.2 n'avait rien à
        // afficher. Trouvé en recette de production le 26/08, en créant un
        // besoin depuis un appel d'offres (#1097).
        source: input.source ?? null,
        provenance: input.provenance ?? null,
        // ⚠️ Même défaut, un cran plus loin : `urgency` et `owner_id` étaient
        // LUS (le badge d'urgence de la colonne « Rôle », `owner_id` dans la
        // liste transverse et dans `toNeedWire`) et n'avaient AUCUN chemin
        // d'écriture — le schéma `.strict()` les refusait en amont. Troisième
        // occurrence de « colonne lue, jamais écrite » dans ce dépôt.
        //
        // `?? null` et jamais un défaut : une urgence absente n'est pas
        // « normale », et un besoin sans propriétaire n'appartient pas à celui
        // qui l'a créé — c'est justement ce que le cockpit cherche à repérer.
        urgency: input.urgency ?? null,
        owner_id: input.owner_id ?? null,
        // #2174.11 — même règle : rien saisi n'est pas « aucun interlocuteur »,
        // c'est une absence de réponse. Vérifié CE compte juste au-dessus.
        contact_id: input.contact_id ?? null,
        // ⚠️ QUATRIÈME occurrence de « colonne lue, jamais écrite », et la plus
        // coûteuse : `languages` et `clearances` étaient acceptées par le
        // contrat (`createProjectNeedSchema`), portées par la table depuis le
        // chantier de rapprochement, lues par le moteur (axes 6 et 12) — et
        // jetées ICI. Les deux axes tournaient donc toujours sur un tableau
        // vide côté besoin, si bien que l'axe 12, DÉCLARÉ BLOQUANT, ne bloquait
        // jamais rien. Un garde-fou qui ne s'applique jamais est pire qu'un
        // garde-fou absent : il se lit comme une protection.
        //
        // `[]` et jamais `undefined` : la colonne est `NOT NULL` avec un défaut
        // `'{}'`, et une liste vide a un SENS ici — « ce poste n'exige ni
        // langue ni habilitation », ce qui fait sortir l'axe du dénominateur au
        // lieu de le noter zéro.
        languages: input.languages ?? [],
        clearances: input.clearances ?? [],
        // L'ORIGINE et le CANAL de l'assistant en quatre étapes — deux champs
        // additifs, jamais dérivés de `source`. `?? null` : personne ne les a
        // dits n'est pas la même chose qu'un défaut choisi pour eux.
        origin: input.origin ?? null,
        channel: input.channel ?? null,
        // Les certifications EXIGÉES par le poste. `[]` et jamais `undefined` :
        // la colonne est `NOT NULL` avec un défaut `'[]'`, et une liste vide a
        // un sens — « ce poste n'exige aucune certification ».
        required_certifications: input.required_certifications ?? [],
        // #2174.17 — LE PROBLÈME. La colonne existe depuis `NeedFields`
        // (migration `1789537604211`), déclarée par `projectNeedSchema`, LUE
        // par `open-needs.service.ts` et `NeedDetailPage.tsx` — jamais écrite
        // par cette porte de création. `?? null` : rien saisi n'est pas «
        // aucun problème », c'est une absence de réponse.
        context: input.context ?? null,
        // #2939 (#2174.16) — LA CAPACITÉ RECHERCHÉE, même patron que `context`
        // juste au-dessus : texte libre, `?? null` si rien saisi.
        expertise: input.expertise ?? null,
        // #2323.22 — LE PROCESSUS de présentation/recrutement, même patron que
        // `context` juste au-dessus : texte libre, `?? null` si rien saisi.
        presentation_process: input.presentation_process ?? null,
        // #2939 (#2174.32/.33/.34) — le processus de décision, le décideur
        // (vérifié juste au-dessus), et les achats — même patron `?? null`.
        decision_process: input.decision_process ?? null,
        decision_maker_contact_id: input.decision_maker_contact_id ?? null,
        procurement_involvement: input.procurement_involvement ?? null,
        // #2939 (#2174.31) — LES CONTRAINTES ADMINISTRATIVES, même patron.
        constraints: input.constraints ?? null,
        // #2323.38-.42 — les quatre champs du moteur de contradictions, même
        // règle `?? null` que les champs juste au-dessus : rien saisi n'est
        // jamais un défaut deviné.
        interview_rounds: input.interview_rounds ?? null,
        onsite_days_per_week: input.onsite_days_per_week ?? null,
        freelance_excluded: input.freelance_excluded ?? null,
        budget_validated: input.budget_validated ?? null,
      }),
    )
    // #2320.16 (épopée #2967) — Opportunité→Besoin confirmé : la TOUTE
    // PREMIÈRE ligne du journal `'need'` (sujet déjà là depuis #2320.23),
    // jamais écrite jusqu'ici — `changeNeedStatus` journalise les statuts
    // SUIVANTS depuis le 25/09, mais aucun appelant n'écrivait la naissance
    // elle-même. Tranché sans Louis : reste sous `'need'`, PAS sous le
    // nouveau sujet `'signal'` (migration `1796340800001`, posé pour
    // #2320.14) — `'signal'`/`'opportunity'` gardent la règle « un sujet =
    // une table » (subject_id = la ligne QU'IL décrit) ; `'need'` reste la
    // bonne table ici, `project_needs.id`. Distinct du mouvement d'ÉTAPE
    // `qualified → confirmed` d'une opportunité déjà qualifiée (sujet
    // `'opportunity'`, déjà couvert) : ici c'est la NAISSANCE d'un besoin
    // depuis une opportunité encore informelle, quand `project_id` est posé —
    // `proof` la cite, jamais une opportunité devinée quand il n'y en a pas.
    // Best-effort, même motif que `recordStageTransition`/`changeNeedStatus`.
    try {
      await this.commercialTransitions.record({
        workspaceId,
        subjectType: 'need',
        subjectId: saved.id,
        fromState: null,
        toState: saved.status,
        actorId,
        proof: projectId ? `opportunity:${projectId}` : null,
      })
    } catch (error) {
      this.logger.warn(`Need birth not recorded: ${(error as Error).message}`)
    }
    return saved
  }

  async updateNeed(workspaceId: string, needId: string, patch: UpdateProjectNeed): Promise<ProjectNeed> {
    const need = await this.needs.findOne({ where: { id: needId, workspace_id: workspaceId } })
    if (!need) throw new NotFoundException('Rôle recherché introuvable')

    if (patch.title !== undefined) need.title = patch.title.trim()
    if (patch.skills !== undefined) need.skills = patch.skills
    if (patch.seniority !== undefined) need.seniority = patch.seniority ?? null
    if (patch.headcount !== undefined) need.headcount = patch.headcount
    if (patch.target_tjm_cents !== undefined) {
      need.target_tjm_cents = patch.target_tjm_cents == null ? null : String(patch.target_tjm_cents)
    }
    if (patch.start_on !== undefined) need.start_on = patch.start_on ?? null
    if (patch.duration_months !== undefined) need.duration_months = patch.duration_months ?? null
    if (patch.location !== undefined) need.location = patch.location ?? null
    // #2173.29 — `undefined` = « je n'en parle pas », `null` = « je retire la
    // réponse » (le besoin redevient non renseigné). Même règle que les
    // champs voisins juste au-dessus.
    if (patch.remote !== undefined) need.remote = patch.remote ?? null
    if (patch.contract_kind !== undefined) need.contract_kind = patch.contract_kind
    // #3547 — forfait encadré. `undefined` = « je n'en parle pas », `null` = « je retire ».
    if (patch.delivery_mode !== undefined) need.delivery_mode = patch.delivery_mode
    if (patch.supervision_role !== undefined) need.supervision_role = patch.supervision_role ?? null
    if (patch.client_team_size !== undefined) need.client_team_size = patch.client_team_size ?? null
    if (patch.client_team_names !== undefined) need.client_team_names = patch.client_team_names
    // Le mode quitté, rôle et équipe partent avec lui : jamais de champs orphelins.
    if (need.delivery_mode !== 'supervised') {
      need.supervision_role = null
      need.client_team_size = null
      need.client_team_names = []
    }
    assertDeliveryModeCoherent({
      contract_kind: need.contract_kind,
      delivery_mode: need.delivery_mode as 'staffed' | 'supervised',
      supervision_role: need.supervision_role as ProjectNeed['supervision_role'],
      client_team_size: need.client_team_size,
      client_team_names: need.client_team_names,
    })
    // `undefined` = « je n'en parle pas », `null` = « retire-le ». Les
    // confondre effacerait l'urgence et le propriétaire de tous les besoins à
    // chaque modification de titre — c'est pourquoi le test tient les deux.
    //
    // Aucun passage par `applyFieldUpdates` ici, et c'est délibéré : l'arbitre
    // de provenance protège une correction HUMAINE d'un writer de pipeline, et
    // ce chemin-ci EST le geste humain (source `human`, le rang le plus haut).
    // L'y faire transiter n'ajouterait aucune protection — c'est la même raison
    // que celle écrite pour l'attribution de portefeuille dans
    // `no-blind-record-writes.spec.ts`, dont le périmètre s'arrête d'ailleurs
    // aux colonnes de fiche compte/contact.
    if (patch.urgency !== undefined) need.urgency = patch.urgency ?? null
    if (patch.owner_id !== undefined) need.owner_id = patch.owner_id ?? null
    if (patch.contact_id !== undefined) {
      if (patch.contact_id) await this.assertContactBelongsToAccount(patch.contact_id, need.account_id, workspaceId)
      need.contact_id = patch.contact_id ?? null
    }
    // Les exigences du poste. Même règle `undefined` / `[]` que ci-dessus, et
    // elle compte doublement ici : `[]` veut dire « cette habilitation n'est
    // plus exigée » — un geste qui doit pouvoir se faire, sans quoi un besoin
    // resterait bloquant pour toujours sur une exigence retirée — tandis que
    // `undefined` veut dire « je n'en parle pas », et confondre les deux
    // effacerait l'exigence à chaque changement de titre. Un blocage qui
    // disparaît en silence est pire qu'un blocage qui n'a jamais existé.
    if (patch.languages !== undefined) need.languages = patch.languages ?? []
    if (patch.clearances !== undefined) need.clearances = patch.clearances ?? []
    if (patch.origin !== undefined) need.origin = patch.origin ?? null
    if (patch.channel !== undefined) need.channel = patch.channel ?? null
    if (patch.required_certifications !== undefined) need.required_certifications = patch.required_certifications ?? []
    // #2323.22 — `undefined` = « je n'en parle pas », `null` = « retire la
    // phrase », même règle que `remote`/`urgency` plus haut.
    if (patch.presentation_process !== undefined) need.presentation_process = patch.presentation_process ?? null
    // #2939 (#2174.32/.33/.34) — même règle `undefined`/`null`. Le décideur
    // porte la MÊME garde que `contact_id` juste au-dessus : vérifié contre le
    // compte du besoin avant d'être posé.
    if (patch.decision_process !== undefined) need.decision_process = patch.decision_process ?? null
    if (patch.decision_maker_contact_id !== undefined) {
      if (patch.decision_maker_contact_id) {
        await this.assertContactBelongsToAccount(patch.decision_maker_contact_id, need.account_id, workspaceId)
      }
      need.decision_maker_contact_id = patch.decision_maker_contact_id ?? null
    }
    if (patch.procurement_involvement !== undefined) {
      need.procurement_involvement = patch.procurement_involvement ?? null
    }
    // #2323.38-.42 — même règle `undefined`/`null` que `presentation_process`
    // juste au-dessus.
    if (patch.interview_rounds !== undefined) need.interview_rounds = patch.interview_rounds ?? null
    if (patch.onsite_days_per_week !== undefined) need.onsite_days_per_week = patch.onsite_days_per_week ?? null
    if (patch.freelance_excluded !== undefined) need.freelance_excluded = patch.freelance_excluded ?? null
    if (patch.budget_validated !== undefined) need.budget_validated = patch.budget_validated ?? null
    // Le statut ne se pose PLUS ici : il a sa porte (`changeNeedStatus`), qui
    // vérifie la transition et exige un motif là où il en faut un. Le laisser
    // passer par le patch générique rouvrirait la porte de côté — et c'est
    // exactement comme ça qu'un besoin se retrouve « gagné » sans mission.
    if (patch.deadline_at !== undefined) need.deadline_at = patch.deadline_at ? new Date(patch.deadline_at) : null

    return toNeedWire(await this.needs.save(need))
  }

  /**
   * Change l'état d'un besoin (PDF 2 §7.4, décision D13 : les onze en base).
   *
   * Quatre vérifications, chacune pour un accident précis : la transition doit
   * être permise (sauter la qualification lance un matching à vide), les deux
   * gates need-level (#2323.23 / #2323.25, ci-dessous), une perte ou une
   * annulation doit porter son MOTIF (sans lui, le taux de refus par cause ne
   * veut rien dire), et la date du changement est posée — sans elle, « depuis
   * quand ce besoin traîne-t-il » n'a pas de réponse.
   */
  async changeNeedStatus(
    workspaceId: string,
    needId: string,
    next: NeedStoredStatus,
    reason: string | null,
    actorId: string | null = null,
    source: CommercialTransitionSource = 'human',
    resumeOn: string | null = null,
  ): Promise<ProjectNeed> {
    const need = await this.needs.findOne({ where: { id: needId, workspace_id: workspaceId } })
    if (!need) throw new NotFoundException('Rôle recherché introuvable')

    // #3389.13 — la date de reprise n'a de sens que sur une veille, et pas dans
    // le passé : refusée AVANT toute écriture, comme le motif.
    const resumeProblem = needResumeOnProblem(next, resumeOn, new Date().toISOString().slice(0, 10))
    if (resumeProblem) {
      throw new BadRequestException(
        resumeProblem === 'only_on_hold'
          ? 'Une date de reprise ne se pose que sur une mise en veille.'
          : 'La date de reprise ne peut pas être dans le passé.',
      )
    }

    const verdict = await this.needTransitionVerdict(need, next)
    if (!verdict.allowed) throw new BadRequestException(verdict.reason ?? 'Transition impossible.')

    const trimmed = (reason ?? '').trim()
    // #2967 (lot V39) — une correction humaine GAGNE toujours (elle prime sur
    // toute proposition de Laura, quelle que soit sa date — voir
    // `effectiveCommercialStage`). Un tel poids exige sa preuve : une
    // correction sans motif ne se distinguerait pas d'un geste ordinaire.
    if (source === 'human_correction' && trimmed.length === 0) {
      throw new BadRequestException('Une correction doit porter son motif.')
    }
    if (needStatusRequiresReason(next) && trimmed.length === 0) {
      throw new BadRequestException(
        next === 'on_hold'
          ? 'Un motif est obligatoire pour mettre ce besoin en veille.'
          : 'Un motif est obligatoire pour clore ce besoin.',
      )
    }

    const previousStatus = need.status
    need.status = next
    // Le motif n'est gardé que là où il a un sens — les trois états où le
    // besoin ARRÊTE d'avancer. Le traîner sur un besoin rouvert afficherait la
    // raison d'un arrêt à côté d'un besoin en marche.
    //
    // ⚠️ `on_hold` en fait partie depuis le 27/08/2026, et c'est ce que ce lot
    // répare : la route acceptait `{ status: 'on_hold', reason }` et cette
    // ligne JETAIT la raison, parce que `needStatusRequiresReason` ne disait
    // oui que pour `lost` et `cancelled`. « Mettre en veille avec motif »
    // écrivait donc une veille sans motif.
    need.status_reason = needStatusRequiresReason(next) ? trimmed : null
    // La date de reprise meurt avec la veille, comme son motif.
    need.resume_on = next === 'on_hold' ? (resumeOn ?? null) : null
    need.status_changed_at = new Date()
    const saved = await this.needs.save(need)
    // #2320.23 — le journal de la chaîne commerciale s'écrit APRÈS l'état,
    // jamais avant : un échec d'écriture du journal ne doit pas faire échouer
    // la transition qu'il ne fait qu'enregistrer.
    await this.commercialTransitions.record({
      workspaceId,
      subjectType: 'need',
      subjectId: needId,
      fromState: previousStatus,
      toState: next,
      actorId,
      proof: trimmed.length > 0 ? trimmed : null,
      source,
    })
    return toNeedWire(saved)
  }

  /**
   * #2952 (#2305.13/.14/.15/.16/.18/.35) — LA PORTE DE CONVERGENCE.
   *
   * `assertExplicitConvergenceTransition`/`assertConvergenceCitesFoundingSignals`
   * (`@bellum/contracts`) existaient sans appelant depuis leur livraison —
   * exactement le motif que ce dépôt nomme partout : du code juste que
   * personne n'appelle. Ce service EST cet appelant.
   *
   * `explicit: true` est toujours vrai ici, et c'est voulu : cette méthode
   * n'est atteignable que par le clic de la porte contrôleur
   * (`changeNeedConvergenceState`), jamais par un batch ou une reprise — le
   * geste humain explicite qu'exige #2305.18 est la route elle-même, pas un
   * paramètre qu'un appelant pourrait mentir.
   */
  async changeNeedConvergenceState(
    workspaceId: string,
    needId: string,
    to: ConvergenceState,
    foundingSignalIds: readonly string[],
  ): Promise<ProjectNeed> {
    const need = await this.needs.findOne({ where: { id: needId, workspace_id: workspaceId } })
    if (!need) throw new NotFoundException('Rôle recherché introuvable')

    const from = need.convergence_state
    if (from) {
      assertExplicitConvergenceTransition(from, to, { explicit: true })
    }
    assertConvergenceCitesFoundingSignals(to, foundingSignalIds)

    need.convergence_state = to
    const saved = await this.needs.save(need)
    return toNeedWire(saved)
  }

  /**
   * #2320.1 (épopée #2795) — le journal de la chaîne commerciale
   * (`CommercialTransitionsService`, #2320.23) s'écrit depuis le 25/09 sur
   * CE besoin (`changeNeedStatus` ci-dessus) mais AUCUNE route ne le relisait
   * — le commit qui l'a introduit l'admettait lui-même. C'est la plus petite
   * tranche qui rend le journal déjà écrit enfin OBSERVABLE : la chronologie
   * des statuts d'un besoin, dans l'ordre où ils sont survenus.
   *
   * Le journal couvre aujourd'hui uniquement `subjectType: 'need'` — la
   * fondation posée par ce lot ; le câblage shortlist/positionnement/mission
   * reste hors de cette tranche (aucun appelant n'écrit encore ces trois
   * sujets, cf. commit 0c0d84dbe).
   */
  /** #2957 (#2179.31) — ce besoin existe-t-il DANS cet espace ? Jamais un
   *  besoin d'un autre espace (GA-43) : un appel d'offres ne se lie pas à ce
   *  qu'on ne voit pas. */
  /** #4195 — UN besoin, scopé à l'espace (la route « retenir » lit son statut et son effectif). */
  async getNeed(workspaceId: string, needId: string): Promise<ProjectNeed> {
    const need = await this.needs.findOne({ where: { id: needId, workspace_id: workspaceId } })
    if (!need) throw new NotFoundException('Rôle recherché introuvable')
    return toNeedWire(need)
  }

  async hasNeed(workspaceId: string, needId: string): Promise<boolean> {
    return (await this.needs.count({ where: { id: needId, workspace_id: workspaceId } })) > 0
  }

  async needStatusHistory(workspaceId: string, needId: string): Promise<CommercialTransitionEntry[]> {
    const need = await this.needs.findOne({ where: { id: needId, workspace_id: workspaceId } })
    if (!need) throw new NotFoundException('Rôle recherché introuvable')
    return this.commercialTransitions.history('need', needId, workspaceId)
  }

  /**
   * #2320.24 (épopée #2967) — LIRE l'état de la chaîne commerciale : le statut
   * ACTUEL d'un besoin, plus son historique de transition complet (état /
   * auteur / date / preuve). `CommercialTransitionsService.history()` existait
   * déjà (#2320.23) sans aucun appelant — cette porte est le premier, pour que
   * Laura (`get_need_transition_history`, `chat_tools.py`) puisse enfin la
   * lire. `null` = besoin introuvable ou d'un AUTRE espace, jamais l'historique
   * d'un besoin qu'on ne voit pas.
   */
  async needTransitionHistory(
    workspaceId: string,
    needId: string,
  ): Promise<{ needId: string; status: string; transitions: CommercialTransitionEntry[] } | null> {
    const need = await this.needs.findOne({ where: { id: needId, workspace_id: workspaceId } })
    if (!need) return null
    const transitions = await this.commercialTransitions.history('need', needId, workspaceId)
    return { needId, status: need.status, transitions }
  }

  /**
   * Le verdict d'UNE transition, SANS l'exécuter — ordre des statuts, puis les
   * deux gates need-level (#2323.23 / #2323.25). Extrait de `changeNeedStatus`
   * pour que `needTransitionCheck` (#2320.26/.27) pose exactement la même
   * question sans écrire : un second calcul aurait pu diverger du premier
   * (GA-26).
   */
  private async needTransitionVerdict(
    need: ProjectNeedEntity,
    next: NeedStoredStatus,
  ): Promise<{ allowed: boolean; reason: string | null }> {
    const verdict = canTransitionNeedStatus(need.status, next)
    if (!verdict.allowed) return { allowed: false, reason: verdict.reason ?? null }

    // #2323.23 / #2323.25 — voir le commentaire d'origine sur `changeNeedStatus` :
    // la porte de service est le seul endroit qui voit TOUTES les routes vers
    // ces deux états (`canTransitionNeedStatus` autorise `on_hold`/
    // `to_reactivate` à les atteindre sans passer par l'ordre des onze états).
    // #4270.4 (18/10) — un forfait encadré (#3547) ne demande aucun consultant :
    // ni accord à présenter ni engagement à prouver. Un besoin staffé garde ses portes.
    if ((next === 'client_review' || next === 'won') && needRequiresStaffing(need)) {
      const submissions = await this.needSubmissionsForGate(need.id)
      if (next === 'client_review' && !needHasConsultantAgreement(submissions)) {
        return {
          allowed: false,
          reason:
            'Aucun positionnement de ce besoin n’a encore dépassé l’accord consultant : rien à présenter au client.',
        }
      }
      if (next === 'won' && !needHasEngagedConsultant(submissions)) {
        return {
          allowed: false,
          reason: 'Aucun positionnement de ce besoin n’a de consultant engagé : la mission ne peut pas démarrer.',
        }
      }
    }
    return { allowed: true, reason: null }
  }

  /**
   * #2320.26 / #2320.27 (épopée #2967) — PRÉPARER une transition sans
   * l'exécuter, et SIGNALER ce qui manque pour la franchir. Pour que Laura
   * (`propose_need_transition`, `chat_tools.py`) prépare une proposition sans
   * jamais en tenter une qu'elle sait déjà refusée. `null` = besoin introuvable
   * ou d'un AUTRE espace. Lecture pure : aucune écriture, contrairement à
   * `changeNeedStatus` dont elle partage le verdict.
   */
  async needTransitionCheck(
    workspaceId: string,
    needId: string,
    next: NeedStoredStatus,
  ): Promise<{
    currentStatus: string
    allowed: boolean
    reason: string | null
    requiresReason: boolean
    canonical: NeedCanonicalTransition
  } | null> {
    const need = await this.needs.findOne({ where: { id: needId, workspace_id: workspaceId } })
    if (!need) return null
    const verdict = await this.needTransitionVerdict(need, next)
    return {
      currentStatus: need.status,
      allowed: verdict.allowed,
      reason: verdict.reason,
      requiresReason: needStatusRequiresReason(next),
      canonical: needCanonicalTransition(need.status, next),
    }
  }

  /**
   * #2323.23 / #2323.25 — les positionnements d'un besoin, au minimum que les
   * deux gates lisent (`need-submission-gate.ts`) : `stage` et `substatus`,
   * rien de plus — ni le talent, ni le TJM, ni la fiche entière.
   */
  private async needSubmissionsForGate(
    needId: string,
  ): Promise<{ stage: SubmissionStage; substatus: SubmissionSubstatus | null }[]> {
    return (await this.needs.manager.query(`SELECT stage, substatus FROM submissions WHERE need_id = $1`, [
      needId,
    ])) as { stage: SubmissionStage; substatus: SubmissionSubstatus | null }[]
  }

  /**
   * #2173.49 — ARCHIVER / DÉSARCHIVER, un rangement NEUTRE (décision Louis,
   * 17/09/2026 matin, par QCM) : `status` ne bouge JAMAIS pour ce geste.
   *
   * Deux portes dédiées, séparées du patch générique (`updateNeed`) ET de la
   * porte d'état (`changeNeedStatus`) — exactement pour qu'aucune des deux ne
   * puisse jamais toucher `status`. La ligne est relue puis réécrite avec UN
   * SEUL champ modifié : une correction humaine posée sur `owner_id`,
   * `urgency` ou tout autre champ traverse ce geste intacte, elle n'a jamais
   * été dans le chemin.
   *
   * Idempotence REFUSÉE, comme `changeNeedStatus` (« Ce besoin est déjà dans
   * cet état ») : archiver un besoin déjà archivé — ou désarchiver un besoin
   * déjà actif — rend une erreur NOMMÉE plutôt qu'un succès silencieux, pour
   * qu'un lot dont une seule ligne était déjà dans cet état le dise (« échec
   * partiel »), au lieu de laisser croire que le geste a fait quelque chose.
   */
  async archiveNeed(workspaceId: string, needId: string, archived: boolean): Promise<ProjectNeed> {
    const need = await this.needs.findOne({ where: { id: needId, workspace_id: workspaceId } })
    if (!need) throw new NotFoundException('Rôle recherché introuvable')

    const alreadyThere = archived ? need.archived_at !== null : need.archived_at === null
    if (alreadyThere) {
      throw new BadRequestException(archived ? 'Ce besoin est déjà archivé.' : 'Ce besoin n’est pas archivé.')
    }

    need.archived_at = archived ? new Date() : null
    return toNeedWire(await this.needs.save(need))
  }

  /**
   * La porte G3 — « Ce besoin est-il staffable ? » (PDF 2 §7.6).
   *
   * L'effet est calculé par une fonction PURE (`staffableGateEffect`) : c'est
   * elle qui décide qu'un « oui » fait avancer, qu'un « non » clôt avec son
   * motif et que « pas encore » ne déplace rien. Le service ne fait que
   * persister — une porte dont la conséquence se réécrit à chaque appelant
   * finit par ne plus être la même selon l'écran.
   */
  async crossStaffableGate(
    workspaceId: string,
    needId: string,
    verdict: StaffableVerdict,
    reason: string | null,
  ): Promise<ProjectNeed> {
    const need = await this.needs.findOne({ where: { id: needId, workspace_id: workspaceId } })
    if (!need) throw new NotFoundException('Rôle recherché introuvable')

    const effect = staffableGateEffect(need.status, verdict, reason)
    if (effect.problem) throw new BadRequestException(effect.problem)

    need.staffable = effect.staffable
    need.staffable_reason = effect.reason
    need.staffable_decided_at = new Date()
    if (effect.nextStatus) {
      need.status = effect.nextStatus
      need.status_changed_at = new Date()
      // Le motif du refus voyage jusqu'au statut : un besoin clos « perdu »
      // sans raison rend le taux de perte par cause illisible, et c'est le seul
      // chiffre que cette porte existe pour produire.
      if (effect.nextStatus === 'lost') need.status_reason = effect.reason
    }
    if (effect.staffable === 'no' && effect.reason) await this.rememberUnstaffableReason(workspaceId, effect.reason)

    return toNeedWire(await this.needs.save(need))
  }

  /**
   * #2323.18 — la porte PRÉSENTER, « accord sur le type de profil ». Même
   * famille que {@link crossStaffableGate} — trois états, sans motif : aucune
   * issue de l'issue #2323 n'exige de justification pour ce geste, à la
   * différence du refus de staffabilité (§7.6, qui produit un KPI par cause).
   * Aucun effet de bord sur `status` : contrairement à `staffable`, l'issue ne
   * décrit aucune conséquence de statut pour ce flag — l'inventer fabriquerait
   * une règle qu'aucune spec ne donne.
   */
  async crossProfileTypeAgreementGate(
    workspaceId: string,
    needId: string,
    agreement: ProfileTypeAgreement,
  ): Promise<ProjectNeed> {
    const need = await this.needs.findOne({ where: { id: needId, workspace_id: workspaceId } })
    if (!need) throw new NotFoundException('Rôle recherché introuvable')

    need.profile_type_agreement = agreement
    return toNeedWire(await this.needs.save(need))
  }

  /** Les motifs de non-staffabilité de l'espace, les siens d'abord. */
  async listUnstaffableReasons(
    workspaceId: string,
    locale: 'fr' | 'en',
  ): Promise<{ items: { label: string; used: boolean }[] }> {
    const rows = await this.unstaffableReasons.find({
      where: { workspace_id: workspaceId, archived: false },
      order: { created_at: 'ASC' },
    })
    const used = rows.map(row => ({ label: row.label, used: true }))
    const known = new Set(used.map(item => item.label.toLowerCase()))
    // Les sept par défaut sont PROPOSÉS, pas insérés : un catalogue pré-rempli
    // affiche sept usages à zéro et donne l'illusion d'une liste tenue.
    const defaults = DEFAULT_UNSTAFFABLE_REASONS.map(reason => ({ label: reason[locale], used: false })).filter(
      item => !known.has(item.label.toLowerCase()),
    )
    return { items: [...used, ...defaults] }
  }

  private async rememberUnstaffableReason(workspaceId: string, label: string): Promise<void> {
    try {
      await this.unstaffableReasons
        .createQueryBuilder()
        .insert()
        .values({ workspace_id: workspaceId, label, archived: false })
        .orIgnore()
        .execute()
    } catch (cause) {
      this.logger.warn('motif de non-staffabilité non mémorisé', { error: cause, workspaceId })
    }
  }

  async removeNeed(workspaceId: string, needId: string): Promise<void> {
    const result = await this.needs.delete({ id: needId, workspace_id: workspaceId })
    if (!result.affected) throw new NotFoundException('Rôle recherché introuvable')
  }

  /* ── Les interlocuteurs du projet ────────────────────────────────────────── */

  async listContacts(workspaceId: string, projectId: string): Promise<ProjectContact[]> {
    await this.assertProject(workspaceId, projectId)
    const rows = await this.links.manager.query<
      {
        contact_id: string
        full_name: string
        title: string | null
        email: string | null
        role: string
        created_at: Date
      }[]
    >(
      `SELECT pc.contact_id, c.full_name, c.title, c.email, pc.role, pc.created_at
         FROM project_contacts pc
         JOIN contacts c ON c.id = pc.contact_id
        WHERE pc.project_id = $1 AND c.deleted_at IS NULL
        ORDER BY pc.created_at ASC`,
      [projectId],
    )
    return rows.map(row => ({
      contact_id: row.contact_id,
      full_name: row.full_name,
      title: row.title,
      email: row.email,
      role: row.role as ProjectContactRole,
      created_at: new Date(row.created_at).toISOString(),
    }))
  }

  /**
   * Rattacher une personne au projet avec son rôle. Ré-appeler avec un autre
   * rôle le CORRIGE plutôt que d'ajouter une seconde ligne : le même sponsor
   * deux fois dans un comité, c'est un comité qu'on ne croit plus.
   */
  async linkContact(
    workspaceId: string,
    projectId: string,
    contactId: string,
    role: ProjectContactRole,
  ): Promise<void> {
    const project = await this.assertProject(workspaceId, projectId)
    const contact = await this.links.manager.query<{ id: string }[]>(
      `SELECT id FROM contacts WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [contactId, project.account_id],
    )
    // Rattacher quelqu'un d'un AUTRE compte ferait apparaître, dans le comité
    // d'un client, une personne qui travaille ailleurs.
    if (!contact[0]) throw new NotFoundException('Contact introuvable sur ce compte')

    await this.links.manager.query(
      `INSERT INTO project_contacts (workspace_id, project_id, contact_id, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, contact_id) DO UPDATE SET role = EXCLUDED.role`,
      [workspaceId, projectId, contactId, role],
    )
  }

  async unlinkContact(workspaceId: string, projectId: string, contactId: string): Promise<void> {
    await this.assertProject(workspaceId, projectId)
    await this.links.delete({ project_id: projectId, contact_id: contactId })
  }

  /** Le projet existe-t-il dans l'espace de l'appelant ? Un id d'une autre équipe
   *  est un 404, jamais une écriture silencieuse chez le voisin. */
  private async assertProject(workspaceId: string, projectId: string): Promise<{ account_id: string }> {
    const rows = await this.projects.manager.query<{ account_id: string }[]>(
      `SELECT o.account_id
         FROM opportunities o
         JOIN accounts a ON a.id = o.account_id
        WHERE o.id = $1 AND (o.workspace_id = $2 OR a.workspace_id = $2) AND a.status <> 'deleted'
        LIMIT 1`,
      [projectId, workspaceId],
    )
    const project = rows[0]
    if (!project) throw new NotFoundException('Projet introuvable')
    return project
  }

  /**
   * #2939 (#2174.10) — RATTACHER LE PROJET À UNE ENTITÉ DU COMPTE (filiale, BU),
   * depuis l'étape 1 de l'assistant de création d'un besoin. La colonne existe
   * depuis toujours (`opportunities.entity_id`, lue par `open-needs.service.ts`
   * — `entity.id = project.entity_id`) et n'avait AUCUNE porte d'écriture :
   * sixième occurrence de « colonne lue, jamais écrite » de ce fichier (voir
   * `contact_id` pour la cinquième). Même patron que
   * `AccountEntitiesService.attachContact` — une entité d'un AUTRE compte la
   * ferait apparaître dans le comité d'un client qui n'est pas le sien.
   */
  async setProjectEntity(
    workspaceId: string,
    projectId: string,
    entityId: string | null,
  ): Promise<{ entity_id: string | null }> {
    const { account_id: accountId } = await this.assertProject(workspaceId, projectId)
    if (entityId) {
      const rows = await this.projects.manager.query<{ id: string }[]>(
        `SELECT id FROM account_entities WHERE id = $1 AND account_id = $2 LIMIT 1`,
        [entityId, accountId],
      )
      if (!rows[0]) throw new BadRequestException("Cette entité n'appartient pas au compte de ce projet.")
    }
    await this.projects.update({ id: projectId }, { entity_id: entityId })
    return { entity_id: entityId }
  }

  /** #2174.11 — l'interlocuteur appartient à CE compte, dans CET espace. Même
   *  raison que {@link assertProject} : un contact d'un autre compte
   *  afficherait la mauvaise personne sur le dossier client. */
  private async assertContactBelongsToAccount(
    contactId: string,
    accountId: string,
    workspaceId: string,
  ): Promise<void> {
    const rows = await this.needs.manager.query<{ id: string }[]>(
      `SELECT c.id
         FROM contacts c
         JOIN accounts a ON a.id = c.account_id
        WHERE c.id = $1 AND c.account_id = $2 AND a.workspace_id = $3
        LIMIT 1`,
      [contactId, accountId, workspaceId],
    )
    if (!rows[0]) throw new BadRequestException('Cet interlocuteur n’appartient pas à ce compte.')
  }
}

function toNeedWire(row: ProjectNeedEntity): ProjectNeed {
  return {
    id: row.id,
    // #2558.1 — un besoin existe sans projet : `null` traverse tel quel, il ne
    // se remplace pas par une chaîne vide qui se lirait comme un projet anonyme.
    project_id: row.project_id,
    account_id: row.account_id,
    title: row.title,
    skills: row.skills ?? [],
    seniority: row.seniority,
    headcount: row.headcount,
    // `bigint` revient en chaîne via le driver pg : le convertir ici évite qu'un
    // TJM s'affiche entre guillemets côté écran.
    target_tjm_cents: row.target_tjm_cents == null ? null : Number(row.target_tjm_cents),
    start_on: row.start_on,
    duration_months: row.duration_months,
    location: row.location,
    // #2173.29 — `null` traverse tel quel : non renseigné n'est jamais
    // `'sur_site'` par défaut.
    remote: (row.remote as ProjectNeed['remote']) ?? null,
    // Les exigences du poste — servies pour de bon, et plus seulement écrites.
    // Elles n'entraient pas dans cette projection : un appelant qui venait de
    // saisir une habilitation ne la revoyait pas, et la ressaisissait.
    //
    // ⚠️ `languages` est du `jsonb` : la base ne contraint pas l'échelle, et une
    // ligne importée peut porter « en:courant ». La normalisation vit dans le
    // contrat, à côté de l'échelle — un niveau hors échelle devient `null` et
    // jamais le plus proche, sans quoi on écrirait une évaluation que personne
    // n'a faite.
    languages: normaliseSpokenLanguages(row.languages),
    clearances: row.clearances ?? [],
    contract_kind: row.contract_kind as ProjectNeed['contract_kind'],
    // #3547 — rendu tel quel : `staffed` / `null` / `[]` se lisent « non dit ».
    delivery_mode: (row.delivery_mode as ProjectNeed['delivery_mode']) ?? 'staffed',
    supervision_role: (row.supervision_role as ProjectNeed['supervision_role']) ?? null,
    client_team_size: row.client_team_size ?? null,
    client_team_names: row.client_team_names ?? [],
    status: row.status as ProjectNeed['status'],
    status_reason: row.status_reason ?? null,
    resume_on: row.resume_on ? String(row.resume_on).slice(0, 10) : null,
    status_changed_at: row.status_changed_at ? new Date(row.status_changed_at).toISOString() : null,
    // Les champs du §7.3. Un `null` traverse tel quel : c'est « personne ne l'a
    // dit », et le remplacer par un défaut ferait passer une absence de réponse
    // pour un arbitrage.
    urgency: (row.urgency as ProjectNeed['urgency']) ?? null,
    source: (row.source as ProjectNeed['source']) ?? null,
    provenance: (row.provenance as ProjectNeed['provenance']) ?? null,
    detected_at: row.detected_at ? new Date(row.detected_at).toISOString() : null,
    contact_id: row.contact_id ?? null,
    owner_id: row.owner_id ?? null,
    budget_cents: row.budget_cents == null ? null : Number(row.budget_cents),
    min_tjm_cents: row.min_tjm_cents == null ? null : Number(row.min_tjm_cents),
    expertise: row.expertise ?? null,
    context: row.context ?? null,
    stack: row.stack ?? [],
    constraints: row.constraints ?? null,
    presentation_process: row.presentation_process ?? null,
    decision_process: row.decision_process ?? null,
    decision_maker_contact_id: row.decision_maker_contact_id ?? null,
    procurement_involvement: (row.procurement_involvement as ProjectNeed['procurement_involvement']) ?? null,
    interview_rounds: row.interview_rounds ?? null,
    onsite_days_per_week: row.onsite_days_per_week ?? null,
    freelance_excluded: row.freelance_excluded ?? null,
    budget_validated: row.budget_validated ?? null,
    profile_type_agreement: (row.profile_type_agreement as ProjectNeed['profile_type_agreement']) ?? 'unknown',
    staffable: (row.staffable as ProjectNeed['staffable']) ?? 'unknown',
    staffable_reason: row.staffable_reason ?? null,
    staffable_decided_at: row.staffable_decided_at ? new Date(row.staffable_decided_at).toISOString() : null,
    origin: (row.origin as ProjectNeed['origin']) ?? null,
    channel: (row.channel as ProjectNeed['channel']) ?? null,
    required_certifications: row.required_certifications ?? [],
    deadline_at: row.deadline_at ? new Date(row.deadline_at).toISOString() : null,
    // #2173.49 — ARCHIVÉ, jamais un statut. `null` = actif.
    archived_at: row.archived_at ? new Date(row.archived_at).toISOString() : null,
    // #2952 — `null` = jamais évalué, jamais un niveau deviné.
    convergence_state: row.convergence_state ?? null,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  }
}

/**
 * #2967 (lot V39) — la même transition, lue dans la machine CANONIQUE
 * (`@bellum/contracts`) : de quel stade vers quel stade, et quelles preuves
 * les gardes traversées exigent (#2320.27). Posée avec la source `laura` —
 * c'est Laura qui prépare ici, et une transition venue d'elle exige toujours
 * une validation humaine (#2320.22 / #2320.26 / #2320.28). Informative : le
 * verdict qui BLOQUE reste `needTransitionVerdict`, inchangé.
 */
type NeedCanonicalTransition = {
  fromStage: CommercialCanonicalStage | null
  toStage: CommercialCanonicalStage | null
  missingEvidence: CommercialTransitionEvidenceKey[]
  requiresHumanValidation: true
}

function needCanonicalTransition(from: string, to: string): NeedCanonicalTransition {
  const fromStage = canonicalCommercialStage('need', from)
  const toStage = canonicalCommercialStage('need', to)
  const missingEvidence =
    fromStage && toStage && fromStage !== toStage
      ? evaluateCommercialTransition({ from: fromStage, to: toStage, source: 'laura', evidence: {} }).missing
      : []
  return { fromStage, toStage, missingEvidence, requiresHumanValidation: true }
}

/** #3547 — le forfait encadré, dit en clair avant toute écriture (400). */
function assertDeliveryModeCoherent(input: {
  contract_kind?: string | null
  delivery_mode?: 'staffed' | 'supervised' | null
  supervision_role?: ProjectNeed['supervision_role']
  client_team_size?: number | null
  client_team_names?: readonly string[] | null
}): void {
  const [problem] = deliveryModeProblems(input)
  if (!problem) return
  const messages = {
    supervised_needs_forfait: 'Le forfait encadré n’existe qu’au forfait : choisis la nature « Forfait ».',
    role_without_supervised: 'Un rôle tenu (cadrage, supervision) n’a de sens qu’en forfait encadré.',
    team_without_supervised: 'Une équipe côté client n’a de sens qu’en forfait encadré.',
  } as const
  throw new BadRequestException(messages[problem])
}
