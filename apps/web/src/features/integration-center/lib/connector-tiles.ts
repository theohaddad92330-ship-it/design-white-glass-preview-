import type { ConnectorId, ConnectorState, ConnectorView } from './connectors'

/**
 * Théo D settings-integrations.R2 / A1 — la grille de cartes de Théo, qui porte
 * TOUS nos connecteurs (décision Louis 22/10).
 *
 * Le catalogue (`connectors.ts`) reste le registre des outils branchables ; la
 * grille en dérive des TUILES. Deux tuiles n'ont pas de connecteur à elles :
 * Collective.work (N1 — aucun branchement n'existe, le périmètre est à
 * contractualiser) et Facturation (N2 — même carte que la signature : le module
 * `admin_docs` couvre les deux, on ne construit pas un deuxième circuit).
 */
export const TILE_FAMILY_ORDER = ['crm', 'workspace', 'communication', 'outreach', 'admin'] as const
type TileFamily = (typeof TILE_FAMILY_ORDER)[number]

type TileId = ConnectorId | 'collective_work' | 'invoicing'

/** La famille de Théo d'un connecteur du catalogue. L'assistant IA rejoint « admin » (outils & accès). */
const FAMILY_OF: Record<ConnectorId, TileFamily> = {
  hubspot: 'crm',
  salesforce: 'crm',
  pipedrive: 'crm',
  attio: 'crm',
  odoo: 'crm',
  zoho: 'crm',
  ats: 'crm',
  google: 'workspace',
  microsoft: 'workspace',
  notion: 'workspace',
  slack: 'communication',
  teams: 'communication',
  googlechat: 'communication',
  discord: 'communication',
  mattermost: 'communication',
  beeper: 'communication',
  webhook: 'communication',
  lemlist: 'outreach',
  telephony: 'admin',
  admin_docs: 'admin',
  mcp: 'admin',
}

export type TileStatus = 'connected' | 'action_required' | 'available' | 'not_included_in_plan' | 'contractual'
type TileAction = 'manage' | 'repair' | 'journey'

export type ConnectorTile = {
  id: TileId
  /** Le connecteur dont la carte complète s'ouvre dans le tiroir. */
  connector: ConnectorId
  family: TileFamily
  status: TileStatus
  action: TileAction
  /** Nom propre affiché — cet écran a le droit de nommer l'éditeur. */
  name: string
}

const STATUS_RANK: Record<TileStatus, number> = {
  action_required: 0,
  connected: 1,
  available: 2,
  not_included_in_plan: 3,
  contractual: 4,
}

function actionOf(state: ConnectorState): TileAction {
  if (state === 'connected') return 'manage'
  if (state === 'action_required') return 'repair'
  return 'journey'
}

/** Les tuiles ajoutées à celles du catalogue : un nom propre, la famille, et la carte qu'elles ouvrent. */
const EXTRA: readonly { id: 'collective_work' | 'invoicing'; name: string; family: TileFamily; opens: ConnectorId }[] =
  [
    { id: 'collective_work', name: 'Collective.work', family: 'outreach', opens: 'webhook' },
    { id: 'invoicing', name: 'Facturation', family: 'admin', opens: 'admin_docs' },
  ]

const NAME_OVERRIDE: Partial<Record<ConnectorId, string>> = {
  admin_docs: 'Signature électronique',
  telephony: 'Téléphonie',
}

export function buildTiles(connectors: readonly ConnectorView[]): ConnectorTile[] {
  const tiles: ConnectorTile[] = connectors.map(c => ({
    id: c.id,
    connector: c.id,
    family: FAMILY_OF[c.id],
    status: c.state,
    action: actionOf(c.state),
    name: NAME_OVERRIDE[c.id] ?? c.displayName,
  }))

  for (const extra of EXTRA) {
    const host = connectors.find(c => c.id === extra.opens)
    // Facturation suit l'état de la carte qu'elle ouvre ; Collective.work n'a aucun branchement.
    if (extra.id === 'invoicing' && !host) continue
    if (extra.id === 'collective_work') {
      tiles.push({
        id: extra.id,
        connector: extra.opens,
        family: extra.family,
        status: 'contractual',
        action: 'journey',
        name: extra.name,
      })
      continue
    }
    tiles.push({
      id: extra.id,
      connector: extra.opens,
      family: extra.family,
      status: host?.state ?? 'available',
      action: actionOf(host?.state ?? 'available'),
      name: extra.name,
    })
  }

  return TILE_FAMILY_ORDER.flatMap(family =>
    tiles.filter(t => t.family === family).sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]),
  )
}
