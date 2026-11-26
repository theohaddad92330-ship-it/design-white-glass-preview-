/**
 * Static resource map. Every namespace JSON is bundled at build time (no runtime
 * backend / HTTP loading) so `t()` is synchronous and works in tests.
 *
 * Keep this map exhaustive: each namespace in `NAMESPACES` (config.ts) must have
 * an `fr` and an `en` entry here.
 *
 * One exception to the "one JSON file per namespace" rule: `changelog` is served
 * from `@bellum/contracts`. The API emails those same entries (the « Newsletter
 * Changelog ») and must not read a file out of the web app, so the catalogue has
 * a single owner in the shared package. FR/EN parity is still enforced here by
 * `parity.test.ts`, which walks this very map.
 */
import { changelogLocales } from '@bellum/contracts'
import frAccess from './locales/fr/access.json'
import frBranding from './locales/fr/branding.json'
import enBranding from './locales/en/branding.json'
import frTerritory from './locales/fr/territory.json'
import frPartnerPipeline from './locales/fr/partnerPipeline.json'
import frSprints from './locales/fr/sprints.json'
import frMarketMemory from './locales/fr/marketMemory.json'
// #2422.6 (épopée #2869, lot R24 07/10/2026) — la page publique du dépôt de pièce de contrat.
import frContractUpload from './locales/fr/contractUpload.json'
import frMarketWatch from './locales/fr/marketWatch.json'
import frLexicon from './locales/fr/lexicon.json'
import frLauncher from './locales/fr/launcher.json'
import frShortcuts from './locales/fr/shortcuts.json'
import frMobile from './locales/fr/mobile.json'
import frBrief from './locales/fr/brief.json'
import frCommon from './locales/fr/common.json'
import frChains from './locales/fr/chains.json'
import frCommercialAudit from './locales/fr/commercialAudit.json'
import frLaura from './locales/fr/laura.json'
import frLauraBubble from './locales/fr/lauraBubble.json'
import frChatCommands from './locales/fr/chatCommands.json'
import frMatching from './locales/fr/matching.json'
import frNav from './locales/fr/nav.json'
import frAuth from './locales/fr/auth.json'
import frOnboarding from './locales/fr/onboarding.json'
import frGuide from './locales/fr/guide.json'
import frDashboard from './locales/fr/dashboard.json'
import frSearch from './locales/fr/search.json'
import frGlobalSearch from './locales/fr/globalSearch.json'
import frDiscover from './locales/fr/discover.json'
import frTechnologyRadar from './locales/fr/technologyRadar.json'
import frDiscoverSkill from './locales/fr/discoverSkill.json'
import frBilling from './locales/fr/billing.json'
import frSettings from './locales/fr/settings.json'
import frAccounts from './locales/fr/accounts.json'
import frTargets from './locales/fr/targets.json'
import frAccountDetail from './locales/fr/accountDetail.json'
import frApollo from './locales/fr/apollo.json'
import frAccountOrg from './locales/fr/accountOrg.json'
import frAccountMissions from './locales/fr/accountMissions.json'
import frAccountSites from './locales/fr/accountSites.json'
import frMarketBrief from './locales/fr/marketBrief.json'
import frAccountWatch from './locales/fr/accountWatch.json'
import frAccountFacts from './locales/fr/accountFacts.json'
import frActivityLog from './locales/fr/activityLog.json'
import frTeamResearch from './locales/fr/teamResearch.json'
import frTeamActivity from './locales/fr/teamActivity.json'
import frTeamAdmin from './locales/fr/teamAdmin.json'
import frEngagement from './locales/fr/engagement.json'
import frContacts from './locales/fr/contacts.json'
import frIntegrations from './locales/fr/integrations.json'
import frImportWizard from './locales/fr/importWizard.json'
import frIntegrationCenter from './locales/fr/integrationCenter.json'
import frRestitution from './locales/fr/restitution.json'
import frGoogle from './locales/fr/google.json'
import frMicrosoft from './locales/fr/microsoft.json'
import frChat from './locales/fr/chat.json'
import frKnowledge from './locales/fr/knowledge.json'
import frActions from './locales/fr/actions.json'
import frCapitalisation from './locales/fr/capitalisation.json'
import frCatalogues from './locales/fr/catalogues.json'
import frOutreach from './locales/fr/outreach.json'
import frPartners from './locales/fr/partners.json'
import frPayments from './locales/fr/payments.json'
import frLegalEntities from './locales/fr/legalEntities.json'
import frFinanceSettings from './locales/fr/financeSettings.json'
// #2035.10 / #2035.11 — les deux réglages d'espace neufs.
import frReverseMarketSettings from './locales/fr/reverseMarketSettings.json'
import frCommercialLoadSettings from './locales/fr/commercialLoadSettings.json'
import frQualificationGrid from './locales/fr/qualificationGrid.json'
import frBusinessUnitsAdmin from './locales/fr/businessUnitsAdmin.json'
import frWorkspaceRules from './locales/fr/workspaceRules.json'
import frSettingsHub from './locales/fr/settingsHub.json'
import frTeamGuardrails from './locales/fr/teamGuardrails.json'
import frFeedback from './locales/fr/feedback.json'
import frTeam from './locales/fr/team.json'
import frMemoireCollective from './locales/fr/memoireCollective.json'
import frWatchlist from './locales/fr/watchlist.json'
import frSignalsLibrary from './locales/fr/signalsLibrary.json'
import frFactoring from './locales/fr/factoring.json'
import frExpenses from './locales/fr/expenses.json'
import frActivities from './locales/fr/activities.json'
import frTasks from './locales/fr/tasks.json'
import frSubmissions from './locales/fr/submissions.json'
import frMissions from './locales/fr/missions.json'
import frAdv from './locales/fr/adv.json'
import frCrmImport from './locales/fr/crmImport.json'
import frGovernance from './locales/fr/governance.json'
import frPlaybooks from './locales/fr/playbooks.json'
import frProjects from './locales/fr/projects.json'
import frRfp from './locales/fr/rfp.json'
import frConsultants from './locales/fr/consultants.json'
import frCrm from './locales/fr/crm.json'
import frExplain from './locales/fr/explain.json'
import frPilotage from './locales/fr/pilotage.json'
import frPilotagePipe from './locales/fr/pilotagePipe.json'
import frManager from './locales/fr/manager.json'
import frProfile from './locales/fr/profile.json'
import frWelcome from './locales/fr/welcome.json'
import frAnalysis from './locales/fr/analysis.json'
import frRoutes from './locales/fr/routes.json'
import frExports from './locales/fr/exports.json'
import frScreenState from './locales/fr/screenState.json'
import frMyData from './locales/fr/myData.json'
import frPipelineSla from './locales/fr/pipelineSla.json'
import frShare from './locales/fr/share.json'
import frImpersonation from './locales/fr/impersonation.json'
import frBriefing from './locales/fr/briefing.json'
import frMailbox from './locales/fr/mailbox.json'
import frMeetings from './locales/fr/meetings.json'
import frProposals from './locales/fr/proposals.json'
import frRoutines from './locales/fr/routines.json'
// « Suivi, facturation & automatisations » (/missions/suivi, D-22-2 levée le
// 31/08/2026). Ajouté en FIN d'import, comme `routines` juste au-dessus.
import frMissionTracking from './locales/fr/missionTracking.json'
import frWorkContexts from './locales/fr/workContexts.json'

