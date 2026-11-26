/**
 * SIMON-FIX S.18 — « Hors du périmètre géographique choisi (France) » doit apparaître pour les contacts
 * écartés par le périmètre. L'API pose le motif en base (`ContactsService.excludeOutsideGeoPerimeter`) ;
 * recette Simon 20/10 : l'écran ne le disait nulle part, le stock rétrécissait sans raison.
 *
 * Le motif est LU tel que l'API l'écrit (un seul endroit le décide, GA-26) : les deux préfixes ci-dessous
 * sont ceux de `excludeOutsideGeoPerimeter` et de `geoExcludedNames`. `null` quand il n'y a rien à dire —
 * jamais un « 0 écarté ».
 */
const COUNTRY_PREFIX = 'Hors du périmètre géographique choisi ('
const SITE_PREFIX = 'hors site ('

export type GeoExcludedView = {
  /** Contacts écartés parce que leur pays est hors du périmètre (France / Europe). */
  country: number
  perimeters: string[]
  /** Contacts écartés parce que hors des sites ciblés. */
  sites: number
  areas: string[]
}

export function readGeoExcludedContacts(
  contacts: readonly { excluded_at?: string | null; exclusion_reason?: string | null }[],
): GeoExcludedView | null {
  const perimeters = new Set<string>()
  const areas = new Set<string>()
  let country = 0
  let sites = 0
  for (const contact of contacts) {
    const reason = contact.exclusion_reason
    if (!contact.excluded_at || !reason) continue
    if (reason.startsWith(COUNTRY_PREFIX)) {
      country += 1
      perimeters.add(reason.slice(COUNTRY_PREFIX.length).replace(/\)$/, ''))
    } else if (reason.startsWith(SITE_PREFIX)) {
      sites += 1
      areas.add(reason.slice(SITE_PREFIX.length).replace(/\)$/, ''))
    }
  }
  if (country + sites === 0) return null
  return { country, perimeters: [...perimeters], sites, areas: [...areas] }
}
