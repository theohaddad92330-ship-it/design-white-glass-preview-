/**
 * #1960.7 — UNE ADRESSE QUI PART DANS UN SIGNALEMENT, SANS SES SECRETS.
 *
 * Une requête ou une ancre porte des jetons : `?t=` du lien de démonstration,
 * `code`/`state` d'un retour OAuth, `#access_token=` d'un lien de connexion. Un
 * signalement est lu par plus de monde qu'une session — leur VALEUR n'y va
 * jamais. Leur PRÉSENCE, elle, se dit (`?…`, `#…`) : l'absence d'un paramètre
 * peut être la cause du bug, la taire serait mentir.
 *
 * Même règle que `networkBuffer` pour les appels en échec, étendue à l'ancre et
 * aux deux champs qui l'ignoraient : la page du signalement et le fil des gestes.
 */

/** Le chemin, suivi de la présence d'une requête et d'une ancre — jamais de leur contenu. */
export function redactLocation(location: Pick<Location, 'pathname' | 'search' | 'hash'>): string {
  return `${location.pathname}${location.search ? '?…' : ''}${location.hash ? '#…' : ''}`
}

/** Origine + {@link redactLocation}. Une adresse illisible rend ce qui précède `?` ou `#`. */
export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw, window.location.origin)
    return `${url.origin}${redactLocation(url)}`
  } catch {
    const head = raw.split(/[?#]/)[0] ?? ''
    return raw.length > head.length ? `${head}?…` : head
  }
}
