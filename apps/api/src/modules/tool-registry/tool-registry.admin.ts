import type { ConnectedTool, LocalizedText } from '@bellum/contracts'
import type { ToolCatalogEntry, ToolSource } from './tool-catalog'

/**
 * Les formes de réponse de la moitié OPÉRATEUR du registre d'outils.
 *
 * L'écran Réglages › Intégrations ne montre à l'utilisateur que ce sur quoi il
 * peut agir. Tout le reste — ce que chaque outil sait faire, son coût, ses
 * limites de débit, sa politique de rétention, et qui l'a branché chez quel
 * client — vit dans le Dashboard Manager et transite par ces types.
 */

/** D'où le service tire l'état d'une entrée, en un mot lisible par un opérateur. */
type ToolSourceKind = ToolSource['kind']

/** Une entrée du catalogue vue par l'opérateur : la fiche complète de l'outil,
 *  plus le fait que CE serveur soit ou non capable de l'offrir. */
type AdminCatalogTool = {
  provider: string
  family: string
  displayName: string
  /** `workspace` = le lien est partagé par l'espace, `user` = propre à chacun. */
  owner: string
  /** Silo qui porte l'état : webhook, crm, oauth, mcp, server, ia-server, catalog. */
  sourceKind: ToolSourceKind
  /** Clé d'environnement / identifiant de fournisseur dont dépend l'activation,
   *  quand l'entrée est adossée à une configuration serveur. */
  sourceRef: string | null
  /**
   * Ce serveur peut-il proposer l'outil ? `false` = la configuration manque
   * (app OAuth non déclarée, clé absente) — l'outil n'apparaît alors PAS dans
   * l'écran client, d'où l'intérêt de le voir ici.
   */
  configured: boolean
  reads: string[]
  writes: string[]
  allowedActions: string[]
  /** Textes localisés du catalogue, restitués tels quels (FR + EN). */
  costModel: LocalizedText
  memoryPolicy: LocalizedText
  rateLimits: LocalizedText | null
}

/** Le catalogue complet + de quoi le lire d'un coup d'œil. */
export type AdminCatalogReport = {
  tools: AdminCatalogTool[]
  total: number
  /** Nombre d'outils que ce serveur est en mesure de proposer. */
  configured: number
}

/** L'état réel du registre pour un espace de travail donné. */
export type AdminWorkspaceRegistry = {
  workspaceId: string
  /** Utilisateurs dont les branchements personnels (webhooks, MCP) sont agrégés. */
  memberCount: number
  tools: ConnectedTool[]
  connected: number
  actionRequired: number
}

/** Extrait la référence de configuration d'une source, ou `null` quand elle n'en
 *  a pas (webhook auto-géré, MCP, entrée purement catalogue). */
function sourceRefOf(source: ToolSource): string | null {
  switch (source.kind) {
    case 'webhook':
    case 'crm':
    case 'oauth':
      return source.providerKey
    case 'server':
      return source.envKey
    case 'ia-server':
      return source.providerId
    case 'workspace-secret':
      return source.providerKey
    case 'mcp':
    case 'catalog':
      return null
  }
}

/**
 * Projette une entrée du catalogue vers sa fiche opérateur.
 *
 * Les champs tableau sont déréférencés défensivement, comme au bord du contrat
 * public : une entrée ajoutée sans `data_types` lors d'un rebase doit dégrader
 * en liste vide, jamais faire tomber l'écran (c'est la régression qui avait
 * mis `/settings/integrations` à terre en production).
 */
export function toAdminCatalogTool(entry: ToolCatalogEntry, configured: boolean): AdminCatalogTool {
  return {
    provider: entry.provider,
    family: entry.family,
    displayName: entry.display_name,
    owner: entry.owner,
    sourceKind: entry.source.kind,
    sourceRef: sourceRefOf(entry.source),
    configured,
    reads: entry.data_types?.reads ?? [],
    writes: entry.data_types?.writes ?? [],
    allowedActions: entry.allowed_actions ?? [],
    costModel: entry.cost_model,
    memoryPolicy: entry.memory_policy,
    rateLimits: entry.rate_limits ?? null,
  }
}
