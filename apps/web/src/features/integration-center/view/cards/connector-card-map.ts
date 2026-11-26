import type { ConnectedTool } from '@bellum/contracts'
import type { ComponentType } from 'react'
import { AdminDocsCard } from '@/features/admin-docs/view/AdminDocsCard'
import { AtsCard } from '@/features/ats/view/AtsCard'
import { OdooCard } from './OdooCard'
import { BeeperCard } from './BeeperCard'
import { GoogleWorkspaceCard } from './GoogleWorkspaceCard'
import { LemlistCard } from './LemlistCard'
import { TelephonyCard } from '@/features/telephony/view/TelephonyCard'
import type { ConnectorId, ConnectorState } from '../../lib/connectors'
import {
  AttioCard,
  DiscordCard,
  GenericWebhookCard,
  GoogleChatCard,
  HubSpotCard,
  MattermostCard,
  McpCard,
  Microsoft365Card,
  NotionCard,
  PipedriveCard,
  SalesforceCard,
  SlackCard,
  TeamsCard,
  ZohoCard,
} from './connector-cards'

/**
 * Connecteur → carte.
 *
 * Une table exhaustive (`Record<ConnectorId, …>`) et non un `Partial` : ajouter
 * un connecteur à la liste de l'écran sans lui donner de carte produirait une
 * case vide dans la grille, ce que personne ne remarque avant un client. Le
 * compilateur refuse désormais l'oubli.
 *
 * Séparée du fichier des cartes pour que celui-ci n'exporte QUE des composants —
 * c'est la condition du rechargement à chaud de Vite.
 */
/** Ce qu'une carte reçoit de l'écran. `state` vient du registre serveur, seul à
 *  savoir qu'un jeton a expiré — la carte, elle, ne voit que « connecté ». Une
 *  carte qui n'a rien à en faire l'ignore : la prop est optionnelle. */
export type ConnectorCardProps = { state?: ConnectorState; tools?: readonly ConnectedTool[] }

export const CONNECTOR_CARDS: Record<ConnectorId, ComponentType<ConnectorCardProps>> = {
  hubspot: HubSpotCard,
  salesforce: SalesforceCard,
  pipedrive: PipedriveCard,
  attio: AttioCard,
  odoo: OdooCard,
  zoho: ZohoCard,
  google: GoogleWorkspaceCard,
  microsoft: Microsoft365Card,
  notion: NotionCard,
  slack: SlackCard,
  discord: DiscordCard,
  teams: TeamsCard,
  googlechat: GoogleChatCard,
  mattermost: MattermostCard,
  beeper: BeeperCard,
  webhook: GenericWebhookCard,
  lemlist: LemlistCard,
  ats: AtsCard,
  telephony: TelephonyCard,
  admin_docs: AdminDocsCard,
  mcp: McpCard,
}
