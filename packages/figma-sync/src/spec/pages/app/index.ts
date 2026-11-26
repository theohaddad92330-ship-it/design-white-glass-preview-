import type { PageSpec } from '../../types'
import { accountsPage } from './accounts'
import { accountsBriefPage } from './accounts-brief'
import {
  accountsDetailPage,
  accountsDetailPerimetresPage,
  accountsDetailOpportunitesPage,
  accountsDetailPersonnesPage,
  accountsDetailEcosystemeAccesPage,
  accountsDetailPlanActionPage,
  accountsDetailHistoriquePreuvesPage,
} from './accounts-detail'
import { accountsMarchesDetailPage } from './accounts-marches-detail'
import { accountsPartnersPage, accountsPartnersDiscoverPage, accountsPartnersOnAccountsPage } from './accounts-partners'
import { contactsApproachPage } from './contacts-approach'
import { contactsDetailPage } from './contacts-detail'
import { contactsPage } from './contacts'
import { mesCiblesPage } from './mes-cibles'
import { searchPage } from './search'
import { discoverPage } from './discover'
import { discoverRadarPage } from './discover-radar'
import { discoverLotsPage } from './discover-lots'
import { discoverLotsDetailPage } from './discover-lots-detail'
import { dashboardPage } from './dashboard'
import { briefingPage } from './briefing'
import { consultantsRecrutementPage } from './consultants-recrutement'
import { contactsImportPage } from './contacts-import'
import { contactsImportsPage } from './contacts-imports'
import { contactsListsPage } from './contacts-lists'
import { onboardingThemesPage } from './onboarding-themes'
import { onboardingThemePage } from './onboarding-theme'
import { searchHistoryPage } from './search-history'
import { signalsPage } from './signals'
import { signalsWatchesPage } from './signals-watches'
import { teamActivitePage } from './team-activite'
import { teamAdminPage } from './team-admin'
import { teamBusinessPage } from './team-business'
import { teamMemberPage } from './team-member'
import { teamPlansPage } from './team-plans'
import { teamRecherchesPage } from './team-recherches'
import { homePage } from './home'
import { missionDossierPage } from './mission-dossier'
import { missionsPage } from './missions'
import { missionsAdvPage } from './missions-adv'
import { pilotagePipePage } from './pilotage-pipe'
import { missionsCessionsPage } from './missions-cessions'
import { missionsCraPage } from './missions-cra'
import { missionsEncaissementsPage } from './missions-encaissements'
import { missionsFacturationPage } from './missions-facturation'
import { missionsNouvellePage } from './missions-nouvelle'
import { missionsPaiementsPage } from './missions-paiements'
import { missionsPlanificationPage } from './missions-planification'
import { missionsSuiviPage } from './missions-suivi'
import { consultantsPage } from './consultants'
import { consultantDetailPage } from './consultant-detail'
import { consultantReverseMarketPage } from './consultant-reverse-market'
import { actionsIndexPage } from './actions-index'
import { actionsDetailPage } from './actions-detail'
import { actionsSequencesPage } from './actions-sequences'
import { chatPage } from './chat'
import { mailboxPage } from './mailbox'
import { propositionsPage } from './propositions'
import { projectsIndexPage } from './projects-index'
import { projectsDetailPage } from './projects-detail'
import { projectsNeedsPage } from './projects-needs'
import { projectsNeedsDetailPage } from './projects-needs-detail'
import { teamPage } from './team'
import { expensesIndexPage } from './expenses-index'
import { missionsFacturesPage } from './missions-factures'
import { missionsFinancePage } from './missions-finance'
import { projectsPresentationsPage } from './projects-presentations'
import { teamReviewPage } from './team-review'
import { actionsSequenceDetailPage } from './actions-sequence-detail'
import { expensesBaremePage } from './expenses-bareme'
import { integrationsPage } from './integrations'
import { billingPage } from './billing'
import { settingsActivityPage } from './settings-activity'
import { settingsBrandingPage } from './settings-branding'
import { settingsBusinessUnitsPage } from './settings-business-units'
import { settingsCataloguesPage } from './settings-catalogues'
import { settingsCommercialLoadPage } from './settings-commercial-load'
import { settingsFinancePage } from './settings-finance'
import { settingsImportPage } from './settings-import'
import {
  settingsKnowledgePage,
  settingsKnowledgeTemplatesPage,
  settingsKnowledgePlaybooksPage,
  settingsKnowledgeMethodePage,
  settingsKnowledgeCrmPage,
} from './settings-knowledge'
import { settingsLegalEntitiesPage } from './settings-legal-entities'
import { settingsLexiconPage } from './settings-lexicon'
import { settingsMcpPage } from './settings-mcp'
import { settingsMemoryPage } from './settings-memory'
import { settingsMesDonneesPage } from './settings-mes-donnees'
import { settingsMesSignalementsPage } from './settings-mes-signalements'
import { settingsNotificationsPage } from './settings-notifications'
import { settingsPipelinePage } from './settings-pipeline'
import { settingsPreferencesPage } from './settings-preferences'
import { settingsProfileAuditPage } from './settings-profile-audit'
import { settingsProfileContextPage } from './settings-profile-context'
import { settingsProfileIdentityPage } from './settings-profile-identity'
import { settingsProfileIndexPage } from './settings-profile-index'
import { settingsProfileStagePage } from './settings-profile-stage'
import { settingsReverseMarketPage } from './settings-reverse-market'
import { submissionsDetailPage } from './submissions-detail'
import { settingsSecurityPage } from './settings-security'
import { settingsShortcutsPage } from './settings-shortcuts'
import { settingsTeamPage } from './settings-team'
import { settingsWorkspaceRulesPage } from './settings-workspace-rules'
import { settingsVivierExportPage } from './settings-vivier-export'
import { settingsDoNotContactPage } from './settings-do-not-contact'
import { settingsLauraModePage } from './settings-laura-mode'
import { pilotageIndexPage } from './pilotage-index'
import { pilotageFinancePage } from './pilotage-finance'
import { pilotageStaffingPage } from './pilotage-staffing'
import { pilotageMarchePage } from './pilotage-marche'
import { pilotageRexPage } from './pilotage-rex'
import { onboardingWelcomePage } from './onboarding-welcome'
import { automationsEditorPage } from './automations-editor'
import { automationsJournalPage } from './automations-journal'
import { automationsLibraryPage } from './automations-library'
import { onboardingCompanyPage } from './onboarding-company'
import { onboardingPlanPage } from './onboarding-plan'
import { onboardingGeneratingPage } from './onboarding-generating'
import { onboardingReviewPage } from './onboarding-review'
import { onboardingStagePage } from './onboarding-stage'
import { loginPage } from './login'
import { signupPage } from './signup'
import { forgotPasswordPage } from './forgot-password'
import { resetPasswordPage } from './reset-password'
import { authCallbackPage } from './auth-callback'
import { verifyEmailPage } from './verify-email'
import { invitationPage } from './invitation'
import { welcomePage } from './welcome'
import { demoPage } from './demo'
import { demoAccesPage } from './demo-acces'
import { sharePage } from './share'
import { depotPiecePage } from './depot-piece'
import { bakHomePage } from './bak-home'

