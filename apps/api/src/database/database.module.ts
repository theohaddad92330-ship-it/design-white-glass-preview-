import { Global, Logger, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm'
import { join } from 'node:path'
import { BackgroundDbBudget, buildBackgroundDbBudget } from './background-pool-budget'
import { MessageLibraryEntryEntity } from './entities/message-library-entry.entity'
import { MessageLibraryTraceEntity } from './entities/message-library-trace.entity'
import { AiToolCallAuditLogEntity } from './entities/ai-tool-call-audit-log.entity'
import { AtsConnectionEntity } from './entities/ats-connection.entity'
import { BeeperConnectionEntity } from './entities/beeper-connection.entity'
import { ChatToolCallRecordingEntity } from './entities/chat-tool-call-recording.entity'
import { DemoLeadEntity } from './entities/demo-lead.entity'
import { MailBatchEntity } from './entities/mail-batch.entity'
import { MailThreadMarkEntity } from './entities/mail-thread-mark.entity'
import { NeedPlayEntity } from './entities/need-play.entity'
import { PrivacyExportAuditLogEntity } from './entities/privacy-export-audit-log.entity'
import { ProviderCostEntity } from './entities/provider-cost.entity'
import { SecurityEventEntity } from './entities/security-event.entity'
import { RoutineBudgetCapEntity } from '../modules/routines/routine-budget-cap.entity'
import { RoutineContentEntity } from '../modules/routines/routine-content.entity'
import { RoutinePreferenceEntity } from '../modules/routines/routine-preference.entity'
import { RoutineRunEntity } from './entities/routine-run.entity'
import { RoutineSubscriptionEntity } from './entities/routine-subscription.entity'
import { FactoringContractEntity } from './entities/factoring-contract.entity'
import { FactoringSettlementEntity } from './entities/factoring-settlement.entity'
import { ReceivableAssignmentEntity } from './entities/receivable-assignment.entity'
import { AccountEntity } from './entities/account.entity'
import { WeakestLinkDiagnosisEntity } from './entities/weakest-link-diagnosis.entity'
import { AccountFeedbackEntity } from './entities/account-feedback.entity'
import { DiscoverCandidateFeedbackEntity } from './entities/discover-candidate-feedback.entity'
import { ChatArtifactVersionEntity } from './entities/chat-artifact-version.entity'
import { ChatReplyFeedbackEntity } from './entities/chat-reply-feedback.entity'
import { AccountShareEntity } from './entities/account-share.entity'
import { AccountVocabularyEntity } from './entities/account-vocabulary.entity'
import { ActionPlanEntity } from './entities/action-plan.entity'
import { AnalysisRunEntity } from './entities/analysis-run.entity'
import { ApiKeyEntity } from './entities/api-key.entity'
import { ActionPlanItemEntity } from './entities/action-plan-item.entity'
import { AttackAngleEntity } from './entities/attack-angle.entity'
import { BannerEntity } from './entities/banner.entity'
import { ConsultantEntity } from './entities/consultant.entity'
import { ConsultantAccountConsentEntity } from './entities/consultant-account-consent.entity'
import { ConsultantCvRewriteEntity } from './entities/consultant-cv-rewrite.entity'
import { CvVersionEntity } from './entities/cv-version.entity'
import { CvBatchImportJobEntity } from './entities/cv-batch-import-job.entity'
import { BulkMatchingJobEntity } from './entities/bulk-matching-job.entity'
import { NeedAutoMatchEntity } from './entities/need-auto-match.entity'
import { BulkExportJobEntity } from './entities/bulk-export-job.entity'
import { BulkCvRewriteJobEntity } from './entities/bulk-cv-rewrite-job.entity'
import { MultiSourceSearchJobEntity } from './entities/multi-source-search-job.entity'
import { PersonalContactEntity } from './entities/personal-contact.entity'
import { UniversalImportIssueEntity, UniversalImportJobEntity } from './entities/universal-import-job.entity'
import { ContextPackImportEntity } from './entities/context-pack-import.entity'
import { SkillAliasProposalEntity } from './entities/skill-alias-proposal.entity'
import { ConsultantSkillEntity } from './entities/consultant-skill.entity'
import { ConsultantExperienceEntity } from './entities/consultant-experience.entity'
import { TalentPreparedMessageEntity } from './entities/talent-prepared-message.entity'
import { SubmissionEntity } from './entities/submission.entity'
import { MatchRunEntity, MatchRunEntryEntity, MatchWeightVersionEntity } from './entities/match-run.entity'
import { ShortlistEntity, ShortlistEntryEntity } from './entities/shortlist.entity'
import { InterviewEntity } from './entities/interview.entity'
import { SubmissionFeedbackEntity } from './entities/submission-feedback.entity'
import { SubmissionConsultantFeedbackEntity } from './entities/submission-consultant-feedback.entity'
import { ConsultantDocumentEntity } from './entities/consultant-document.entity'
import { TalentIdentityDecisionEntity } from './entities/talent-identity-decision.entity'
import { MarketVerificationReceiptEntity } from './entities/market-verification-receipt.entity'
import { ConsultantPushFeedbackEntity } from './entities/consultant-push-feedback.entity'
import { ProjectEntity } from './entities/project.entity'
import { ProjectNeedEntity } from './entities/project-need.entity'
import { ContactCrmExportEntity } from './entities/contact-crm-export.entity'
import { ProjectContactEntity } from './entities/project-contact.entity'
import { DealStageSlaEntity } from './entities/deal-stage-sla.entity'
// #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes.
// Les deux réglages d'espace (marché inversé, charge commerciale) tiennent
// dans les DEUX tables de production ; la paire `..._capacity_settings` de la
// vague 3, jamais déployée, a disparu (GA-26).
import { PipelineStageLabelEntity } from './entities/pipeline-stage-label.entity'
import { LossReasonEntity } from './entities/loss-reason.entity'
import { SignalHistoryEntity } from './entities/signal-history.entity'
import { BetaFeedbackEntity } from './entities/beta-feedback.entity'
import { ContactEntity } from './entities/contact.entity'
import { AccountMemoryEntity } from './entities/account-memory.entity'
import { ContactStopEntity } from './entities/contact-stop.entity'
import { WorkspaceDoNotContactEntity } from './entities/workspace-do-not-contact.entity'
import { AccountTeamMemberEntity } from './entities/account-team-member.entity'
import { AccountTeamScopeEntity } from './entities/account-team-scope.entity'
import { ContactIntakeExclusionEntity } from './entities/contact-intake-exclusion.entity'
import { PersonErasureEntity } from './entities/person-erasure.entity'
import { ContactLifecycleTransitionEntity } from './entities/contact-lifecycle-transition.entity'
import { ContactMergeEntity } from './entities/contact-merge.entity'
import { ContactDuplicateDecisionEntity } from './entities/contact-duplicate-decision.entity'
import { CommercialTransitionEntity } from './entities/commercial-transition.entity'
import { OpportunityFieldChangeEntity } from './entities/opportunity-field-change.entity'
import { CommercialAuditFeedbackEntity } from './entities/commercial-audit-feedback.entity'
import { ProspectingSessionEntity } from './entities/prospecting-session.entity'
import { CreditLedgerEntity } from './entities/credit-ledger.entity'
import { ChatMessageEntity } from './entities/chat-message.entity'
import { ChatReplyMemoryUseEntity } from './entities/chat-reply-memory-use.entity'
import { ChatEvalSampleEntity } from './entities/chat-eval-sample.entity'
import { ChatThreadTitleEntity } from './entities/chat-thread-title.entity'
import { ChatConversationEntity, ChatConversationVersionEntity } from './entities/chat-conversation.entity'
import { ChatPresenceEntity } from './entities/chat-presence.entity'
import { LauraUnroutedIntentEntity } from './entities/laura-unrouted-intent.entity'
import { ConversationSummaryEntity } from './entities/conversation-summary.entity'
import { AdminDocsConnectionEntity } from './entities/admin-docs-connection.entity'
import { AtsWriteRequestEntity } from './entities/ats-write-request.entity'
import { CrmConnectionEntity } from './entities/crm-connection.entity'
import { LinkedInInteractionEntity } from './entities/linkedin-interaction.entity'
import { LinkedInMandateEntity } from './entities/linkedin-mandate.entity'
import { LinkedInSendLogEntity } from './entities/linkedin-send-log.entity'
import { FieldProvenanceEntity } from './entities/field-provenance.entity'
import { FieldContradictionEntity } from './entities/field-contradiction.entity'
import { WorkspaceMergeItemEntity, WorkspaceMergeRequestEntity } from './entities/workspace-merge.entity'
import { RecordFieldAuditEntity } from './entities/record-field-audit.entity'
import { ActivityEntity } from './entities/activity.entity'
import { ChainManualMarkEntity } from './entities/chain-manual-mark.entity'
import { ChainRunEntity } from './entities/chain-run.entity'
import { TaskEntity } from './entities/task.entity'
import { ActivityParticipantEntity } from './entities/activity-participant.entity'
import { ActivitySyncStateEntity } from './entities/activity-sync-state.entity'
import { NoteEntity } from './entities/note.entity'
import { CrmDealFactEntity } from './entities/crm-deal-fact.entity'
import {
  CrmActivityEntity,
  CrmDealEntity,
  CrmOwnerEntity,
  CrmPipelineEntity,
  CrmStageEntity,
} from './entities/crm-mirror.entity'
import { CrmSyncCursorEntity } from './entities/crm-sync-cursor.entity'
import { CrmPipelineSyncEntity } from './entities/crm-pipeline-sync.entity'
import { TelephonyCallLogEntity } from './entities/telephony-call-log.entity'
import { LemlistConnectionEntity } from './entities/lemlist-connection.entity'
import { LemlistLeadPushEntity } from './entities/lemlist-lead-push.entity'
import { TelephonyCallStateEntity } from './entities/telephony-call-state.entity'
import { TelephonyConnectionEntity } from './entities/telephony-connection.entity'
import { EmailSuppressionEntity } from './entities/email-suppression.entity'
import { EnrichmentDurationSampleEntity } from './entities/enrichment-duration-sample.entity'
import { ChatTurnCostSampleEntity } from './entities/chat-turn-cost-sample.entity'
import { EsnProfileEntity } from './entities/esn-profile.entity'
import { GoogleConnectionEntity } from './entities/google-connection.entity'
import { BackofficeAccessEventEntity } from './entities/backoffice-access-event.entity'
import { BackofficeAuditEventEntity } from './entities/backoffice-audit-event.entity'
import { BusinessMetricSnapshotEntity } from './entities/business-metric-snapshot.entity'
import { BusinessMetricSnapshotLineEntity } from './entities/business-metric-snapshot-line.entity'
import { BusinessTreasuryMonthEntity } from './entities/business-treasury-month.entity'
import { ImpersonationAuditEntity } from './entities/impersonation-audit.entity'
import { IntegrationDeliveryEntity } from './entities/integration-delivery.entity'
import { IntegrationEntity } from './entities/integration.entity'
import { IntegrationSyncRunEntity } from './entities/integration-sync-run.entity'
import { IntroductionAuthorizationEntity } from './entities/introduction-authorization.entity'
import { MessageDraftArchivalEntity } from './entities/message-draft-archival.entity'
import { MessageDraftValidationEntity } from './entities/message-draft-validation.entity'
import { MessageDraftVersionEntity } from './entities/message-draft-version.entity'
import { ScheduledMessageSendEntity } from './entities/scheduled-message-send.entity'
import { McpAccessIntentEntity } from './entities/mcp-access-intent.entity'
import { TalentRecruitmentEventEntity } from './entities/talent-recruitment-event.entity'
import { MemberObjectiveEntity } from './entities/member-objective.entity'
import { ObjectiveProposalEntity } from './entities/objective-proposal.entity'
import { TargetListEntity } from './entities/target-list.entity'
import { AnalysisBatchEntity } from './entities/analysis-batch.entity'
import { AnalysisBatchItemEntity } from './entities/analysis-batch-item.entity'
import { EntityResolutionCorrectionEntity } from './entities/entity-resolution-correction.entity'
import { ContactResolutionCorrectionEntity } from './entities/contact-resolution-correction.entity'
import { TargetListItemEntity } from './entities/target-list-item.entity'
import {
  BusinessUnitAccessRequestEntity,
  BusinessUnitEntity,
  BusinessUnitMemberEntity,
} from './entities/business-unit.entity'
import { WorkspaceJoinRequestEntity } from './entities/workspace-join-request.entity'
import { EsnProfileCorrectionRequestEntity } from './entities/esn-profile-correction-request.entity'
import { MemoryFactEventEntity } from './entities/memory-fact-event.entity'
import { MemoryPinnedFactEntity } from './entities/memory-pinned-fact.entity'
import { MicrosoftConnectionEntity } from './entities/microsoft-connection.entity'
import { NotificationEntity } from './entities/notification.entity'
import { LauraInterventionEntity } from './entities/laura-intervention.entity'
import { NotificationPreferenceEntity } from './entities/notification-preference.entity'
import { NotificationSmsChannelEntity } from './entities/notification-sms-channel.entity'
import { NotionConnectionEntity } from './entities/notion-connection.entity'
import { OAuthAuthorizationCodeEntity } from './entities/oauth-authorization-code.entity'
import { OAuthClientEntity } from './entities/oauth-client.entity'
import { OAuthConsentEntity } from './entities/oauth-consent.entity'
import { OAuthRefreshTokenEntity } from './entities/oauth-refresh-token.entity'
import { OnboardingStageDefinitionEntity } from './entities/onboarding-stage-definition.entity'
import { OwnerInvitationEntity } from './entities/owner-invitation.entity'
import { OutboxEntity } from './entities/outbox.entity'
import { OutreachAssetEntity } from './entities/outreach-asset.entity'
import { OutreachSequenceEntity } from './entities/outreach-sequence.entity'
import { OutreachSequenceStepEntity } from './entities/outreach-sequence-step.entity'
import { OutreachDelegationEntity } from './entities/outreach-delegation.entity'
import { AutomationRuleEntity } from './entities/automation-rule.entity'
import { AutomationRuleFiringEntity } from './entities/automation-rule-firing.entity'
import { AutomationRuleTrialEntity } from './entities/automation-rule-trial.entity'
import { OutreachMessageEntity } from './entities/outreach-message.entity'
import { ContactDecisionRoleHistoryEntity } from './entities/contact-decision-role-history.entity'
import { OutreachMessageQualityFlagEntity } from './entities/outreach-message-quality-flag.entity'
import { OutreachMessageVariableEntity } from './entities/outreach-message-variable.entity'
import { OutreachMessageVersionEntity } from './entities/outreach-message-version.entity'
import { OutreachCallTaskEntity } from './entities/outreach-call-task.entity'
import { OutreachTransitionEntity } from './entities/outreach-transition.entity'
import { ApprovedMessageTemplateEntity } from './entities/approved-message-template.entity'
import { UserAngleEntity } from './entities/user-angle.entity'
import { MessageStyleTemplateEntity } from './entities/message-style-template.entity'
import { MessageStyleRuleProposalEntity } from './entities/message-style-rule-proposal.entity'
import { MessageLearningRuleProposalSnapshotEntity } from './entities/message-learning-rule-proposal-snapshot.entity'
import { MessageStyleImportEntity } from './entities/message-style-import.entity'
import { PlanDefinitionEntity } from './entities/plan-definition.entity'
import { ProductEventEntity } from './entities/product-event.entity'
import { ProfileEntity } from './entities/profile.entity'
import { LibraryItemEntity } from './entities/library-item.entity'
import { ManualBillingInvoiceEntity } from './entities/manual-billing-invoice.entity'
import { ChatDeepenJobEntity } from './entities/chat-deepen-job.entity'
import { ManualBillingTermsEntity } from './entities/manual-billing-terms.entity'
import { ProfileContextRevisionEntity } from './entities/profile-context-revision.entity'
import { RagDocumentEntity } from './entities/rag-document.entity'
import { RagDocumentChunkEntity } from './entities/rag-document-chunk.entity'
import { StripeEventEntity } from './entities/stripe-event.entity'
import { SubscriptionEntity } from './entities/subscription.entity'
import { TeamCommentEntity } from './entities/team-comment.entity'
import { TeamReviewEntity } from './entities/team-review.entity'
import { TeamResearchEntryEntity } from './entities/team-research-entry.entity'
import { ApprovalRequestEntity } from './entities/approval-request.entity'
import { CreditReservationEntity } from './entities/credit-reservation.entity'
import { MissionEntity } from './entities/mission.entity'
import { NeedProposalEntity } from './entities/need-proposal.entity'
import { MissionTimesheetEntity } from './entities/mission-timesheet.entity'
import { MissionAssignmentEntity } from './entities/mission-assignment.entity'
import { MissionCommercialTermsEntity } from './entities/mission-commercial-terms.entity'
import { MissionRiskResolutionEntity } from './entities/mission-risk-resolution.entity'
import { MissionExpenseEntity } from './entities/mission-expense.entity'
import { MissionFeedbackEntity } from './entities/mission-feedback.entity'
import { SupplierInvoiceEntity } from './entities/supplier-invoice.entity'
import { ExpenseReportEntity } from './entities/expense-report.entity'
import { ExpenseReportLineEntity } from './entities/expense-report-line.entity'
import { ExpenseReportAttachmentEntity } from './entities/expense-report-attachment.entity'
import { ExpensePolicyEntity } from './entities/expense-policy.entity'
import { ExpensePolicyCapEntity } from './entities/expense-policy-cap.entity'
import { ExpenseMileageRateEntity } from './entities/expense-mileage-rate.entity'
import { OutgoingPaymentEntity } from './entities/outgoing-payment.entity'
import { InvoiceReadinessEntity } from './entities/invoice-readiness.entity'
import { InvoiceConnectorWriteRequestEntity } from './entities/invoice-connector-write-request.entity'
import { StorageObjectEntity } from './entities/storage-object.entity'
import { AdvRecordEntity } from './entities/adv-record.entity'
import { ConnectorCapabilityProbeEntity } from './entities/connector-capability-probe.entity'
import { ConnectorScopeGapEntity } from './entities/connector-scope-gap.entity'
import { ConnectorCapabilityIncidentEntity } from './entities/connector-capability-incident.entity'
import { ConnectorCapabilityIncidentLogEntity } from './entities/connector-capability-incident-log.entity'
import { ToolLatencyObservationEntity } from './entities/tool-latency-observation.entity'
import { ImportSessionEntity } from './entities/import-session.entity'
import { OutboundWriteRequestEntity } from './entities/outbound-write-request.entity'
import { SyncLinkEntity } from './entities/sync-link.entity'
import { SyncRunEntity } from './entities/sync-run.entity'
import { SyncRecordEventEntity } from './entities/sync-record-event.entity'
import { DiscoverAlertEventEntity } from './entities/discover-alert-event.entity'
import { SavedViewEntity } from './entities/saved-view.entity'
import { CustomFieldDefEntity } from './entities/custom-field-def.entity'
import { CustomFieldValueEntity } from './entities/custom-field-value.entity'
import { DecisionGateCrossingEntity } from './entities/decision-gate-crossing.entity'
import { DuplicatePairEntity } from './entities/duplicate-pair.entity'
import { PipelineDetectionEntity } from './entities/pipeline-detection.entity'
import { CanonicalTriggerEventEntity } from './entities/canonical-trigger-event.entity'
import { AccountEntityRow } from './entities/account-entity.entity'
import { AccountParkReasonEntity } from './entities/account-park-reason.entity'
import { AccessFactEntity } from './entities/access-fact.entity'
import { AccountPartnerEntity } from './entities/account-partner.entity'
import { ExternalSourcingPartnerBriefEntity } from './entities/external-sourcing-partner-brief.entity'
import { QualificationLeadDecisionEntity } from './entities/qualification-lead-decision.entity'
import { DataforgeAccountEntity } from './entities/dataforge-account.entity'
import { MarketCompanyAliasEntity } from './entities/market-company-alias.entity'
import { MarketCompanyResolutionOverrideEntity } from './entities/market-company-resolution-override.entity'
import { MarketMemoryGroundTruthJudgmentEntity } from './entities/market-memory-ground-truth-judgment.entity'
import { MarketCompanySignalEntity } from './entities/market-company-signal.entity'
import { MarketCompanyStackEntity } from './entities/market-company-stack.entity'
import { MarketEsnClientEntity } from './entities/market-esn-client.entity'
import { MarketExEsnAtClientEntity } from './entities/market-ex-esn-at-client.entity'
import { MarketPersonPathEntity } from './entities/market-person-path.entity'
import { DataforgeAccountDomainEntity } from './entities/dataforge-account-domain.entity'
import { DataforgeAccountStatusEntity } from './entities/dataforge-account-status.entity'
import { DataforgeAnomalyEntity } from './entities/dataforge-anomaly.entity'
import { DataforgeNeedEntity } from './entities/dataforge-need.entity'
import { DataforgeRagChunkEntity } from './entities/dataforge-rag-chunk.entity'
import { EsnDirectoryEntity } from './entities/esn-directory.entity'
import {
  PublicRegistryAnnouncementEntity,
  PublicRegistryWatchStateEntity,
  SireneSnapshotEntity,
} from './entities/public-registry.entity'
import { PartnerRelationEntity } from './entities/partner-relation.entity'
import { PartnerCvPushEntity } from './entities/partner-cv-push.entity'
import { TerritorySnapshotEntity } from './entities/territory-snapshot.entity'
import { TerritorySubscriptionEntity } from './entities/territory-subscription.entity'
import { StockSnapshotEntity } from './entities/stock-snapshot.entity'
import { FinanceMarginTargetEntity } from './entities/finance-margin-target.entity'
import { WorkspaceRitualPreferenceEntity } from './entities/workspace-ritual-preference.entity'
import { WorkspaceRitualLastHeldEntity } from './entities/workspace-ritual-last-held.entity'
import { OrgGraphCorrectionEntity } from './entities/org-graph-correction.entity'
import { OrgEnrichmentJobEntity } from './entities/org-enrichment-job.entity'
import { OrgFocusWeightsEntity } from './entities/org-focus-weights.entity'
import { NeedUnstaffableReasonEntity } from './entities/need-unstaffable-reason.entity'
import { NeedDocumentEntity } from './entities/need-document.entity'
import { NeedStepEntity } from './entities/need-step.entity'
import { ProjectDocumentEntity } from './entities/project-document.entity'
import { MissionDocumentEntity } from './entities/mission-document.entity'
import { ProjectStepEntity } from './entities/project-step.entity'
import { CommercialOutcomeEntity } from './entities/commercial-outcome.entity'
import { ProofEntity } from './entities/proof.entity'
import { RexEntryEntity } from './entities/rex-entry.entity'
import { LostDealRexEntity } from './entities/lost-deal-rex.entity'
import { LostDealRuleProposalEntity } from './entities/lost-deal-rule-proposal.entity'
import { WorkspaceMethodRuleEntity } from './entities/workspace-method-rule.entity'
import { TestimonialEntity } from './entities/testimonial.entity'
import { LegalEntityEntity } from './entities/legal-entity.entity'
import { SiteEntity } from './entities/site.entity'
import { WorkspaceMemberPermissionEntity } from './entities/workspace-member-permission.entity'
// #2081.14 — les règles d'espace, qui priment sur les réglages individuels.
import { WorkspaceRulesEntity } from './entities/workspace-rules.entity'
// #2035.10 — le réglage d'espace du Reverse Market (§6.2).
import { WorkspaceReverseMarketSettingsEntity } from './entities/workspace-reverse-market-settings.entity'
// #2035.11 — le réglage d'espace de la charge commerciale et de la priorisation des besoins.
import { WorkspaceCommercialLoadSettingsEntity } from './entities/workspace-commercial-load-settings.entity'
import { WorkspaceTeamPolicySettingsEntity } from './entities/workspace-team-policy-settings.entity'
// #2975 — les cinq leviers admin de gouvernance de coût par espace.
import { WorkspaceBudgetEntity } from './entities/workspace-budget.entity'
import { PlaybookSubscriptionEntity } from './entities/playbook-subscription.entity'
import { PlaybookSendEntity } from './entities/playbook-send.entity'
import { InterventionEntity } from './entities/intervention.entity'
import { RfpEntity } from './entities/rfp.entity'
import { RfpSourceDocumentEntity } from './entities/rfp-source-document.entity'
import { RfpImportSessionEntity } from './entities/rfp-import-session.entity'
import { UserActionEntity } from './entities/user-action.entity'
import { WorkflowRunEntity } from './entities/workflow-run.entity'
import { UserDailyBriefEntity } from './entities/user-daily-brief.entity'
import { UserLastSeenEntity } from './entities/user-last-seen.entity'
import { UserMfaEntity } from './entities/user-mfa.entity'
import { AgendaBellumCreatedEventEntity } from './entities/agenda-bellum-created-event.entity'
import { FocusPlanBlockOutcomeEntity } from './entities/focus-plan-block-outcome.entity'
import { UserOnboardingStateEntity } from './entities/user-onboarding-state.entity'
import { UserOnboardingTransitionEntity } from './entities/user-onboarding-transition.entity'
import { FramingDecisionEntity } from './entities/framing-decision.entity'
import { UserPreferenceEntity } from './entities/user-preference.entity'
import { UserSessionEntity } from './entities/user-session.entity'
// #2455 — contextes de travail enregistrés (LAU-FINAL-168). Déjà déclarées à
// `TypeOrmModule.forFeature` dans `work-contexts.module.ts` (le module est
// autonome, règle #7) ; enregistrées ICI aussi pour que GA-65
// (`table-scope-registry.spec.ts`) sache déduire leur scope depuis leurs
// colonnes (`workspace_id`/`owner_user_id`/`user_id`) au lieu de les voir
// comme des tables « sans entité » — absence mesurée le 22/09/2026.
import { WorkContextActivationEntity } from './entities/work-context-activation.entity'
import { WorkContextEntity } from './entities/work-context.entity'
import { WorkspaceEntity } from './entities/workspace.entity'
import { WorkspaceInvitationEntity } from './entities/workspace-invitation.entity'
import { WorkspaceMemberEntity } from './entities/workspace-member.entity'
import { WorkspaceActiveSelectionEntity } from './entities/workspace-active-selection.entity'
import { WorkspaceBridgeContactEntity } from './entities/workspace-bridge-contact.entity'
import { WatchlistRuleEntity } from '../modules/watchlist-rules/watchlist-rule.entity'
import { UserFavoriteEntity } from '../modules/favorites/user-favorite.entity'
import { AccountFollowEntity } from '../modules/account-follows/account-follow.entity'
import { SignalUserStateEntity } from '../modules/signal-library/signal-user-state.entity'
import { SignalWatchEntity } from '../modules/signal-library/signal-watch.entity'
import { SimilarAccountDismissalEntity } from './entities/similar-account-dismissal.entity'
import { AccountCompletionDismissalEntity } from './entities/account-completion-dismissal.entity'
import { EmployerIdentityChoiceEntity } from './entities/employer-identity-choice.entity'
import { ReverseMarketDismissalEntity } from './entities/reverse-market-dismissal.entity'
import { MarketZoneEntity } from './entities/market-zone.entity'
import { EsnTargetPersonaEntity } from './entities/esn-target-persona.entity'
import { SequenceTemplateEntity, SequenceTemplateStepEntity } from './entities/sequence-template.entity'
import {
  AccountQualificationEntity,
  QualificationCriterionEntity,
  QualificationGridEntity,
} from './entities/qualification-grid.entity'
import { registerPgDateParser } from './pg-date'
import { decidePoolMax } from './pool-sizing'
import { DirectDbService } from './direct-db.service'

export const ENTITIES = [
  EsnTargetPersonaEntity,
  MarketZoneEntity,
  SequenceTemplateEntity,
  SequenceTemplateStepEntity,
  // #3755 — la grille de qualification de l'espace et l'évaluation des comptes.
  QualificationGridEntity,
  QualificationCriterionEntity,
  AccountQualificationEntity,
  MessageLibraryEntryEntity,
  MessageLibraryTraceEntity,
  SecurityEventEntity,
  AccountEntityRow,
  DataforgeAccountEntity,
  MarketCompanySignalEntity,
  MarketEsnClientEntity,
  MarketCompanyStackEntity,
  MarketExEsnAtClientEntity,
  MarketPersonPathEntity,
  MarketCompanyAliasEntity,
  MarketCompanyResolutionOverrideEntity,
  MarketMemoryGroundTruthJudgmentEntity,
  DataforgeAccountDomainEntity,
  DataforgeAccountStatusEntity,
  DataforgeAnomalyEntity,
  DataforgeNeedEntity,
  DataforgeRagChunkEntity,
  EsnDirectoryEntity,
  // #3916.a — les registres publics lus en continu (partagées, fait de registre).
  PublicRegistryAnnouncementEntity,
  PublicRegistryWatchStateEntity,
  // #3921.a / #3921.b — le relevé Sirene, une ligne par jour.
  SireneSnapshotEntity,
  PartnerRelationEntity,
  PartnerCvPushEntity,
  TerritorySnapshotEntity,
  TerritorySubscriptionEntity,
  StockSnapshotEntity,
  // L'objectif mensuel de marge d'un espace (D7, levé le 31/08/2026) — il vit
  // juste après la photo mensuelle parce qu'il répond à la même famille de
  // questions : « ce chiffre, par rapport à quoi ? »
  FinanceMarginTargetEntity,
  // BEL-SC-242 (#3271.10, .12) — un espace qui a masqué un rituel.
  WorkspaceRitualPreferenceEntity,
  // #3298 (suite #3271.8) — la marque légère de dernière tenue d'un rituel.
  WorkspaceRitualLastHeldEntity,
  OrgGraphCorrectionEntity,
  OrgEnrichmentJobEntity,
  OrgFocusWeightsEntity,
  AccountParkReasonEntity,
  AccessFactEntity,
  AccountPartnerEntity,
  ExternalSourcingPartnerBriefEntity,
  // #1952.7 (épopée #2844, lot SRC5 28/09 soir) — le job de recherche multi-sources.
  MultiSourceSearchJobEntity,
  QualificationLeadDecisionEntity,
  NeedUnstaffableReasonEntity,
  NeedDocumentEntity,
  NeedStepEntity,
  ProjectStepEntity,
  CommercialOutcomeEntity,
  ProjectDocumentEntity,
  MissionDocumentEntity,
  ProofEntity,
  RexEntryEntity,
  LostDealRexEntity,
  LostDealRuleProposalEntity,
  WorkspaceMethodRuleEntity,
  TestimonialEntity,
  SiteEntity,
  ProjectEntity,
  ProjectNeedEntity,
  ProjectContactEntity,
  ContactCrmExportEntity,
  PipelineStageLabelEntity,
  DealStageSlaEntity,
  LossReasonEntity,
  ConsultantEntity,
  WeakestLinkDiagnosisEntity,
  ConsultantAccountConsentEntity,
  ConsultantPushFeedbackEntity,
  ConsultantCvRewriteEntity,
  CvVersionEntity,
  CvBatchImportJobEntity,
  // #1952.3 (épopée #2844, lot SRC5 28/09 soir) — le job de matching massif.
  BulkMatchingJobEntity,
  NeedAutoMatchEntity,
  // #1952.6 (épopée #2844, lot SRC5 28/09 soir) — le job d'export en lot.
  BulkExportJobEntity,
  // #1952.5 (épopée #2844, lot SRC5 28/09 soir) — le job de réécriture de CV en lot.
  BulkCvRewriteJobEntity,
  UniversalImportJobEntity,
  ContextPackImportEntity,
  PersonalContactEntity,
  UniversalImportIssueEntity,
  SkillAliasProposalEntity,
  ConsultantSkillEntity,
  ConsultantExperienceEntity,
  TalentPreparedMessageEntity,
  SubmissionEntity,
  MatchRunEntity,
  MatchRunEntryEntity,
  MatchWeightVersionEntity,
  ShortlistEntity,
  ShortlistEntryEntity,
  InterviewEntity,
  SubmissionFeedbackEntity,
  SubmissionConsultantFeedbackEntity,
  ConsultantDocumentEntity,
  TalentIdentityDecisionEntity,
  // #2288.2 — les reçus de vérification à la demande (la CONSERVATION).
  MarketVerificationReceiptEntity,
  SignalHistoryEntity,
  AccountEntity,
  AccountFeedbackEntity,
  DiscoverCandidateFeedbackEntity,
  ChatReplyFeedbackEntity,
  // #2429.9 (épopée #2852, lot P07) — les versions d'un artefact de chat.
  ChatArtifactVersionEntity,
  AccountShareEntity,
  AccountVocabularyEntity,
  ActionPlanEntity,
  ActionPlanItemEntity,
  AnalysisRunEntity,
  ApiKeyEntity,
  AttackAngleEntity,
  BannerEntity,
  BetaFeedbackEntity,
  ChatMessageEntity,
  // #1916.24 — les éléments de mémoire envoyés à Laura, réponse par réponse.
  ChatReplyMemoryUseEntity,
  ChatEvalSampleEntity,
  ChatThreadTitleEntity,
  // #2430.11 — l'objet conversation et ses versions figées.
  ChatConversationEntity,
  ChatConversationVersionEntity,
  // #3086 — présence sur un fil (battement de coeur éphémère).
  ChatPresenceEntity,
  // #1949.23 — la trace anonyme des demandes que Laura n'a pas su router.
  LauraUnroutedIntentEntity,
  CommercialTransitionEntity,
  OpportunityFieldChangeEntity,
  CommercialAuditFeedbackEntity,
  // #2386.9 — la télémétrie de la session de prospection, par parcours.
  ProspectingSessionEntity,
  ContactEntity,
  ContactLifecycleTransitionEntity,
  ContactMergeEntity,
  // #4114.4 — la décision humaine sur une paire de doublons proposée.
  ContactDuplicateDecisionEntity,
  // #2777 — la mémoire du compte : la sortie `learnings` de la cascade compte
  // rendu.
  AccountMemoryEntity,
  ConversationSummaryEntity,
  CreditLedgerEntity,
  AdminDocsConnectionEntity,
  AtsWriteRequestEntity,
  CrmConnectionEntity,
  LinkedInInteractionEntity,
  LinkedInMandateEntity,
  LinkedInSendLogEntity,
  FieldProvenanceEntity,
  // #4016.L13 — la source qui contredit un fait confirmé à la main.
  FieldContradictionEntity,
  // #4158.57 — rapatriement de l'espace personnel : la demande (aperçu figé + empreinte) et son journal.
  WorkspaceMergeRequestEntity,
  WorkspaceMergeItemEntity,
  RecordFieldAuditEntity,
  NoteEntity,
  ActivityEntity,
  ChainRunEntity,
  ChainManualMarkEntity,
  ActivityParticipantEntity,
  ActivitySyncStateEntity,
  TaskEntity,
  CrmDealFactEntity,
  CrmSyncCursorEntity,
  // SYNC-A — le miroir CRM.
  CrmOwnerEntity,
  CrmPipelineEntity,
  CrmStageEntity,
  CrmDealEntity,
  CrmActivityEntity,
  CrmPipelineSyncEntity,
  TelephonyConnectionEntity,
  TelephonyCallLogEntity,
  TelephonyCallStateEntity,
  LemlistConnectionEntity,
  LemlistLeadPushEntity,
  EmailSuppressionEntity,
  EnrichmentDurationSampleEntity,
  ChatTurnCostSampleEntity,
  EsnProfileEntity,
  GoogleConnectionEntity,
  BackofficeAccessEventEntity,
  BackofficeAuditEventEntity,
  BusinessMetricSnapshotEntity,
  BusinessMetricSnapshotLineEntity,
  BusinessTreasuryMonthEntity,
  ImpersonationAuditEntity,
  IntegrationDeliveryEntity,
  IntegrationEntity,
  IntegrationSyncRunEntity,
  IntroductionAuthorizationEntity,
  MessageDraftVersionEntity,
  MessageDraftValidationEntity,
  MessageDraftArchivalEntity,
  ScheduledMessageSendEntity,
  McpAccessIntentEntity,
  TalentRecruitmentEventEntity,
  LibraryItemEntity,
  ManualBillingInvoiceEntity,
  ManualBillingTermsEntity,
  MemberObjectiveEntity,
  ObjectiveProposalEntity,
  TargetListEntity,
  TargetListItemEntity,
  // #2293.5 — le lot d'analyses multi-comptes (job parent + sous-jobs).
  AnalysisBatchEntity,
  AnalysisBatchItemEntity,
  // #2284.67-.69 — la correction d'identité versionnée par l'espace.
  EntityResolutionCorrectionEntity,
  // #2159.35 — la correction de rapprochement de contact versionnée par l'espace.
  ContactResolutionCorrectionEntity,
  BusinessUnitEntity,
  BusinessUnitMemberEntity,
  BusinessUnitAccessRequestEntity,
  // #2016 — demandes d'accès d'un non-membre à un espace existant.
  WorkspaceJoinRequestEntity,
  EsnProfileCorrectionRequestEntity,
  MemoryFactEventEntity,
  MemoryPinnedFactEntity,
  MicrosoftConnectionEntity,
  NotificationEntity,
  LauraInterventionEntity,
  NotificationPreferenceEntity,
  NotificationSmsChannelEntity,
  NotionConnectionEntity,
  OAuthAuthorizationCodeEntity,
  OAuthClientEntity,
  OAuthConsentEntity,
  OAuthRefreshTokenEntity,
  OnboardingStageDefinitionEntity,
  OwnerInvitationEntity,
  OutboxEntity,
  OutreachAssetEntity,
  OutreachSequenceEntity,
  OutreachSequenceStepEntity,
  // #2366 — le modèle canonique de l'outreach.
  OutreachDelegationEntity,
  AutomationRuleEntity,
  AutomationRuleFiringEntity,
  AutomationRuleTrialEntity,
  OutreachMessageEntity,
  OutreachMessageVersionEntity,
  OutreachMessageQualityFlagEntity,
  OutreachMessageVariableEntity,
  ContactDecisionRoleHistoryEntity,
  OutreachCallTaskEntity,
  OutreachTransitionEntity,
  // #2369.9/.10 (épopée #2768) — l'objet Template de la mémoire de style.
  MessageStyleTemplateEntity,
  ApprovedMessageTemplateEntity,
  // #4739 — « Mes angles » : angles écrits à la main, personnels.
  UserAngleEntity,
  // #2369.7/.8/.13 — la proposition de règle et sa garde d'apprentissage.
  MessageStyleRuleProposalEntity,
  MessageLearningRuleProposalSnapshotEntity,
  // #2369.2/.3 (épopée #2768) — l'import pour apprentissage (nature + source).
  MessageStyleImportEntity,
  PlanDefinitionEntity,
  ProductEventEntity,
  ProfileEntity,
  ProfileContextRevisionEntity,
  // #3236.2 (b, tranche) — la trace persistante d'un approfondissement interrompu.
  ChatDeepenJobEntity,
  RagDocumentEntity,
  // #3750 — les morceaux citables d'un document (onglet, diapositive, section).
  RagDocumentChunkEntity,
  StripeEventEntity,
  SubscriptionEntity,
  TeamCommentEntity,
  // Théo D team-review.N1 — le compte rendu d'un point d'équipe.
  TeamReviewEntity,
  TeamResearchEntryEntity,
  UserActionEntity,
  RfpEntity,
  RfpSourceDocumentEntity,
  RfpImportSessionEntity,
  MissionEntity,
  NeedProposalEntity,
  MissionTimesheetEntity,
  MissionAssignmentEntity,
  MissionCommercialTermsEntity,
  MissionRiskResolutionEntity,
  MissionExpenseEntity,
  MissionFeedbackEntity,
  SupplierInvoiceEntity,
  // Les NOTES DE FRAIS (31/08/2026) — le dossier, ses lignes, ses justificatifs,
  // et la politique de remboursement par client.
  //
  // ⚠️ Elles sont déclarées ICI et pas seulement dans `expenses.module.ts` :
  // `ENTITIES` est ce que LISENT les gardes d'architecture. Sans cette
  // inscription, GA-65 voit cinq tables « sans entité TypeORM » et réclame
  // qu'elles soient classées au registre des portées — une entité qui existe
  // sur le disque mais qu'aucune liste ne porte n'existe pour personne.
  ExpenseReportEntity,
  ExpenseReportLineEntity,
  ExpenseReportAttachmentEntity,
  ExpensePolicyEntity,
  ExpensePolicyCapEntity,
  // Le barème kilométrique SAISI (31/08/2026) : il naît vide, et tant qu'il
  // l'est une ligne `mileage` reste non vérifiée.
  ExpenseMileageRateEntity,
  OutgoingPaymentEntity,
  InvoiceReadinessEntity,
  InvoiceConnectorWriteRequestEntity,
  // Le dossier d'administration des ventes (31/08/2026) — trois faits qu'aucune
  // autre table ne portait, et aucun moyen de paiement.
  AdvRecordEntity,
  // LE STOCKAGE DE FICHIERS (31/08/2026) — le registre unique des octets que ce
  // produit détient. Sans cette inscription, GA-36 ne verrait pas les colonnes
  // de `storage_objects` et GA-65 réclamerait un classement au registre des
  // portées pour une table qui porte pourtant son `workspace_id`.
  StorageObjectEntity,
  ConnectorCapabilityProbeEntity,
  ConnectorScopeGapEntity,
  ConnectorCapabilityIncidentEntity,
  // #2445.12 (épopée #2766, lot SRC5 28/09 soir) — le journal append-only
  // des actions/communications d'un incident.
  ConnectorCapabilityIncidentLogEntity,
  // #2261.13 (19/09) — les synchronisations réelles qui mesurent la latence
  // probable d'un outil connecté (`tool-latency.ts::measureToolLatency`).
  ToolLatencyObservationEntity,
  ImportSessionEntity,
  OutboundWriteRequestEntity,
  ContactStopEntity,
  // #4158.22/.25 — garde-fous entre collègues : liste « ne pas contacter » + équipe de compte.
  WorkspaceDoNotContactEntity,
  AccountTeamMemberEntity,
  AccountTeamScopeEntity,
  // #2309.16/.19 — un candidat jamais devenu une fiche (identité ambiguë / doublon à l'import).
  ContactIntakeExclusionEntity,
  // #2297 — la trace d'un effacement de personne (RGPD art. 17), sans donnée de la personne.
  PersonErasureEntity,
  SyncLinkEntity,
  SyncRunEntity,
  SyncRecordEventEntity,
  DiscoverAlertEventEntity,
  SavedViewEntity,
  CustomFieldDefEntity,
  CustomFieldValueEntity,
  DecisionGateCrossingEntity,
  DuplicatePairEntity,
  // #4016 L6 — le pipe « détecté, à revoir ».
  PipelineDetectionEntity,
  CanonicalTriggerEventEntity,
  LegalEntityEntity,
  WorkspaceMemberPermissionEntity,
  WorkspaceRulesEntity,
  WorkspaceReverseMarketSettingsEntity,
  WorkspaceCommercialLoadSettingsEntity,
  WorkspaceTeamPolicySettingsEntity,
  WorkspaceBudgetEntity,
  PlaybookSubscriptionEntity,
  PlaybookSendEntity,
  InterventionEntity,
  WorkflowRunEntity,
  ApprovalRequestEntity,
  CreditReservationEntity,
  UserDailyBriefEntity,
  UserLastSeenEntity,
  UserMfaEntity,
  UserOnboardingStateEntity,
  UserOnboardingTransitionEntity,
  FramingDecisionEntity,
  UserPreferenceEntity,
  AgendaBellumCreatedEventEntity,
  FocusPlanBlockOutcomeEntity,
  UserSessionEntity,
  WorkContextEntity,
  WorkContextActivationEntity,
  WorkspaceEntity,
  WorkspaceMemberEntity,
  WorkspaceInvitationEntity,
  WorkspaceActiveSelectionEntity,
  // Le journal de contribution de la memoire collective : deux personnes mises
  // en relation par un croisement. Compte d'espace sur un mois, jamais une
  // ventilation par personne.
  WorkspaceBridgeContactEntity,
  WatchlistRuleEntity,
  UserFavoriteEntity,
  // #4267 — le suivi explicite d'un compte, par utilisateur.
  AccountFollowEntity,
  SignalUserStateEntity,
  SignalWatchEntity,
  SimilarAccountDismissalEntity,
  AccountCompletionDismissalEntity,
  EmployerIdentityChoiceEntity,
  ReverseMarketDismissalEntity,
  // Six entités livrées sans jamais être déclarées ici. Les tables existaient,
  // les migrations étaient passées, mais TypeORM ne connaissait pas les classes :
  // toute lecture répondait `EntityMetadataNotFoundError`, donc 500. Vu dans les
  // logs de production le 03/08 — « No metadata for "RoutineSubscriptionEntity" ».
  AiToolCallAuditLogEntity,
  AtsConnectionEntity,
  // #4406.1 — Beeper Desktop (branchement personnel, jetons chiffrés).
  BeeperConnectionEntity,
  ChatToolCallRecordingEntity,
  MailBatchEntity,
  MailThreadMarkEntity,
  NeedPlayEntity,
  ProviderCostEntity,
  RoutineRunEntity,
  RoutineBudgetCapEntity,
  RoutineContentEntity,
  RoutinePreferenceEntity,
  RoutineSubscriptionEntity,
  // #2439.15 (intégration matin B) — même défaut : la migration
  // (`1796321386200-PrivacyExportAuditLog`) et le service qui écrit
  // existaient, l'entité n'était jamais déclarée ici.
  PrivacyExportAuditLogEntity,
  // La CESSION de créance (31/08/2026) — trois tables, migration
  // `1790971000001-Factoring`.
  FactoringContractEntity,
  ReceivableAssignmentEntity,
  FactoringSettlementEntity,
  // #2705 — les prospects du formulaire obligatoire du lien de démo. Ni
  // `workspace_id` ni `user_id` (voir `table-scopes.ts`, `demo_leads`).
  DemoLeadEntity,
]

/**
 * Bound the node-postgres pool and add timeouts. Without an `extra` block the
 * defaults are max=10 with no connection/query timeouts, so the worker's UPDATE
 * loops (concurrency 3) can pin every connection and a single runaway query
 * holds one forever — HTTP requests then queue behind an exhausted pool and 500
 * in cascade. `statement_timeout` lets Postgres kill a stuck query, and
 * `connectionTimeoutMillis` fails a checkout fast instead of hanging the request.
 *
 * `max` is env-overridable (DB_POOL_MAX) so it can track the Supabase connection
 * ceiling / whether the pooler (port 6543) is in use, without a code change.
 *
 * INC-04-10 — après un blip réseau (04/10/2026, 09:27Z→10:18Z) le pool de 5 est
 * resté bloqué 50 min, base saine : des sockets à moitié ouverts gardaient des
 * clients « occupés » sur une réponse qui ne viendrait jamais, et le
 * `statement_timeout` (côté SERVEUR) ne peut rien quand le serveur n'a plus la
 * requête. D'où :
 *  - `keepAlive` + délai initial 10 s : le noyau sonde le socket inactif, un
 *    socket mort lève une erreur, le client devient non-requêtable et pg-pool
 *    l'évince au release (`!client._queryable`) au lieu de le recycler ;
 *  - `query_timeout` (côté CLIENT) = 75 s, volontairement AU-DESSUS du
 *    `statement_timeout` de 60 s : quand le serveur répond, c'est lui qui coupe
 *    proprement (annulation, transaction en erreur) ; le client ne tranche que
 *    si aucune réponse n'arrive. Les plus longues requêtes légitimes mesurées
 *    sont sous 60 s par instruction (purge démo : 65-85 s AU TOTAL sur 258
 *    tables, la pire instruction `account_entities` à ~43 s). On ne relève PAS
 *    le plafond global : une requête qui doit durer plus le dit localement
 *    (`SET LOCAL statement_timeout` dans sa transaction).
 */
export function buildDbPoolExtra(): Record<string, number | boolean> {
  const requested = Number(process.env['DB_POOL_MAX'])
  // Incident pool du 04/10/2026 (soir) — `DB_POOL_MAX × réplicas` comparé au
  // `pool_size` Supavisor : au-delà de 70 %, clamp + ERREUR, jamais un refus de
  // démarrer. Voir `pool-sizing.ts`.
  const decision = decidePoolMax(Number.isFinite(requested) && requested > 0 ? requested : 10)
  if (decision.level === 'clamped' && decision.message) poolLogger.error(decision.message)
  else if (decision.level === 'unguarded' && decision.message && !poolSizingWarned) {
    poolSizingWarned = true
    poolLogger.warn(decision.message)
  }
  return {
    max: decision.max,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 60_000,
    query_timeout: 75_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  }
}

const poolLogger = new Logger('PostgresPool')
/** L'avertissement « garde aveugle » ne sort qu'UNE fois par process. */
let poolSizingWarned = false

/**
 * INC-04-10 — une erreur levée par un client INACTIF du pool (socket coupé par
 * le réseau ou le pooler) : TypeORM la journalisait en simple `warn`. Elle passe
 * en ERREUR, MESSAGE SEUL — jamais l'objet, qui peut porter la config de
 * connexion (hôte, utilisateur).
 */
function logPoolError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  poolLogger.error(`Postgres pool: idle client error — ${message}`)
}

