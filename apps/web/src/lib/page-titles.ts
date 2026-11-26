/**
 * Maps top-level routes to the i18n key (namespace `nav`) of the human-readable
 * title shown in the page header. Titles are resolved with `t()` at render time
 * so they follow the active language. Sub-routes inherit their parent's title
 * via the `startsWith` lookup in `resolveTitle`.
 */
export const pageTitleKeys: Record<string, string> = {
  '/dashboard': 'items.dashboard',
  '/search': 'pageTitles.search',
  '/accounts': 'items.accounts',
  '/contacts': 'items.contacts',
  '/chat': 'pageTitles.chat',
  '/discover': 'items.discover',
  '/integrations': 'items.integrations',
  '/billing': 'items.billing',
  '/settings/profile': 'items.profile',
  '/settings/notifications': 'items.notifications',
  '/settings/security': 'items.security',
  // ⚠️ Explicite, comme ses voisines : sans cette ligne `resolveTitle` retombe
  // sur `/settings` et l'écran s'intitulerait « Préférences ».
  '/settings/mes-donnees': 'items.myData',
  // #1960.10 — explicite pour la même raison que la ligne au-dessus.
  '/settings/mes-signalements': 'items.myReports',
  '/settings/pipeline': 'items.pipelineSla',
  '/settings/branding': 'items.branding',
  // #2035.10 / #2035.11 — explicites pour la même raison que leurs voisines.
  '/settings/reverse-market': 'items.reverseMarketSettings',
  '/settings/commercial-load': 'items.commercialLoadSettings',
  // ⚠️ AVANT `/settings`, et surtout : explicite. `resolveTitle` retombe sur le
  // préfixe le plus long, et sans cette ligne la page des raccourcis
  // s'intitulerait « Préférences » — un écran qui hérite du titre d'un autre.
  '/settings/shortcuts': 'items.shortcuts',
  // ⚠️ Explicite pour la même raison que la ligne au-dessus : sans elle,
  // `resolveTitle` retombe sur `/settings` et l'écran des sociétés s'intitule
  // « Préférences ».
  '/settings/legal-entities': 'items.legalEntities',
  // #2081.14 — explicite pour la même raison : sans elle, « Préférences ».
  '/settings/workspace-rules': 'items.workspaceRules',
  '/settings': 'items.preferences',
}
