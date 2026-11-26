import { connectedToolLogo } from '@/features/chat/view/brand-logos'
import type { ConnectorId } from '../../lib/connectors'

/**
 * #3973.7 (Louis 16/10/2026) — le logo d'un connecteur de Réglages › Intégrations.
 *
 * UN SEUL REGISTRE (garde GA-26) : `chat/view/brand-logos.ts`, celui du sélecteur « Outils et sources » de Laura —
 * SVG commités, licence écrite dans `brand-logos/LICENSES.md`, jamais chargés à distance. L'ancien relais
 * `/logo?domain=` (#1614) et sa table de domaines sont retirés : deux sources pour un même logo divergent.
 * Les identifiants de connecteur et d'outil client coïncident (hubspot, salesforce, teams…), donc aucune 2e liste.
 *
 * ⚠️ Absent ⇒ l'icône `lucide` (`connector-icons.ts`), jamais un carré vide ni un logo approximatif.
 */
export function connectorLogo(connector: ConnectorId | undefined): string | null {
  return connector ? connectedToolLogo(connector) : null
}

/**
 * Les connecteurs SANS logo, et pourquoi — déclarés plutôt que tus, pour que la garde exige que chaque
 * connecteur de l'écran ait l'un ou l'autre.
 *
 * - `webhook` et `mcp` : des PROTOCOLES, personne ne les édite.
 * - `ats`, `telephony`, `admin_docs` : une FAMILLE où l'opérateur choisit son outil ; en montrer un seul
 *   désignerait un éditeur qu'on ne fournit pas.
 * - `google` : la carte groupe Gmail, Agenda et Drive — trois logos, aucun « Google » seul sous licence.
 * - `attio` : EN ATTENTE du fichier sous licence que Louis fournit. UN SEUL endroit à compléter :
 *   déposer `chat/view/brand-logos/attio.svg` + sa ligne dans `LICENSES.md` (la correspondance est déjà
 *   dans `PROVIDER_TO_LOGO`), puis retirer `attio` de cette liste.
 * - `beeper` (#4406.4) : aucun SVG sous licence commité — l'icône lucide en attendant, jamais un logo
 *   chargé à distance. Même geste que pour `attio` le jour où le fichier existe.
 * - `lemlist` (#4427.1) : même cas qu'Attio — aucun fichier sous licence n'est commité ; l'icône `Send` tient
 *   la place, jamais un logo chargé à distance.
 */
export const CONNECTORS_WITHOUT_LOGO = [
  'webhook',
  'mcp',
  'ats',
  'telephony',
  'admin_docs',
  'google',
  'attio',
  'beeper',
  'lemlist',
] as const satisfies readonly ConnectorId[]