import enAccess from './locales/en/access.json'
import enTerritory from './locales/en/territory.json'
import enPartnerPipeline from './locales/en/partnerPipeline.json'
import enSprints from './locales/en/sprints.json'
import enMarketMemory from './locales/en/marketMemory.json'
import enContractUpload from './locales/en/contractUpload.json'
import enMarketWatch from './locales/en/marketWatch.json'
import enLexicon from './locales/en/lexicon.json'
import enLauncher from './locales/en/launcher.json'
import enShortcuts from './locales/en/shortcuts.json'
import enMobile from './locales/en/mobile.json'
import enBrief from './locales/en/brief.json'
import enCommon from './locales/en/common.json'
import enChains from './locales/en/chains.json'
import enCommercialAudit from './locales/en/commercialAudit.json'
import enLaura from './locales/en/laura.json'
import enLauraBubble from './locales/en/lauraBubble.json'
import enChatCommands from './locales/en/chatCommands.json'
import enMatching from './locales/en/matching.json'
import enNav from './locales/en/nav.json'
import enAuth from './locales/en/auth.json'
import enOnboarding from './locales/en/onboarding.json'
import enGuide from './locales/en/guide.json'
import enDashboard from './locales/en/dashboard.json'
import enSearch from './locales/en/search.json'
import enGlobalSearch from './locales/en/globalSearch.json'
import enDiscover from './locales/en/discover.json'
import enTechnologyRadar from './locales/en/technologyRadar.json'
import enDiscoverSkill from './locales/en/discoverSkill.json'
import enBilling from './locales/en/billing.json'
import enSettings from './locales/en/settings.json'
import enAccounts from './locales/en/accounts.json'
import enTargets from './locales/en/targets.json'
import enAccountDetail from './locales/en/accountDetail.json'
import enApollo from './locales/en/apollo.json'
import enAccountOrg from './locales/en/accountOrg.json'
import enAccountMissions from './locales/en/accountMissions.json'
import enAccountSites from './locales/en/accountSites.json'
import enMarketBrief from './locales/en/marketBrief.json'
import enAccountWatch from './locales/en/accountWatch.json'
import enAccountFacts from './locales/en/accountFacts.json'
import enActivityLog from './locales/en/activityLog.json'
import enTeamResearch from './locales/en/teamResearch.json'
import enTeamActivity from './locales/en/teamActivity.json'
import enTeamAdmin from './locales/en/teamAdmin.json'
import enEngagement from './locales/en/engagement.json'
import enContacts from './locales/en/contacts.json'
import enIntegrations from './locales/en/integrations.json'
import enImportWizard from './locales/en/importWizard.json'
import enIntegrationCenter from './locales/en/integrationCenter.json'
import enRestitution from './locales/en/restitution.json'
import enGoogle from './locales/en/google.json'
import enMicrosoft from './locales/en/microsoft.json'
import enChat from './locales/en/chat.json'
import enKnowledge from './locales/en/knowledge.json'
import enActions from './locales/en/actions.json'
import enCapitalisation from './locales/en/capitalisation.json'
import enCatalogues from './locales/en/catalogues.json'
import enOutreach from './locales/en/outreach.json'
import enPartners from './locales/en/partners.json'
import enPayments from './locales/en/payments.json'
import enLegalEntities from './locales/en/legalEntities.json'
import enFinanceSettings from './locales/en/financeSettings.json'
import enReverseMarketSettings from './locales/en/reverseMarketSettings.json'
import enCommercialLoadSettings from './locales/en/commercialLoadSettings.json'
import enQualificationGrid from './locales/en/qualificationGrid.json'
import enBusinessUnitsAdmin from './locales/en/businessUnitsAdmin.json'
import enWorkspaceRules from './locales/en/workspaceRules.json'
import enSettingsHub from './locales/en/settingsHub.json'
import enTeamGuardrails from './locales/en/teamGuardrails.json'
import enFeedback from './locales/en/feedback.json'
import enTeam from './locales/en/team.json'
import enMemoireCollective from './locales/en/memoireCollective.json'
import enWatchlist from './locales/en/watchlist.json'
import enSignalsLibrary from './locales/en/signalsLibrary.json'
import enFactoring from './locales/en/factoring.json'
import enExpenses from './locales/en/expenses.json'
import enActivities from './locales/en/activities.json'
import enTasks from './locales/en/tasks.json'
import enSubmissions from './locales/en/submissions.json'
import enMissions from './locales/en/missions.json'
import enAdv from './locales/en/adv.json'
import enCrmImport from './locales/en/crmImport.json'
import enGovernance from './locales/en/governance.json'
import enPlaybooks from './locales/en/playbooks.json'
import enProjects from './locales/en/projects.json'
import enRfp from './locales/en/rfp.json'
import enConsultants from './locales/en/consultants.json'
import enCrm from './locales/en/crm.json'
import enExplain from './locales/en/explain.json'
import enPilotage from './locales/en/pilotage.json'
import enPilotagePipe from './locales/en/pilotagePipe.json'
import enManager from './locales/en/manager.json'
import enProfile from './locales/en/profile.json'
import enWelcome from './locales/en/welcome.json'
import enAnalysis from './locales/en/analysis.json'
import enRoutes from './locales/en/routes.json'
import enExports from './locales/en/exports.json'
import enScreenState from './locales/en/screenState.json'
import enMyData from './locales/en/myData.json'
import enPipelineSla from './locales/en/pipelineSla.json'
import enShare from './locales/en/share.json'
import enImpersonation from './locales/en/impersonation.json'
import enBriefing from './locales/en/briefing.json'
import enMailbox from './locales/en/mailbox.json'
import enMeetings from './locales/en/meetings.json'
import enProposals from './locales/en/proposals.json'
import enRoutines from './locales/en/routines.json'
import enMissionTracking from './locales/en/missionTracking.json'
import enWorkContexts from './locales/en/workContexts.json'

