import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountFeedbackEntity } from '../../database/entities/account-feedback.entity'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { ChatReplyFeedbackEntity } from '../../database/entities/chat-reply-feedback.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { OrgGraphModule } from '../org-graph/org-graph.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AccountFeedbackController } from './account-feedback.controller'
import { IaModule } from '../ia/ia.module'
import { AccountFeedbackService } from './account-feedback.service'
import { ReplyFeedbackController } from './reply-feedback.controller'
import { ReplyFeedbackService } from './reply-feedback.service'
import { FirstProofRecetteService } from './first-proof-recette.service'
import { InternalFirstProofRecetteController } from './internal-first-proof-recette.controller'
import { InternalSecretGuard } from '../../common/internal-secret.guard'

/**
 * Boucle de feedback dossier (A2) : capture structurée des retours utilisateur
 * (`POST /accounts/:id/feedback`) + mémoire par compte/workspace condensée en
 * directives de correction. Exporte {@link AccountFeedbackService} pour que
 * l'analyse (re-run/refresh) et le chat-context réinjectent ces directives.
 *
 * Volontairement AUCUNE dépendance à AccountsModule (le check d'appartenance
 * passe par le repo AccountEntity) ni à AuthModule (la stratégie passport
 * 'jwt' du JwtGuard est enregistrée une fois au scope app, comme pour
 * AccountsModule) : AnalysisModule peut nous importer sans créer de cycle
 * Analysis → AccountFeedback → Accounts → Analysis. Module autonome (règle #7)
 * — le retirer ne casse pas le reste.
 */
@Module({
  imports: [
    WorkspaceModule,
    OrgGraphModule,
    // Recalcul déterministe du score après correction (P1-10).
    IaModule,
    // #1919 — les retours sur les réponses de Laura : leur table, le message
    // retrouvé par empreinte, et le cloisonnement du compte / contact visés.
    TypeOrmModule.forFeature([
      AccountFeedbackEntity,
      AccountEntity,
      ChatReplyFeedbackEntity,
      ChatMessageEntity,
      ContactEntity,
      // #2076.13 — la portée de réutilisation de l'espace, recopiée sur le retour.
      EsnProfileEntity,
    ]),
  ],
  // #2076.13 — la recette produit de la « première preuve » (back-office).
  controllers: [AccountFeedbackController, ReplyFeedbackController, InternalFirstProofRecetteController],
  providers: [AccountFeedbackService, ReplyFeedbackService, FirstProofRecetteService, InternalSecretGuard],
  // `ReplyFeedbackService` est lu par le contrôleur du chat (#1919.15).
  exports: [AccountFeedbackService, ReplyFeedbackService],
})
export class AccountFeedbackModule {}
