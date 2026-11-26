/**
 * Choisir LE bon cookie de session quand le navigateur en porte plusieurs.
 *
 * Les cookies d'authentification sont nommés par utilisateur — `session:{id}`,
 * `uploadsSig:{id}` — précisément pour que deux identités puissent coexister
 * dans un même navigateur. Mais les trois endroits qui les LISAIENT prenaient
 * « le premier venu », et l'ordre d'un en-tête `Cookie` n'appartient à personne :
 *
 *     for (const [name, value] of Object.entries(cookies))
 *       if (name.startsWith(prefix)) return value
 *
 * Ouvrir la démonstration dans un second onglet déposait donc un deuxième
 * `session:*` — et les DEUX onglets se mettaient à taper sur la même identité,
 * tirée au sort. C'est le mélange décrit par DEMO-01 (audit terrain du 17/08) :
 * on présente le produit à un prospect, et l'onglet de démonstration se met à
 * afficher les vrais dossiers, ou l'inverse.
 *
 * L'onglet DIT désormais pour qui il travaille, dans l'en-tête
 * {@link SESSION_SCOPE_HEADER}. Trois règles, dans cet ordre :
 *
 *  1. indication présente ET cookie correspondant présent → ce cookie ;
 *  2. indication présente et cookie ABSENT → `null`, jamais une autre identité.
 *     Un 401 se répare tout seul (l'app rejoue un rafraîchissement, sinon
 *     renvoie à la connexion) ; servir la session de quelqu'un d'autre, non ;
 *  3. aucune indication (appel serveur à serveur, client antérieur, curl) →
 *     le comportement historique, inchangé.
 *
 * L'en-tête n'accorde AUCUN droit : il ne fait que désigner lequel des cookies
 * déjà détenus par ce navigateur doit être lu. Le jeton qu'il désigne est validé
 * exactement comme avant — signature, audience, expiration. Le poser au nom d'un
 * autre utilisateur ne donne donc rien : sans son cookie, la lecture rend `null`.
 */

/** L'en-tête par lequel un onglet déclare l'identité sous laquelle il travaille. */
export const SESSION_SCOPE_HEADER = 'x-bellum-user'

/** Un identifiant Supabase est un UUID ; tout le reste est écarté sans façon —
 *  l'indication ne sert qu'à composer un nom de cookie, elle n'a aucune raison
 *  d'accepter une chaîne libre. */
const USER_ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** L'identité déclarée par l'onglet, ou `null` si rien d'exploitable. */
export function readSessionScopeHint(headers: Record<string, unknown> | undefined): string | null {
  const raw = headers?.[SESSION_SCOPE_HEADER]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return USER_ID_SHAPE.test(trimmed) ? trimmed.toLowerCase() : null
}

/**
 * Le cookie `{prefix}:{id}` de l'identité déclarée, sinon le premier `{prefix}:`
 * porteur d'une valeur (comportement historique quand rien n'est déclaré).
 */
export function pickScopedCookie(
  cookies: Record<string, string> | undefined,
  prefix: string,
  hint: string | null,
): string | null {
  if (!cookies) return null
  const namePrefix = `${prefix}:`
  if (hint) {
    // Comparaison insensible à la casse : l'identité voyage en minuscules dans
    // l'en-tête, alors qu'un cookie posé plus tôt peut porter la casse d'origine.
    for (const [name, value] of Object.entries(cookies)) {
      if (!value || !name.startsWith(namePrefix)) continue
      if (name.slice(namePrefix.length).toLowerCase() === hint) return value
    }
    return null
  }
  for (const [name, value] of Object.entries(cookies)) {
    if (name.startsWith(namePrefix) && value) return value
  }
  return null
}