// Intégration E (29/09/2026) — une langue par constante. Le type INFÉRÉ d'un
// seul objet `{ fr, en }` (≈ 110 espaces de noms × 2, JSON inlinés) a dépassé
// la longueur que `tsc` sait sérialiser (`declaration: true`, base.json) :
// TS7056 dès l'entrée des locales des épopées E1–E17. Chaque langue est
// sérialisée À PART, et le type fin (clé par clé) reste celui des tests.
const fr = {
  access: frAccess,
  territory: frTerritory,
  partnerPipeline: frPartnerPipeline,
  sprints: frSprints,
  marketMemory: frMarketMemory,
  contractUpload: frContractUpload,
  marketWatch: frMarketWatch,
  lexicon: frLexicon,
  launcher: frLauncher,
  shortcuts: frShortcuts,
  mobile: frMobile,
  brief: frBrief,
  common: frCommon,
  chains: frChains,
  commercialAudit: frCommercialAudit,
  laura: frLaura,
  lauraBubble: frLauraBubble,
  chatCommands: frChatCommands,
  matching: frMatching,
  nav: frNav,
  auth: frAuth,
  onboarding: frOnboarding,
  guide: frGuide,
  dashboard: frDashboard,
  search: frSearch,
  globalSearch: frGlobalSearch,
  discover: frDiscover,
  technologyRadar: frTechnologyRadar,
  discoverSkill: frDiscoverSkill,
  billing: frBilling,
  branding: frBranding,
  settings: frSettings,
  accounts: frAccounts,
  targets: frTargets,
  accountDetail: frAccountDetail,
  apollo: frApollo,
  accountOrg: frAccountOrg,
  accountMissions: frAccountMissions,
  accountSites: frAccountSites,
  marketBrief: frMarketBrief,
  accountWatch: frAccountWatch,
  accountFacts: frAccountFacts,
  activityLog: frActivityLog,
  teamResearch: frTeamResearch,
  teamActivity: frTeamActivity,
  teamAdmin: frTeamAdmin,
  engagement: frEngagement,
  contacts: frContacts,
  integrations: frIntegrations,
  importWizard: frImportWizard,
  integrationCenter: frIntegrationCenter,
  restitution: frRestitution,
  google: frGoogle,
  microsoft: frMicrosoft,
  chat: frChat,
  knowledge: frKnowledge,
  actions: frActions,
  capitalisation: frCapitalisation,
  catalogues: frCatalogues,
  outreach: frOutreach,
  partners: frPartners,
  payments: frPayments,
  legalEntities: frLegalEntities,
  financeSettings: frFinanceSettings,
  reverseMarketSettings: frReverseMarketSettings,
  commercialLoadSettings: frCommercialLoadSettings,
  qualificationGrid: frQualificationGrid,
  businessUnitsAdmin: frBusinessUnitsAdmin,
  workspaceRules: frWorkspaceRules,
  settingsHub: frSettingsHub,
  teamGuardrails: frTeamGuardrails,
  feedback: frFeedback,
  team: frTeam,
  memoireCollective: frMemoireCollective,
  watchlist: frWatchlist,
  signalsLibrary: frSignalsLibrary,
  factoring: frFactoring,
  expenses: frExpenses,
  activities: frActivities,
  tasks: frTasks,
  submissions: frSubmissions,
  missions: frMissions,
  // Administration des ventes (31/08/2026).
  adv: frAdv,
  crmImport: frCrmImport,
  governance: frGovernance,
  playbooks: frPlaybooks,
  projects: frProjects,
  rfp: frRfp,
  consultants: frConsultants,
  crm: frCrm,
  explain: frExplain,
  pilotage: frPilotage,
  pilotagePipe: frPilotagePipe,
  manager: frManager,
  profile: frProfile,
  welcome: frWelcome,
  analysis: frAnalysis,
  routes: frRoutes,
  exports: frExports,
  screenState: frScreenState,
  myData: frMyData,
  pipelineSla: frPipelineSla,
  share: frShare,
  changelog: changelogLocales.fr,
  impersonation: frImpersonation,
  briefing: frBriefing,
  mailbox: frMailbox,
  meetings: frMeetings,
  proposals: frProposals,
  routines: frRoutines,
  missionTracking: frMissionTracking,
  workContexts: frWorkContexts,
} as const

