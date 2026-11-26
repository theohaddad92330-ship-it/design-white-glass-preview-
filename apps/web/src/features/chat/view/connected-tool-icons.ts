import type { ConnectedClientTool, ToolFamily } from '@bellum/contracts'
import {
  Bot,
  Briefcase,
  CalendarClock,
  Database,
  FileSignature,
  FileText,
  Landmark,
  Mail,
  MessageSquare,
  Phone,
  Plug,
  Search,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { CONNECTOR_ICONS } from '@/features/integration-center/view/cards/connector-icons'

/** Les seuls identifiants que `CONNECTOR_ICONS` dessine réellement — `ConnectorId`
 *  (plus large, `ats`/`telephony`/`admin_docs`/`webhook` compris) en contient
 *  que cette table ne référencera jamais : indexer sur ce sous-ensemble plutôt
 *  que sur `ConnectorId` garde le type-check honnête. */
type IconedConnectorId = keyof typeof CONNECTOR_ICONS

/**
 * #2254 — « ils devraient avoir des logos ». La doctrine (D354) interdit un
 * fichier de MARQUE dans l'app : ce n'est pas un logo d'éditeur, c'est
 * l'icône déjà choisie par Réglages › Intégrations pour ce même connecteur
 * (`connector-icons.ts`, #1447) — la réutiliser évite un second choix qui
 * diverge du premier, et couvre GA-44 (rien ici ne nomme ni ne dessine un
 * fournisseur qui n'est pas au registre `CLIENT_TOOLS`).
 *
 * `ConnectedClientTool.provider` (registre d'outils) et `ConnectorId`
 * (Réglages › Intégrations) sont deux espaces d'identifiants proches mais pas
 * identiques : Réglages GROUPE Gmail, Google Agenda et Google Drive sous une
 * seule carte « google » (un geste de connexion), quand le registre les
 * distingue (trois capacités). Cette table normalise avant de chercher.
 */
const PROVIDER_TO_CONNECTOR_ICON_ID: Readonly<Record<string, IconedConnectorId>> = {
  gmail: 'google',
  'google-calendar': 'google',
  'google-drive': 'google',
  microsoft: 'microsoft',
  hubspot: 'hubspot',
  salesforce: 'salesforce',
  pipedrive: 'pipedrive',
  attio: 'attio',
  odoo: 'odoo',
  notion: 'notion',
  slack: 'slack',
  discord: 'discord',
  teams: 'teams',
  googlechat: 'googlechat',
  mattermost: 'mattermost',
}

/**
 * Icône de CAPACITÉ — jamais nue — pour un fournisseur que Réglages ›
 * Intégrations ne dessine pas (BoondManager, Aircall, Yousign, LinkedIn…).
 * Totale sur `toolFamilyValues` : un `Record` complet plutôt qu'un repli
 * implicite, pour qu'une famille ajoutée au registre sans entrée ici échoue
 * au type-check plutôt qu'en silence à l'écran.
 */
const GENERIC_FAMILY_ICON: Record<ToolFamily, LucideIcon> = {
  crm: Database,
  email: Mail,
  calendar: CalendarClock,
  linkedin: Users,
  prospection: Search,
  documents: FileText,
  communication: MessageSquare,
  jobs: Briefcase,
  data: Database,
  finance: Wallet,
  mcp: Bot,
  ats: Briefcase,
  telephony: Phone,
  admin_docs: FileSignature,
  // #2261.30 — le même symbole que la carte « marchés publics » du compte
  // (`CompanyPublicDataSection.tsx`), pour ne pas inventer un second choix.
  tenders: Landmark,
}

/** L'icône d'un outil BRANCHÉ, pour la saisie de Laura. Ne dérive jamais de
 *  texte affiché : `tool.name` reste la seule source du LIBELLÉ (GA-44). */
export function connectedToolIcon(tool: ConnectedClientTool): LucideIcon {
  const connectorId = PROVIDER_TO_CONNECTOR_ICON_ID[tool.provider]
  const known = connectorId ? CONNECTOR_ICONS[connectorId] : undefined
  return known ?? GENERIC_FAMILY_ICON[tool.family] ?? Plug
}
