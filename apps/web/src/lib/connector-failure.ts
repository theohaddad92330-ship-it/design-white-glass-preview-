import { ApiError } from './api-error'

/**
 * LEQUEL DES ÉCHECS DE CONNECTEUR — une seule définition pour tout le produit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE — #1836
 * ─────────────────────────────────────────────────────────────────────────────
 * Quatre écrans posaient la même question et la recopiaient : `CrmPipelinePanel`
 * (`unavailableState`), `CrmDataPanel`, `CrmImportPanel` (`HistoryUnavailable`)
 * et `MailboxPage` (`connectorState`). Quatre copies d'une DÉRIVATION, ce qui
 * est déjà interdit ; et surtout quatre endroits où ajouter un cas — donc quatre
 * occasions d'en oublier trois.
 *
 * C'est exactement ce qui s'est produit : le jour où le serveur a su dire « la
 * connexion existe et elle est morte », il aurait fallu se souvenir des quatre.
 * La dérivation vit donc ici, et les écrans ne décident plus que de leurs mots.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE DES TESTS EST L'ORDRE D'IRRÉVERSIBILITÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Il reprend celui du serveur (`classifyProviderError`) : ce qui ne repassera
 * jamais tout seul passe avant ce qui se rattrape. Une portée manquante ou une
 * autorisation morte annoncées « réessaie dans un moment » font perdre une
 * journée à quelqu'un qui attend.
 *
 * `not_connected` se déduit AUSSI d'un 412 : les routes CRM rendent ce statut
 * quand aucun outil n'est branché (« la route existe, il manque une CONDITION »)
 * sans passer par le vocabulaire des connecteurs.
 */
export type ConnectorFailureState = 'scope_missing' | 'authorization_expired' | 'not_connected' | 'failed'

export function connectorFailureState(error: unknown): ConnectorFailureState {
  const failure = error instanceof ApiError ? error : null
  if (failure?.code === 'scope_missing') return 'scope_missing'
  if (failure?.code === 'authorization_expired') return 'authorization_expired'
  if (failure?.code === 'not_connected' || failure?.status === 412) return 'not_connected'
  return 'failed'
}

/**
 * La phrase du SERVEUR porte-t-elle ce que le navigateur ne peut pas deviner ?
 *
 * Vrai pour les deux états où le serveur en sait plus que nous : il NOMME les
 * portées manquantes, et il sait quelle capacité exacte a perdu son
 * autorisation. Faux pour les autres — une panne, l'écran la dit mieux dans la
 * langue de l'utilisateur.
 */
export function connectorFailureSpeaksForItself(state: ConnectorFailureState): boolean {
  return state === 'scope_missing' || state === 'authorization_expired'
}

/**
 * Y a-t-il un geste à faire dans Réglages › Intégrations ?
 *
 * Une PANNE ne s'y répare pas : un chemin qui ne répare rien est pire qu'un
 * message nu. Les trois autres états, si — c'est la distinction entre un défaut
 * du produit et un problème de configuration, et c'est elle que #1836 rendait
 * à l'envers.
 */
export function connectorFailureIsActionable(state: ConnectorFailureState): boolean {
  return state !== 'failed'
}