const en = {
  access: enAccess,
  territory: enTerritory,
  partnerPipeline: enPartnerPipeline,
  sprints: enSprints,
  marketMemory: enMarketMemory,
  contractUpload: enContractUpload,
  marketWatch: enMarketWatch,
  lexicon: enLexicon,
  launcher: enLauncher,
  shortcuts: enShortcuts,
  mobile: enMobile,
  brief: enBrief,
  common: enCommon,
  chains: enChains,
  commercialAudit: enCommercialAudit,
  laura: enLaura,
  lauraBubble: enLauraBubble,
  chatCommands: enChatCommands,
  matching: enMatching,
  nav: enNav,
  auth: enAuth,
  onboarding: enOnboarding,
  guide: enGuide,
  dashboard: enDashboard,
  search: enSearch,
  globalSearch: enGlobalSearch,
  discover: enDiscover,
  technologyRadar: enTechnologyRadar,
  discoverSkill: enDiscoverSkill,
  billing: enBilling,
  branding: enBranding,
  settings: enSettings,
  accounts: enAccounts,
  targets: enTargets,
  accountDetail: enAccountDetail,
  apollo: enApollo,
  accountOrg: enAccountOrg,
  accountMissions: enAccountMissions,
  accountSites: enAccountSites,
  marketBrief: enMarketBrief,
  accountWatch: enAccountWatch,
  accountFacts: enAccountFacts,
  activityLog: enActivityLog,
  teamResearch: enTeamResearch,
  teamActivity: enTeamActivity,
  teamAdmin: enTeamAdmin,
  engagement: enEngagement,
  contacts: enContacts,
  integrations: enIntegrations,
  importWizard: enImportWizard,
  integrationCenter: enIntegrationCenter,
  restitution: enRestitution,
  google: enGoogle,
  microsoft: enMicrosoft,
  chat: enChat,
  knowledge: enKnowledge,
  actions: enActions,
  capitalisation: enCapitalisation,
  catalogues: enCatalogues,
  outreach: enOutreach,
  partners: enPartners,
  payments: enPayments,
  legalEntities: enLegalEntities,
  financeSettings: enFinanceSettings,
  reverseMarketSettings: enReverseMarketSettings,
  commercialLoadSettings: enCommercialLoadSettings,
  qualificationGrid: enQualificationGrid,
  businessUnitsAdmin: enBusinessUnitsAdmin,
  workspaceRules: enWorkspaceRules,
  settingsHub: enSettingsHub,
  teamGuardrails: enTeamGuardrails,
  feedback: enFeedback,
  team: enTeam,
  memoireCollective: enMemoireCollective,
  watchlist: enWatchlist,
  signalsLibrary: enSignalsLibrary,
  factoring: enFactoring,
  expenses: enExpenses,
  activities: enActivities,
  tasks: enTasks,
  submissions: enSubmissions,
  missions: enMissions,
  adv: enAdv,
  crmImport: enCrmImport,
  governance: enGovernance,
  playbooks: enPlaybooks,
  projects: enProjects,
  rfp: enRfp,
  consultants: enConsultants,
  crm: enCrm,
  explain: enExplain,
  pilotage: enPilotage,
  pilotagePipe: enPilotagePipe,
  manager: enManager,
  profile: enProfile,
  welcome: enWelcome,
  analysis: enAnalysis,
  routes: enRoutes,
  exports: enExports,
  screenState: enScreenState,
  myData: enMyData,
  pipelineSla: enPipelineSla,
  share: enShare,
  changelog: changelogLocales.en,
  impersonation: enImpersonation,
  briefing: enBriefing,
  mailbox: enMailbox,
  meetings: enMeetings,
  proposals: enProposals,
  routines: enRoutines,
  missionTracking: enMissionTracking,
  workContexts: enWorkContexts,
} as const

export const resources: { readonly fr: typeof fr; readonly en: typeof en } = { fr, en }
