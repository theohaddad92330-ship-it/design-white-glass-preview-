import { z } from 'zod'

/**
 * Les neuf métriques analytics de la migration de routes — #2958.72-.93.
 *
 * #2154.30 demandait « onze métriques » pour un système entier de comparaison
 * avant/après qui n'existe pas — RECLASSÉ le 24/09/2026 (« pas un système
 * entier — raison floue »). Le tri du 28/09 (`TRI-RESTES-28-09.md`) repose la
 * question à l'échelle qui EXISTE déjà : `apps/web/src/lib/product-tracker.ts`
 * définit exactement NEUF émetteurs d'événements comportementaux
 * (`screen_viewed`, `screen_left`, `tab_opened`, `action_started`,
 * `action_completed`, `action_abandoned`, `filter_applied`,
 * `search_performed`, `error_shown`), lus sans écriture par
 * `ProductAnalyticsReadService` (`apps/api/src/modules/analytics/product-analytics-read.service.ts`).
 * Une métrique de migration par émetteur, pas onze métriques inventées.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER GARANTIT (doctrine analytique produit)
 * ─────────────────────────────────────────────────────────────────────────
 * `aggregation` vaut TOUJOURS `'route_or_screen'` — jamais `'person'` — parce
 * que `product-analytics-read.service.ts` écrit `workspace_id: null`
 * INCONDITIONNELLEMENT et que `resolveProductScreen` replie tout chemin réel
 * (`/accounts/3f1c…`) vers son MOTIF avant toute lecture. « Agrégé par route
 * ou écran, jamais par personne » n'est pas une promesse de ce fichier : c'est
 * une propriété du flux qu'il lit, que le type rend simplement IMPOSSIBLE à
 * contredire ailleurs dans ce module.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `instrumented` vs `gap` — CE QUE ÇA VEUT DIRE ICI PRÉCISÉMENT
 * ─────────────────────────────────────────────────────────────────────────
 * `instrumented` : l'émetteur a un appelant de PRODUCTION réel qui fire sur au
 * moins une des SIX destinations du registre #2154.3 (`/actions`, `/signals` (ex `/mes-cibles`),
 * `/accounts`, `/settings/knowledge`, `/projects`, `/consultants`) — vérifié
 * par lecture du fichier appelant, jamais une extrapolation depuis un écran
 * voisin. `resolveProductScreen` distingue LITTÉRALEMENT `/consultants` (liste)
 * de `/consultants/$id` (fiche) — un appelant sur la fiche ne prouve RIEN pour
 * la liste, exactement la même rigueur que #2154.3 pour les routes migrées.
 * `gap` : l'émetteur existe et peut même avoir un appelant de production
 * ailleurs dans le produit, mais aucune preuve qu'il fire sur une des six
 * destinations de CETTE migration — nommé, jamais deviné.
 */

export const ROUTE_MIGRATION_METRIC_KEYS = [
  'screen_viewed',
  'screen_left',
  'tab_opened',
  'action_started',
  'action_completed',
  'action_abandoned',
  'filter_applied',
  'search_performed',
  'error_shown',
] as const
export const routeMigrationMetricKeySchema = z.enum(ROUTE_MIGRATION_METRIC_KEYS)
export type RouteMigrationMetricKey = (typeof ROUTE_MIGRATION_METRIC_KEYS)[number]

export const ROUTE_MIGRATION_METRIC_STATUSES = ['instrumented', 'gap'] as const
export const routeMigrationMetricStatusSchema = z.enum(ROUTE_MIGRATION_METRIC_STATUSES)
export type RouteMigrationMetricStatus = (typeof ROUTE_MIGRATION_METRIC_STATUSES)[number]

/** Les six destinations nommées par #2154.4/.5 qu'une métrique peut couvrir. */
export const MIGRATION_DESTINATION_SCREENS = [
  // Louis 23/10 — « Mes cibles » est l'écran Signaux de Théo : `/mes-cibles` redirige, la destination mesurée est `/signals`.
  '/signals',
  '/accounts',
  '/settings/knowledge',
  '/projects',
  '/actions',
  '/consultants',
] as const
export type MigrationDestinationScreen = (typeof MIGRATION_DESTINATION_SCREENS)[number]

