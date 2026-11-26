import {
  departmentFromCity,
  departmentFromLabel,
  departmentFromPostalCode,
  normaliseGeoLabel,
  regionFromLabel,
} from '@/features/accounts/lib/frenchDepartments'

/**
 * #3742 (recette prod 07/10, Arquus : 160 contacts) — croiser un LIEU et les
 * contacts du compte. Le filtre « Localisation » de l'onglet Contacts lit ce
 * que la fiche porte vraiment (`contact.location`, texte « Ville, Pays » ou
 * « 58180 Ville, France ») et ce que le compte sait de ses SITES (ville →
 * code postal), puis le range en pays / région / département / ville.
 *
 * Rien n'est deviné : un lieu absent laisse le contact hors de toute option
 * (et il reste visible sous « Tous les lieux »), une ville inconnue n'a ni
 * département ni région.
 */
type PlaceDepartment = { code: string; name: string }

type ContactPlace = {
  city: string | null
  department: PlaceDepartment | null
  region: string | null
  country: string | null
}

type PlaceKind = 'country' | 'region' | 'department' | 'city'

type PlaceOption = { value: string; kind: PlaceKind; label: string; count: number }

type PlaceIndex = ReadonlyMap<string, { department: PlaceDepartment | null; region: string | null }>

const POSTAL_RE = /\b(\d{5})\b/
const FRANCE_ALIASES = new Set(['france', 'fr', 'fra', 'republique francaise'])

/** Ville → département/région, lu sur les sites du compte (`sites_france`). */
export function buildPlaceIndex(sites: unknown): PlaceIndex {
  const index = new Map<string, { department: PlaceDepartment | null; region: string | null }>()
  if (!Array.isArray(sites)) return index
  for (const site of sites) {
    if (typeof site !== 'object' || site === null) continue
    const raw = site as Record<string, unknown>
    const city = typeof raw['city'] === 'string' ? raw['city'] : typeof raw['ville'] === 'string' ? raw['ville'] : ''
    if (!city.trim()) continue
    const postal = typeof raw['postal_code'] === 'string' ? raw['postal_code'] : null
    const dept = departmentFromPostalCode(postal)
    const declared = typeof raw['region'] === 'string' ? regionFromLabel(raw['region']) : null
    const region = dept?.region ?? declared
    if (!dept && !region) continue
    index.set(normaliseGeoLabel(city), {
      department: dept ? { code: dept.code, name: dept.name } : null,
      region,
    })
  }
  return index
}

export function readContactPlace(contact: { location?: string | null }, index: PlaceIndex): ContactPlace {
  const place: ContactPlace = { city: null, department: null, region: null, country: null }
  const text = (contact.location ?? '').trim()
  if (!text) return place

  const postal = text.match(POSTAL_RE)?.[1]
  const fromPostal = departmentFromPostalCode(postal)
  if (fromPostal) {
    place.department = { code: fromPostal.code, name: fromPostal.name }
    place.region = fromPostal.region
  }

  const segments = text
    .split(',')
    .map(segment => segment.replace(POSTAL_RE, '').trim())
    .filter(Boolean)
  const leftovers: string[] = []
  segments.forEach((segment, position) => {
    const region = regionFromLabel(segment)
    if (region) {
      place.region ??= region
      return
    }
    const dept = departmentFromLabel(segment)
    // Une ville peut porter le nom de son département (« Paris ») : seule la
    // PREMIÈRE position est lue comme ville.
    if (dept && position > 0) {
      place.department ??= { code: dept.code, name: dept.name }
      place.region ??= dept.region
      return
    }
    leftovers.push(segment)
  })

  if (leftovers.length > 1) {
    const last = leftovers.pop() as string
    place.country = FRANCE_ALIASES.has(normaliseGeoLabel(last)) ? 'France' : last
  } else if (leftovers.length === 1 && segments.length > 1 && FRANCE_ALIASES.has(normaliseGeoLabel(leftovers[0]!))) {
    place.country = 'France'
    leftovers.pop()
  }
  place.city = leftovers[0] ?? null

  if (place.city) {
    const known = index.get(normaliseGeoLabel(place.city))
    if (known) {
      place.department ??= known.department
      place.region ??= known.region
    }
    // #3709 — « Paris », « Versailles » sans code postal ni site connu : la
    // table des villes courantes donne département + région. Jamais appliqué
    // à une fiche dont le pays est un autre pays que la France.
    if (!place.department && (!place.country || FRANCE_ALIASES.has(normaliseGeoLabel(place.country)))) {
      const fromCity = departmentFromCity(place.city)
      if (fromCity) {
        place.department = { code: fromCity.code, name: fromCity.name }
        place.region ??= fromCity.region
      }
    }
  }
  if (!place.country && (place.region || place.department)) place.country = 'France'
  return place
}

function keyOf(kind: PlaceKind, place: ContactPlace): { value: string; label: string } | null {
  switch (kind) {
    case 'country':
      return place.country ? { value: `country:${place.country}`, label: place.country } : null
    case 'region':
      return place.region ? { value: `region:${place.region}`, label: place.region } : null
    case 'department':
      return place.department
        ? { value: `department:${place.department.code}`, label: `${place.department.name} (${place.department.code})` }
        : null
    case 'city':
      return place.city ? { value: `city:${normaliseGeoLabel(place.city)}`, label: place.city } : null
  }
}

const KINDS: readonly PlaceKind[] = ['country', 'region', 'department', 'city']

/** Les lieux PRÉSENTS, par niveau puis par nombre décroissant. */
export function buildPlaceOptions(places: readonly ContactPlace[]): PlaceOption[] {
  const options: PlaceOption[] = []
  for (const kind of KINDS) {
    const counts = new Map<string, PlaceOption>()
    for (const place of places) {
      const key = keyOf(kind, place)
      if (!key) continue
      const current = counts.get(key.value)
      counts.set(key.value, current ? { ...current, count: current.count + 1 } : { ...key, kind, count: 1 })
    }
    options.push(...Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)))
  }
  return options
}

export function matchesPlace(place: ContactPlace, filter: string | undefined): boolean {
  if (!filter || filter === 'all') return true
  const separator = filter.indexOf(':')
  if (separator < 0) return true
  const kind = filter.slice(0, separator) as PlaceKind
  if (!KINDS.includes(kind)) return true
  return keyOf(kind, place)?.value === filter
}
