import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { WorkspaceMemberPermissionEntity } from '../../database/entities/workspace-member-permission.entity'
import { WorkspaceRulesEntity } from '../../database/entities/workspace-rules.entity'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { ProductEventEntity } from '../../database/entities/product-event.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { TaskEntity } from '../../database/entities/task.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceInvitationEntity } from '../../database/entities/workspace-invitation.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { WorkspaceActiveSelectionEntity } from '../../database/entities/workspace-active-selection.entity'
import { WorkspaceBridgeContactEntity } from '../../database/entities/workspace-bridge-contact.entity'
import { LocksModule } from '../locks/locks.module'
import { MailerModule } from '../mailer/mailer.module'
import { PlanCatalogModule } from '../credits/plan-catalog.module'
import { WorkspaceActivityService } from './workspace-activity.service'
import { WorkspaceContextService } from './workspace-context.service'
import { WorkspaceController } from './workspace.controller'
import { WorkspaceLauraModeService } from './workspace-laura-mode.service'
import { WorkspaceMarketService } from './workspace-market.service'
import { WorkspaceTimezoneService } from './workspace-timezone.service'
import { WorkspaceHiddenSectionsService } from './workspace-hidden-sections.service'
import { WorkspacePermissionGuard } from './workspace-permission.guard'
import { WorkspaceMemoryController } from './workspace-memory.controller'
import { WorkspaceMemoryCrossingsService } from './workspace-memory-crossings.service'
import { WorkspacePortfolioHandoverService } from './workspace-portfolio-handover.service'
import { WorkspaceTeamService } from './workspace-team.service'
import { WorkspaceInvitationExpirySweeper } from './workspace-invitation-expiry.sweeper'
import { WorkspaceBrandService } from './workspace-brand.service'
import { BrandController } from './brand.controller'
import { WorkspaceRulesController } from './workspace-rules.controller'
import { WorkspaceRulesService } from './workspace-rules.service'
// #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes :
// le marché inversé et la charge commerciale n'ont plus qu'UNE table chacun,
// celle de la production, et un seul service (GA-26).
import { WorkspaceReverseMarketSettingsEntity } from '../../database/entities/workspace-reverse-market-settings.entity'
import { WorkspaceReverseMarketSettingsService } from './workspace-reverse-market-settings.service'
import { WorkspaceReverseMarketSettingsController } from './workspace-reverse-market-settings.controller'
import { WorkspaceCommercialLoadSettingsEntity } from '../../database/entities/workspace-commercial-load-settings.entity'
import { WorkspaceCommercialLoadSettingsService } from './workspace-commercial-load-settings.service'
import { WorkspaceCommercialLoadSettingsController } from './workspace-commercial-load-settings.controller'
// #2770.37 — la politique d'équipe (Réglages › Équipe), lue par Laura via le pont.
import { WorkspaceTeamPolicySettingsEntity } from '../../database/entities/workspace-team-policy-settings.entity'
import { WorkspaceTeamPolicySettingsService } from './workspace-team-policy-settings.service'
import { WorkspaceTeamPolicySettingsController } from './workspace-team-policy-settings.controller'

/**
 * Multi-user workspace module.
 *
 * - {@link WorkspaceContextService} (Phase 2 foundation) resolves the caller's
 *   active workspace so any team-scoped module can scope reads by `workspace_id`.
 * - {@link WorkspaceTeamService} + {@link WorkspaceController} (Phase 3/4) power
 *   the "Équipe" screen: invitations (email + accept token), member management
 *   and the owner/admin role guards.
 * - {@link WorkspaceMarketService} resolves/persists the workspace's target
 *   market (country) — the knob that drives a run's sources, locale, legal basis
 *   and the `country` param propagated to the IA country packs (FR = default).
 *
 * See `agent_docs/multi-user-workspaces.md`.
 */
