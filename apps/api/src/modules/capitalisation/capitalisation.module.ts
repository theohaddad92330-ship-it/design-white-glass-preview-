import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountPartnerEntity } from '../../database/entities/account-partner.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import { LostDealRexEntity } from '../../database/entities/lost-deal-rex.entity'
import { LostDealRuleProposalEntity } from '../../database/entities/lost-deal-rule-proposal.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { ProofEntity } from '../../database/entities/proof.entity'
import { RecordFieldAuditEntity } from '../../database/entities/record-field-audit.entity'
import { WorkspaceMethodRuleEntity } from '../../database/entities/workspace-method-rule.entity'
import { RexEntryEntity } from '../../database/entities/rex-entry.entity'
import { TestimonialEntity } from '../../database/entities/testimonial.entity'
import { MarketMemoryModule } from '../market-memory/market-memory.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { CapitalisationController } from './capitalisation.controller'
import { InternalRexController } from './internal-rex.controller'
import { CapitalisationService } from './capitalisation.service'
import { WorkspaceMethodRulesController } from './workspace-method-rules.controller'
import { WorkspaceMethodRulesService } from './workspace-method-rules.service'

/**
 * La capitalisation (PDF 2 §12). Module autonome (règle #7) : le retirer fait
 * disparaître l'onglet Preuves & REX, sans toucher aux missions dont il tire
 * ses faits.
 */
@Module({
  imports: [
    // ⚠️ Tout dépôt INJECTÉ se déclare ici (GA-20) : un `@InjectRepository` sans
    // son `forFeature` passe les tests unitaires — qui construisent le service à
    // la main — et ne casse qu'au démarrage réel.
    TypeOrmModule.forFeature([
      ProofEntity,
      RexEntryEntity,
      TestimonialEntity,
      MissionEntity,
      // #3544.4 — l'auteur d'un REX (nom, e-mail) pour le diagnostic du DM.
      ProfileEntity,
      AccountEntity,
      // #3295 — lecture seule : les actions posées sous une règle apprise.
      ActionPlanItemEntity,
      // #3210.1 — les ESN partenaires en place, pour la comparaison de cas.
      AccountPartnerEntity,
      ProjectNeedEntity,
      // #2424.14 — le journal d'audit des écritures de preuve.
      RecordFieldAuditEntity,
      // BEL-SC-243 (#3272) — REX perte + apprentissage contrôlé.
      LostDealRexEntity,
      LostDealRuleProposalEntity,
      // #3295 — la règle promue d'une proposition adoptée.
      WorkspaceMethodRuleEntity,
      // #3210 (LAU-FINAL-216) — les opportunités PERDUES, seule source du
      // dépôt qui porte un motif d'échec (`loss_reason`) : `similarCases` en
      // a besoin pour que Laura apprenne aussi des échecs, pas seulement des
      // REX (qui ne couvrent que les missions gagnées).
      ProjectEntity,
      // #3210.1 (lot R17) — les canaux déjà utilisés (`outreach_messages.channel`,
      // jamais le corps du message) pour la comparaison de cas, via les contacts du compte.
      ContactEntity,
      OutreachMessageEntity,
      // #3210.1 (lot M11) — les rendez-vous captés (`activities.kind = 'meeting'`).
      ActivityEntity,
    ]),
    WorkspaceModule,
    // #1638.2 — la prévalence des technologies dans le référentiel, lue par le
    // CONTRÔLEUR. Le service reste `@Optional()` de son côté : retirer cette
    // ligne fait disparaître le palier et rien d'autre.
    MarketMemoryModule,
  ],
  controllers: [CapitalisationController, WorkspaceMethodRulesController, InternalRexController],
  providers: [CapitalisationService, WorkspaceMethodRulesService],
  exports: [CapitalisationService, WorkspaceMethodRulesService],
})
export class CapitalisationModule {}
