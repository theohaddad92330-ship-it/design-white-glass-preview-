import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { ActivationStepStatus, OnboardingActivation } from '@bellum/contracts'
import { failure, success, type Result } from '@bellum/utils'
import { In, Repository } from 'typeorm'
import { AccountFeedbackEntity } from '../../database/entities/account-feedback.entity'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { GoogleConnectionEntity } from '../../database/entities/google-connection.entity'
import { MicrosoftConnectionEntity } from '../../database/entities/microsoft-connection.entity'
import { ProductEventEntity } from '../../database/entities/product-event.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkspaceInvitationEntity } from '../../database/entities/workspace-invitation.entity'
import { WorkspaceTeamService } from '../workspace/workspace-team.service'
import type { OnboardingFailure } from './onboarding.service'

/** `user_actions.action_type` values that count as "first message prepared" —
 *  a copy is as much activation as a send (the rep took the message out). */
const MESSAGE_ACTION_TYPES = [
  'message_copied',
  'message_sent',
  'plan_action_message_copied',
  'plan_action_message_sent',
] as const

/**
 * Derives the self-serve activation checklist (8 milestones) from REAL data
 * only — nothing is stored, nothing can drift, no fake progress:
 *
 *  ① profile_completed — #2077.3, D9 : le contexte commercial a été VALIDÉ par
 *    cet utilisateur (`profiles.profile_context_status === 'validated'`), pas
 *    seulement rempli. Un profil rempli n'est pas un profil validé.
 *  ② analysis_launched — at least one `analysis_runs` row launched by the user.
 *  ③ dossier_viewed    — an `account_viewed` product event (emitted when the
 *    user opens a COMPLETED dossier, see AccountsController.findOne).
 *  ④ contact_enriched  — a `contact_enriched` product event (provider matched,
 *    credit burned) OR a plan enrichment request in `user_actions`.
 *  ⑤ message_prepared  — a copied/sent message action in `user_actions`.
 *  ⑦ correction_made   — #2077.6, an `account_feedback` row written by this
 *    user: « ce play est hors sujet », « ce contact n'est plus là ». C'est le
 *    geste par lequel le dossier cesse d'être « ce qu'une machine a trouvé »
 *    pour devenir « ce que mon équipe sait » — et il revient dans l'analyse
 *    suivante du même compte. La ligne appartient à l'espace, le JALON est
 *    personnel (`user_id`), comme les six autres.
 *  ⑥ tool_connected    — #1810, a `google_connections`, `microsoft_connections`
 *    or `crm_connections` row for this user (mailbox, agenda or CRM — ANY one
 *    of them, never all three: the milestone is « you took a first step »,
 *    not « you connected everything », and `/integrations` stays the place
 *    where the rest happens on your own time).
 *  ⑧ colleague_invited — #2077.9, TRI-ÉTAT (jamais booléen) : `done` dès qu'une
 *    `workspace_invitations` row porte `invited_by = userId` ; sinon `pending`
 *    quand l'utilisateur PEUT encore inviter (`team:manage` + siège libre,
 *    {@link WorkspaceTeamService.canInviteColleague}) ; sinon `not_applicable`
 *    — sorti du dénominateur d'activation, jamais compté comme « pas encore ».
 *
 * Everything is scoped to the requesting user (`user_id`), never the workspace:
 * activation is personal — a teammate's analysis doesn't activate me, and a
 * teammate's CRM connection doesn't either (its `user_id` is the connector's).
 */
