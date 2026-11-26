import type { PageSpec } from '../../types'
import { accesRefusePage } from './a-acces-refuse'
import { accueilPage } from './a-accueil'
import { analysisDetailPage } from './a-analysis-detail'
import { auditPage } from './a-audit'
import { bannersPage } from './a-banners'
import { changelogPage } from './a-changelog'
import { clientsPage } from './a-clients'
import { coutsPage } from './a-couts'
import { dependancesManagerPage } from './a-dependances-manager'
import { esnDetailPage } from './a-esn-detail'
import { facturationPage } from './a-facturation'
import { feedbackPage } from './a-feedback'
import { flagsPage } from './a-flags'
import { healthPage } from './a-health'
import { impersonationsPage } from './a-impersonations'
import { integrationsPage } from './a-integrations'
import { loginPage } from './a-login'
import { methodCorpusPage } from './a-method-corpus'
import { supervisionPage } from './a-supervision'
import { dmLauraSitePage } from './b-laura-site'
import { dmMonitoringPage } from './b-monitoring'
import { dmMonitoringDetailPage } from './b-monitoring-detail'
import { dmOffresPage } from './b-offres'
import { dmProduitPage } from './b-produit'
import { dmProduitAdoptionPage } from './b-produit-adoption'
import { dmProduitLauraNonComprisPage } from './b-produit-laura-non-compris'
import { dmProduitRaisonnementPage } from './b-produit-raisonnement'
import { dmProduitOnboardingPage } from './b-produit-onboarding'
import { dmProduitPremierePreuvePage } from './b-produit-premiere-preuve'
import { dmProspectsPage } from './b-prospects'
import { dmQueuesPage } from './b-queues'
import { dmRetentionPage } from './b-retention'
import { dmRevenusPage } from './b-revenus'
import { dmRevenusClientsPage } from './b-revenus-clients'
import { dmRevenusClientsConsommationPage } from './b-revenus-clients-consommation'
import { dmRevenusTresoreriePage } from './b-revenus-tresorerie'
import { dmChatTurnPage } from './b-chat-turn'
import { dmRunPage } from './b-run'
import { dmRunbookPage } from './b-runbook'
import { dmSecuritePage } from './b-securite'
import { dmTeamsPage } from './b-teams'
import { dmTeamsDetailPage } from './b-teams-detail'
import { dmUsagePage } from './b-usage'
import { dmUsersPage } from './b-users'
import { dmUsersDetailPage } from './b-users-detail'
import { dmVeriteTerrainPage } from './b-verite-terrain'
import { apiConsolePage } from './a-api'

/** Les pages du backoffice (apps/dashboard-manager, 42 pages) — gabarit `admin-table` surtout. Lots suivants. */
export const DM_PAGES: readonly PageSpec[] = [
  accueilPage,
  apiConsolePage,
  accesRefusePage,
  loginPage,
  changelogPage,
  bannersPage,
  flagsPage,
  methodCorpusPage,
  supervisionPage,
  integrationsPage,
  auditPage,
  clientsPage,
  coutsPage,
  dependancesManagerPage,
  esnDetailPage,
  facturationPage,
  analysisDetailPage,
  feedbackPage,
  healthPage,
  impersonationsPage,
  dmLauraSitePage,
  dmMonitoringPage,
  dmMonitoringDetailPage,
  dmOffresPage,
  dmProduitPage,
  dmProduitAdoptionPage,
  dmProduitLauraNonComprisPage,
  dmProduitRaisonnementPage,
  dmProduitOnboardingPage,
  dmProduitPremierePreuvePage,
  dmProspectsPage,
  dmQueuesPage,
  dmRetentionPage,
  dmRevenusPage,
  dmRevenusClientsPage,
  dmRevenusClientsConsommationPage,
  dmRevenusTresoreriePage,
  dmChatTurnPage,
  dmRunPage,
  dmRunbookPage,
  dmSecuritePage,
  dmTeamsPage,
  dmTeamsDetailPage,
  dmUsagePage,
  dmUsersPage,
  dmUsersDetailPage,
  dmVeriteTerrainPage,
]
