/**
 * #2045.5 (épopée #2859) — combien de contacts le CRM branché de l'espace
 * connaît, TOUS comptes confondus.
 *
 * `reseau-comptage.ts` (onboarding) demande à COMPTER le réseau personnel en
 * bandes déclarées pour cinq réservoirs — jamais pour « mes contacts CRM » :
 * `answers-reseau.ts` documente déjà que #2045.5 est une LECTURE d'un
 * connecteur branché, jamais une estimation, sous peine d'inventer un chiffre
 * que le produit peut compter exactement.
 *
 * Honnêteté (JAMAIS de donnée inventée, gardes GA-18/GA-19) :
 *   - CRM non configuré / non connecté → `provider: null`, `total: null`
 *     (« non mesuré » n'est JAMAIS un zéro déguisé)
 *   - connecté mais lecture en échec → `provider: 'hubspot'` (l'espace A
 *     branché ce fournisseur, c'est un fait connu), `total: null`
 *   - lu avec succès → le total RÉEL, même s'il vaut zéro (un vrai zéro, pas
 *     une absence)
 *
 * Seul HubSpot est câblé, comme `crm-vocabulary.ts` (#2031.5/#2045.5) : les
 * autres fournisseurs n'ont aucune méthode de comptage portail aujourd'hui.
 *
 * GA-43 : un seul espace est jamais lu (`workspaceScopeWhere`) — aucune
 * agrégation entre espaces.
 */
export type CrmNetworkSize = {
  /** Le CRM qui a répondu — null quand aucun n'a été consulté. */
  provider: 'hubspot' | null
  /** null = non mesuré. Jamais confondu avec un compte réel de zéro. */
  total: number | null
}

/** La réponse honnête par défaut : rien n'a été lu. */
export function emptyNetworkSize(provider: CrmNetworkSize['provider'] = null): CrmNetworkSize {
  return { provider, total: null }
}
