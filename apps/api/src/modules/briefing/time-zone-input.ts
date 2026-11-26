/**
 * LE FUSEAU QUE LE CLIENT ENVOIE — jamais persisté (décision de Louis du
 * 12/09/2026, lot 7A, #1936).
 *
 * Chaque appel porte le fuseau du NAVIGATEUR au moment de l'appel, jamais une
 * valeur stockée qui daterait le jour où l'utilisateur a réglé son fuseau une
 * fois pour toutes — un commercial en déplacement change de fuseau plus
 * souvent qu'il ne rouvre ses réglages.
 *
 * Une valeur qui n'est pas un identifiant IANA valide retombe
 * SILENCIEUSEMENT sur {@link DEFAULT_TIME_ZONE} : deviner un fuseau à partir
 * d'un texte qu'on ne sait pas lire serait pire que d'utiliser celui du
 * produit — un décalage fabriqué se lirait comme une mesure, un repli se lit
 * comme un repli. C'est la même famille de règle que « non mesuré n'est
 * jamais 0 » : une valeur qu'on ne sait pas interpréter ne se remplace pas
 * par une valeur inventée qui a l'air juste.
 */

/** Fuseau de référence du produit — les ESN visées travaillent en heure de Paris. */
export const DEFAULT_TIME_ZONE = 'Europe/Paris'

/** `true` quand `Intl` reconnaît `timeZone` comme un identifiant IANA. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false
  try {
    // `Intl.DateTimeFormat` lève un `RangeError` sur un fuseau qu'il ne
    // connaît pas — c'est la seule vérification isomorphe (Node ET
    // navigateur) sans dépendance supplémentaire.
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

/**
 * Le fuseau à utiliser pour une requête : celui du client s'il est un IANA
 * valide, sinon {@link DEFAULT_TIME_ZONE}. Absent, vide ou invalide suivent
 * le même repli — aucun des trois cas ne doit faire échouer l'appelant.
 */
export function resolveTimeZone(candidate: string | null | undefined): string {
  if (!candidate) return DEFAULT_TIME_ZONE
  return isValidTimeZone(candidate) ? candidate : DEFAULT_TIME_ZONE
}
