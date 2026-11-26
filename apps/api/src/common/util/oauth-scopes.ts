/**
 * Ce qu'un jeton OAuth autorise VRAIMENT.
 *
 * Trois connecteurs le calculaient chacun de leur côté, ou pas du tout. Le « pas
 * du tout » coûte cher : une portée accordée avant un élargissement reste
 * étroite, l'appel part quand même, et le fournisseur répond une erreur qui
 * remonte en 500 opaque (HubSpot) ou — pire — une liste vide (Microsoft), qui se
 * lit « tu n'as aucun document » au lieu de « je n'ai pas le droit de regarder ».
 *
 * La comparaison porte sur des JETONS ENTIERS séparés par des espaces : en
 * sous-chaîne, `calendar.events` aurait l'air d'accorder `calendar.events.owned`
 * et `Mail.Read` d'accorder `Mail.ReadWrite`.
 */
export function grantedScopes(scope: string | null | undefined): Set<string> {
  return new Set((scope ?? '').split(/\s+/).filter(Boolean))
}

/**
 * La portée est-elle accordée ?
 *
 * Insensible à la casse parce que les fournisseurs ne s'accordent pas :
 * Microsoft rend `Mail.Read` sur l'écran de consentement et `mail.read` dans la
 * réponse du jeton. Comparer tel quel ferait croire à une portée absente et
 * éteindrait une capacité qui marche.
 */
export function hasScope(granted: Set<string>, scope: string): boolean {
  if (granted.has(scope)) return true
  const wanted = scope.toLowerCase()
  for (const entry of granted) if (entry.toLowerCase() === wanted) return true
  return false
}

/**
 * Le fournisseur dit-il « tu n'as pas la permission » ?
 *
 * Un refus de portée n'est PAS une panne : il ne se réparera pas tout seul, il
 * demande une reconnexion. Les confondre, c'est conseiller « réessaie dans un
 * moment » pour quelque chose qui ne repassera jamais.
 */
export function looksLikeMissingScope(message: string): boolean {
  return /hasn't been granted|has not been granted|insufficient (?:scope|permission)|missing scope|required scopes|invalid_scope|forbidden|403/i.test(
    message,
  )
}
