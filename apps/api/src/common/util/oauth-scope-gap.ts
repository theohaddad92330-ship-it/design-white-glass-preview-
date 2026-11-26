/**
 * L'écart entre ce que l'app DEMANDE à un fournisseur OAuth et ce qu'il ACCORDE.
 *
 * Le 18/10/2026, l'app HubSpot publiée n'accordait que les portées contacts alors que le code en
 * demandait quatre de plus. HubSpot n'affiche aucun écran de portées : la connexion « réussit »,
 * l'utilisateur reconnecte, et rien ne change. Personne côté Bellum ne le savait, parce que
 * personne ne comparait les deux listes au retour du jeton. Cette fonction est cette comparaison,
 * écrite UNE fois pour tous les connecteurs.
 */
function tokens(list: string | null | undefined): string[] {
  // Espaces (OAuth 2) ET virgules (Zoho) : un fournisseur ne s'aligne pas sur la RFC.
  return (list ?? '').split(/[\s,]+/).filter(Boolean)
}

/**
 * Les portées demandées que le jeton ne porte PAS.
 *
 * `null` quand le fournisseur ne REND pas ses portées (`granted` null/undefined) : sans réponse, on
 * ne devine pas — conclure « tout manque » alerterait à tort, conclure « rien ne manque » mentirait.
 * Comparaison par jetons entiers, insensible à la casse (comme `hasScope`).
 */
export function missingScopes(
  requested: string | null | undefined,
  granted: string | null | undefined,
): string[] | null {
  if (granted === null || granted === undefined) return null
  const have = new Set(tokens(granted).map(scope => scope.toLowerCase()))
  const seen = new Set<string>()
  const missing: string[] = []
  for (const scope of tokens(requested)) {
    const key = scope.toLowerCase()
    if (have.has(key) || seen.has(key)) continue
    seen.add(key)
    missing.push(scope)
  }
  return missing
}

/** L'empreinte d'un ensemble de portées : stable (ordre, casse), pour ne notifier qu'une fois par ensemble. */
export function scopeSignature(scopes: readonly string[]): string {
  return [...new Set(scopes.map(scope => scope.toLowerCase()))].sort().join(' ')
}
