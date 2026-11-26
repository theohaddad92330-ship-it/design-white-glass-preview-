/**
 * #2150.62 — « NE JAMAIS PERDRE OÙ L'ON ÉTAIT EN PASSANT PAR UN CONTACT ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI SE PASSAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * La fiche contact est UNIQUE (une seule ligne `contacts`, lue par `useContact`
 * depuis chaque porte), mais son fil d'Ariane ne connaissait qu'un chemin : le
 * compte du contact, onglet Contacts. Ouverte depuis l'ORGANIGRAMME d'un compte,
 * la fiche ramenait à l'onglet Contacts — l'endroit quitté était perdu, seul le
 * bouton du navigateur le retrouvait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * L'origine voyage dans l'URL (`from` / `fromId` / `fromTab`) — donc elle survit
 * à un rechargement — et c'est ELLE que le fil d'Ariane relit. Une origine sans
 * identifiant, ou d'un genre inconnu, n'en est pas une : on ne devine jamais un
 * retour.
 *
 * #3687.16 — « retour : origine, filtres, position ». Ouverte depuis la liste
 * /contacts avec des filtres actifs, la fiche ramenait au maillon « Contacts »
 * en `/contacts` NU — les filtres quittés étaient perdus. Deuxième variante de
 * la MÊME origine (`kind: 'list'`), pas un second système : la liste sérialise
 * ses propres paramètres de recherche (déjà bookmarkables, `routes/contacts/
 * index.tsx`) en un seul JSON opaque, que le maillon relit pour y revenir à
 * l'identique. La POSITION de lecture, elle, réutilise le mécanisme déjà posé
 * pour la fiche (#3688.10, `useReadingPosition`, GA-26 : un réglage vit à un
 * seul endroit) — câblé sur la page liste par `ContactsPage`.
 *
 * ⚠️ Seules les origines COMPTE et LISTE sont câblées. Le retour vers une
 * conversation avec Laura demande l'identifiant de la conversation, que
 * `PendingActions` ne reçoit pas aujourd'hui : l'écrire ici sans appelant
 * serait du code que personne n'appelle.
 */

/** #3674.3 — `overview` : la stratégie de compte (arrivée ordinaire), d'où l'on ouvre aussi une fiche. */
type ContactAccountTab = 'contacts' | 'organigramme' | 'overview'

/**
 * #3674.R1 — les filtres actifs de l'onglet Contacts au moment du clic sur une
 * fiche. Mêmes clés que `ContactsTabFilters` une fois passées par
 * `contactsFiltersToSearch` (défauts déjà retirés) : ce fichier ne dépend pas
 * du type de `accountDetailSearch.ts`, seulement de sa forme d'URL.
 */
type ContactOriginFilters = { q?: string; role?: string; entity?: string; level?: string; place?: string }

/**
 * #4061.b — l'état de l'onglet Organigramme au moment du clic (vue, direction, colonnes repliées,
 * filtres, sélection) : les clés d'URL `ov/od/oc/of/os` de `/accounts/$id`, que le fil d'Ariane de la fiche
 * remet dans l'URL du retour.
 */
type ContactOriginOrg = Partial<Record<'ov' | 'od' | 'oc' | 'of' | 'os', string>>
const ORG_KEYS = ['ov', 'od', 'oc', 'of', 'os'] as const

type ContactOrigin =
  | {
      kind: 'account'
      accountId: string
      tab: ContactAccountTab
      /** Présents seulement quand `tab === 'contacts'` et qu'un filtre était actif. */
      filters?: ContactOriginFilters
      /** #4061.b — présent seulement quand `tab === 'organigramme'` et qu'un état non par défaut était posé. */
      org?: ContactOriginOrg
    }
  /** #3687.16 — `search` : le JSON opaque des paramètres de `/contacts` quittée. */
  | { kind: 'list'; search: string }

type ContactOriginSearch =
  | {
      from: 'account'
      fromId: string
      fromTab: ContactAccountTab
      fromQ?: string
      fromRole?: string
      fromEntity?: string
      fromLevel?: string
      fromPlace?: string
      fromOrg?: string
    }
  | { from: 'list'; fromSearch: string }

