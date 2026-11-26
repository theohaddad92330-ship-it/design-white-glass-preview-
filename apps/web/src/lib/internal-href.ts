import { defaultParseSearch } from '@tanstack/react-router'

/**
 * #4868.1 — LE découpeur d'un lien interne : une chaîne `/ecran?a=1#ancre` → `{ to, search, hash }`, à UN seul
 * endroit. `navigate({ to: href })` laissait la requête DANS le chemin : la recherche n'était ni analysée ni validée
 * par la route visée. La recherche est lue comme le fait le routeur (`defaultParseSearch` : `true` → booléen, `+` →
 * espace), donc le clic simple et l'URL rechargée (cmd+clic) arrivent au même endroit.
 */
export function splitInternalHref(href: string): { to: string; search?: Record<string, unknown>; hash?: string } {
  const hashAt = href.indexOf('#')
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt)
  const hash = hashAt === -1 ? '' : href.slice(hashAt + 1)
  const queryAt = beforeHash.indexOf('?')
  const to = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt)
  const query = queryAt === -1 ? '' : beforeHash.slice(queryAt + 1)
  const search = query ? defaultParseSearch(`?${query}`) : {}
  return {
    to,
    ...(Object.keys(search).length > 0 ? { search } : {}),
    ...(hash ? { hash } : {}),
  }
}