@Injectable()
export class ActivationService {
  constructor(
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(AnalysisRunEntity)
    private readonly runs: Repository<AnalysisRunEntity>,
    @InjectRepository(ProductEventEntity)
    private readonly events: Repository<ProductEventEntity>,
    @InjectRepository(UserActionEntity)
    private readonly actions: Repository<UserActionEntity>,
    @InjectRepository(GoogleConnectionEntity)
    private readonly googleConnections: Repository<GoogleConnectionEntity>,
    @InjectRepository(MicrosoftConnectionEntity)
    private readonly microsoftConnections: Repository<MicrosoftConnectionEntity>,
    @InjectRepository(CrmConnectionEntity)
    private readonly crmConnections: Repository<CrmConnectionEntity>,
    // #2077.6 — LECTURE seule, comme toutes les sources de ce service.
    @InjectRepository(AccountFeedbackEntity)
    private readonly feedback: Repository<AccountFeedbackEntity>,
    // #2077.9 — LECTURE seule : ce service n'écrit jamais d'invitation.
    @InjectRepository(WorkspaceInvitationEntity)
    private readonly invitations: Repository<WorkspaceInvitationEntity>,
    // #2077.9 — la seule dérivation de « peut inviter » (rôle + sièges) vit
    // dans `WorkspaceTeamService` (module-boundaries.spec.ts, +1 justifié) :
    // la recalculer ici créerait un second chemin qui diverge du premier.
    private readonly workspaceTeam: WorkspaceTeamService,
  ) {}

  async getActivation(userId: string): Promise<Result<OnboardingActivation, OnboardingFailure>> {
    try {
      const [
        profile,
        runCount,
        viewCount,
        enrichEventCount,
        enrichActionCount,
        messageCount,
        googleCount,
        microsoftCount,
        crmCount,
        feedbackCount,
        invitedByMeCount,
        canInvite,
      ] = await Promise.all([
        this.profiles.findOne({ where: { user_id: userId } }),
        this.runs.count({ where: { user_id: userId } }),
        this.events.count({ where: { user_id: userId, event_name: 'account_viewed' } }),
        this.events.count({ where: { user_id: userId, event_name: 'contact_enriched' } }),
        this.actions.count({ where: { user_id: userId, action_type: 'plan_action_enrichment_requested' } }),
        this.actions.count({ where: { user_id: userId, action_type: In([...MESSAGE_ACTION_TYPES]) } }),
        this.googleConnections.count({ where: { user_id: userId } }),
        this.microsoftConnections.count({ where: { user_id: userId } }),
        this.crmConnections.count({ where: { user_id: userId } }),
        this.feedback.count({ where: { user_id: userId } }),
        this.invitations.count({ where: { invited_by: userId } }),
        this.workspaceTeam.canInviteColleague(userId),
      ])

      const colleagueInvited: ActivationStepStatus =
        invitedByMeCount > 0 ? 'done' : canInvite ? 'pending' : 'not_applicable'

      const steps = {
        // LUDB.1 — validé OU rempli : un contexte généré (`succeeded`, contenu
        // présent) vaut profil complété, recalculé à la lecture, sans écrire.
        profile_completed:
          profile?.profile_context_status === 'validated' ||
          (profile?.profile_context_status === 'succeeded' && profile.profile_context != null),
        analysis_launched: runCount > 0,
        dossier_viewed: viewCount > 0,
        contact_enriched: enrichEventCount > 0 || enrichActionCount > 0,
        message_prepared: messageCount > 0,
        tool_connected: googleCount > 0 || microsoftCount > 0 || crmCount > 0,
        // #2077.6 — un seul retour suffit : le jalon dit « tu as corrigé une
        // fois », pas « tu corriges assez ».
        correction_made: feedbackCount > 0,
      }
      // #2077.9 — `not_applicable` sort du numérateur ET du dénominateur : un
      // jalon qu'on ne peut jamais atteindre ne doit ni compter comme fait, ni
      // empêcher `is_complete` (doctrine « non mesuré n'est jamais 0 »).
      const booleanDoneCount = Object.values(steps).filter(Boolean).length
      const completedCount = booleanDoneCount + (colleagueInvited === 'done' ? 1 : 0)
      const applicableCount = Object.keys(steps).length + (colleagueInvited === 'not_applicable' ? 0 : 1)

      return success({
        ...steps,
        colleague_invited: colleagueInvited,
        completed_count: completedCount,
        is_complete: completedCount === applicableCount,
      })
    } catch (cause) {
      return failure({ code: 'persist_failed', message: "Impossible de calculer l'activation", cause })
    }
  }
}