/** Les clés d'URL qui portent l'origine, à passer en `search` vers `/contacts/$id`. */
export function contactOriginSearch(origin: ContactOrigin): ContactOriginSearch {
  if (origin.kind === 'list') return { from: 'list', fromSearch: origin.search }
  const f = origin.filters
  return {
    from: 'account',
    fromId: origin.accountId,
    fromTab: origin.tab,
    ...(f?.q ? { fromQ: f.q } : {}),
    ...(f?.role ? { fromRole: f.role } : {}),
    ...(f?.entity ? { fromEntity: f.entity } : {}),
    ...(f?.level ? { fromLevel: f.level } : {}),
    ...(f?.place ? { fromPlace: f.place } : {}),
    ...(origin.org && Object.keys(origin.org).length > 0 ? { fromOrg: JSON.stringify(origin.org) } : {}),
  }
}

/** L'origine que l'URL porte, ou `null` quand elle est absente, incomplète ou inconnue. */
export function readContactOrigin(search: Record<string, unknown>): ContactOrigin | null {
  if (search.from === 'list') {
    const fromSearch = typeof search.fromSearch === 'string' && search.fromSearch.length > 0 ? search.fromSearch : null
    return fromSearch === null ? null : { kind: 'list', search: fromSearch }
  }
  const fromId = typeof search.fromId === 'string' && search.fromId.length > 0 ? search.fromId : null
  if (fromId === null || search.from !== 'account') return null
  const tab = search.fromTab === 'organigramme' || search.fromTab === 'overview' ? search.fromTab : 'contacts'
  const str = (key: string) =>
    typeof search[key] === 'string' && (search[key] as string).length > 0 ? (search[key] as string) : undefined
  const filters: ContactOriginFilters = {
    ...(str('fromQ') ? { q: str('fromQ') } : {}),
    ...(str('fromRole') ? { role: str('fromRole') } : {}),
    ...(str('fromEntity') ? { entity: str('fromEntity') } : {}),
    ...(str('fromLevel') ? { level: str('fromLevel') } : {}),
    ...(str('fromPlace') ? { place: str('fromPlace') } : {}),
  }
  const org = readOriginOrg(search.fromOrg)
  return {
    kind: 'account',
    accountId: fromId,
    tab,
    ...(Object.keys(filters).length > 0 ? { filters } : {}),
    ...(org ? { org } : {}),
  }
}

/** #4061.b — le JSON opaque de l'état d'organigramme ; seules les cinq clés connues passent, le reste est écarté. */
function readOriginOrg(raw: unknown): ContactOriginOrg | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Record<string, unknown>
    const org: ContactOriginOrg = {}
    for (const key of ORG_KEYS) {
      const value = record[key]
      if (typeof value === 'string' && value.length > 0) org[key] = value
    }
    return Object.keys(org).length > 0 ? org : null
  } catch {
    return null
  }
}

/**
 * Où mène le maillon « Contacts » du fil d'Ariane : les MÊMES filtres que
 * ceux quittés, quand la fiche vient de la liste ; la liste NUE sinon (le
 * comportement d'avant) — jamais une page cassée sur un JSON trafiqué.
 */
export function contactsCrumbTarget(origin: ContactOrigin | null): Record<string, unknown> {
  if (origin?.kind !== 'list') return {}
  try {
    const parsed = JSON.parse(origin.search)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Où mène le maillon « compte » du fil d'Ariane : le compte D'ORIGINE et son
 * onglet quand la fiche a été ouverte depuis un compte ; sinon le compte du
 * contact, onglet Contacts (le comportement d'avant) ; `null` pour un contact
 * sans compte — pas de maillon mort (#1473).
 *
 * #3674.R1 — les filtres de l'origine voyagent jusqu'au maillon : le retour
 * par le fil d'Ariane ramène aux FILTRES de l'onglet Contacts, pas seulement
 * au compte/onglet.
 */
export function accountCrumbTarget(
  origin: ContactOrigin | null,
  contactAccountId: string | null,
): { accountId: string; tab: ContactAccountTab; filters?: ContactOriginFilters; org?: ContactOriginOrg } | null {
  if (origin?.kind === 'account')
    return {
      accountId: origin.accountId,
      tab: origin.tab,
      ...(origin.filters ? { filters: origin.filters } : {}),
      ...(origin.org ? { org: origin.org } : {}),
    }
  return contactAccountId ? { accountId: contactAccountId, tab: 'contacts' } : null
}
