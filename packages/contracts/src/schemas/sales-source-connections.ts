import type { ConnectedTool } from './tool-registry.js'

/**
 * #3904.3 — LA LECTURE UNIQUE de l'état des quatre sources commerciales que
 * Laura croise (CRM, téléphonie, agenda, mail) : branchée ou non, à
 * reconnecter, et la date de la dernière synchronisation.
 *
 * Aucun second calcul (GA-26) : la vérité de connexion vit dans le Tool
 * Registry (`ToolRegistryService.list`, `GET /tool-registry`), qui lit déjà les
 * tables réelles (`crm_connections`, `telephony_connections`,
 * `google_connections`, `microsoft_connections`). Cette fonction ne fait que
 * REGROUPER ses lignes par source — appelée par le pont de Laura
 * (`internal/copilot/sources/connections`) ET par l'écran (centre
 * d'intégrations), pour que les deux disent la même chose.
 *
 * Les quatre sources sortent TOUJOURS, dans le même ordre : un connecteur
 * absent se NOMME (`not_connected`), il ne disparaît pas — Laura ne conclut
 * jamais sur un trou qu'elle n'a pas vu. Aucun nom d'éditeur ne voyage : on
 * dit « ton CRM », jamais lequel (GA-69).
 */
export const SALES_SOURCE_KINDS = ['crm', 'telephony', 'calendar', 'email'] as const
export type SalesSourceKind = (typeof SALES_SOURCE_KINDS)[number]

export type SalesSourceState = 'connected' | 'action_required' | 'not_connected'

export type SalesSourceConnection = {
  source: SalesSourceKind
  state: SalesSourceState
  /** Dernière activité RÉELLE de la connexion (`last_sync` du registre) ;
   *  `null` = jamais mesurée, jamais une date inventée. */
  lastSync: string | null
}

type RegistryRow = Pick<ConnectedTool, 'provider' | 'family' | 'status' | 'last_sync'>

/**
 * Quels outils du catalogue alimentent quelle source. Le mail et l'agenda se
 * lisent par OUTIL, pas par famille : `copilot-bridge` est rangé en famille
 * `email` mais n'est pas une boîte branchée par l'espace, et Microsoft 365
 * porte à la fois le mail et l'agenda.
 */
const SOURCE_MATCHERS: Record<SalesSourceKind, (row: RegistryRow) => boolean> = {
  crm: row => row.family === 'crm',
  telephony: row => row.family === 'telephony',
  calendar: row => row.provider === 'google-calendar' || row.provider === 'microsoft',
  email: row => row.provider === 'gmail' || row.provider === 'microsoft',
}

function latest(rows: readonly RegistryRow[]): string | null {
  const stamps = rows.map(row => row.last_sync).filter((stamp): stamp is string => typeof stamp === 'string')
  return stamps.length === 0 ? null : stamps.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b))
}

export function salesSourceConnections(tools: readonly RegistryRow[]): SalesSourceConnection[] {
  return SALES_SOURCE_KINDS.map(source => {
    const rows = tools.filter(SOURCE_MATCHERS[source])
    const connected = rows.filter(row => row.status === 'connected')
    if (connected.length > 0) return { source, state: 'connected', lastSync: latest(connected) }
    const broken = rows.filter(row => row.status === 'action_required')
    if (broken.length > 0) return { source, state: 'action_required', lastSync: latest(broken) }
    return { source, state: 'not_connected', lastSync: null }
  })
}

/**
 * #4184.4 (R44) — l'OUTIL qui porte la date de dernière synchro d'une source : l'identifiant du
 * registre de la connexion dont `lastSync` est issue (la plus récente parmi celles de l'état retenu).
 * Réservé à l'ÉCRAN (le nom se dérive ensuite par `clientToolName`, jamais écrit en dur) : il ne
 * voyage PAS dans `SalesSourceConnection`, donc pas vers le pont de Laura (GA-69). `null` = pas de
 * connexion, ou aucune date : jamais un outil deviné.
 */
export function salesSourceSyncProvider(tools: readonly RegistryRow[], source: SalesSourceKind): string | null {
  const rows = tools.filter(SOURCE_MATCHERS[source])
  const retained = rows.some(row => row.status === 'connected')
    ? rows.filter(row => row.status === 'connected')
    : rows.filter(row => row.status === 'action_required')
  const dated = retained.filter(row => typeof row.last_sync === 'string')
  if (dated.length === 0) return null
  return dated.reduce((a, b) => (Date.parse(a.last_sync as string) >= Date.parse(b.last_sync as string) ? a : b))
    .provider
}

/**
 * CRM-SYNC-D.4 — TOUS les outils branchés d'une source, un par ligne (la tuile du haut de /integrations ne
 * résumait que le plus récent : six CRM branchés, un seul visible). Réservé à l'ÉCRAN, comme
 * `salesSourceSyncProvider` : rien de plus ne voyage vers le pont de Laura (GA-69). `lastSync: null` = jamais mesurée.
 */
export function salesSourceConnectedTools(
  tools: readonly RegistryRow[],
  source: SalesSourceKind,
): Array<{ provider: string; lastSync: string | null }> {
  return tools
    .filter(row => SOURCE_MATCHERS[source](row) && row.status === 'connected')
    .map(row => ({ provider: row.provider, lastSync: typeof row.last_sync === 'string' ? row.last_sync : null }))
}
