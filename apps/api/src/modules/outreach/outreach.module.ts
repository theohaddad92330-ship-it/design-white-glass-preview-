import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ConsultantAccountConsentEntity } from '../../database/entities/consultant-account-consent.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ConsultantSkillEntity } from '../../database/entities/consultant-skill.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { ActivityParticipantEntity } from '../../database/entities/activity-participant.entity'
import { PartnerRelationEntity } from '../../database/entities/partner-relation.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { MessageStyleTemplateEntity } from '../../database/entities/message-style-template.entity'
import { OutreachAssetEntity } from '../../database/entities/outreach-asset.entity'
import { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import { OutreachSequenceStepEntity } from '../../database/entities/outreach-sequence-step.entity'
import { ProjectContactEntity } from '../../database/entities/project-contact.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { TargetListItemEntity } from '../../database/entities/target-list-item.entity'
import { ContactStopEntity } from '../../database/entities/contact-stop.entity'
import { OutreachDelegationEntity } from '../../database/entities/outreach-delegation.entity'
import { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import { OutreachMessageQualityFlagEntity } from '../../database/entities/outreach-message-quality-flag.entity'
import { OutreachMessageVariableEntity } from '../../database/entities/outreach-message-variable.entity'
import { OutreachMessageVersionEntity } from '../../database/entities/outreach-message-version.entity'
import { OutreachCallTaskEntity } from '../../database/entities/outreach-call-task.entity'
import { OutreachTransitionEntity } from '../../database/entities/outreach-transition.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { ActionRouterModule } from '../action-router/action-router.module'
import { ContactStopModule } from '../contact-stop/contact-stop.module'
import { SavedViewEntity } from '../../database/entities/saved-view.entity'
import { ContactsModule } from '../contacts/contacts.module'
import { CrmModule } from '../crm/crm.module'
import { LocksModule } from '../locks/locks.module'
import { MailboxModule } from '../mailbox/mailbox.module'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { SequenceTemplatesModule } from '../sequence-templates/sequence-templates.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { CampaignAudienceController } from './campaign-audience.controller'
import { CampaignAudienceService } from './campaign-audience.service'
import { OutreachController } from './outreach.controller'
import { OutreachDelegationController } from './outreach-delegation.controller'
import { OutreachDelegationService } from './outreach-delegation.service'
import { OutreachMessageController } from './outreach-message.controller'
import { OutreachMessageService } from './outreach-message.service'
import { OutreachMessageVariablesService } from './outreach-message-variables.service'
import { OutreachCadenceService } from './outreach-cadence.service'
import { OutreachSendSweeper } from './outreach-send.sweeper'
import { OutreachAutomationAdapter } from './outreach-automation.adapter'
import { AUTOMATION_ACTIONS_PORT } from '../automation-rules/automation-ports'
import { OutreachService } from './outreach.service'
import { BenchPushService } from './bench-push.service'

/**
 * Séquences d'outreach multi-touch (roadmap §8 + §5). Module autonome (Craft
 * rule #7) : il ne réimplémente aucune capacité — les rappels datés passent par
 * l'Action Router (`schedule_reminder` → journal `user_actions`), la
 * préparation email snapshotte le brouillon existant.
 *
 * #3069 — L'ENVOI D'UN MESSAGE `approved` PART DÉSORMAIS DE CE MODULE, PAS D'UN
 * CLIC. `approveMany` reste le SEUL endroit qui décide (une preuve humaine par
 * message, `message.approval`) ; `OutreachSendSweeper` ne fait qu'EXÉCUTER une
 * décision déjà prise, par le même connecteur gouverné que le send-email #394
 * (`MailboxService.sendBatch`) — jamais un second chemin.
 */
@Module({
  imports: [
    WorkspaceModule,
    ActionRouterModule,
    // #4418 — la cadence de relances, planifiée aussi par « Marquer envoyé ». Sens unique :
    // `ContactsModule` n'importe jamais celui-ci.
    ContactsModule,
    // La porte « ne me contactez plus ». Sans cette ligne l'injection échoue au
    // DÉMARRAGE et nulle part avant (GA-42) — et une séquence s'armerait sur
    // quelqu'un qui a demandé qu'on cesse.
    ContactStopModule,
    // La capacité d'envoi réelle — désormais résolue par le dispatcher (#3069).
    MailboxModule,
    // #2386.3 — le reflet best-effort sur la fiche CRM après un envoi confirmé
    // (`OutreachSendSweeper.mirrorSentToCrm`). FEUILLE, comme pour
    // `ActivitiesModule` : `CrmModule` n'importe jamais ce module en retour.
    CrmModule,
    // #3756 — la bibliothèque de modèles de séquence (application d'un modèle).
    SequenceTemplatesModule,
    // GA-76/GA-77 — sans cette ligne, `@Optional() locks?` du sweeper résoudrait
    // `undefined` : le verrou dégraderait en exécution directe, et N répliques
    // enverraient chacune le même message.
    LocksModule,
    // #4016 L5 — les bornes d'un mandat d'envoi sont un réglage PAR PLAN (`sendBoundsOfPlan`) :
    // le contrôleur des mandats lit le palier de l'espace. FEUILLE : ce module n'importe pas l'outreach.
    PlanFeaturesModule,
    TypeOrmModule.forFeature([
      OutreachSequenceEntity,
      OutreachSequenceStepEntity,
      // #2366 — le modèle canonique (message, versions, appel, transitions).
      // Sans ces lignes, l'injection échoue au DÉMARRAGE (GA-20).
      OutreachDelegationEntity,
      ContactStopEntity,
      OutreachMessageEntity,
      OutreachMessageVersionEntity,
      // #2877 (#2385.4) — les signaux qualité déclarés par le relecteur.
      OutreachMessageQualityFlagEntity,
      OutreachMessageVariableEntity,
      OutreachCallTaskEntity,
      OutreachTransitionEntity,
      // #2372.6 — le gate d'envoi conditionnel lit le catalogue à la préparation.
      OutreachAssetEntity,
      ContactEntity,
      AccountEntity,
      UserActionEntity,
      // Les seuils d'approbation de l'espace. Sans cette ligne, l'injection
      // échoue au DÉMARRAGE et Railway rejette le déploiement au healthcheck,
      // sans qu'aucun test ne tombe (GA-20).
      WorkspaceEntity,
      // #2369.12 — vérifier (appartenance à l'espace, statut `active`) le style
      // relié à la préparation d'un message, en LECTURE seule.
      MessageStyleTemplateEntity,
      // #2974 (lot V39, #2380.7 lot R07) — les sources du constructeur
      // d'audience, lues seulement : les liens contact↔opportunité, les
      // listes de cibles, et (demandeur/décideur) les liens contact↔besoin.
      ProjectContactEntity,
      TargetListItemEntity,
      ProjectNeedEntity,
      // #2974 (lot E3, #2380.11 / #2380.13) — participants d'un événement et
      // contacts des ESN partenaires, lus seulement.
      ActivityEntity,
      ActivityParticipantEntity,
      PartnerRelationEntity,
      // #2202.12 — la vue enregistrée comme source d'audience, lue seulement.
      SavedViewEntity,
      // #5029.1 — « Proposer ce profil » : le consultant, ses compétences et son consentement par compte,
      // lus seulement (`BenchPushService`). Sans ces lignes, l'injection échoue au DÉMARRAGE (GA-20).
      ConsultantEntity,
      ConsultantSkillEntity,
      ConsultantAccountConsentEntity,
    ]),
  ],
  controllers: [
    OutreachController,
    OutreachMessageController,
    OutreachDelegationController,
    CampaignAudienceController,
  ],
  providers: [
    OutreachService,
    // Lot L-B (#4165) — le socle multicanal. Sans cette ligne l'injection échoue au DÉMARRAGE (GA-20).
    OutreachCadenceService,
    OutreachMessageService,
    OutreachMessageVariablesService,
    OutreachSendSweeper,
    OutreachDelegationService,
    CampaignAudienceService,
    // #5029.1 — prépare la séquence « Proposer ce profil » (lecture seule).
    BenchPushService,
    // Lot L-D1 (#4167) — COMMENT une règle d'automatisation inscrit et prépare : les mêmes portes que le geste manuel.
    OutreachAutomationAdapter,
    { provide: AUTOMATION_ACTIONS_PORT, useExisting: OutreachAutomationAdapter },
  ],
  // #4016 L5 (reprise 20/10) — le mandat est relu par ses APPELANTS (Laura, Action OS).
  exports: [OutreachService, OutreachMessageService, OutreachDelegationService, AUTOMATION_ACTIONS_PORT],
})
export class OutreachModule {}
