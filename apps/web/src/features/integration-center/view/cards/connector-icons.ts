import {
  Blocks,
  BookOpen,
  Bot,
  Chrome,
  Cloud,
  Database,
  Hash,
  Layers,
  LayoutGrid,
  Mail,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Send,
  Users,
  Webhook,
  Smartphone,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import type { ConnectorId } from '../../lib/connectors'

/**
 * Une icône par connecteur — la table, et rien d'autre (#1447).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les icônes étaient choisies à l'endroit de chaque carte, dans trois fichiers.
 * Deux cartes de la MÊME section de la grille portaient donc `Boxes` sans que
 * rien ne s'en aperçoive, et deux canaux voisins portaient `MessageCircle`. Une
 * grille qu'on parcourt du regard perd alors sa seule aide au repérage : deux
 * lignes rigoureusement identiques à l'œil.
 *
 * Le doublon n'est pas une faute d'attention, c'est une conséquence — personne
 * ne peut vérifier une unicité répartie sur trois fichiers. La table le rend
 * vérifiable, et `connector-icons-are-distinct.test.ts` le vérifie.
 *
 * ⚠️ Elle n'est PAS le catalogue. Ce que l'écran affiche reste décidé par
 * `buildConnectorsView` : un outil que ce serveur n'offre pas (toutes ses lignes
 * en `coming_soon`) reste masqué, et cette table n'a aucun moyen de le
 * rétablir — elle ne fait qu'attribuer un dessin à une entrée déjà visible.
 */
export const CONNECTOR_ICONS = {
  hubspot: Database,
  salesforce: Cloud,
  pipedrive: Workflow,
  attio: LayoutGrid,
  odoo: Blocks,
  zoho: Layers,
  google: Chrome,
  microsoft: Mail,
  notion: BookOpen,
  slack: MessageSquare,
  teams: Users,
  googlechat: MessagesSquare,
  discord: MessageCircle,
  mattermost: Hash,
  beeper: Smartphone,
  webhook: Webhook,
  lemlist: Send,
  mcp: Bot,
} as const satisfies Partial<Record<ConnectorId, LucideIcon>>

/**
 * Les cartes qui n'ont PAS d'entête à icône, et pourquoi.
 *
 * Ces trois-là n'utilisent pas `CardShell` : elles portent leur propre mise en
 * page (un formulaire de jeton, une liste d'opérateurs). Les déclarer ici plutôt
 * que les taire est ce qui permet à la garde d'exiger que l'union des deux
 * listes couvre TOUS les connecteurs — sinon un connecteur neuf sans icône
 * passerait inaperçu, et c'est exactement ainsi que le doublon est arrivé.
 */
export const CONNECTORS_WITHOUT_ICON = ['ats', 'telephony', 'admin_docs'] as const satisfies readonly ConnectorId[]