@Module({
  imports: [
    ConfigModule,
    // #4158.3 — le balayeur d'invitations expirées prend le verrou singleton (une réplique à la fois).
    LocksModule,
    MailerModule,
    // DB-backed plan catalog — WorkspaceTeamService reads per-plan seats from it.
    PlanCatalogModule,
    TypeOrmModule.forFeature([
      WorkspaceEntity,
      WorkspaceMemberEntity,
      WorkspaceInvitationEntity,
      // The user's persisted "which workspace am I working in" choice — what
      // makes belonging to several teams usable (a preference, never a right).
      WorkspaceActiveSelectionEntity,
      ProfileEntity,
      SubscriptionEntity,
      // Journal d'activité (Théo p.21 P2) — read-only view over the append-only
      // product_events stream, scoped by workspace behind `team:manage`.
      ProductEventEntity,
      // Retirer un membre libère son portefeuille : sans ces deux dépôts, ses
      // comptes gardent l'identifiant d'un non-membre — invisibles dans la file
      // des non-attribués, et verrouillés au libre-service.
      AccountEntity,
      ContactEntity,
      // #4158.4 / #4158.29 — les actions déléguées du partant sont libérées avec son portefeuille ; étapes de plan et relances reprises, bornées par le compte.
      ActionPlanItemEntity,
      // La REPRISE d'un portefeuille (tome 8 §33, angle mort n°2) : les quatre
      // autres tables qui portent un responsable nommé. Sans elles, un membre
      // qui part emporte ses tâches, ses opportunités, ses besoins et ses
      // missions — ils resteraient chez un non-membre, donc chez personne.
      TaskEntity,
      ProjectEntity,
      ProjectNeedEntity,
      MissionEntity,
      // Les permissions accordées en propre, lues par `can()` à chaque requête
      // gardée — c'est le seul endroit qui répond « a-t-il le droit ».
      WorkspaceMemberPermissionEntity,
      // #2081.14 — les règles d'espace, lues par `WorkspaceContextService` à
      // chaque décision qu'elles gouvernent (export, visibilité des unités).
      // Sans ce dépôt, le contexte retomberait sur les défauts : la ligne est
      // donc vérifiée par `workspace.module.spec.ts`.
      WorkspaceRulesEntity,
      // LA MÉMOIRE COLLECTIVE — « le pont, pas le dossier ». Seul le journal de
      // contribution est déclaré : c'est la seule table que le service écrit,
      // donc le seul dépôt qu'il injecte. Les quatre dérivations lisent en SQL
      // borné par `workspace_id`, sans passer par un dépôt — déclarer ici des
      // entités que personne n'injecte ferait une liste qui ne dit plus rien.
      WorkspaceBridgeContactEntity,
      // #2035.10 / #2035.11 — les deux réglages d'espace, tables de production.
      WorkspaceReverseMarketSettingsEntity,
      WorkspaceCommercialLoadSettingsEntity,
      WorkspaceTeamPolicySettingsEntity,
    ]),
  ],
  controllers: [
    WorkspaceController,
    WorkspaceMemoryController,
    BrandController,
    WorkspaceRulesController,
    WorkspaceReverseMarketSettingsController,
    WorkspaceCommercialLoadSettingsController,
    WorkspaceTeamPolicySettingsController,
  ],
  providers: [
    WorkspaceBrandService,
    WorkspaceContextService,
    WorkspaceTeamService,
    WorkspaceInvitationExpirySweeper,
    WorkspaceMarketService,
    WorkspaceTimezoneService,
    WorkspaceHiddenSectionsService,
    WorkspaceLauraModeService,
    WorkspaceActivityService,
    WorkspacePermissionGuard,
    WorkspacePortfolioHandoverService,
    WorkspaceMemoryCrossingsService,
    WorkspaceRulesService,
    WorkspaceReverseMarketSettingsService,
    WorkspaceCommercialLoadSettingsService,
    WorkspaceTeamPolicySettingsService,
  ],
  // `WorkspaceTeamService` is exported for the backoffice: sales-led provisioning
  // invites the client's team through THIS flow (seat cap, invite dedupe, token,
  // email) rather than re-implementing invitations beside it.
  exports: [
    WorkspaceBrandService,
    WorkspaceContextService,
    WorkspaceMarketService,
    WorkspacePermissionGuard,
    WorkspaceTeamService,
    // #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations
    // concurrentes. Ces deux services sont exportés parce que leurs LECTEURS
    // vivent ailleurs : `ReverseMarketService.forTalent` (module
    // `consultants`) et `OpenNeedsService.list` (module `projects`). Les
    // exporter, plutôt que de laisser chaque module relire la table, est
    // précisément ce qui fait qu'un réglage vit à un seul endroit (GA-26).
    WorkspaceReverseMarketSettingsService,
    WorkspaceCommercialLoadSettingsService,
    WorkspaceTeamPolicySettingsService,
    // #2451.1 — le mode de contexte par défaut de l'espace a des LECTEURS hors
    // de ce module : Découvrir (`ia-proxy`), Analyser (`analysis`) et le contrat
    // de contexte. Exporté pour qu'aucun ne relise la colonne lui-même (GA-26).
    WorkspaceLauraModeService,
  ],
})
export class WorkspaceModule {}
