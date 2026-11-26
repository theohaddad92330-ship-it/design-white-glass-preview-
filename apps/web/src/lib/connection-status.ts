import type { AtsStatus } from '@bellum/contracts'
import type { TFunction } from 'i18next'

/**
 * #4689 — L'ÉTAT D'UNE CONNEXION, défini UNE fois.
 *
 * Recette écran du 28/10 : la carte de la grille disait « Non connecté », le panneau de la même intégration « Branché »,
 * et le même état « Non branché » ailleurs. Les trois mots viennent désormais d'un seul endroit —
 * `integrationCenter.grid.status` — que la carte (`ConnectorTile`) ET le panneau (`AtsCard`) lisent par cette fonction.
 * Le vocabulaire du produit est « branché » (la doctrine nomme ce que l'espace a branché).
 */
type ConnectionStatus = 'connected' | 'action_required' | 'available'

export function connectionStatusLabel(t: TFunction, status: ConnectionStatus): string {
  return t(`grid.status.${status}`)
}

/** L'état du panneau ATS, NOMMÉ — jamais deviné : non branché · branché · à reconnecter (+ l'héritage, + le serveur). */
type AtsConnectionState = 'not_connected' | 'connected' | 'needs_reconnect' | 'legacy' | 'environment'

export function atsConnectionState(status: AtsStatus | undefined): AtsConnectionState {
  if (!status?.connected) return 'not_connected'
  if (status.fromEnvironment) return 'environment'
  if (status.authMode !== 'oauth2') return 'legacy'
  return status.needsReconnect ? 'needs_reconnect' : 'connected'
}

/** L'état du panneau, ramené au vocabulaire de la carte ; `legacy` / `environment` ont un libellé à eux (précisions). */
export function atsConnectionStatus(state: AtsConnectionState): ConnectionStatus | null {
  switch (state) {
    case 'not_connected':
      return 'available'
    case 'connected':
      return 'connected'
    case 'needs_reconnect':
      return 'action_required'
    case 'legacy':
    case 'environment':
      return null
  }
}