/** Les pages de l'app (apps/web, ~106 écrans). Une ligne par fichier de page, par ordre de domaine. */
export const APP_PAGES: readonly PageSpec[] = [
  homePage,
  briefingPage,
  dashboardPage,
  accountsPage,
  accountsDetailPage,
  accountsDetailPerimetresPage,
  accountsDetailOpportunitesPage,
  accountsDetailPersonnesPage,
  accountsDetailEcosystemeAccesPage,
  accountsDetailPlanActionPage,
  accountsDetailHistoriquePreuvesPage,
  accountsBriefPage,
  accountsMarchesDetailPage,
  accountsPartnersPage,
  accountsPartnersDiscoverPage,
  accountsPartnersOnAccountsPage,
  contactsPage,
  contactsApproachPage,
  contactsDetailPage,
  mesCiblesPage,
  searchPage,
  discoverPage,
  discoverRadarPage,
  discoverLotsPage,
  discoverLotsDetailPage,
  missionsPage,
  missionDossierPage,
  missionsAdvPage,
  pilotagePipePage,
  missionsCessionsPage,
  missionsCraPage,
  missionsEncaissementsPage,
  missionsFacturationPage,
  missionsNouvellePage,
  missionsPaiementsPage,
  missionsPlanificationPage,
  missionsSuiviPage,
  consultantsPage,
  consultantDetailPage,
  consultantReverseMarketPage,
  actionsIndexPage,
  actionsDetailPage,
  actionsSequencesPage,
  chatPage,
  mailboxPage,
  propositionsPage,
  projectsIndexPage,
  projectsDetailPage,
  projectsNeedsPage,
  projectsNeedsDetailPage,
  teamPage,
  expensesIndexPage,
  missionsFacturesPage,
  missionsFinancePage,
  projectsPresentationsPage,
  teamReviewPage,
  actionsSequenceDetailPage,
  expensesBaremePage,
  integrationsPage,
  billingPage,
  settingsPreferencesPage,
  settingsSecurityPage,
  settingsNotificationsPage,
  settingsMesDonneesPage,
  settingsMesSignalementsPage,
  settingsShortcutsPage,
  settingsMemoryPage,
  submissionsDetailPage,
  settingsTeamPage,
  settingsBusinessUnitsPage,
  settingsLegalEntitiesPage,
  settingsWorkspaceRulesPage,
  settingsVivierExportPage,
  settingsDoNotContactPage,
  settingsLauraModePage,
  automationsLibraryPage,
  automationsJournalPage,
  automationsEditorPage,
  settingsFinancePage,
  settingsCommercialLoadPage,
  settingsReverseMarketPage,
  settingsPipelinePage,
  settingsCataloguesPage,
  settingsLexiconPage,
  settingsKnowledgePage,
  settingsKnowledgeTemplatesPage,
  settingsKnowledgePlaybooksPage,
  settingsKnowledgeMethodePage,
  settingsKnowledgeCrmPage,
  settingsMcpPage,
  settingsBrandingPage,
  settingsActivityPage,
  settingsImportPage,
  settingsProfileIndexPage,
  settingsProfileIdentityPage,
  settingsProfileContextPage,
  settingsProfileAuditPage,
  settingsProfileStagePage,
  pilotageIndexPage,
  pilotageFinancePage,
  pilotageStaffingPage,
  pilotageMarchePage,
  pilotageRexPage,
  onboardingWelcomePage,
  onboardingCompanyPage,
  onboardingPlanPage,
  onboardingGeneratingPage,
  onboardingReviewPage,
  onboardingStagePage,
  loginPage,
  signupPage,
  forgotPasswordPage,
  resetPasswordPage,
  authCallbackPage,
  verifyEmailPage,
  invitationPage,
  welcomePage,
  demoPage,
  demoAccesPage,
  sharePage,
  depotPiecePage,
  bakHomePage,
  consultantsRecrutementPage,
  contactsImportPage,
  contactsImportsPage,
  contactsListsPage,
  onboardingThemesPage,
  onboardingThemePage,
  searchHistoryPage,
  signalsPage,
  signalsWatchesPage,
  teamActivitePage,
  teamAdminPage,
  teamBusinessPage,
  teamMemberPage,
  teamPlansPage,
  teamRecherchesPage,
]