export const routeMigrationMetricSchema = z.object({
  key: routeMigrationMetricKeySchema,
  sourceIssue: z.literal('#2958.72-.93'),
  /** Le nom d'événement RÉEL du traceur produit (`product-tracker.ts`), verbatim. */
  eventName: z.string().min(1),
  label: z.string().min(1),
  /** Jamais `'person'` — voir la doctrine en tête de fichier. */
  aggregation: z.literal('route_or_screen'),
  status: routeMigrationMetricStatusSchema,
  /** Les destinations de #2154.3 où l'événement est PROUVÉ fire — vide en `gap`. */
  provenOnDestinations: z.array(z.enum(MIGRATION_DESTINATION_SCREENS)),
  /** Fichier:ligne réel, jamais une affirmation à main levée. */
  evidence: z.string().min(1),
  file: z.string().min(1).nullable(),
})
export type RouteMigrationMetric = z.infer<typeof routeMigrationMetricSchema>

export const ROUTE_MIGRATION_METRICS: readonly RouteMigrationMetric[] = [
  {
    key: 'screen_viewed',
    sourceIssue: '#2958.72-.93',
    eventName: 'screen_viewed',
    label: 'écran ouvert',
    aggregation: 'route_or_screen',
    status: 'instrumented',
    provenOnDestinations: [...MIGRATION_DESTINATION_SCREENS],
    evidence:
      '`router.tsx` appelle `notifyRouteViewed(screenPattern(event.toLocation.pathname), provenance)` INCONDITIONNELLEMENT à chaque changement de route — les SIX destinations de la migration sont des écrans produit comme les autres, aucune exception ne les exclut.',
    file: 'apps/web/src/router.tsx',
  },
  {
    key: 'screen_left',
    sourceIssue: '#2958.72-.93',
    eventName: 'screen_left',
    label: 'écran quitté',
    aggregation: 'route_or_screen',
    status: 'instrumented',
    provenOnDestinations: [...MIGRATION_DESTINATION_SCREENS],
    evidence:
      "Même appelant que `screen_viewed` : `notifyRouteViewed` (`product-tracker.ts`) ferme la vue précédente par `enqueue('screen_left', …)` avant d'ouvrir la suivante — un aller-retour entre deux des six destinations émet les deux événements, jamais un seul.",
    file: 'apps/web/src/lib/product-tracker.ts',
  },
  {
    key: 'tab_opened',
    sourceIssue: '#2958.72-.93',
    eventName: 'tab_opened',
    label: 'onglet ouvert',
    aggregation: 'route_or_screen',
    status: 'instrumented',
    provenOnDestinations: ['/projects', '/accounts', '/actions'],
    evidence:
      "`SectionTabs.tsx` (monté par `CustomerPageContent`) appelle `trackTabOpened(found.section.to, key)` à chaque changement d'onglet DE SECTION, et `section.to` EST la route de la destination : `/projects`, `/accounts` (barre de Comptes rendue sur mobile seulement, #3585.2) et `/actions` — prouvé par `SectionTabs.tracking.test.tsx`. Les appelants `AccountDetailTabsBar` / `TalentDetailPage` restent ceux des FICHES, qui ne prouvent rien pour les listes.",
    file: 'apps/web/src/components/navigation/SectionTabs.tsx',
  },
  {
    key: 'action_started',
    sourceIssue: '#2958.72-.93',
    eventName: 'action_started',
    label: 'action démarrée',
    aggregation: 'route_or_screen',
    status: 'instrumented',
    provenOnDestinations: ['/signals', '/accounts', '/settings/knowledge', '/projects', '/actions', '/consultants'],
    evidence:
      "`ActionCenter.tsx` : la décision d'une demande en attente (`decide`, onglet « À valider » d'« Aujourd'hui ») appelle `trackActionStarted('approval_decided', '/actions')` à l'envoi (#2958, 16/10/2026), prouvé par `ActionCenter.test.tsx` (#2154.30). Les cinq autres destinations passent par `trackedMutation` (`product-tracker.ts`, #2154.30, 17/10/2026) : `/accounts` (`AccountAssignSubmenu.tsx`, attribution d'un compte), `/projects` (`CreateProjectDialog.tsx`, ouverture d'une affaire), `/mes-cibles` (`ImportTargetListDialog.tsx`, import d'une liste), `/consultants` (`ConsultantsPage.tsx`, fiche créée ou modifiée) et `/settings/knowledge` (`Knowledge.tsx`, élément enregistré).",
    file: 'apps/web/src/features/action-os/view/ActionCenter.tsx',
  },
  {
    key: 'action_completed',
    sourceIssue: '#2958.72-.93',
    eventName: 'action_completed',
    label: 'action terminée',
    aggregation: 'route_or_screen',
    status: 'instrumented',
    provenOnDestinations: ['/signals', '/accounts', '/settings/knowledge', '/projects', '/actions', '/consultants'],
    evidence:
      "Même appelant : `trackActionCompleted('approval_decided', '/actions')` au SUCCÈS de la décision, jamais au clic — sans début connu le traceur n'émet rien (non mesuré n'est jamais 0).",
    file: 'apps/web/src/features/action-os/view/ActionCenter.tsx',
  },
  {
    key: 'action_abandoned',
    sourceIssue: '#2958.72-.93',
    eventName: 'action_abandoned',
    label: 'action abandonnée',
    aggregation: 'route_or_screen',
    status: 'instrumented',
    provenOnDestinations: ['/signals', '/accounts', '/settings/knowledge', '/projects', '/actions', '/consultants'],
    evidence:
      "Même appelant : `trackActionAbandoned('approval_decided', '/actions', 'error')` quand la décision échoue — l'abandon silencieux (fermeture sans décision) n'est pas mesuré ici.",
    file: 'apps/web/src/features/action-os/view/ActionCenter.tsx',
  },
  {
    key: 'filter_applied',
    sourceIssue: '#2958.72-.93',
    eventName: 'filter_applied',
    label: 'filtre appliqué',
    aggregation: 'route_or_screen',
    status: 'instrumented',
    provenOnDestinations: ['/signals', '/actions'],
    evidence:
      "DEUX appelants réels sur des destinations exactes : `WatchlistBoard.tsx:110/135` avec `screen={TARGETS_SCREEN}` (`'/signals'`, monté par `TargetSignalsSection` → `TargetListsContent` → `TargetListsPage`, la route `/signals` elle-même) et `ActionHistoryJournal.tsx:93` (tiroir « Historique » de `/actions`, #4164) avec `ACTIONS_SCREEN = '/actions'`. Les quatre autres destinations (`/accounts`, `/settings/knowledge`, `/projects`, `/consultants`) n'ont aucun appelant `filter_applied` trouvé.",
    file: 'apps/web/src/features/watchlist/view/WatchlistBoard.tsx',
  },
  {
    key: 'search_performed',
    sourceIssue: '#2958.72-.93',
    eventName: 'search_performed',
    label: 'recherche effectuée',
    aggregation: 'route_or_screen',
    status: 'instrumented',
    provenOnDestinations: ['/accounts', '/consultants', '/projects'],
    evidence:
      "Le hook partagé `useTrackSearchPerformed` (un seul endroit, GA-26) émet `search_performed` quand la recherche RÉSOUT, avec le total serveur et l'écran, jamais le texte : appelé par `AccountsPage.tsx` (`/accounts`, total de la 1ʳᵉ page), `ConsultantsPage.tsx` (`/consultants`) et `ProjectsPage.tsx` (`/projects`, pipe affiché). `/mes-cibles`, `/settings/knowledge` et `/actions` n'ont pas de champ de recherche texte propre : rien à mesurer, rien d'inventé. (`Search.tsx` et `ContactsPageContent.tsx` restent des appelants hors des six destinations.)",
    file: 'apps/web/src/lib/useTrackSearchPerformed.ts',
  },
  {
    key: 'error_shown',
    sourceIssue: '#2958.72-.93',
    eventName: 'error_shown',
    label: 'erreur affichée',
    aggregation: 'route_or_screen',
    status: 'instrumented',
    provenOnDestinations: [...MIGRATION_DESTINATION_SCREENS],
    evidence:
      "`error-boundary.tsx` appelle `trackErrorShown(screen, …)` pour CHAQUE nature d'erreur qu'il rattrape (réseau, fonctionnelle, 404, lien invalide, exception) et enveloppe l'application entière — une erreur sur l'une des six destinations est captée par le même mécanisme que partout ailleurs, aucune route n'y échappe.",
    file: 'apps/web/src/components/templates/error-boundary.tsx',
  },
]

/** Résumé lecture-seule : combien des neuf émetteurs sont prouvés sur AU MOINS
 *  une des six destinations de cette migration — jamais un pourcentage inventé
 *  en dessous, jamais un total qui prétendrait couvrir tout le produit. */
export function routeMigrationMetricsCoverage(): { instrumented: number; total: number } {
  return {
    instrumented: ROUTE_MIGRATION_METRICS.filter(metric => metric.status === 'instrumented').length,
    total: ROUTE_MIGRATION_METRICS.length,
  }
}
