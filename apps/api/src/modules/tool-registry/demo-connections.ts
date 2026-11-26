import type { CapabilityDescriptor, ConnectedTool } from '@bellum/contracts'
import { demoAtsConnection } from '../demo/demo-dataset'

/**
 * #4163 LF (points 6 et 7) — LES DEUX OUTILS QUE LA SALLE DE DÉMONSTRATION MONTRE BRANCHÉS (+ BoondManager, #4689 : la carte suit le panneau).
 *
 * Recette prod du 14/10 : « Aucun outil connecté ne fournit ces données — ce qui manque : email » sur des séquences
 * dont les mandats d'envoi sont signés et actifs, et « Écriture CRM indisponible » devant des cartes d'écriture.
 * Une salle qui montre des gestes d'envoi et d'écriture sans messagerie ni CRM se contredit en réunion.
 *
 * ⚠️ Rien n'est branché pour de vrai, et c'est voulu : AUCUNE ligne `crm_connections` / `google_connections`, aucun
 * jeton. Le registre est un OVERLAY de lecture (comme `CrmService.getStatus` l'est déjà en démo, « CRM fictif ») ;
 * toute tentative réelle d'appel d'un fournisseur cherche un jeton qui n'existe pas et s'arrête avant le réseau.
 * Le nom dit « démonstration » : la salle ne prétend jamais une vraie connexion.
 */
export const DEMO_CONNECTED_PROVIDERS: readonly string[] = ['gmail', 'hubspot', 'boondmanager']

/**
 * Recette R24 (15/10/2026) — /integrations n'affichait que HubSpot, Salesforce et Odoo : Zoho, Pipedrive et Attio, dont
 * le connecteur existe, restent `coming_soon` tant que le serveur n'a pas leurs clés, et un outil `coming_soon` n'a pas
 * de carte. La salle les LISTE « à brancher » (jamais « connecté ») : un prospect voit le choix complet des CRM.
 * Même overlay de lecture que ci-dessus — rien n'est branché, aucun jeton.
 */
export const DEMO_LISTED_CRM_PROVIDERS: readonly string[] = ['salesforce', 'pipedrive', 'attio', 'odoo', 'zoho']

/**
 * #5048 (craft rule n° 9) — la salle montre aussi UN outil « à reconnecter » : les puces « Tes outils avec Laura » du
 * composeur affichent connecté ET à reconnecter, et un prospect doit voir où mène ce second état (`/integrations`).
 * Même overlay de lecture : aucune connexion réelle, aucun jeton — l'état est celui de l'écran, rien d'autre.
 */
export const DEMO_RECONNECT_PROVIDERS: readonly string[] = ['google-calendar']

const DEMO_SUFFIX = ' (démonstration)'

export function withDemoConnections(tools: readonly ConnectedTool[], now: Date): ConnectedTool[] {
  return tools.map(tool => {
    if (DEMO_LISTED_CRM_PROVIDERS.includes(tool.provider) && tool.status === 'coming_soon') {
      return { ...tool, status: 'available' }
    }
    if (DEMO_RECONNECT_PROVIDERS.includes(tool.provider)) return { ...tool, status: 'action_required' }
    if (!DEMO_CONNECTED_PROVIDERS.includes(tool.provider)) return tool
    // BoondManager : la date est celle du PANNEAU (`AtsService.status`), pas l'instant du rendu — #4689.
    const stamp = tool.provider === 'boondmanager' ? demoAtsConnection(now.getTime()).lastExchangeAt : now.toISOString()
    const capabilities: CapabilityDescriptor[] = tool.capabilities.map(capability => ({
      ...capability,
      state: 'operational',
      last_error_code: null,
      last_error_at: null,
    }))
    return {
      ...tool,
      display_name: tool.display_name.endsWith(DEMO_SUFFIX) ? tool.display_name : `${tool.display_name}${DEMO_SUFFIX}`,
      status: 'connected',
      capability_state: 'operational',
      last_sync: stamp,
      capabilities,
    }
  })
}
