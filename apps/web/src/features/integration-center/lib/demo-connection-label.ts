import { connectedClientTools, type ConnectedTool } from '@bellum/contracts'

/**
 * G.6 — les noms que la salle de démonstration montre « branchés » (Gmail, HubSpot),
 * pour la mention « (démonstration) » de l'écran Intégrations.
 *
 * Dérivés de `connectedClientTools` (jamais écrits ici : on ne nomme que ce que
 * l'espace a branché, sous son nom client), et vides hors démonstration — une
 * vraie connexion ne porte jamais cette mention.
 */
export function demoConnectedNames(tools: readonly ConnectedTool[], isDemo: boolean): string[] {
  if (!isDemo) return []
  return connectedClientTools(tools).map(tool => tool.name)
}
