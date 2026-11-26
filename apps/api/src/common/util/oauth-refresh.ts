/**
 * Le rafraîchissement d'un jeton OAuth, avec la trace de son échec.
 *
 * Les cinq connecteurs OAuth (HubSpot, Salesforce, Pipedrive, Google, Microsoft)
 * renouvellent leur jeton d'accès de la même façon, et tous avaient le même trou :
 * quand le fournisseur REFUSE le rafraîchissement — consentement retiré, mot de
 * passe changé, application désinstallée — l'erreur remontait à l'appelant et rien
 * n'en gardait la mémoire. L'écran Intégrations ne pouvait donc pas distinguer
 * « le jeton d'accès a une heure » (normal, il se renouvelle) de « la connexion est
 * morte » (il faut se reconnecter).
 *
 * Deux règles portent l'honnêteté de ce helper :
 *
 * 1. **La trace ne masque jamais l'erreur d'origine.** Si l'écriture de la trace
 *    échoue elle-même (base indisponible), on l'avale : l'appelant doit voir
 *    l'erreur du FOURNISSEUR, pas une erreur de comptabilité interne qui lui
 *    ferait chercher au mauvais endroit.
 * 2. **Un succès efface la trace.** Un refus passager (503 du fournisseur, réseau
 *    coupé) ne doit pas condamner une connexion saine à afficher « à reconnecter »
 *    pour toujours — c'est le premier rafraîchissement réussi qui a le dernier mot.
 */
export async function refreshTrackingFailure<T>(
  refresh: () => Promise<T>,
  markFailure: () => Promise<unknown>,
): Promise<T> {
  try {
    return await refresh()
  } catch (error) {
    await markFailure().catch(() => undefined)
    throw error
  }
}
