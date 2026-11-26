/**
 * Les scopes OAuth2 que BellumAI demande à BoondManager (#4691) — UN SEUL endroit (GA-26).
 *
 * Demande MINIMALE, capacité par capacité. Aucun scope `admin:*` : rien dans le produit n'en a besoin, et en demander un
 * est le meilleur moyen de faire refuser la validation marketplace. La raison de chaque scope : agent_docs/env-reference.md.
 *
 * Les scopes ACCORDÉS viennent de la colonne `scopes` de la connexion, jamais supposés.
 */

export const REQUESTED_BOOND_SCOPES = [
  'companies:read',
  'contacts:read',
  'opportunities:read',
  'opportunities:write',
  'positionings:read',
  'actions:read',
  'actions:write',
  'deliveries:read',
  'deliveries:write',
  'resources:read',
  'candidates:read',
] as const

type BoondScope = (typeof REQUESTED_BOOND_SCOPES)[number]

/** Racine de route → ressource du scope. `/application/*` n'en exige aucun (identité, dictionnaire). */
const RESOURCE_BY_ROOT: Record<string, string> = {
  companies: 'companies',
  contacts: 'contacts',
  opportunities: 'opportunities',
  positionings: 'positionings',
  actions: 'actions',
  deliveries: 'deliveries',
  resources: 'resources',
  candidates: 'candidates',
}

/** Une route que le produit n'a pas déclarée : refusée en test comme à l'exécution, jamais appelée « au cas où ». */
export class UndeclaredBoondRouteError extends Error {
  constructor(readonly path: string) {
    super(`Route BoondManager non déclarée : ${path} — déclarer son scope dans boond-scopes.ts avant tout appel.`)
  }
}

/** Le scope qu'exige `METHOD path`, ou `null` pour `/application/*`. Lève sur une route non déclarée ou un scope non demandé. */
export function requiredScopeFor(method: string, path: string): BoondScope | null {
  const root = path.split('?')[0]?.split('/').filter(Boolean)[0] ?? ''
  if (root === 'application') return null
  const resource = RESOURCE_BY_ROOT[root]
  if (!resource) throw new UndeclaredBoondRouteError(path)
  const scope = `${resource}:${method === 'GET' ? 'read' : 'write'}`
  if (!(REQUESTED_BOOND_SCOPES as readonly string[]).includes(scope)) throw new UndeclaredBoondRouteError(path)
  return scope as BoondScope
}

/** La chaîne `scope` d'un échange de jetons → liste. `null` (non rendu) → liste vide : rien n'est supposé accordé. */
export function parseGrantedScopes(raw: string | null | undefined): string[] {
  return (raw ?? '').split(/[\s,]+/).filter(Boolean)
}

/**
 * `null` = la capacité est disponible. Sinon le message qui NOMME le scope absent et le geste pour l'obtenir.
 * `granted === undefined` : connexion héritée (jeton utilisateur / JWT), sans notion de scope — rien à vérifier.
 */
export function scopeRefusal(granted: readonly string[] | undefined, scope: BoondScope | null): string | null {
  if (scope === null || granted === undefined) return null
  if (granted.includes(scope)) return null
  return `Le scope BoondManager « ${scope} » n'a pas été accordé à cette connexion. Reconnectez BoondManager et acceptez-le sur l'écran de consentement.`
}