/**
 * TypeORM wiring for direct Postgres access. Migrations live in
 * `src/migrations/*.ts` and are executed explicitly via the
 * `pnpm migration:run` CLI — never at app boot. `synchronize` stays
 * `false` so TypeORM never alters the DB structure on its own.
 */
export function buildTypeOrmOptions(config: ConfigService): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: config.get<string>('postgresHost'),
    port: config.get<number>('postgresPort'),
    username: config.get<string>('postgresUser'),
    password: config.get<string>('postgresPassword'),
    database: config.get<string>('postgresDb'),
    entities: ENTITIES,
    migrations: [join(__dirname, '..', 'migrations', '*.{ts,js}')],
    migrationsTableName: '_migrations',
    migrationsRun: false,
    synchronize: false,
    logging: ['error', 'warn'],
    extra: buildDbPoolExtra(),
    poolErrorHandler: logPoolError,
    ssl:
      config.get<string>('nodeEnv') === 'production'
        ? { rejectUnauthorized: false } // Supabase utilise un cert valide, mais le chain CA varie
        : false,
  }
}

/**
 * Posée À L'IMPORT du module, donc avant toute connexion : une colonne `date`
 * revient en `YYYY-MM-DD` sur les requêtes brutes comme sur les entités. Voir
 * `pg-date.ts` pour ce que le défaut du pilote a coûté.
 */
registerPgDateParser()

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions,
    }),
  ],
  // Incident pool du 04/10/2026 — la connexion dédiée hors pooler transaction
  // (élection du balayage démo, purge lourde, relevé de pg_stat_activity).
  providers: [DirectDbService, { provide: BackgroundDbBudget, useFactory: () => buildBackgroundDbBudget() }],
  // #4616.4 — le budget du travail de fond (≤ 50 % de DB_POOL_MAX) : un worker ou une tâche planifiée qui
  // touche la base s'enveloppe dans `budget.run(...)`.
  exports: [DirectDbService, BackgroundDbBudget],
})
export class DatabaseModule {}
